// Local development placeholder.
// 127.0.0.1 only works when testing in WeChat DevTools on this machine.
// Real devices and production builds must use a cloud-hosted HTTPS domain.
const BACKEND_BASE_URL = 'http://127.0.0.1:8001';

const BACKEND_AUTH_STORAGE_KEYS = {
  userId: 'backendUserId',
  accessToken: 'backendAccessToken',
  loginAt: 'backendLoginAt'
};

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedBase = BACKEND_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.charAt(0) === '/' ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getAccessToken() {
  try {
    return wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken) || '';
  } catch (error) {
    console.warn('[apiClient] Failed to read backend access token', error);
    return '';
  }
}

function buildHeaders(headers) {
  const mergedHeaders = Object.assign(
    {
      'content-type': 'application/json'
    },
    headers || {}
  );
  const accessToken = getAccessToken();

  if (accessToken && !mergedHeaders.Authorization && !mergedHeaders.authorization) {
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

function request(options) {
  const requestOptions = options || {};

  return new Promise((resolve, reject) => {
    try {
      wx.request({
        url: buildUrl(requestOptions.url || requestOptions.path || ''),
        method: requestOptions.method || 'GET',
        data: requestOptions.data || {},
        header: buildHeaders(requestOptions.header || requestOptions.headers),
        timeout: requestOptions.timeout || 10000,
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response.data);
            return;
          }

          const normalizedError = normalizeRequestError({
            errMsg: response.errMsg,
            statusCode: response.statusCode,
            data: response.data
          });
          reject(normalizedError);
        },
        fail(error) {
          const normalizedError = normalizeRequestError(error);
          reject(normalizedError);
        }
      });
    } catch (error) {
      const normalizedError = normalizeRequestError(error);
      reject(normalizedError);
    }
  });
}

function loginWithWechatCode(code) {
  return request({
    url: '/api/auth/wechat-login',
    method: 'POST',
    data: {
      code
    }
  });
}

async function createBackendCard(card) {
  let token = '';

  try {
    token = wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken) || '';
  } catch (error) {
    console.warn('[backend-card] failed to read backendAccessToken, skip backend sync', error);
  }

  if (!token) {
    console.warn('[backend-card] missing backendAccessToken, skip backend sync');
    return {
      ok: false,
      skipped: true,
      reason: 'missing_token'
    };
  }

  return request({
    url: '/api/cards',
    method: 'POST',
    header: {
      Authorization: `Bearer ${token}`
    },
    data: card
  });
}

module.exports = {
  BACKEND_BASE_URL,
  BACKEND_AUTH_STORAGE_KEYS,
  getAccessToken,
  request,
  loginWithWechatCode,
  createBackendCard
};
