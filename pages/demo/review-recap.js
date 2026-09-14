Page({
  data: { safeTop: 20, items: [], total: 0, size: 5 },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const recap = wx.getStorageSync('coreReviewRecap') || {};
    this.setData({
      safeTop: info.statusBarHeight || 20,
      items: Array.isArray(recap.items) ? recap.items : [],
      total: Number(recap.total || 0),
      size: Number(recap.size || 5)
    });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=personal' });
  },
  again() { wx.redirectTo({ url: '/pages/demo/review-session?size=' + this.data.size }); },
  home() { wx.switchTab({ url: '/pages/demo/review' }); }
});
