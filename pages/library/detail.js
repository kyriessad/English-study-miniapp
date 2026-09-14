const api = require('../../utils/api/index');
const {
  newClientActionId,
  toCardView,
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');
const { createPronunciationController } = require('../../utils/pronunciation');

function analysisView(reference) {
  if (!reference) return null;
  const related = (reference.similar_phrases || reference.synonyms || [])
    .map((item) => item.text || item.content || item.word || '')
    .filter(Boolean);
  const result = {
    meaning: reference.understanding || reference.translation || '',
    usage: reference.usage_scenario || '',
    exampleEn: reference.example_sentence || '',
    exampleZh: reference.example_translation || '',
    relatedText: related.join('、')
  };
  return Object.keys(result).some((key) => Boolean(result[key])) ? result : null;
}

Page({
  data: {
    safeTop: 20,
    item: null,
    mode: 'public',
    fromReview: false,
    analysis: null,
    saved: false,
    saving: false,
    loading: true,
    error: '',
    english: '',
    my: '',
    whereEncountered: '',
    notes: '',
    lexicalInfoLoaded: false,
    lexicalInfoLoading: false,
    phoneticDisplay: '',
    phoneticSource: '',
    pronunciationAvailable: false,
    pronunciationText: '',
    pronunciationLoading: false,
    pronunciationPlaying: false,
    menuRightInset: 88,
    detailsExpanded: true,
    usageExpanded: true,
    exampleExpanded: true,
    referenceExpanded: true
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 88;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 8, 0);
    } catch (_) {}
    this.id = options.id;
    this.mode = options.source === 'personal' ? 'personal' : 'public';
    this.fromReview = options.fromReview === '1';
    this.hasShown = false;
    this.addActionId = newClientActionId('material-detail');
    this.pronunciationController = createPronunciationController(this);
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      mode: this.mode,
      fromReview: this.fromReview
    });
    this.load();
  },

  onShow() {
    if (this.hasShown && this.data.item) this.load();
    this.hasShown = true;
  },

  onUnload() {
    if (this.pronunciationController) {
      this.pronunciationController.destroy();
      this.pronunciationController = null;
    }
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      if (this.mode === 'personal') {
        const card = await api.cards.get(this.id);
        const item = toCardView(card);
        this.setData({
          item,
          english: item.en,
          my: item.my,
          whereEncountered: item.where,
          notes: item.note,
          analysis: analysisView({
            usage_scenario: card.sourceContext,
            example_sentence: card.exampleSentence,
            example_translation: card.exampleTranslation
          })
        });
      } else {
        const detail = await api.discovery.getItem(this.id);
        const item = toMaterialView(detail.item, detail.reference);
        this.setData({
          item,
          english: item.en,
          my: '',
          whereEncountered: '',
          notes: '',
          saved: item.joined,
          analysis: analysisView(detail.reference)
        });
      }
      if (this.pronunciationController) this.pronunciationController.load(this.data.english);
    } catch (error) {
      this.setData({ error: errorMessage(error, '内容加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.load(); },

  goEdit() {
    if (this.mode !== 'personal' || this.fromReview) return;
    wx.navigateTo({ url: '/pages/add/add?id=' + encodeURIComponent(this.id) });
  },

  async remember() {
    if (this.data.saved || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await api.discovery.addToLibrary(this.id, this.addActionId, true);
      this.setData({ saved: true, item: Object.assign({}, this.data.item, { joined: true }) });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async analyze() {
    if (this.mode !== 'public' || this.data.analyzing) return;
    this.setData({ analyzing: true });
    try {
      const detail = await api.discovery.analyzeItem(this.id, !!this.data.analysis);
      const item = toMaterialView(detail.item, detail.reference);
      this.setData({ item, english: item.en, analysis: analysisView(detail.reference) });
      if (this.pronunciationController) this.pronunciationController.load(item.en);
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '分析失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ analyzing: false });
    }
  },

  play() {
    if (this.pronunciationController) this.pronunciationController.playText(this.data.english);
  },

  playExample() {
    const text = (this.data.analysis && this.data.analysis.exampleEn)
      || (this.data.item && (this.data.item.sentence || this.data.item.context))
      || this.data.english;
    if (text && this.pronunciationController) this.pronunciationController.playText(text);
  },

  toggleSection(e) {
    const key = e.currentTarget.dataset.section + 'Expanded';
    this.setData({ [key]: !this.data[key] });
  },

  goLibrary() { wx.switchTab({ url: '/pages/library/index' }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
