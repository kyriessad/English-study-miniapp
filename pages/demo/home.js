const api = require('../../utils/api/index');
const {
  newClientActionId,
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');

Page({
  data: {
    featured: [],
    safeTop: 20,
    loading: false,
    error: '',
    savingIds: {}
  },

  onLoad() {
    this.setData({ safeTop: this.getSafeTop() });
  },

  onShow() {
    this.refresh();
  },

  getSafeTop() {
    if (wx.getWindowInfo) return wx.getWindowInfo().statusBarHeight || 20;
    return wx.getSystemInfoSync().statusBarHeight || 20;
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const daily = await api.discovery.getTodayQuote();
      const featured = daily.items.slice(0, 3).map((item) => toMaterialView(item));
      this.setData({ featured });
    } catch (error) {
      this.setData({ error: errorMessage(error, '今日推荐加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.refresh(); },
  goDiscover() { wx.navigateTo({ url: '/pages/demo/discover' }); },
  openDiscoverOption(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'books') {
      wx.navigateTo({ url: '/pages/demo/books' });
      return;
    }
    wx.navigateTo({ url: '/pages/demo/scene?type=' + key });
  },
  goAdd() { wx.navigateTo({ url: '/pages/demo/add' }); },
  openFeatured(e) {
    wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=public' });
  },
  playFeature() { wx.showToast({ title: '发音功能将在后续版本开放', icon: 'none' }); },

  async remember(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const current = this.data.featured.find((item) => item.id === id);
    if (!id || !current || current.saved || this.data.savingIds[id]) return;
    this.setData({ [`savingIds.${id}`]: true });
    try {
      await api.discovery.addToLibrary(id, newClientActionId('home-material'), true);
      this.setData({
        featured: this.data.featured.map((item) => (
          item.id === id ? Object.assign({}, item, { saved: true, joined: true }) : item
        ))
      });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ [`savingIds.${id}`]: false });
    }
  }
});
