const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');

Page({
  data: {
    safeTop: 20,
    loading: true,
    error: '',
    items: []
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.listening.list();
      this.setData({ items: response.items || [], loading: false });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '听力素材加载失败') });
    }
  },

  retryLoad() { this.load(); },
  goBack() {
    wx.navigateBack({ fail() { wx.navigateTo({ url: '/pages/discover/index' }); } });
  },
  openItem(event) {
    const sourceId = String(event.currentTarget.dataset.id || '');
    if (!sourceId) return;
    wx.navigateTo({ url: '/pages/listening/play?id=' + encodeURIComponent(sourceId) });
  }
});
