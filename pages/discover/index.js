const {
  getDiscoveryPacks,
  getDiscoveryItems,
  setDiscoveryItemKnown,
  downloadPronunciationAudio
} = require('../../utils/apiClient');
const { getStoredVoice } = require('../../utils/pronunciation');
const { saveDiscoveryPrefill } = require('../../utils/discoveryPrefill');

const PAGE_SIZE = 20;

Page({
  data: {
    packs: [],
    selectedPackCode: '',
    selectedPackTitle: '',
    items: [],
    total: 0,
    loading: true,
    loadingMore: false,
    errorMessage: '',
    searchText: '',
    markingItemId: '',
    playingItemId: ''
  },

  onLoad(options) {
    this.initialPackCode = String(options && options.pack || '');
    this.searchTimer = null;
    this.audioContext = null;
    this.loadPacks();
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.audioContext) {
      try { this.audioContext.destroy(); } catch (_) {}
      this.audioContext = null;
    }
  },

  onPullDownRefresh() {
    Promise.all([this.loadPacks(true), this.loadItems(true)]).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.loadingMore && this.data.items.length < this.data.total) this.loadItems(false);
  },

  async loadPacks(keepSelection = false) {
    try {
      const response = await getDiscoveryPacks();
      const packs = Array.isArray(response && response.items) ? response.items : [];
      let selected = keepSelection
        ? packs.find((item) => item.code === this.data.selectedPackCode)
        : packs.find((item) => item.code === this.initialPackCode);
      if (!selected) selected = packs[0];
      this.setData({
        packs,
        selectedPackCode: selected ? selected.code : '',
        selectedPackTitle: selected ? selected.title : '',
        loading: packs.length ? this.data.loading : false,
        errorMessage: packs.length ? '' : '素材还在准备中'
      });
      if (!keepSelection) await this.loadItems(true);
    } catch (error) {
      console.warn('[discover] load packs failed', error);
      this.setData({ loading: false, errorMessage: '素材暂时加载失败，请稍后重试' });
    }
  },

  async loadItems(reset) {
    const pack = this.data.selectedPackCode;
    if (!pack || (!reset && this.data.loadingMore)) return;
    const offset = reset ? 0 : this.data.items.length;
    this.setData(reset ? { loading: true, errorMessage: '' } : { loadingMore: true });
    try {
      const response = await getDiscoveryItems({
        pack,
        limit: PAGE_SIZE,
        offset,
        q: this.data.searchText
      });
      const nextItems = Array.isArray(response && response.items) ? response.items : [];
      this.setData({
        items: reset ? nextItems : this.data.items.concat(nextItems),
        total: Number(response && response.total || 0),
        loading: false,
        loadingMore: false
      });
    } catch (error) {
      console.warn('[discover] load items failed', error);
      this.setData({ loading: false, loadingMore: false, errorMessage: '素材暂时加载失败，请稍后重试' });
    }
  },

  onPackTap(event) {
    const code = String(event.currentTarget.dataset.code || '');
    const selected = this.data.packs.find((item) => item.code === code);
    if (!selected || code === this.data.selectedPackCode) return;
    this.setData({ selectedPackCode: code, selectedPackTitle: selected.title, items: [], total: 0 });
    this.loadItems(true);
  },

  onSearchInput(event) {
    this.setData({ searchText: String(event.detail.value || '') });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadItems(true), 350);
  },

  async onKnownTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    if (!itemId || this.data.markingItemId) return;
    const previousItems = this.data.items.slice();
    this.setData({
      markingItemId: itemId,
      items: previousItems.filter((item) => String(item.id) !== itemId),
      total: Math.max(0, this.data.total - 1)
    });
    try {
      await setDiscoveryItemKnown(itemId, true);
      const packs = this.data.packs.map((pack) => pack.code === this.data.selectedPackCode
        ? { ...pack, remaining_count: Math.max(0, Number(pack.remaining_count || 0) - 1) }
        : pack);
      this.setData({ packs, markingItemId: '' });
    } catch (error) {
      console.warn('[discover] mark known failed', error);
      this.setData({ items: previousItems, total: previousItems.length, markingItemId: '' });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  onRememberTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate) => String(candidate.id) === itemId);
    if (!item) return;
    if (item.in_library) {
      wx.showToast({ title: '已经在卡片库里了', icon: 'none' });
      return;
    }
    saveDiscoveryPrefill(item, `发现素材 · ${item.pack_title || this.data.selectedPackTitle}`);
    const url = '/pages/add/add?from=discovery';
    wx.navigateTo({
      url,
      fail(error) {
        console.warn('[discover] navigate to add failed; using redirect', error);
        wx.redirectTo({ url });
      }
    });
  },

  async onPronounceTap(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    const item = this.data.items.find((candidate) => String(candidate.id) === itemId);
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
