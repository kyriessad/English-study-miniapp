// 阶段 B 安全版 app.js：
// 1. 恢复 backendAccessToken 从 Storage 到 globalData
// 2. 暂时不在启动阶段自动请求 Python 后端登录

const {
  BACKEND_AUTH_STORAGE_KEYS,
  refreshBackendAuth
} = require('./utils/apiClient');
const { runLegacyStorageCleanup } = require('./utils/legacyStorageCleanup');

App({
  onLaunch() {
    this.restoreBackendAuthFromStorage();
    runLegacyStorageCleanup();

    // 重要：
    // 现在先不在启动阶段自动登录 Python 后端。
    // 阶段 B 继续验收”新增卡片同步失败不影响本地保存”。
    // this.initBackendLoginSafe();
  },

  globalData: {
    backendUserId: '',
    backendAccessToken: '',
    backendLoginAt: '',
    indexViewMode: null
  },

  restoreBackendAuthFromStorage() {
    try {
      this.globalData.backendUserId = wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.userId) || '';
      this.globalData.backendAccessToken = wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken) || '';
      this.globalData.backendLoginAt = wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.loginAt) || '';

      console.log('[backend-auth] restored backend auth from storage');
    } catch (error) {
      console.warn('[backend-auth] Failed to restore backend auth from storage', error);
    }
  },

  initBackendLoginSafe() {
    try {
      if (this.backendLoginPromise) {
        return this.backendLoginPromise;
      }

      this.backendLoginPromise = this.loginBackendSilently()
        .catch((error) => {
          console.warn('[backend-auth] Backend login failed, continue without backend', error);
          return null;
        })
        .finally(() => {
          this.backendLoginPromise = null;
        });

      return this.backendLoginPromise;
    } catch (error) {
      this.backendLoginPromise = null;
      console.warn('[backend-auth] Backend login failed, continue without backend', error);
      return Promise.resolve(null);
    }
  },

  requestWechatLoginCode() {
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
  },

  saveBackendAuth(authData) {
    const backendUserId = authData && authData.user_id ? String(authData.user_id) : '';
    const backendAccessToken = authData && authData.access_token ? String(authData.access_token) : '';

    if (!backendUserId || !backendAccessToken) {
      throw new Error('Backend login response missing user_id or access_token');
    }

    const backendLoginAt = new Date().toISOString();

    wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.userId, backendUserId);
    wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.accessToken, backendAccessToken);
    wx.setStorageSync(BACKEND_AUTH_STORAGE_KEYS.loginAt, backendLoginAt);

    this.globalData.backendUserId = backendUserId;
    this.globalData.backendAccessToken = backendAccessToken;
    this.globalData.backendLoginAt = backendLoginAt;

    return {
      backendUserId,
      backendAccessToken,
      backendLoginAt
    };
  },

  async loginBackendSilently() {
    try {
      console.log('[backend-auth] Starting backend login');

      const backendAuth = await refreshBackendAuth();

      console.log('[backend-auth] Backend login success, backend user id:', backendAuth.backendUserId);
      return backendAuth;
    } catch (error) {
      console.warn('[backend-auth] Backend login failed, continue without backend', error);
      return null;
    }
  }
});
