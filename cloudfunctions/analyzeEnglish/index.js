const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

function normalizeText(value) {
  return String(value || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCategory(value) {
  return String(value || '').trim()
}

function mapPythonCategoryToMiniappCategory(category, fallbackCategory) {
  if (fallbackCategory) {
    return fallbackCategory
  }

  const map = {
    word: '单词',
    phrase: '短语',
    sentence: '句子',
    paragraph: '句子',
    unknown: ''
  }

  return map[category] || ''
}

function buildFallbackResult(text, category, message = '分析服务暂时不可用，已先保存英文内容。') {
  const normalizedText = normalizeText(text)
  const normalizedCategory = normalizeCategory(category)

  return {
    ok: false,
    text: normalizedText,
    normalizedText,
    category: normalizedCategory,
    analysisStatus: 'failed',
    validation: {
      errors: [],
      warnings: [message],
      normalizedText
    },
    understanding: {
      candidate: '',
      source: 'backend_failed'
    },
    cacheKey: `${normalizedCategory}::${normalizedText.toLowerCase()}`,
    fromCache: false
  }
}

function postJson(url, data, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const target = new URL(url)

    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout
      },
      (res) => {
        let raw = ''

        res.setEncoding('utf8')

        res.on('data', chunk => {
          raw += chunk
        })

        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {}

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed)
              return
            }

            reject(new Error(`Python backend HTTP ${res.statusCode}: ${raw}`))
          } catch (err) {
            reject(new Error(`Invalid JSON from Python backend: ${raw}`))
          }
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error('Python backend request timeout'))
    })

    req.on('error', reject)

    req.write(body)
    req.end()
  })
}

function adaptPythonResultToMiniappShape(pythonResult, event) {
  const originalText = normalizeText(event && event.text)
  const originalCategory = normalizeCategory(event && event.category)
  const words = Array.isArray(event && event.words) ? event.words : []

  const text = normalizeText(
    pythonResult.normalizedText || pythonResult.text || originalText
  )

  const category = mapPythonCategoryToMiniappCategory(
    pythonResult.category,
    originalCategory
  )

  const warnings = Array.isArray(pythonResult.warnings)
    ? pythonResult.warnings
    : []

  const errors = Array.isArray(pythonResult.errors)
    ? pythonResult.errors
    : []

  const candidate = normalizeText(
    pythonResult.translation || pythonResult.understanding || ''
  )

  const source = pythonResult.provider
    ? pythonResult.provider
    : 'python_backend'

    return {
      ok: pythonResult.ok !== false,
    
      // 兼容旧字段
      text,
    
      // 新增：直接透传给小程序 add.js 使用
      normalizedText: text,
    
      category,
      analysisStatus: pythonResult.level === 'failed' ? 'failed' : 'done',
      validation: {
        errors,
        warnings,
    
        // 新增：也放一份到 validation 里，兼容 add.js 的第二读取路径
        normalizedText: text
      },
    understanding: {
      candidate,
      source
    },
    cacheKey: `${category}::${text.toLowerCase()}::${words.map(w => normalizeText(w).toLowerCase()).filter(Boolean).join('|')}`,
    fromCache: Boolean(pythonResult.cacheHit),
    backend: {
      level: pythonResult.level || '',
      category: pythonResult.category || '',
      provider: pythonResult.provider || '',
      translation: pythonResult.translation || '',
      understanding: pythonResult.understanding || ''
    }
  }
}

exports.main = async (event) => {
  const text = normalizeText(event && event.text)
  const category = normalizeCategory(event && event.category)

  if (!text) {
    return {
      ok: false,
      text: '',
      normalizedText: '',
      category,
      analysisStatus: 'failed',
      validation: {
        errors: ['英文内容不能为空。'],
        warnings: [],
        normalizedText: ''
      },
      understanding: {
        candidate: '',
        source: 'empty'
      },
      cacheKey: ''
    }
  }

  const backendUrl = process.env.PYTHON_ANALYZER_URL

  if (!backendUrl) {
    return buildFallbackResult(text, category)
  }

  try {
    const pythonResult = await postJson(backendUrl, {
      text,
      cardType: category || 'auto',
      targetLang: 'zh'
    })

    return adaptPythonResultToMiniappShape(pythonResult, event)
  } catch (err) {
    console.error('[analyzeEnglish proxy error]', err)
    return buildFallbackResult(text, category)
  }
}