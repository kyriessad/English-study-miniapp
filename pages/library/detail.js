const api = require('../../utils/api/index');
const {
  toCardView,
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');
const { createPronunciationController } = require('../../utils/pronunciation');
const { addMaterialToLibrary, removeMaterialFromLibrary } = require('../../utils/materialLibrary');
const { englishSizeClass, extraExplanation, sourceLabel } = require('../../utils/detailExplanation');

Page({
  data: {
    safeTop: 20,
    item: null,
    mode: 'public',
    fromReview: false,
    explanation: null,
    sourceChip: '',
    saved: false,
    saving: false,
    analyzing: false,
    loading: true,
    error: '',
    english: '',
    englishClass: '',
    chinese: '',
    whereEncountered: '',
    notes: '',
    libraryCardId: '',
    libraryCardVersion: 0,
    phoneticDisplay: '',
    phoneticSource: '',
    pronunciationAvailable: false,
    pronunciationText: '',
    pronunciationLoading: false,
    pronunciationPlaying: false,
    menuRightInset: 88
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
          englishClass: englishSizeClass(item.en),
          chinese: item.my || item.zh,
          sourceChip: sourceLabel(item, 'personal'),
          whereEncountered: item.where,
          notes: item.note,
          explanation: extraExplanation({
            usage_scenario: card.sourceContext,
            example_sentence: card.exampleSentence,
            example_translation: card.exampleTranslation
          }, item.en, item.my || item.zh),
          libraryCardId: item.id,
          libraryCardVersion: item.version
        });
      } else {
        const detail = await api.discovery.getItem(this.id);
        const item = toMaterialView(detail.item, detail.reference);
        this.setData({
          item,
          english: item.en,
          englishClass: englishSizeClass(item.en),
          chinese: item.zh,
          sourceChip: sourceLabel(item, 'public'),
          whereEncountered: '',
          notes: '',
          saved: item.joined,
          explanation: extraExplanation(detail.reference, item.en, item.zh),
          libraryCardId: '',
          libraryCardVersion: 0
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
    if (this.mode !== 'public' || this.data.saving) return;
    this.setData({ saving: true });
    try {
      if (this.data.saved) {
        await removeMaterialFromLibrary({
          id: this.id,
          en: this.data.english,
          libraryCardId: this.data.libraryCardId,
          libraryCardVersion: this.data.libraryCardVersion
        });
        this.setData({
          saved: false,
          libraryCardId: '',
          libraryCardVersion: 0,
          item: Object.assign({}, this.data.item, { joined: false })
        });
        wx.showToast({ title: '已从卡片中移除', icon: 'none' });
        return;
      }
      const card = await addMaterialToLibrary(this.id);
      this.setData({
        saved: true,
        libraryCardId: card.id,
        libraryCardVersion: card.version,
        item: Object.assign({}, this.data.item, { joined: true })
      });
      wx.showToast({ title: '已加入卡片', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, this.data.saved ? '移除失败，请重试' : '加入失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async analyze() {
    if (this.mode !== 'public' || this.data.analyzing) return;
    this.setData({ analyzing: true });
    try {
      const detail = await api.discovery.analyzeItem(this.id, !!this.data.explanation);
      const item = toMaterialView(detail.item, detail.reference);
      const explanation = extraExplanation(detail.reference, item.en, item.zh);
      this.setData({
        item,
        english: item.en,
        englishClass: englishSizeClass(item.en),
        chinese: item.zh,
        sourceChip: sourceLabel(item, 'public'),
        explanation
      });
      if (!explanation) wx.showToast({ title: '暂时没有更多讲解', icon: 'none' });
      if (this.pronunciationController) this.pronunciationController.load(item.en);
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '讲解暂时不可用'), icon: 'none' });
    } finally {
      this.setData({ analyzing: false });
    }
  },

  play() {
    if (this.pronunciationController) this.pronunciationController.playText(this.data.english);
  },

  goBack() { wx.navigateBack({ delta: 1 }); }
});
