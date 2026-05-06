const cloud = require('wx-server-sdk')
const tencentcloud = require('tencentcloud-sdk-nodejs')
const https = require('https')
const querystring = require('querystring')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const TmtClient = tencentcloud.tmt.v20180321.Client

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/'
const GRAMMAR_API_URL = 'https://api.languagetool.org/v2/check'

const TRANSLATION_CACHE = new Map()
const ANALYSIS_CACHE = new Map()
const CACHE_LIMIT = 300

const COMMON_CONNECTORS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from',
  'by', 'about', 'into', 'over', 'after', 'before', 'under', 'through',
  'and', 'or', 'but', 'up', 'out', 'off'
])

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
])

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
}

function normalizeText(value) {
  return String(value || '')
    .replace(/[‘’]/g, '\'')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeCandidate(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^["']+|["']+$/g, '')
    .trim()
}

function makeCacheKey(text, category, words) {
  const normalizedText = normalizeText(text).toLowerCase()
  const normalizedCategory = normalizeText(category)
  const normalizedWords = Array.isArray(words)
    ? words.map(w => normalizeText(w).toLowerCase()).filter(Boolean).join('|')
    : ''

  return `${normalizedCategory}::${normalizedText}::${normalizedWords}`
}

function getMapValue(map, key) {
  if (!map.has(key)) {
    return null
  }

  const value = map.get(key)
  map.delete(key)
  map.set(key, value)
  return value
}

function setMapValue(map, key, value) {
  if (!key || !value) {
    return
  }

  if (map.has(key)) {
    map.delete(key)
  }

  map.set(key, value)

  if (map.size <= CACHE_LIMIT) {
    return
  }

  const oldestKey = map.keys().next().value
  if (oldestKey) {
    map.delete(oldestKey)
  }
}

function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = ''
  } = options

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 6000 }, (res) => {
      let raw = ''

      res.setEncoding('utf8')

      res.on('data', (chunk) => {
        raw += chunk
      })

      res.on('end', () => {
        let data = raw

        try {
          data = raw ? JSON.parse(raw) : {}
        } catch (error) {
          reject(error)
          return
        }

        resolve({
          statusCode: res.statusCode,
          data
        })
      })
    })

    req.on('error', reject)

    req.on('timeout', () => {
      req.destroy(new Error('request_timeout'))
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

function normalizeWordForDictionary(word) {
  let normalized = String(word || '')
    .trim()
    .toLowerCase()

  normalized = normalized.replace(/['’]s$/i, '')
  normalized = normalized.replace(/['’]$/i, '')

  return normalized
}

async function lookupWord(word) {
  const response = await requestJson(`${DICTIONARY_API_BASE}${encodeURIComponent(word.toLowerCase())}`)

  if (response.statusCode === 200 && Array.isArray(response.data) && response.data.length > 0) {
    return { exists: true }
  }

  if (response.statusCode === 404) {
    return { exists: false }
  }

  throw new Error('dictionary_unavailable')
}

async function checkWordsOnline(words, category) {
  const contentWords = (words || [])
    .map((word) => normalizeWordForDictionary(word))
    .filter((word) => {
      const normalizedWord = String(word || '').toLowerCase()
      return (
        normalizedWord &&
        !COMMON_CONNECTORS.has(normalizedWord) &&
        !DICTIONARY_SKIP_WORDS.has(normalizedWord)
      )
    })

  if (contentWords.length === 0) {
    return { warnings: [], errors: [] }
  }

  const uniqueWords = Array.from(new Set(contentWords)).slice(0, 8)

  try {
    const results = await Promise.all(uniqueWords.map((word) => lookupWord(word)))
    const missingWords = uniqueWords.filter((word, index) => !results[index].exists)

    if (missingWords.length === 0) {
      return { warnings: [], errors: [] }
    }

    if (category === '单词') {
      return {
        warnings: [
          `词典未收录“${missingWords[0]}”，如果这是人名、地名、品牌名或专有名词，可以继续保存。`
        ],
        errors: []
      }
    }

    return {
      warnings: [
        `部分词词典未收录：${missingWords.join('、')}。若包含人名、地名、品牌名或专有名词，可继续保存。`
      ],
      errors: []
    }
  } catch (error) {
    return {
      warnings: ['在线词典暂时不可用，本次只完成了本地校验。'],
      errors: []
    }
  }
}

async function checkGrammarOnline(text, category) {
  if (category !== '句子') {
    return { warnings: [], errors: [] }
  }

  try {
    const body = querystring.stringify({
      language: 'en-US',
      text
    })

    const response = await requestJson(GRAMMAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    })

    const matches = Array.isArray(response.data && response.data.matches)
      ? response.data.matches
      : []

    if (matches.length === 0) {
      return { warnings: [], errors: [] }
    }

    const importantMatch = matches.find((item) => item.rule && item.rule.issueType !== 'typographical') || matches[0]
    const message = importantMatch.message || '这句话可能有语法或拼写问题。'

    return {
      warnings: [`语法检查提示：${message}`],
      errors: []
    }
  } catch (error) {
    return {
      warnings: ['在线语法检查暂时不可用，本次只完成了本地校验。'],
      errors: []
    }
  }
}

function getLocalReference(text) {
  const normalizedText = normalizeText(text).toLowerCase().replace(/[.!?]$/, '')
  return LOCAL_REFERENCE_MAP[normalizedText] || ''
}

function createTmtClient() {
  const secretId = process.env.TENCENT_SECRET_ID || process.env.SECRET_ID || ''
  const secretKey = process.env.TENCENT_SECRET_KEY || process.env.SECRET_KEY || ''

  if (!secretId || !secretKey) {
    return null
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
  })
}

async function translateWithTencent(text) {
  const normalizedText = normalizeText(text)
  const cacheKey = normalizedText.toLowerCase()
  const cachedValue = getMapValue(TRANSLATION_CACHE, cacheKey)

  if (cachedValue) {
    return {
      candidate: cachedValue,
      source: 'memory_cache'
    }
  }

  const client = createTmtClient()

  if (!client) {
    return {
      candidate: '',
      source: 'no_secret'
    }
  }

  const response = await client.TextTranslate({
    SourceText: normalizedText,
    Source: 'en',
    Target: 'zh',
    ProjectId: 0
  })

  const translatedText = sanitizeCandidate(response && response.TargetText)

  if (!translatedText || translatedText.toLowerCase() === normalizedText.toLowerCase()) {
    return {
      candidate: '',
      source: 'empty_translate'
    }
  }

  setMapValue(TRANSLATION_CACHE, cacheKey, translatedText)

  return {
    candidate: translatedText,
    source: 'tencent_tmt'
  }
}

async function suggestUnderstanding(text, category) {
  const normalizedText = normalizeText(text)

  if (!normalizedText) {
    return {
      candidate: '',
      category,
      source: 'empty'
    }
  }

  const localReference = getLocalReference(normalizedText)

  if (localReference) {
    setMapValue(TRANSLATION_CACHE, normalizedText.toLowerCase(), localReference)

    return {
      candidate: localReference,
      category,
      source: 'local'
    }
  }

  try {
    const result = await translateWithTencent(normalizedText)

    return {
      candidate: result.candidate || '',
      category,
      source: result.source || 'fallback'
    }
  } catch (error) {
    console.error('translateWithTencent failed:', error)

    return {
      candidate: '',
      category,
      source: 'fallback'
    }
  }
}

exports.main = async (event) => {
  const text = normalizeText(event && event.text)
  const category = normalizeText(event && event.category)
  const words = Array.isArray(event && event.words) ? event.words : []

  if (!text) {
    return {
      ok: false,
      text: '',
      category,
      analysisStatus: 'failed',
      validation: {
        errors: ['英文内容不能为空。'],
        warnings: []
      },
      understanding: {
        candidate: '',
        source: 'empty'
      },
      cacheKey: ''
    }
  }

  const cacheKey = makeCacheKey(text, category, words)
  const cachedAnalysis = getMapValue(ANALYSIS_CACHE, cacheKey)

  if (cachedAnalysis) {
    return {
      ...cachedAnalysis,
      fromCache: true
    }
  }

  const [dictionaryResult, grammarResult, understandingResult] = await Promise.all([
    checkWordsOnline(words, category),
    checkGrammarOnline(text, category),
    suggestUnderstanding(text, category)
  ])

  const result = {
    ok: true,
    text,
    category,
    analysisStatus: 'done',
    validation: {
      errors: grammarResult.errors.concat(dictionaryResult.errors),
      warnings: grammarResult.warnings.concat(dictionaryResult.warnings)
    },
    understanding: {
      candidate: understandingResult.candidate || '',
      source: understandingResult.source || 'fallback'
    },
    cacheKey,
    fromCache: false
  }

  setMapValue(ANALYSIS_CACHE, cacheKey, result)

  return result
}