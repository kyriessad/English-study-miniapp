const api = require('../../utils/api/index');
const {
  toCardView,
  toMaterialView,
  errorMessage,
  newClientActionId
} = require('../../utils/coreViewModels');
const { createPronunciationController } = require('../../utils/pronunciation');
const { addMaterialToLibrary, removeMaterialFromLibrary } = require('../../utils/materialLibrary');
const { englishSizeClass, extraExplanation, sourceLabel } = require('../../utils/detailExplanation');

function splitWordbookGloss(zh) {
  const text = String(zh || '').trim();
  const match = text.match(/^((?:[a-z]+\.\s*)+)/i);
  if (!match) return { pos: '', gloss: text };
  return {
    pos: match[1].replace(/\s+/g, ' ').trim(),
    gloss: text.slice(match[1].length).trim() || text
  };
}

Page({
  data: {
    safeTop: 20,
    item: null,
    mode: 'public',
    fromReview: false,
    fromWordbook: false,
    bookCode: '',
    known: false,
    markingKnown: false,
    posLabel: '',
    glossText: '',
    exampleEn: '',
    exampleZh: '',
    exampleLoading: false,
    collocationText: '',
    collocations: [],
    collocationStatus: 'pending',
    usageNote: '',
    extraMeaning: '',
    extraUsage: '',
    learned: false,
    unmasteredRank: 0,
    unmasteredTotal: 0,
    browseRank: 1,
    prevEntry: null,
    nextEntry: null,
    collocationLoading: false,
    navPrevLabel: '<--',
    navNextLabel: '-->',
    sortKey: 'position',
    progressFilter: 'all',
    savingExample: false,
    exampleSaved: false,
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
    this.fromWordbook = options.from === 'wordbook';
    this.bookCode = String(options.book || '');
    this.sortKey = options.sort === 'alpha' ? 'alpha' : 'position';
    this.progressFilter = String(options.progress || 'all');
    this.hasShown = false;
    this.pronunciationController = createPronunciationController(this);
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      mode: this.mode,
      fromReview: this.fromReview,
      fromWordbook: this.fromWordbook,
      bookCode: this.bookCode,
      sortKey: this.sortKey,
      progressFilter: this.progressFilter,
      navPrevLabel: '<--',
      navNextLabel: '-->'
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

  async load(options) {
    const silent = Boolean(options && options.silent);
    if (!silent) this.setData({ loading: true, error: '' });
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
        const tasks = [api.discovery.getItem(this.id)];
        if (this.fromWordbook && this.bookCode) {
          tasks.push(api.wordbooks.getEntry(this.bookCode, this.id, {
            sort: this.sortKey,
            progress: this.progressFilter
          }));
        }
        const [detail, entryDetail] = await Promise.all(tasks);
        const item = toMaterialView(detail.item, detail.reference);
        this.applyPublicItem(item, detail.reference, entryDetail);
      }
      if (this.pronunciationController) this.pronunciationController.load(this.data.english);
    } catch (error) {
      this.setData({ error: errorMessage(error, '内容加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyPublicItem(item, reference, entryDetail) {
    const extras = extraExplanation(reference, item.en, item.zh);
    const entry = entryDetail && entryDetail.entry;
    const chinese = (entry && entry.chinese) || item.zh;
    const gloss = splitWordbookGloss(chinese);
    const learned = Boolean(entry && entry.progressState === 'learned');
    const rank = entryDetail && entryDetail.unmasteredRank;
    const position = entry && entry.position;
    const browseRank = (rank != null && Number(rank) > 0)
      ? Number(rank)
      : (Number(position) || 1);
    const entryCollocations = entryDetail && Array.isArray(entryDetail.collocations)
      ? entryDetail.collocations
      : [];
    const storedExampleEn = entryDetail && (entryDetail.exampleEn || entryDetail.example_en);
    const storedExampleZh = entryDetail && (entryDetail.exampleZh || entryDetail.example_zh);
    const collocations = entryCollocations.length ? entryCollocations : [];
    this.setData({
      item,
      english: item.en,
      englishClass: englishSizeClass(item.en),
      chinese,
      sourceChip: this.fromWordbook ? (item.source || '词汇书') : sourceLabel(item, 'public'),
      whereEncountered: '',
      notes: '',
      saved: Boolean((entry && entry.inLibrary) || item.joined),
      known: Boolean(item.raw && item.raw.known),
      learned,
      unmasteredRank: rank == null ? 0 : Number(rank),
      unmasteredTotal: entryDetail ? Number(entryDetail.unmasteredTotal || 0) : this.data.unmasteredTotal,
      browseRank,
      prevEntry: (entryDetail && entryDetail.prevEntry) || null,
      nextEntry: (entryDetail && entryDetail.nextEntry) || null,
      explanation: extras,
      posLabel: gloss.pos,
      glossText: gloss.gloss || chinese,
      exampleEn: storedExampleEn || '',
      exampleZh: storedExampleZh || '',
      exampleLoading: false,
      collocationText: (extras && extras.relatedText) || '',
      collocations,
      collocationStatus: (entryDetail && entryDetail.collocationStatus) || 'pending',
      usageNote: (entryDetail && entryDetail.usageNote) || '',
      collocationLoading: false,
      extraMeaning: (extras && extras.meaning) || '',
      extraUsage: (extras && extras.usage) || '',
      libraryCardId: this.data.libraryCardId || '',
      libraryCardVersion: this.data.libraryCardVersion || 0
    });
  },

  goPrevEntry() {
    if (!this.data.prevEntry) return;
    return this.openNeighbor(this.data.prevEntry);
  },

  goNextEntry() {
    if (!this.data.nextEntry) return;
    return this.openNeighbor(this.data.nextEntry);
  },

  openNeighbor(entry) {
    if (!entry || !entry.id || this.switchingEntry) return;
    this.switchingEntry = true;
    this.id = entry.id;
    this.setData({
      exampleEn: '',
      exampleZh: '',
      exampleSaved: false,
      exampleLoading: false,
      collocations: [],
      collocationStatus: 'pending',
      usageNote: '',
      collocationLoading: false,
      error: '',
      english: entry.content
    });
    return this.load({ silent: true }).finally(() => {
      this.switchingEntry = false;
    });
  },

  retryLoad() { this.load(); },

  goEdit() {
    if (this.mode !== 'personal' || this.fromReview) return;
    wx.navigateTo({ url: '/pages/add/add?id=' + encodeURIComponent(this.id) });
  },

  async remember() {
    if (this.mode !== 'public' || this.data.saving) return;
    if (this.data.saved) {
      wx.switchTab({ url: '/pages/library/index' });
      return;
    }
    this.setData({ saving: true });
    try {
      const card = await addMaterialToLibrary(this.id);
      this.setData({
        saved: true,
        libraryCardId: card.id,
        libraryCardVersion: card.version,
        item: Object.assign({}, this.data.item, { joined: true })
      });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
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
      this.applyPublicItem(item, detail.reference, null);
      if (!this.data.extraMeaning && !this.data.exampleEn && !this.data.collocationText) {
        wx.showToast({ title: '暂时没有更多讲解', icon: 'none' });
      }
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

  async toggleFavorite() {
    if (!this.fromWordbook || this.data.saving) return;
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
        wx.showToast({ title: '已取消收藏', icon: 'none' });
        return;
      }
      const result = this.bookCode
        ? await api.wordbooks.addEntryToLibrary(
            this.bookCode,
            this.id,
            newClientActionId('wordbook-entry'),
            false
          )
        : await api.discovery.addToLibrary(this.id, newClientActionId('wordbook-entry'), false);
      const card = (result && result.card) || result || {};
      this.setData({
        saved: true,
        libraryCardId: card.id || '',
        libraryCardVersion: Number(card.version || 0),
        item: Object.assign({}, this.data.item, { joined: true })
      });
      wx.showToast({ title: '已加入我的收藏', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, this.data.saved ? '取消失败，请重试' : '收藏失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  playExample() {
    if (!this.pronunciationController || !this.data.exampleEn) return;
    this.pronunciationController.playText(this.data.exampleEn);
  },

  async addExample() {
    if (!this.data.exampleEn || this.data.savingExample || this.data.exampleSaved) return;
    this.setData({ savingExample: true });
    try {
      await api.cards.create({
        content: this.data.exampleEn,
        card_type: 'sentence',
        understanding: this.data.exampleZh || '',
        translation: this.data.exampleZh || '',
        participates_in_review: true,
        add_channel: 'manual',
        where_encountered: (this.data.bookCode || '词汇书') + ' · 例句'
      });
      this.setData({ exampleSaved: true });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ savingExample: false });
    }
  },

  async toggleMastered() {
    if (!this.fromWordbook || !this.bookCode || this.data.markingKnown) return;
    if (this.data.progressFilter === 'all') {
      wx.showToast({ title: '请在“未学”或“学习中”里标记掌握', icon: 'none' });
      return;
    }
    this.setData({ markingKnown: true });
    try {
      await api.wordbooks.startOrContinue(this.bookCode);
      const nextLearned = !this.data.learned;
      const result = await api.wordbooks.updateProgress(this.bookCode, this.id, {
        clientActionId: newClientActionId('wordbook-progress'),
        status: nextLearned ? 'learned' : 'not_started'
      });
      const total = result.book && result.book.userState
        ? result.book.userState.unlearnedCount
        : this.data.unmasteredTotal;
      this.setData({
        learned: nextLearned,
        unmasteredRank: nextLearned ? 0 : this.data.unmasteredRank,
        unmasteredTotal: total
      });
      await this.load({ silent: true });
      wx.showToast({ title: nextLearned ? '已移至已掌握' : '已恢复原词表顺序', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '标记失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ markingKnown: false });
    }
  },

  goBack() { wx.navigateBack({ delta: 1 }); },
  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
