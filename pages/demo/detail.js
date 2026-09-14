const api = require('../../utils/api/index');
const {
  newClientActionId,
  toCardView,
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');

function analysisView(reference) {
  if (!reference) return null;
  const related = (reference.similar_phrases || reference.synonyms || [])
    .map((item) => item.text || item.content || item.word || '')
    .filter(Boolean);
  return {
    meaning: reference.understanding || reference.translation || '',
    usages: [reference.usage_scenario || '在真实语境中理解和使用这条英语。'],
    examples: [{
      en: reference.example_sentence || '',
      zh: reference.example_translation || ''
    }],
    relatedText: related.join('、')
  };
}

Page({
  data: {
    safeTop: 20,
    item: null,
    mode: 'public',
    editing: false,
    analysis: null,
    saved: false,
    saving: false,
    loading: true,
    error: '',
    english: '',
    my: '',
    note: '',
    participate: true,
    detailsExpanded: true,
    usageExpanded: true,
    exampleExpanded: true,
    referenceExpanded: true
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.id = options.id;
    this.mode = options.source === 'personal' ? 'personal' : 'public';
    this.addActionId = newClientActionId('material-detail');
    this.setData({ safeTop: info.statusBarHeight || 20, mode: this.mode });
    this.load();
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
          note: item.where || item.note,
          participate: item.participate,
          analysis: analysisView({
            understanding: card.translation || card.understanding,
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
          note: '',
          saved: item.joined,
          analysis: analysisView(detail.reference)
        });
      }
    } catch (error) {
      this.setData({ error: errorMessage(error, '内容加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.load(); },
  onEnglishInput(e) { this.setData({ english: e.detail.value }); },
  onMyInput(e) { this.setData({ my: e.detail.value }); },
  onNoteInput(e) { this.setData({ note: e.detail.value }); },
  toggleEdit() { this.setData({ editing: !this.data.editing }); },

  async save() {
    if (this.data.saving) return;
    const english = this.data.english.trim().replace(/\s+/g, ' ');
    if (!english) {
      wx.showToast({ title: '请输入英文内容', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const card = await api.cards.update(this.id, {
        base_version: this.data.item.version,
        content: english,
        understanding: this.data.my.trim() || null,
        where_encountered: this.data.note.trim() || null
      });
      const item = toCardView(card);
      this.setData({
        english: item.en,
        my: item.my,
        note: item.where || item.note,
        item,
        editing: false
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '保存失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
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
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '分析失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ analyzing: false });
    }
  },

  play() { wx.showToast({ title: '发音功能将在后续版本开放', icon: 'none' }); },

  async toggleParticipate(e) {
    if (this.mode !== 'personal' || this.data.saving) return;
    const nextValue = !!e.detail.value;
    this.setData({ participate: nextValue, saving: true });
    try {
      const card = await api.cards.update(this.id, {
        base_version: this.data.item.version,
        participates_in_review: nextValue
      });
      this.setData({ item: toCardView(card), participate: card.participatesInReview });
    } catch (error) {
      this.setData({ participate: !nextValue });
      wx.showToast({ title: errorMessage(error, '更新失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  toggleSection(e) {
    const key = e.currentTarget.dataset.section + 'Expanded';
    this.setData({ [key]: !this.data[key] });
  },

  remove() {
    wx.showModal({
      title: '删除这条内容？',
      content: '删除后将不再出现在“我的英语”中。',
      confirmText: '删除',
      confirmColor: '#b35d55',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.cards.remove(this.id, { baseVersion: this.data.item.version });
          wx.navigateBack({ delta: 1 });
        } catch (error) {
          wx.showToast({ title: errorMessage(error, '删除失败，请重试'), icon: 'none' });
        }
      }
    });
  },

  goLibrary() { wx.switchTab({ url: '/pages/demo/library' }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
