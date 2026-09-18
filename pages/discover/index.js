const api = require('../../utils/api/index');
const { downloadPronunciationAudio } = require('../../utils/apiClient');
const { getStoredVoice } = require('../../utils/pronunciation');
const { errorMessage } = require('../../utils/coreViewModels');
const { addMaterialToLibrary, removeMaterialFromLibrary } = require('../../utils/materialLibrary');

const PAGE_SIZE = 20;
const DOMAIN_TITLES = { life: '生活英语', reading: '阅读英语' };

Page({
  data: {
    viewMode: 'hub',
    domain: '',
    domainTitle: '',
    categories: [],
    selectedCategoryCode: '',
    selectedCategoryTitle: '',
    sourceItems: [],
    items: [],
    total: 0,
    nextCursor: '',
    hasMore: false,
    loading: false,
    loadingMore: false,
    errorMessage: '',
    searchText: '',
    markingItemId: '',
    leavingItemId: '',
    playingItemId: '',
    safeTop: 20
  },

  onLoad(options) {
    const requestedDomain = String(options && options.domain || '').toLowerCase();
    const domain = DOMAIN_TITLES[requestedDomain] ? requestedDomain : '';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.audioContext = null;
    this.enteredWithDomain = Boolean(domain);
    this.setData({
      viewMode: domain ? 'list' : 'hub',
      domain,
      domainTitle: domain ? DOMAIN_TITLES[domain] : '',
      loading: Boolean(domain),
      safeTop: info.statusBarHeight || 20
    });
    if (domain) this.loadCategories();
  },

  goBack() {
    if (this.data.viewMode === 'list' && !this.enteredWithDomain) {
      this.setData({
        viewMode: 'hub',
        domain: '',
        domainTitle: '',
        categories: [],
        selectedCategoryCode: '',
        selectedCategoryTitle: '',
        sourceItems: [],
        items: [],
        searchText: '',
        loading: false,
        errorMessage: '',
        markingItemId: '',
        leavingItemId: ''
      });
      return;
    }
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/index/index' }); } });
  },

  openHubOption(event) {
    const key = String(event.currentTarget.dataset.key || '');
    if (key === 'books') {
      wx.navigateTo({ url: '/pages/wordbooks/index' });
      return;
    }
    if (key === 'listening') {
      wx.navigateTo({ url: '/pages/listening/index' });
      return;
    }
    if (!DOMAIN_TITLES[key]) return;
    this.setData({
      viewMode: 'list',
      domain: key,
      domainTitle: DOMAIN_TITLES[key],
      loading: true,
      errorMessage: ''
    });
    this.loadCategories();
  },

  onUnload() {
    if (this.audioContext) {
      try { this.audioContext.destroy(); } catch (_) {}
      this.audioContext = null;
    }
  },

  onPullDownRefresh() {
    if (this.data.viewMode !== 'list') {
      wx.stopPullDownRefresh();
      return;
    }
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
    return filtered;
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

  _patchItem(itemId, patch) {
    const sourceItems = this.data.sourceItems.map((candidate) => (
      String(candidate.id) === String(itemId)
        ? Object.assign({}, candidate, patch)
        : candidate
    ));
    this.setData({
      sourceItems,
      items: this.filterItems(sourceItems)
    });
    return sourceItems;
  },

  async onKnownTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    if (!itemId || this.data.markingItemId || this.data.leavingItemId) return;
    const previousSourceItems = this.data.sourceItems.slice();
    this.setData({
      markingItemId: itemId,
      leavingItemId: itemId
    });
    await new Promise((resolve) => setTimeout(resolve, 240));
    if (this.data.leavingItemId !== itemId) return;
    const sourceItems = previousSourceItems.filter((item) => String(item.id) !== itemId);
    this.setData({
      sourceItems,
      items: this.filterItems(sourceItems),
      total: Math.max(0, this.data.total - 1)
    });
    try {
      await api.discovery.setKnown(itemId, true);
      this.setData({ markingItemId: '', leavingItemId: '' });
    } catch (error) {
      console.warn('[discover] mark known failed', error);
      this.setData({
        sourceItems: previousSourceItems,
        items: this.filterItems(previousSourceItems),
        total: previousSourceItems.length,
        markingItemId: '',
        leavingItemId: ''
      });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  async onRememberTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    const item = this.data.sourceItems.find((candidate) => String(candidate.id) === itemId);
    if (!item || this.data.markingItemId || this.data.leavingItemId) return;
    const removing = Boolean(item.inLibrary);
    const previous = {
      inLibrary: item.inLibrary,
      libraryCardId: item.libraryCardId,
      libraryCardVersion: item.libraryCardVersion
    };
    this.setData({ markingItemId: itemId });
    this._patchItem(itemId, removing
      ? { inLibrary: false, libraryCardId: '', libraryCardVersion: 0 }
      : { inLibrary: true });
    wx.showToast({ title: removing ? '已移出' : '已加入', icon: 'none' });
    try {
      if (removing) {
        await removeMaterialFromLibrary({
          id: item.id,
          en: item.content,
          libraryCardId: previous.libraryCardId,
          libraryCardVersion: previous.libraryCardVersion
        });
      } else {
        const card = await addMaterialToLibrary(itemId);
        this._patchItem(itemId, {
          inLibrary: true,
          libraryCardId: card.id,
          libraryCardVersion: card.version
        });
      }
      this.setData({ markingItemId: '' });
    } catch (error) {
      this._patchItem(itemId, previous);
      this.setData({ markingItemId: '' });
      wx.showToast({ title: errorMessage(error, removing ? '移除失败，请重试' : '加入失败，请重试'), icon: 'none' });
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
