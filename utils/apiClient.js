const { BACKEND_BASE_URL } = require('./localBackendConfig');

let hasLoggedResolvedBackendBaseUrl = false;
let lastTtsRequestId = '';

function logTtsDiagnostic(event, details = {}) {
  const entry = { event, ...details };
  console.log('[TTS_DIAG]', JSON.stringify(entry));
  reportTtsDiagnostic(entry);
}

function logAiStreamDiagnostic(event, details = {}) {
  console.log('[AI_STREAM_DIAG]', JSON.stringify({ event, ...details }));
}

function shouldLogResolvedBackendBaseUrl() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const accountInfo = wx.getAccountInfoSync();
      const envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion;
      return envVersion !== 'release';
    }
  } catch (_) {
    // Keep diagnostics best-effort only.
  }

  return true;
}

function logResolvedBackendBaseUrlOnce() {
  if (hasLoggedResolvedBackendBaseUrl || !shouldLogResolvedBackendBaseUrl()) {
    return;
  }

  hasLoggedResolvedBackendBaseUrl = true;
  console.log(`[apiClient] resolved backend base URL: ${BACKEND_BASE_URL}`);
}

logResolvedBackendBaseUrlOnce();

const BACKEND_AUTH_STORAGE_KEYS = {
  userId: 'backendUserId',
  accessToken: 'backendAccessToken',
  loginAt: 'backendLoginAt'
};

let refreshPromise = null;
let authGeneration = 0;
let autoRefreshSuppressed = false;

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedBase = BACKEND_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.charAt(0) === '/' ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildQueryString(params = {}) {
  const pairs = [];

  Object.keys(params || {}).forEach((key) => {
    const val = params[key];

    if (val === undefined || val === null || val === '') {
      return;
    }

    if (Array.isArray(val)) {
      val.forEach((v) => {
        if (v !== undefined && v !== null && v !== '') {
          pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
        }
      });
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  });

  return pairs.length ? `?${pairs.join('&')}` : '';
}

function getAccessToken() {
  try {
    return wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken) || '';
  } catch (error) {
    console.warn('[apiClient] Failed to read backend access token', error);
    return '';
  }
}

function getLocalTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone) {
        return timezone;
      }
    }
  } catch (error) {
    console.warn('[apiClient] Failed to resolve local timezone', error);
  }

  return 'Asia/Shanghai';
}

function updateAppBackendAuth(authState) {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;

    if (!app || !app.globalData) {
      return;
    }

    app.globalData.backendUserId = authState.backendUserId || '';
    app.globalData.backendAccessToken = authState.backendAccessToken || '';
    app.globalData.backendLoginAt = authState.backendLoginAt || '';
  } catch (error) {
    console.warn('[apiClient] Failed to update app backend auth state', error);
  }
}

function saveBackendAuth(authData) {
  const authUser = authData && authData.user ? authData.user : {};
  const backendUserId = String((authData && authData.user_id) || authUser.id || '');
  const backendAccessToken = String((authData && authData.access_token) || '');

  if (!backendUserId || !backendAccessToken) {
    throw new Error('Backend login response missing user id or access token');
  }

  const backendLoginAt = new Date().toISOString();

  wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.userId, backendUserId);
  wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken, backendAccessToken);
  wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.loginAt, backendLoginAt);

  const authState = {
    backendUserId,
    backendAccessToken,
    backendLoginAt
  };

  updateAppBackendAuth(authState);
  return authState;
}

function clearBackendAuth() {
  try {
    wx.removeStorageSync(BACKEND_AUTH_STORAGE_KEYS.userId);
    wx.removeStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken);
    wx.removeStorageSync(BACKEND_AUTH_STORAGE_KEYS.loginAt);
  } catch (error) {
    console.warn('[apiClient] Failed to clear backend auth storage', error);
  }

  updateAppBackendAuth({
    backendUserId: '',
    backendAccessToken: '',
    backendLoginAt: ''
  });
}

async function logoutBackendAuth() {
  autoRefreshSuppressed = true;
  authGeneration += 1;
  try {
    if (getAccessToken()) {
      await sendRequest({
        url: '/api/auth/logout',
        method: 'POST',
        skipAuthRefresh: true
      });
    }
  } finally {
    clearBackendAuth();
  }
}

function buildHeaders(headers, options = {}) {
  const mergedHeaders = Object.assign(
    {
      'content-type': 'application/json',
      'ngrok-skip-browser-warning': '1'
    },
    headers || {}
  );
  const accessToken = getAccessToken();

  if (
    !options.skipAuthHeader &&
    accessToken &&
    !mergedHeaders.Authorization &&
    !mergedHeaders.authorization
  ) {
    mergedHeaders.Authorization = `Bearer ${accessToken}`;
  }

  return mergedHeaders;
}

function normalizeRequestError(error) {
  return {
    errMsg: error && error.errMsg ? error.errMsg : 'Backend request failed',
    statusCode: error && error.statusCode ? error.statusCode : 0,
    data: error && error.data ? error.data : null
  };
}

function sendRequest(options) {
  const requestOptions = options || {};

  return new Promise((resolve, reject) => {
    try {
      wx.request({
        url: buildUrl(requestOptions.url || requestOptions.path || ''),
        method: requestOptions.method || 'GET',
        data: requestOptions.data || {},
        header: buildHeaders(requestOptions.header || requestOptions.headers, requestOptions),
        timeout: requestOptions.timeout || 10000,
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response.data);
            return;
          }

          reject(normalizeRequestError({
            errMsg: response.errMsg,
            statusCode: response.statusCode,
            data: response.data
          }));
        },
        fail(error) {
          reject(normalizeRequestError(error));
        }
      });
    } catch (error) {
      reject(normalizeRequestError(error));
    }
  });
}

function requestWechatLoginCode() {
  return new Promise((resolve, reject) => {
    try {
      wx.login({
        success(response) {
          if (response.code) {
            resolve(response.code);
            return;
          }

          reject(new Error('wx.login did not return a code'));
        },
        fail(error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function loginWithWechatCode(code) {
  return sendRequest({
    url: '/api/auth/wechat-login',
    method: 'POST',
    data: {
      code,
      timezone: getLocalTimezone()
    },
    skipAuthHeader: true,
    skipAuthRefresh: true
  });
}

function refreshBackendAuth() {
  if (refreshPromise) {
    return refreshPromise;
  }

  autoRefreshSuppressed = false;
  const generationAtStart = authGeneration;
  refreshPromise = (async () => {
    const code = await requestWechatLoginCode();
    const authData = await loginWithWechatCode(code);
    if (generationAtStart !== authGeneration) {
      throw new Error('Backend auth state changed during login');
    }
    return saveBackendAuth(authData);
  })()
    .catch((error) => {
      // Don't clear auth on refresh failure — keep existing tokens for retry
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function request(options) {
  const requestOptions = Object.assign({}, options || {});

  try {
    return await sendRequest(requestOptions);
  } catch (error) {
    if (
      error &&
      error.statusCode === 401 &&
      !requestOptions.skipAuthRefresh &&
      !requestOptions._hasRetriedAuth &&
      !autoRefreshSuppressed
    ) {
      await refreshBackendAuth();
      return sendRequest(Object.assign({}, requestOptions, { _hasRetriedAuth: true }));
    }

    throw error;
  }
}

function getCurrentBackendUser() {
  return request({
    url: '/api/auth/me',
    method: 'GET'
  });
}

function listBackendCards(params = {}) {
  return request({
    url: `/api/cards${buildQueryString(params)}`,
    method: 'GET'
  });
}

function createBackendCard(card) {
  return request({
    url: '/api/cards',
    method: 'POST',
    data: card
  });
}

function updateBackendCard(cardId, patch) {
  return request({
    url: `/api/cards/${encodeURIComponent(cardId)}`,
    method: 'PATCH',
    data: patch
  });
}

function deleteBackendCard(cardId) {
  return request({
    url: `/api/cards/${encodeURIComponent(cardId)}`,
    method: 'DELETE'
  });
}

function getReviewOverview(params) {
  return request({
    url: '/api/reviews/overview' + buildQueryString(params || {}),
    method: 'GET'
  });
}

function getCardStats() {
  return request({
    url: '/api/cards/stats',
    method: 'GET'
  });
}

function createReviewSession(data) {
  return request({
    url: '/api/review-sessions',
    method: 'POST',
    data: data || {}
  });
}

function getTodayReview({ limit = 5, restart = false, session_type } = {}) {
  var params = { limit: limit, restart: restart ? 'true' : '' };
  if (session_type) {
    params.session_type = session_type;
  }
  return request({
    url: '/api/reviews/today' + buildQueryString(params),
    method: 'GET'
  });
}

/**
 * Phase 3: submit review feedback with client_action_id for idempotency.
 */
function submitReviewFeedback({
  client_action_id,
  session_id,
  session_item_id,
  card_id,
  question_id,
  selected_option_id,
  response_time_ms,
  result
}) {
  return request({
    url: '/api/reviews/feedback',
    method: 'POST',
    data: {
      client_action_id,
      session_id,
      session_item_id,
      card_id,
      question_id,
      selected_option_id,
      response_time_ms,
      result
    }
  });
}

/**
 * Phase 3: get session summary for recovery.
 */
function getSessionSummary(sessionId) {
  return request({
    url: `/api/reviews/sessions/${encodeURIComponent(sessionId)}/summary`,
    method: 'GET'
  });
}

/**
 * Phase 5-1C: get history review list grouped by card.
 */
function getReviewHistory(params = {}) {
  return request({
    url: '/api/reviews/history' + buildQueryString(params),
    method: 'GET'
  });
}

/**
 * Phase 5-1C: get history review summary stats.
 */
function getReviewHistorySummary(params = {}) {
  return request({
    url: '/api/reviews/history/summary' + buildQueryString(params),
    method: 'GET'
  });
}

/**
 * Phase 5-5C: get single history review log detail.
 */
function getReviewHistoryDetail(logId) {
  return request({
    url: `/api/reviews/history/${encodeURIComponent(logId)}`,
    method: 'GET'
  });
}

function getTodayReviewed() {
  return request({
    url: '/api/reviews/today-reviewed',
    method: 'GET'
  });
}

function getLexicalInfo(text) {
  return request({
    url: `/api/lexical-info${buildQueryString({ text })}`,
    method: 'GET'
  });
}

function buildPronunciationAudioUrl(text, voice) {
  var params = { text: text };
  if (voice) {
    params.voice = voice;
  }
  return buildUrl('/api/pronunciation/audio' + buildQueryString(params));
}

function buildTtsDiagnosticTestAudioUrl() {
  return buildUrl('/api/diagnostics/test-audio.mp3');
}

function makeTtsRequestId() {
  return 'tts-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function getLastTtsRequestId() {
  return lastTtsRequestId;
}

function getClientDiagnosticInfo() {
  const client = {};
  try {
    if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
      const info = wx.getSystemInfoSync();
      client.platform = info.platform || '';
      client.system = info.system || '';
      client.version = info.version || '';
      client.SDKVersion = info.SDKVersion || '';
      client.brand = info.brand || '';
      client.model = info.model || '';
    }
  } catch (_) {}

  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const accountInfo = wx.getAccountInfoSync();
      client.envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion || '';
    }
  } catch (_) {}

  return client;
}

function reportTtsDiagnostic(entry) {
  try {
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      return;
    }
    const requestId = entry.requestId || lastTtsRequestId || '';
    wx.request({
      url: buildUrl('/api/diagnostics/tts-client'),
      method: 'POST',
      header: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId ? `${requestId}:diag` : makeTtsRequestId()
      },
      data: {
        event: entry.event || '',
        requestId,
        timestamp: new Date().toISOString(),
        details: entry,
        client: getClientDiagnosticInfo()
      },
      timeout: 5000,
      fail() {}
    });
  } catch (_) {
    // Diagnostics must never affect playback.
  }
}

function headerValue(headers, name) {
  const target = String(name || '').toLowerCase();
  const source = headers || {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === target) {
      return source[keys[i]];
    }
  }
  return '';
}

function getTempFileSize(tempFilePath) {
  return new Promise((resolve) => {
    try {
      if (!wx.getFileSystemManager) {
        resolve(0);
        return;
      }
      wx.getFileSystemManager().getFileInfo({
        filePath: tempFilePath,
        success(result) {
          resolve(Number(result && result.size) || 0);
        },
        fail(error) {
          logTtsDiagnostic('file_info_failed', {
            tempFilePath,
            errMsg: String(error && error.errMsg || error || 'unknown')
          });
          resolve(0);
        }
      });
    } catch (error) {
      logTtsDiagnostic('file_info_exception', {
        tempFilePath,
        errMsg: String(error && error.errMsg || error || 'unknown')
      });
      resolve(0);
    }
  });
}

/**
 * Download pronunciation audio as a local temp file so playback can carry the
 * Authorization header and bypass ngrok's browser interstitial. InnerAudioContext
 * cannot send headers, so it must play a downloaded local file instead of a URL.
 */
function downloadPronunciationAudio(text, voice) {
  const requestId = makeTtsRequestId();
  lastTtsRequestId = requestId;
  function attemptDownload() {
    return new Promise((resolve, reject) => {
      const headers = { 'ngrok-skip-browser-warning': '1' };
      const accessToken = getAccessToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      headers['X-Request-ID'] = requestId;
      const url = buildPronunciationAudioUrl(text, voice);

      logTtsDiagnostic('download_start', {
        requestId,
        url,
        voice: voice || ''
      });

      wx.downloadFile({
        url: url,
        header: headers,
        timeout: 20000,
        success(response) {
          const responseHeaders = response.header || response.headers || {};
          logTtsDiagnostic('download_http_response', {
            requestId,
            statusCode: response.statusCode,
            contentType: String(headerValue(responseHeaders, 'content-type') || ''),
            contentLength: String(headerValue(responseHeaders, 'content-length') || '')
          });
          if (response.statusCode === 200) {
            getTempFileSize(response.tempFilePath).then((fileSize) => {
              logTtsDiagnostic('download_success', {
                requestId,
                tempFilePath: response.tempFilePath,
                fileSize
              });
              resolve(response.tempFilePath);
            });
            return;
          }
          logTtsDiagnostic('download_failure', {
            requestId,
            statusCode: response.statusCode,
            errMsg: String(response.errMsg || 'non-200 response')
          });
          reject(normalizeRequestError({
            errMsg: response.errMsg,
            statusCode: response.statusCode
          }));
        },
        fail(error) {
          logTtsDiagnostic('download_failure', {
            requestId,
            statusCode: error && error.statusCode ? error.statusCode : 0,
            errCode: error && error.errCode ? error.errCode : '',
            errMsg: String(error && error.errMsg || error || 'unknown')
          });
          reject(normalizeRequestError(error));
        }
      });
    });
  }

  return attemptDownload().catch((error) => {
    if (error && error.statusCode === 401 && !autoRefreshSuppressed) {
      return refreshBackendAuth().then(attemptDownload);
    }
    throw error;
  });
}

function downloadDiagnosticTestAudio() {
  const requestId = makeTtsRequestId();
  lastTtsRequestId = requestId;
  return new Promise((resolve, reject) => {
    const headers = { 'ngrok-skip-browser-warning': '1' };
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    headers['X-Request-ID'] = requestId;
    const url = buildTtsDiagnosticTestAudioUrl();

    logTtsDiagnostic('test_mp3_download_start', {
      requestId,
      url
    });

    wx.downloadFile({
      url,
      header: headers,
      timeout: 20000,
      success(response) {
        const responseHeaders = response.header || response.headers || {};
        logTtsDiagnostic('test_mp3_download_http_response', {
          requestId,
          statusCode: response.statusCode,
          contentType: String(headerValue(responseHeaders, 'content-type') || ''),
          contentLength: String(headerValue(responseHeaders, 'content-length') || '')
        });
        if (response.statusCode === 200) {
          getTempFileSize(response.tempFilePath).then((fileSize) => {
            logTtsDiagnostic('test_mp3_download_success', {
              requestId,
              tempFilePath: response.tempFilePath,
              fileSize
            });
            resolve(response.tempFilePath);
          });
          return;
        }
        logTtsDiagnostic('test_mp3_download_failure', {
          requestId,
          statusCode: response.statusCode,
          errMsg: String(response.errMsg || 'non-200 response')
        });
        reject(normalizeRequestError({
          errMsg: response.errMsg,
          statusCode: response.statusCode
        }));
      },
      fail(error) {
        logTtsDiagnostic('test_mp3_download_failure', {
          requestId,
          statusCode: error && error.statusCode ? error.statusCode : 0,
          errCode: error && error.errCode ? error.errCode : '',
          errMsg: String(error && error.errMsg || error || 'unknown')
        });
        reject(normalizeRequestError(error));
      }
    });
  });
}

function analyzeEnglishDirect(text, category, forceRefresh = false, idempotencyKey = '') {
  const data = {
    text: text,
    cardType: category || 'auto',
    targetLang: 'zh'
  };
  if (forceRefresh) {
    data.forceRefresh = true;
  }
  const headers = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return request({
    url: '/api/analyze-english',
    method: 'POST',
    data: data,
    headers: headers,
    timeout: 60000
  });
}

function validateEnglish(text, category) {
  return request({
    url: '/api/validate-english',
    method: 'POST',
    data: {
      text: String(text || ''),
      cardType: category || 'auto'
    },
    timeout: 5000
  });
}

/**
 * Byte helpers for the NDJSON streaming client. NDJSON lines are delimited by
 * "\n" (0x0A), which never appears inside a multi-byte UTF-8 sequence, so we
 * can buffer raw bytes and only decode whole lines (reassembling any Chinese
 * character split across chunk boundaries).
 */
function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function concatUint8(a, b) {
  if (!a || a.length === 0) {
    return b || new Uint8Array(0);
  }
  if (!b || b.length === 0) {
    return a;
  }
  var out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfByte(bytes, target) {
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === target) {
      return i;
    }
  }
  return -1;
}

function utf8BytesToString(bytes) {
  if (!bytes || bytes.length === 0) {
    return '';
  }

  if (typeof TextDecoder !== 'undefined' && TextDecoder) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {
      // fall through to the manual decoder below
    }
  }

  var out = '';
  var i = 0;
  var n = bytes.length;
  while (i < n) {
    var b = bytes[i];
    var cp;
    var len;
    if (b < 0x80) {
      cp = b;
      len = 1;
    } else if ((b & 0xE0) === 0xC0) {
      cp = b & 0x1F;
      len = 2;
    } else if ((b & 0xF0) === 0xE0) {
      cp = b & 0x0F;
      len = 3;
    } else if ((b & 0xF8) === 0xF0) {
      cp = b & 0x07;
      len = 4;
    } else {
      cp = 0xFFFD;
      len = 1;
    }

    if (i + len > n) {
      out += String.fromCharCode(0xFFFD);
      i += 1;
      continue;
    }

    var valid = true;
    for (var j = 1; j < len; j++) {
      var cb = bytes[i + j];
      if ((cb & 0xC0) !== 0x80) {
        valid = false;
        break;
      }
      cp = (cp << 6) | (cb & 0x3F);
    }

    if (!valid) {
      out += String.fromCharCode(0xFFFD);
      i += 1;
      continue;
    }

    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

/**
 * Stream a single /api/analyze-english/stream call as NDJSON.
 *
 * ``onEvent(obj)`` is invoked for each complete NDJSON object
 * ({type:"start"|"delta"|"field"|"reset"|"final"|"done"}). Resolves with ``final.data`` (the
 * full AnalyzeResponse) when the "done" line arrives; rejects on transport
 * errors. One request — never retries here.
 */
function analyzeEnglishDirectStream(text, category, onEvent, forceRefresh = false, taskHolder = null, idempotencyKey = '', diagnostics = {}) {
  return new Promise((resolve, reject) => {
    const generationId = Number(diagnostics.generationId) || 0;
    const headers = buildHeaders({
      'content-type': 'application/json',
      Accept: 'application/x-ndjson'
      , ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    });

    let byteBuffer = new Uint8Array(0);
    let finalData = null;
    let gotFinal = false;
    let gotChunkBytes = false;
    let settled = false;

    function settleFinal(data) {
      if (settled) return;
      settled = true;
      resolve(data);
    }

    function settleError(error) {
      if (settled) return;
      settled = true;
      const normalized = normalizeRequestError(error);
      if (error && error.aborted) {
        normalized.aborted = true;
      }
      reject(normalized);
    }

    function handleLine(line) {
      if (!line) return;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (_) {
        return; // ignore partial / non-JSON lines
      }
      if (!obj || typeof obj !== 'object') return;

      if (obj.type === 'delta') {
        logAiStreamDiagnostic('stream_delta', {
          generationId,
          idempotencyKey,
          seq: Number(obj.seq) || 0,
          field: String(obj.field || '')
        });
      } else if (obj.type === 'field') {
        logAiStreamDiagnostic('stream_field', {
          generationId,
          idempotencyKey,
          field: String(obj.field || '')
        });
      } else if (obj.type === 'final') {
        logAiStreamDiagnostic('stream_final', { generationId, idempotencyKey });
      } else if (obj.type === 'done') {
        logAiStreamDiagnostic('stream_done', { generationId, idempotencyKey });
      } else if (obj.type === 'reset') {
        logAiStreamDiagnostic('stream_reset', {
          generationId,
          idempotencyKey,
          attempt: Number(obj.attempt) || 0
        });
      }

      if (obj.type === 'final') {
        finalData = obj.data;
        gotFinal = true;
      }
      if (typeof onEvent === 'function') {
        onEvent(obj);
      }
      if (obj.type === 'done') {
        settleFinal(finalData);
      }
    }

    function processBytes(bytes) {
      byteBuffer = concatUint8(byteBuffer, bytes);
      let idx;
      while ((idx = indexOfByte(byteBuffer, 0x0A)) >= 0) {
        const lineBytes = byteBuffer.slice(0, idx);
        byteBuffer = byteBuffer.slice(idx + 1);
        handleLine(utf8BytesToString(lineBytes));
      }
    }

    function handleChunk(res) {
      if (settled) return;
      try {
        const bytes = toUint8Array(res && res.data);
        if (bytes && bytes.length) {
          gotChunkBytes = true;
          logAiStreamDiagnostic('stream_chunk', {
            generationId,
            idempotencyKey,
            chunkBytes: bytes.length
          });
          processBytes(bytes);
        }
      } catch (_) {
        // Ignore a malformed chunk; the request's success/fail callback still
        // settles the stream and can trigger the existing direct fallback.
      }
    }

    try {
      logAiStreamDiagnostic('stream_http_start', {
        generationId,
        idempotencyKey,
        forceRefresh: Boolean(forceRefresh),
        endpoint: '/api/analyze-english/stream'
      });
      const task = wx.request({
        url: buildUrl('/api/analyze-english/stream'),
        method: 'POST',
        data: {
          text: text,
          cardType: category || 'auto',
          targetLang: 'zh',
          ...(forceRefresh ? { forceRefresh: true } : {})
        },
        header: headers,
        enableChunked: true,
        responseType: 'arraybuffer',
        timeout: 60000,
        success(response) {
          if (settled) return;

          // Some runtimes/proxies may deliver the complete body only in the
          // success callback. Parse it only when no chunk bytes were observed,
          // otherwise the same NDJSON events could be handled twice.
          if (!gotChunkBytes) {
            const responseBytes = toUint8Array(response && response.data);
            if (responseBytes && responseBytes.length) {
              processBytes(responseBytes);
            }
          }

          // Flush any trailing bytes that did not end with a newline.
          if (byteBuffer.length) {
            const trailing = utf8BytesToString(byteBuffer);
            byteBuffer = new Uint8Array(0);
            handleLine(trailing);
          }

          if (gotFinal && finalData !== null) {
            settleFinal(finalData);
            return;
          }
          if (response.statusCode >= 200 && response.statusCode < 300) {
            settleError({ errMsg: 'stream ended without final data', statusCode: response.statusCode });
            return;
          }
          settleError({
            errMsg: response.errMsg,
            statusCode: response.statusCode,
            data: response.data
          });
        },
        fail(error) {
          const errMsg = error && error.errMsg ? String(error.errMsg) : '';
          if (errMsg.indexOf('abort') >= 0) {
            settleError(Object.assign({}, error, { aborted: true }));
            return;
          }
          settleError(error);
        }
      });

      if (taskHolder) {
        taskHolder.task = task;
      }


      // WeChat exposes chunk delivery on the RequestTask returned by
      // wx.request, not as an option callback.
      if (task && typeof task.onChunkReceived === 'function') {
        task.onChunkReceived(handleChunk);
      }
    } catch (error) {
      settleError(error);
    }
  });
}

module.exports = {
  BACKEND_BASE_URL,
  BACKEND_AUTH_STORAGE_KEYS,
  clearBackendAuth,
  logoutBackendAuth,
  getAccessToken,
  getCurrentBackendUser,
  getReviewHistoryDetail,
  getSessionSummary,
  getReviewHistory,
  getReviewHistorySummary,
  getTodayReviewed,
  listBackendCards,
  loginWithWechatCode,
  refreshBackendAuth,
  request,
  saveBackendAuth,
  createBackendCard,
  updateBackendCard,
  deleteBackendCard,
  getCardStats,
  createReviewSession,
  getReviewOverview,
  getTodayReview,
  getLexicalInfo,
  buildPronunciationAudioUrl,
  buildTtsDiagnosticTestAudioUrl,
  downloadPronunciationAudio,
  downloadDiagnosticTestAudio,
  getLastTtsRequestId,
  logTtsDiagnostic,
  submitReviewFeedback,
  validateEnglish,
  analyzeEnglishDirect,
  analyzeEnglishDirectStream
};
