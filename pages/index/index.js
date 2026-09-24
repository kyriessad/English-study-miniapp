const api = require('../../utils/api/index');
const { downloadPronunciationAudio } = require('../../utils/apiClient');
const { getStoredVoice } = require('../../utils/pronunciation');
const {
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');
const { attachTabPage } = require('../../utils/tabChrome');
const { addMaterialToLibrary } = require('../../utils/materialLibrary');
const { saveDiscoveryPrefill } = require('../../utils/discoveryPrefill');
const { dailyGoal, overviewView } = require('../../utils/reviewOverview');

function heroTextClass(text) {
  const length = String(text || '').trim().length;
  if (length > 68) return 'recommendation-english-small';
  if (length > 34) return 'recommendation-english-compact';
  return '';
}

function clean(value) { return String(value || '').trim(); }
function mapSearchResult(item) {
  const source = item && typeof item === 'object' ? item : {};
  const senses = Array.isArray(source.senses) ? source.senses.map((sense) => {
    const meanings = Array.isArray(sense && sense.meanings) ? sense.meanings.map(clean).filter(Boolean) : [];
    const examples = Array.isArray(sense && sense.examples) ? sense.examples.map((example) => ({
      en: clean(example && (example.en || example.english)),
      zh: clean(example && (example.zh || example.chinese))
    })).filter((example) => example.en) : [];
    return { pos: clean(sense && sense.pos), meaningsText: meanings.join('；'), examples };
  }).filter((sense) => sense.meaningsText || sense.examples.length) : [];
  const sources = Array.isArray(source.sources) ? source.sources.map((entry) => ({
    bookCode: clean(entry && entry.book_code),
    itemId: clean(entry && entry.item_id)
  })).filter((entry) => entry.itemId) : [];
  return {
    content: clean(source.content),
    chinese: clean(source.chinese) || senses.map((sense) => [sense.pos, sense.meaningsText].filter(Boolean).join(' ')).join('；'),
    phonetic: clean(source.phonetic),
    senses,
    exampleEn: clean(source.example_en || source.exampleEn) || clean(senses[0] && senses[0].examples[0] && senses[0].examples[0].en),
    exampleZh: clean(source.example_zh || source.exampleZh) || clean(senses[0] && senses[0].examples[0] && senses[0].examples[0].zh),
    collocations: (Array.isArray(source.collocations) ? source.collocations : []).map((entry) => ({
      en: clean(entry && (entry.en || entry.english)),
      zh: clean(entry && (entry.zh || entry.chinese))
    })).filter((entry) => entry.en).slice(0, 4),
    sources
  };
}

Page({
  data: {
    featured: null,
    safeTop: 20,
    menuRightInset: 96,
    isAndroid: false,
    dateLabel: '',
    greeting: 'Good morning.',
    loading: false,
    error: '',
    savingIds: {},
    tabEnter: false,
    playingFeature: false,
    searchOpen: false,
    searchQuery: '',
    searchFocus: false,
    searchLoading: false,
    searchError: '',
    searchResults: [],
    searchSearched: false,
    selectedSearchIndex: -1,
    playingSearchIndex: -1
  },

  onLoad() {
    const now = new Date();
    this.setData(Object.assign({}, this.getChromeMetrics(), {
      dateLabel: this.formatDate(now),
      greeting: this.getGreeting(now.getHours())
    }));
  },

  onShow() {
    attachTabPage(this, 0);
    this.refresh();
    this.refreshReview();
  },

  async refreshReview() {
    try {
      const overview = await api.reviews.getOverview({ daily_goal: dailyGoal() });
      this.setData(overviewView(overview));
    } catch (_) {
      this.setData({ overviewReady: false });
    }
  },
  goReview() { wx.switchTab({ url: '/pages/review/index' }); },
  goLibrary() { wx.switchTab({ url: '/pages/library/index' }); },
  onHide() { if (this.audioContext) this.audioContext.stop(); },

  getChromeMetrics() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const device = wx.getDeviceInfo ? wx.getDeviceInfo() : info;
    const platform = String((device && device.platform) || info.platform || '').toLowerCase();
    const isAndroid = platform === 'android';
    const safeTop = info.statusBarHeight || 20;
    let menuRightInset = 96;
    const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 10, 0);
    return { safeTop, menuRightInset, isAndroid };
  },

  formatDate(date) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  },

  getGreeting(hour) {
    if (hour >= 5 && hour < 12) return 'Good morning.';
    if (hour >= 12 && hour < 18) return 'Good afternoon.';
    return 'Good evening.';
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const daily = await api.discovery.getTodayQuote();
      const item = (daily.items || [])[0];
      const view = item ? toMaterialView(item) : null;
      this.setData({
        featured: view ? Object.assign({}, view, { heroTextClass: heroTextClass(view.en) }) : null
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '今日推荐加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.refresh(); },
  goSearch() {
    this.setData({ searchOpen: true, searchFocus: false, searchQuery: '', searchLoading: false, searchError: '', searchResults: [], searchSearched: false }, () => {
      this.setData({ searchFocus: true });
    });
  },
  closeSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchGeneration = (this.searchGeneration || 0) + 1;
    wx.hideKeyboard({ fail() {} });
    if (this.audioContext) this.audioContext.stop();
    this.setData({ searchOpen: false, searchFocus: false, searchQuery: '', searchLoading: false, searchError: '', searchResults: [], searchSearched: false, selectedSearchIndex: -1, playingSearchIndex: -1 });
  },
  clearSearchQuery() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchGeneration = (this.searchGeneration || 0) + 1;
    this.setData({ searchQuery: '', searchLoading: false, searchError: '', searchResults: [], searchSearched: false, searchFocus: true, selectedSearchIndex: -1 });
  },
  onSearchInput(event) {
    const searchQuery = event.detail.value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchGeneration = (this.searchGeneration || 0) + 1;
    this.setData({ searchQuery, searchError: '', searchResults: [], searchSearched: false, selectedSearchIndex: -1 });
    if (!clean(searchQuery)) { this.setData({ searchLoading: false }); return; }
    this.searchTimer = setTimeout(() => this.searchDatabase(searchQuery), 260);
  },
  onSearchConfirm() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    wx.hideKeyboard({ fail() {} });
    this.searchDatabase(this.data.searchQuery);
  },
  async searchDatabase(rawQuery) {
    const query = clean(rawQuery);
    if (!query) return;
    const generation = (this.searchGeneration || 0) + 1;
    this.searchGeneration = generation;
    this.setData({ searchLoading: true, searchError: '' });
    try {
      const response = await api.wordbooks.search(query, 12, { generateAi: false });
      if (generation !== this.searchGeneration) return;
      this.setData({ searchResults: (response.items || []).map(mapSearchResult), searchSearched: true, selectedSearchIndex: -1 });
    } catch (error) {
      if (generation !== this.searchGeneration) return;
      this.setData({ searchError: errorMessage(error, '搜索失败，请重试'), searchSearched: true, searchResults: [] });
    } finally {
      if (generation === this.searchGeneration) this.setData({ searchLoading: false });
    }
  },
  openSearchResult(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.searchResults[index]) return;
    wx.hideKeyboard({ fail() {} });
    this.setData({ selectedSearchIndex: this.data.selectedSearchIndex === index ? -1 : index, searchFocus: false });
  },
  async playSearchResult(event) {
    const index = Number(event.currentTarget.dataset.index);
    const result = this.data.searchResults[index];
    if (!result || !result.content || this.data.playingSearchIndex >= 0) return;
    this.setData({ playingSearchIndex: index });
    try {
      const path = await downloadPronunciationAudio(result.content, getStoredVoice());
      if (!this.audioContext) this.audioContext = wx.createInnerAudioContext();
      this.audioContext.stop();
      this.audioContext.src = path;
      this.audioContext.play();
    } catch (_) {
      wx.showToast({ title: '发音暂不可用', icon: 'none' });
    } finally {
      this.setData({ playingSearchIndex: -1 });
    }
  },
  saveSearchResult(event) {
    const result = this.data.searchResults[Number(event.currentTarget.dataset.index)];
    if (!result || !result.content) return;
    saveDiscoveryPrefill({ content: result.content, translation: result.chinese, cardType: 'word' }, '词库查找');
    wx.navigateTo({ url: '/pages/add/add' });
  },
  goDiscover() { wx.navigateTo({ url: '/pages/discover/index' }); },
  goAdd() { wx.navigateTo({ url: '/pages/add/add' }); },
  openFeatured() {
    const featured = this.data.featured;
    if (!featured || !featured.id) return;
    wx.navigateTo({ url: '/pages/library/detail?id=' + featured.id + '&source=public' });
  },
  onUnload() {
    if (this.audioContext) {
      try { this.audioContext.destroy(); } catch (_) {}
      this.audioContext = null;
    }
  },

  async playFeature() {
    const text = String((this.data.featured && this.data.featured.en) || '').trim();
    if (!text || this.data.playingFeature) return;
    this.setData({ playingFeature: true });
    try {
      const path = await downloadPronunciationAudio(text, getStoredVoice());
      if (!this.audioContext) this.audioContext = wx.createInnerAudioContext();
      this.audioContext.stop();
      this.audioContext.src = path;
      this.audioContext.play();
    } catch (error) {
      wx.showToast({ title: '发音暂不可用', icon: 'none' });
    } finally {
      this.setData({ playingFeature: false });
    }
  },

  rememberHero() {
    const hero = this.data.featured;
    if (!hero) return;
    this.remember({ currentTarget: { dataset: { id: hero.id } } });
  },

  stopHeroFooterTap() {},

  async remember(e) {
    const id = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '');
    const current = this.data.featured && this.data.featured.id === id ? this.data.featured : null;
    if (!id || !current || this.data.savingIds[id]) return;
    this.savingLock = Object.assign({}, this.savingLock, { [id]: true });
    this.setData({ savingIds: Object.assign({}, this.data.savingIds, { [id]: true }) });
    try {
      if (current.saved) {
        this.goLibrary();
        return;
      }
      const card = await addMaterialToLibrary(id);
      this.setData({
        featured: Object.assign({}, current, {
          saved: true,
          joined: true,
          libraryCardId: card.id,
          libraryCardVersion: card.version
        })
      });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
      this.refreshReview();
    } catch (error) {
      wx.showToast({ title: errorMessage(error, current.saved ? '移除失败，请重试' : '加入失败，请重试'), icon: 'none' });
    } finally {
      const savingIds = Object.assign({}, this.data.savingIds);
      delete savingIds[id];
      if (this.savingLock) delete this.savingLock[id];
      this.setData({ savingIds });
    }
  }
});
