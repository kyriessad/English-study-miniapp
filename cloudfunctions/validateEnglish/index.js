const cloud = require('wx-server-sdk');
const https = require('https');
const querystring = require('querystring');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const GRAMMAR_API_URL = 'https://api.languagetool.org/v2/check';
const COMMON_CONNECTORS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from',
  'by', 'about', 'into', 'over', 'after', 'before', 'under', 'through',
  'and', 'or', 'but', 'up', 'out', 'off'
]);
const DICTIONARY_SKIP_WORDS = new Set([
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  'am', 'is', 'are', 'was', 'were',
  'be', 'been', 'being',
  'do', 'does', 'did',
  'have', 'has', 'had'
]);

function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = ''
  } = options;

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 6000 }, (res) => {
      let raw = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let data = raw;

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(error);
          return;
        }

        resolve({
          statusCode: res.statusCode,
          data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('request_timeout'));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function normalizeWordForDictionary(word) {
  let normalized = String(word || '')
    .trim()
    .toLowerCase();

  // 处理网页/文章里常见的所有格：
  // women's -> women
  // country's -> country
  // Beyoncé's -> beyoncé
  // students' -> students
  normalized = normalized.replace(/['’]s$/i, '');
  normalized = normalized.replace(/['’]$/i, '');

  return normalized;
}

async function lookupWord(word) {
  const response = await requestJson(`${DICTIONARY_API_BASE}${encodeURIComponent(word.toLowerCase())}`);

  if (response.statusCode === 200 && Array.isArray(response.data) && response.data.length > 0) {
    return { exists: true };
  }

  if (response.statusCode === 404) {
    return { exists: false };
  }

  throw new Error('dictionary_unavailable');
}

async function checkWordsOnline(words, category) {
  const contentWords = (words || [])
  .map((word) => normalizeWordForDictionary(word))
  .filter((word) => {
    const normalizedWord = String(word || '').toLowerCase();
    return (
      normalizedWord &&
      !COMMON_CONNECTORS.has(normalizedWord) &&
      !DICTIONARY_SKIP_WORDS.has(normalizedWord)
    );
  });

  if (contentWords.length === 0) {
    return { warnings: [], errors: [] };
  }

  const uniqueWords = Array.from(new Set(contentWords)).slice(0, 8);

  try {
    
    const results = await Promise.all(uniqueWords.map((word) => lookupWord(word)));
    
    const missingWords = uniqueWords.filter((word, index) => !results[index].exists);

    if (missingWords.length === 0) {
      return { warnings: [], errors: [] };
    }

    if (category === '单词') {
      return {
        warnings: [
          `词典未收录“${missingWords[0]}”，如果这是人名、地名、品牌名或专有名词，可以继续保存。`
        ],
        errors: []
      };
    }
    
    return {
      warnings: [
        `部分词词典未收录：${missingWords.join('、')}。若包含人名、地名、品牌名或专有名词，可继续保存。`
      ],
      errors: []
    };
  } catch (error) {
    return {
      warnings: ['在线词典暂时不可用，本次只完成了本地校验。'],
      errors: []
    };
  }
}

async function checkGrammarOnline(text, category) {
  if (category !== '句子') {
    return { warnings: [], errors: [] };
  }

  try {
    const body = querystring.stringify({
      language: 'en-US',
      text
    });

    const response = await requestJson(GRAMMAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    const matches = Array.isArray(response.data && response.data.matches)
      ? response.data.matches
      : [];

    if (matches.length === 0) {
      return { warnings: [], errors: [] };
    }

    const importantMatch = matches.find((item) => item.rule && item.rule.issueType !== 'typographical') || matches[0];
    const message = importantMatch.message || '这句话可能有语法或拼写问题。';

    return {
      warnings: [`语法检查提示：${message}`],
      errors: []
    };
  } catch (error) {
    return {
      warnings: ['在线语法检查暂时不可用，本次只完成了本地校验。'],
      errors: []
    };
  }
}

exports.main = async (event) => {

  const text = String(event && event.text || '').trim();
  const category = String(event && event.category || '').trim();
  const words = Array.isArray(event && event.words) ? event.words : [];

  const [dictionaryResult, grammarResult] = await Promise.all([
    checkWordsOnline(words, category),
    checkGrammarOnline(text, category)
  ]);

  return {
    ok: true,
    errors: grammarResult.errors.concat(dictionaryResult.errors),
    warnings: grammarResult.warnings.concat(dictionaryResult.warnings)
  };
};
