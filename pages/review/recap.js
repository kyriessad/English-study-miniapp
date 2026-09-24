Page({
  data: { safeTop: 20, items: [], total: 0, size: 5 },
  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    const menuRightInset = menu && menu.left ? Math.max(0, (info.windowWidth || 375) - menu.left + 8) : 100;
    const recap = wx.getStorageSync('coreReviewRecap') || {};
    try { wx.setStorageSync('todayReviewedNeedsRefresh', true); } catch (_) {}
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      items: Array.isArray(recap.items) ? recap.items : [],
      total: Number(recap.total || 0),
      size: Number(recap.size || 5)
    });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=personal' });
  },
  again() { wx.redirectTo({ url: '/pages/review/review?size=' + this.data.size }); },
  home() { wx.switchTab({ url: '/pages/review/index' }); }
});

