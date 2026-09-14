const api = require('../../utils/api/index');
const {
  newClientActionId,
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');

Page({
  data: {
    safeTop: 20,
    type: 'life',
    title: '生活英语',
    categories: [],
    selectedCode: '',
    selectedTitle: '',
    items: [],
    loading: false,
    loadingMore: false,
    nextCursor: null,
    reachedEnd: false,
    error: '',
    savingIds: {}
  },

  onLoad(options) {
    const type = options.type === 'reading' ? 'reading' : 'life';
    this.setData({
      type,
      title: type === 'reading' ? '阅读英语' : '生活英语'
    });
    this.loadCategories();
  },

  onReady() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  async loadCategories() {
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.discovery.listCategories();
      const group = response.items.find((item) => item.code === this.data.type);
      const categories = group && group.children ? group.children : [];
      if (!categories.length) throw new Error('当前分类暂无公开素材');
      this.setData({
        categories,
        selectedCode: categories[0].code,
        selectedTitle: categories[0].title
      });
      await this.loadItems(false);
    } catch (error) {
      this.setData({ error: errorMessage(error, '公开素材加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  selectCategory(e) {
    const code = e.currentTarget.dataset.code;
    const category = this.data.categories.find((item) => item.code === code);
    if (!category || code === this.data.selectedCode) return;
    this.setData({ selectedCode: code, selectedTitle: category.title, nextCursor: null, reachedEnd: false });
    this.loadItems(false);
  },

  async loadItems(append) {
    if (!this.data.selectedCode || this.data.loadingMore) return;
    this.setData({ loadingMore: true, error: '' });
    try {
      const response = await api.discovery.listCategoryItems(this.data.selectedCode, {
        limit: 20,
        cursor: append ? this.data.nextCursor : undefined
      });
      const nextItems = response.items.map((item) => toMaterialView(item));
      const items = append ? this.data.items.concat(nextItems) : nextItems;
      this.setData({
        items,
        nextCursor: response.nextCursor,
        reachedEnd: !response.hasMore
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '公开素材加载失败') });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  async remember(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const current = this.data.items.find((item) => item.id === id);
    if (!id || !current || current.joined || this.data.savingIds[id]) return;
    this.setData({ [`savingIds.${id}`]: true });
    try {
      await api.discovery.addToLibrary(id, newClientActionId('scene-material'), true);
      this.setData({
        items: this.data.items.map((item) => (
          item.id === id ? Object.assign({}, item, { joined: true, saved: true }) : item
        ))
      });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ [`savingIds.${id}`]: false });
    }
  },

  openDetail(e) {
    wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=public' });
  },
  changeBatch() {
    this.setData({ nextCursor: null, reachedEnd: false });
    this.loadItems(false);
  },
  onReachBottom() {
    if (!this.data.reachedEnd) this.loadItems(true);
  },
  retryLoad() {
    if (this.data.categories.length) this.loadItems(false);
    else this.loadCategories();
  },
  play() { wx.showToast({ title: '发音功能将在后续版本开放', icon: 'none' }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
