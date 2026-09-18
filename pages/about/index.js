const DEVELOPER_EMAIL = '1790624614@qq.com';

Page({
  data: {
    safeTop: 20
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  goBack() {
    wx.navigateBack({ fail() { wx.navigateTo({ url: '/pages/settings/index' }); } });
  },

  onContactDeveloper() {
    wx.showModal({
      title: '联系开发者',
      content: '开发者邮箱：' + DEVELOPER_EMAIL + '\n\n如有使用问题或功能建议，欢迎发邮件反馈，描述操作步骤或附截图说明更佳。',
      cancelText: '取消',
      confirmText: '复制邮箱',
      success(res) {
        if (res.confirm) {
          wx.setClipboardData({
            data: DEVELOPER_EMAIL,
            success() {
              wx.showToast({ title: '邮箱已复制', icon: 'success' });
            }
          });
        }
      }
    });
  }
});
