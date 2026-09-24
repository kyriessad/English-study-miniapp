const api = require('../../utils/api/index');
const { saveDiscoveryPrefill } = require('../../utils/discoveryPrefill');
const { createPronunciationController } = require('../../utils/pronunciation');

const RECENT_KEY = 'englishSearch.recents.v1';

function clean(value) { return String(value || '').trim(); }

function mapSense(value) {
  const source = value && typeof value === 'object' ? value : {};
  const meanings = Array.isArray(source.meanings)
    ? source.meanings.map(clean).filter(Boolean)
    : (clean(source.meaning) ? [clean(source.meaning)] : []);
  const examples = Array.isArray(source.examples)
    ? source.examples.map((example) => ({
      en: clean(example && (example.en || example.english)),
      zh: clean(example && (example.zh || example.chinese))
    })).filter((example) => example.en)
    : [];
  return {
    pos: clean(source.pos),
    meanings,
    meaningsText: meanings.join('、'),
    examples
  };
}

function mapResult(item) {
  const source = item && typeof item === 'object' ? item : {};
  const sources = Array.isArray(source.sources) ? source.sources.map((entry) => ({
    bookCode: clean(entry && entry.book_code),
    itemId: clean(entry && entry.item_id),
    position: Number(entry && entry.position || 0)
  })).filter((entry) => entry.itemId) : [];
  const pos = Array.isArray(source.pos) ? source.pos.map(clean).filter(Boolean) : [];
  const senses = Array.isArray(source.senses) ? source.senses.map(mapSense).filter((sense) => sense.meaningsText || sense.examples.length) : [];
  return {
    content: clean(source.content),
    chinese: clean(source.chinese),
    phonetic: clean(source.phonetic),
    pos,
    posLabel: pos.join(' / '),
    senses,
    exact: Boolean(source.exact),
    sources,
    exampleEn: clean(source.example_en || source.exampleEn),
    exampleZh: clean(source.example_zh || source.exampleZh),
    collocations: (Array.isArray(source.collocations) ? source.collocations : []).map((entry) => ({
      en: clean(entry && (entry.en || entry.english)),
      zh: clean(entry && (entry.zh || entry.chinese))
    })).filter((entry) => entry.en)
  };
}

Page({
  data: {
    safeTop: 20,
    menuRightInset: 96,
    query: '',
    inputFocus: true,
    loading: false,
    generating: false,
    searched: false,
    error: '',
    results: [],
    exactMatch: false,
    pronunciationLoading: false,
    pronunciationPlaying: false,
    recent: []
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 96;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 8, 0);
    } catch (_) {}
    this.searchGeneration = 0;
    this.pronunciationController = createPronunciationController(this);
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      recent: this.loadRecent(),
      query: clean(options && options.q)
    });
    if (this.data.query) this.searchDatabase(this.data.query, false);
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchGeneration += 1;
    if (this.pronunciationController) {
      this.pronunciationController.destroy();
      this.pronunciationController = null;
    }
  },

  loadRecent() {
    try {
      const stored = wx.getStorageSync(RECENT_KEY);
      return Array.isArray(stored) ? stored.map(clean).filter(Boolean).slice(0, 8) : [];
    } catch (_) { return []; }
  },

  rememberQuery(query) {
    const normalized = clean(query);
    if (!normalized) return;
    const recent = [normalized].concat(this.data.recent.filter((item) => item.toLowerCase() !== normalized.toLowerCase())).slice(0, 8);
    this.setData({ recent });
    try { wx.setStorageSync(RECENT_KEY, recent); } catch (_) {}
  },

  goBack() { wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/index/index' }); } }); },

  onInput(e) {
    const query = e.detail.value;
    // Invalidate an older live/model response as soon as the text changes.
    this.searchGeneration += 1;
    this.activeSearchGenerateAi = false;
    this.setData({ query, error: '', results: [], exactMatch: false, searched: false, generating: false });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!clean(query)) {
      this.setData({ loading: false });
      return;
    }
    this.searchTimer = setTimeout(() => this.searchDatabase(query, false), 280);
  },

  onInputFocus() { this.setData({ inputFocus: true }); },

  clearQuery() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchGeneration += 1;
    if (this.pronunciationController) this.pronunciationController.stop();
    this.setData({
      query: '', results: [], searched: false, exactMatch: false,
      error: '', inputFocus: true, loading: false, generating: false
    });
  },

  useRecent(e) {
    const query = clean(e.currentTarget.dataset.query);
    this.setData({ query, inputFocus: false });
    this.submitQuery();
  },

  async searchDatabase(rawQuery, generateAi) {
    const query = clean(rawQuery);
    if (!query) return { exactMatch: false, results: [] };
    const generation = ++this.searchGeneration;
    this.activeSearchGenerateAi = Boolean(generateAi);
    this.setData({ loading: true, generating: Boolean(generateAi), error: '' });
    try {
      const response = await api.wordbooks.search(query, 12, { generateAi: Boolean(generateAi) });
      if (generation !== this.searchGeneration) return null;
      const results = (Array.isArray(response && response.items) ? response.items : []).map(mapResult);
      const exactMatch = Boolean(response && response.exact_match);
      this.setData({ results, exactMatch, searched: true, inputFocus: false });
      return { exactMatch, results };
    } catch (error) {
      if (generation !== this.searchGeneration) return null;
      this.setData({
        error: clean(error && error.message) || '词条暂时无法查询，请重试',
        searched: true,
        results: [],
        exactMatch: false
      });
      return null;
    } finally {
      if (generation === this.searchGeneration) {
        this.activeSearchGenerateAi = false;
        this.setData({ loading: false, generating: false });
      }
    }
  },

  async submitQuery() {
    const query = clean(this.data.query);
    if (!query || this.activeSearchGenerateAi) return;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    // A live dictionary request must not prevent the explicit submit action
    // from running the opt-in model enrichment request.
    if (this.data.loading) this.searchGeneration += 1;
    this.rememberQuery(query);
    await this.searchDatabase(query, true);
  },

  playResult(e) {
    const result = this.data.results[Number(e.currentTarget.dataset.index)];
    if (!result || !result.content || !this.pronunciationController) return;
    this.pronunciationController.playText(result.content);
  },

  openWordbookEntry(e) {
    const result = this.data.results[Number(e.currentTarget.dataset.index)];
    const source = result && result.sources[0];
    if (!source) return;
    wx.navigateTo({
      url: '/pages/library/detail?id=' + encodeURIComponent(source.itemId)
        + '&source=public&from=wordbook&book=' + encodeURIComponent(source.bookCode)
        + '&sort=alpha&progress=all'
    });
  },

  saveResult(e) {
    const result = this.data.results[Number(e.currentTarget.dataset.index)];
    if (!result || !result.content) return;
    saveDiscoveryPrefill({
      content: result.content,
      translation: result.chinese,
      cardType: 'word'
    }, '');
    wx.navigateTo({ url: '/pages/add/add' });
  }
});
