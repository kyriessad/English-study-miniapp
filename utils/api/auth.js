const transport = require('./transport');
const { mapAuthResponse, mapUser } = require('./mappers');

const authApi = {
  loginWithWechatCode(code) {
    return transport.request({
      url: '/api/auth/wechat-login',
      method: 'POST',
      data: { code },
      skipAuthHeader: true,
      skipAuthRefresh: true
    }).then(mapAuthResponse);
  },

  getCurrentUser() {
    return transport.request({ url: '/api/auth/me', method: 'GET' }).then(mapUser);
  },

  logout() {
    return transport.logoutBackendAuth();
  },

  getState() {
    return transport.getBackendAuthState();
  },

  ensureAuthenticated() {
    return transport.ensureBackendAuth();
  }
};

module.exports = authApi;
