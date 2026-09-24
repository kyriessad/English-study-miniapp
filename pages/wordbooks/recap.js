const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };

Page({
  data: { safeTop: 20, items: [], total: 0, bookCode: '', bookLabel: '' },
  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    const menuRightInset = menu && menu.left ? Math.max(0, (info.windowWidth || 375) - menu.left + 8) : 100;
    const recap = wx.getStorageSync('wordbookStudyRecap') || {};
    const bookCode = options.code || recap.bookCode || '';
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      items: Array.isArray(recap.items) ? recap.items : [],
      total: Number(recap.total || 0),
      bookCode,
      bookLabel: BOOK_MARKS[bookCode] || bookCode.toUpperCase()
    });
  },
  open(e) {
    wx.navigateTo({
      url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=public&from=wordbook&book=' + encodeURIComponent(this.data.bookCode)
    });
  },
  again() {
    wx.redirectTo({ url: '/pages/wordbooks/study?code=' + encodeURIComponent(this.data.bookCode) });
  },
  home() {
    wx.redirectTo({ url: '/pages/wordbooks/detail?id=' + encodeURIComponent(this.data.bookCode) });
  }
});
