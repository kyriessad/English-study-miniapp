const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');

Page({
  data: {
    safeTop: 20,
    menuRightInset: 88,
    loading: true,
    error: '',
    item: null,
    title: '',
    english: '',
    chinese: '',
    whereEncountered: '',
    notes: ''
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 88;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 8, 0);
    } catch (_) {}
    this.id = options.id;
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset
    });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const passage = await api.passages.get(this.id);
      this.setData({
        item: passage,
        title: passage.title || '长文本',
        english: passage.englishText || passage.content || '',
        chinese: passage.understanding || passage.translation || '',
        whereEncountered: passage.whereEncountered || '',
        notes: passage.note || ''
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '长文本加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.load(); },
  goBack() {
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/library/index' }); } });
  },
  goEdit() {
    wx.navigateTo({ url: '/pages/add/add?passageId=' + encodeURIComponent(this.id) });
  }
});
