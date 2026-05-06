const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const TmtClient = tencentcloud.tmt.v20180321.Client;
const TRANSLATION_CACHE = new Map();
const CACHE_LIMIT = 200;

const LOCAL_REFERENCE_MAP = {
  world: '世界',
  word: '单词',
  sentence: '句子',
  phrase: '短语',
  beautiful: '美丽的',
  vivid: '生动的；鲜明的',
  improve: '提高；改善',
  'improve reading': '提高阅读能力',
  reading: '阅读',
  writing: '写作',
  listening: '听力',
  speaking: '口语',
  'get up': '起床',
  'give up': '放弃',
  'break down': '出故障；崩溃；分解',
  'take notes': '记笔记',
  'never give up': '永不放弃',
  'on the same page': '想法一致；理解一致',
  'i am your father': '我是你的父亲',
  'i am on the same page with you': '我和你理解一致。'
};

function normalizeText(value) {
  return String(value || '')
    .replace(/[‘’]/g, '\'')
    .replace(/[“”]/g, '"')
    .trim();
}

function sanitizeCandidate(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function getCacheValue(key) {
  if (!TRANSLATION_CACHE.has(key)) {
    return '';
  }

  const cachedValue = TRANSLATION_CACHE.get(key);
  TRANSLATION_CACHE.delete(key);
  TRANSLATION_CACHE.set(key, cachedValue);
  return cachedValue;
}

function setCacheValue(key, value) {
  if (!key || !value) {
    return;
  }

  if (TRANSLATION_CACHE.has(key)) {
    TRANSLATION_CACHE.delete(key);
  }

  TRANSLATION_CACHE.set(key, value);

  if (TRANSLATION_CACHE.size <= CACHE_LIMIT) {
    return;
  }

  const oldestKey = TRANSLATION_CACHE.keys().next().value;
  if (oldestKey) {
    TRANSLATION_CACHE.delete(oldestKey);
  }
}

function getLocalReference(text) {
  const normalizedText = normalizeText(text).toLowerCase().replace(/[.!?]$/, '');
  return LOCAL_REFERENCE_MAP[normalizedText] || '';
}

function createTmtClient() {
  const secretId = process.env.TENCENT_SECRET_ID || process.env.SECRET_ID || '';
  const secretKey = process.env.TENCENT_SECRET_KEY || process.env.SECRET_KEY || '';

  if (!secretId || !secretKey) {
    return null;
  }

  return new TmtClient({
    credential: {
      secretId,
      secretKey
    },
    region: process.env.TENCENT_TMT_REGION || 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'tmt.tencentcloudapi.com',
        reqTimeout: 6
      }
    }
  });
}

async function translateWithTencent(text) {
  const normalizedText = normalizeText(text);
  const cacheKey = normalizedText.toLowerCase();
  const cachedValue = getCacheValue(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const client = createTmtClient();
  if (!client) {
    return '';
  }

  console.log('call suggestUnderstanding start', normalizedText);

  const response = await client.TextTranslate({
    SourceText: normalizedText,
    Source: 'en',
    Target: 'zh',
    ProjectId: 0
  });

  console.log('call suggestUnderstanding start', normalizedText);

  const translatedText = sanitizeCandidate(response && response.TargetText);

  if (!translatedText || translatedText.toLowerCase() === normalizedText.toLowerCase()) {
    return '';
  }

  setCacheValue(cacheKey, translatedText);
  return translatedText;
}

exports.main = async (event) => {



  const text = normalizeText(event && event.text);
  const category = normalizeText(event && event.category);

  if (!text) {
    return {
      ok: false,
      candidate: '',
      category,
      source: 'empty'
    };
  }

  const localReference = getLocalReference(text);
  if (localReference) {
    setCacheValue(text.toLowerCase(), localReference);
    return {
      ok: true,
      candidate: localReference,
      category,
      source: 'local'
    };
  }

  try {
    const candidate = await translateWithTencent(text);

    if (candidate) {
      return {
        ok: true,
        candidate,
        category,
        source: 'tencent_tmt'
      };
    }
  } catch (error) {
    console.error('translateWithTencent failed:', error);
    // Fall through to final empty result.
  }

  return {
    ok: false,
    candidate: '',
    category,
    source: 'fallback'
  };
};
