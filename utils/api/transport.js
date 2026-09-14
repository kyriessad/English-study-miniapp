// The legacy apiClient remains the only wx.request implementation.
const client = require('../apiClient');

module.exports = {
  request: client.request,
  getAccessToken: client.getAccessToken,
  getBackendAuthState: client.getBackendAuthState,
  ensureBackendAuth: client.ensureBackendAuth,
  refreshBackendAuth: client.refreshBackendAuth,
  logoutBackendAuth: client.logoutBackendAuth,
  clearBackendAuth: client.clearBackendAuth,
  saveBackendAuth: client.saveBackendAuth,
  BACKEND_AUTH_STORAGE_KEYS: client.BACKEND_AUTH_STORAGE_KEYS
};
