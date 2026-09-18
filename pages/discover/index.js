const api = require('../../utils/api/index');
const { downloadPronunciationAudio } = require('../../utils/apiClient');
const { getStoredVoice } = require('../../utils/pronunciation');
const { errorMessage } = require('../../utils/coreViewModels');
const { addMaterialToLibrary, removeMaterialFromLibrary } = require('../../utils/materialLibrary');

const PAGE_SIZE = 20;
const DOMAIN_TITLES = { life: '生活英语', reading: '阅读英语' };

Page({
  data: {
    domain: 'life',
    domainTitle: '生活英语',
    categories: [],
    selectedCategoryCode: '',
    selectedCategoryTitle: '',
    sourceItems: [],
    items: [],
    total: 0,
    nextCursor: '',
    hasMore: false,
    loading: true,
    loadingMore: false,
    errorMessage: '',
    searchText: '',
    markingItemId: '',
    playingItemId: '',
    safeTop: 20
  },

  onLoad(options) {
    const requestedDomain = String(options && options.domain || '').toLowerCase();
    const domain = DOMAIN_TITLES[requestedDomain] ? requestedDomain : 'life';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.audioContext = null;
    this.setData({
      domain,
      domainTitle: DOMAIN_TITLES[domain],
      safeTop: info.statusBarHeight || 20
    });
    this.loadCategories();
  },

  goBack() {
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/index/index' }); } });
  },

  onUnload() {
    if (this.audioContext) {
      try { this.audioContext.destroy(); } catch (_) {}
      this.audioContext = null;
    }
  },

  onPullDownRefresh() {
    this.loadCategories(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.loadItems(false);
  },

  async loadCategories(keepSelection = false) {
    try {
      const response = await api.discovery.listCategories();
      const groups = Array.isArray(response && response.items) ? response.items : [];
      const group = groups.find((item) => item.code === this.data.domain);
      const categories = group && Array.isArray(group.children) ? group.children : [];
      let selected = keepSelection
        ? categories.find((item) => item.code === this.data.selectedCategoryCode)
        : null;
      if (!selected) selected = categories[0];
      this.setData({
        categories,
        selectedCategoryCode: selected ? selected.code : '',
        selectedCategoryTitle: selected ? selected.title : '',
        loading: categories.length > 0,
        errorMessage: categories.length ? '' : '这一类素材还在准备中'
      });
      if (selected) await this.loadItems(true);
    } catch (error) {
      console.warn('[discover] load categories failed', error);
      this.setData({ loading: false, errorMessage: '素材暂时加载失败，请稍后重试' });
    }
  },

  async loadItems(reset) {
    const categoryCode = this.data.selectedCategoryCode;
    if (!categoryCode || (!reset && (this.data.loadingMore || !this.data.hasMore))) return;
    this.setData(reset ? { loading: true, errorMessage: '' } : { loadingMore: true });
    try {
      const response = await api.discovery.listCategoryItems(categoryCode, {
        limit: PAGE_SIZE,
        cursor: reset ? '' : this.data.nextCursor
      });
      const nextItems = Array.isArray(response && response.items) ? response.items : [];
      const sourceItems = reset ? nextItems : this.data.sourceItems.concat(nextItems);
      this.setData({
        sourceItems,
        items: this.filterItems(sourceItems),
        total: Number(response && response.category && response.category.itemCount || sourceItems.length),
        nextCursor: String(response && response.nextCursor || ''),
        hasMore: Boolean(response && response.hasMore),
        loading: false,
        loadingMore: false
      });
    } catch (error) {
      console.warn('[discover] load items failed', error);
      this.setData({ loading: false, loadingMore: false, errorMessage: '素材暂时加载失败，请稍后重试' });
    }
  },

  filterItems(items) {
    const keyword = this.data.searchText.trim().toLowerCase();
    const filtered = keyword
      ? items.filter((item) => [item.content, item.translation, item.chinese]
        .join(' ')
        .toLowerCase()
        .includes(keyword))
      : items.slice();
    return filtered.sort((a, b) => {
      const aRank = a.known ? 2 : (a.inLibrary ? 1 : 0);
      const bRank = b.known ? 2 : (b.inLibrary ? 1 : 0);
      return aRank - bRank;
    });
  },

  onItemTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    if (!itemId) return;
    const url = `/pages/library/detail?id=${itemId}&source=public`;
    wx.navigateTo({
      url,
      fail(error) {
        console.warn('[discover] open detail failed', error);
      }
    });
  },

  onCategoryTap(event) {
    const code = String(event.currentTarget.dataset.code || '');
    const selected = this.data.categories.find((item) => item.code === code);
    if (!selected || code === this.data.selectedCategoryCode) return;
    this.setData({
      selectedCategoryCode: code,
      selectedCategoryTitle: selected.title,
      sourceItems: [],
      items: [],
      total: 0,
      nextCursor: '',
      hasMore: false
    });
    this.loadItems(true);
  },

  onSearchInput(event) {
    const searchText = String(event.detail.value || '');
    this.setData({ searchText }, () => {
      this.setData({ items: this.filterItems(this.data.sourceItems) });
    });
  },

  async onKnownTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    if (!itemId || this.data.markingItemId) return;
    const previousSourceItems = this.data.sourceItems.slice();
    const sourceItems = previousSourceItems.filter((item) => String(item.id) !== itemId);
    this.setData({
      markingItemId: itemId,
      sourceItems,
      items: this.filterItems(sourceItems),
      total: Math.max(0, this.data.total - 1)
    });
    try {
      await api.discovery.setKnown(itemId, true);
      this.setData({ markingItemId: '' });
    } catch (error) {
      console.warn('[discover] mark known failed', error);
      this.setData({
        sourceItems: previousSourceItems,
        items: this.filterItems(previousSourceItems),
        total: previousSourceItems.length,
        markingItemId: ''
      });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  async onRememberTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    const item = this.data.sourceItems.find((candidate) => String(candidate.id) === itemId);
    if (!item || this.data.markingItemId) return;
    this.setData({ markingItemId: itemId });
    try {
      if (item.inLibrary) {
        await removeMaterialFromLibrary({
          id: item.id,
          en: item.content,
          libraryCardId: item.libraryCardId,
          libraryCardVersion: item.libraryCardVersion
        });
        const sourceItems = this.data.sourceItems.map((candidate) => (
          String(candidate.id) === itemId
            ? Object.assign({}, candidate, { inLibrary: false, libraryCardId: '', libraryCardVersion: 0 })
            : candidate
        ));
        this.setData({
          sourceItems,
          items: this.filterItems(sourceItems),
          markingItemId: ''
        });
        wx.showToast({ title: '已从卡片中移除', icon: 'none' });
        return;
      }
      const card = await addMaterialToLibrary(itemId);
      const sourceItems = this.data.sourceItems.map((candidate) => (
        String(candidate.id) === itemId
          ? Object.assign({}, candidate, {
            inLibrary: true,
            libraryCardId: card.id,
            libraryCardVersion: card.version
          })
          : candidate
      ));
      this.setData({
        sourceItems,
        items: this.filterItems(sourceItems),
        markingItemId: ''
      });
      wx.showToast({ title: '已加入卡片', icon: 'success' });
    } catch (error) {
      this.setData({ markingItemId: '' });
      wx.showToast({ title: errorMessage(error, item.inLibrary ? '移除失败，请重试' : '加入失败，请重试'), icon: 'none' });
    }
  },

  async onPronounceTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    const item = this.data.sourceItems.find((candidate) => String(candidate.id) === itemId);
    if (!item || this.data.playingItemId) return;
    this.setData({ playingItemId: itemId });
    try {
      const path = await downloadPronunciationAudio(item.content, getStoredVoice());
      if (!this.audioContext) this.audioContext = wx.createInnerAudioContext();
      this.audioContext.stop();
      this.audioContext.src = path;
      this.audioContext.play();
    } catch (error) {
      console.warn('[discover] pronunciation failed', error);
      wx.showToast({ title: '发音暂不可用', icon: 'none' });
    } finally {
      this.setData({ playingItemId: '' });
    }
  }
});
