// Local development placeholder.
// 127.0.0.1 only works when testing in WeChat DevTools on this machine.
// Real devices and production builds must use a cloud-hosted HTTPS domain.
const BACKEND_BASE_URL = 'http://127.0.0.1:8001';

const BACKEND_AUTH_STORAGE_KEYS = {
  userId: 'backendUserId',
  accessToken: 'backendAccessToken',
  loginAt: 'backendLoginAt'
};

let refreshPromise = null;

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedBase = BACKEND_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.charAt(0) === '/' ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildQueryString(params = {}) {
  const pairs = Object.keys(params || {})
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);

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

function buildHeaders(headers, options = {}) {
  const mergedHeaders = Object.assign(
    {
      'content-type': 'application/json'
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

  refreshPromise = (async () => {
    const code = await requestWechatLoginCode();
    const authData = await loginWithWechatCode(code);
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
      !requestOptions._hasRetriedAuth
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

function getReviewOverview() {
  return request({
    url: '/api/reviews/overview',
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

function getTodayReview({ limit = 5, restart = false } = {}) {
  return request({
    url: `/api/reviews/today${buildQueryString({ limit, restart: restart ? 'true' : '' })}`,
    method: 'GET'
  });
}

/**
 * Phase 3: submit review feedback with client_action_id for idempotency.
 */
function submitReviewFeedback({ client_action_id, session_id, session_item_id, card_id, result }) {
  return request({
    url: '/api/reviews/feedback',
    method: 'POST',
    data: {
      client_action_id,
      session_id,
      session_item_id,
      card_id,
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

module.exports = {
  BACKEND_BASE_URL,
  BACKEND_AUTH_STORAGE_KEYS,
  clearBackendAuth,
  getAccessToken,
  getCurrentBackendUser,
  getSessionSummary,
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
  submitReviewFeedback
};
