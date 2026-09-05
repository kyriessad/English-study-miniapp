const mock = require('../../utils/demoMock');
const store = require('../../utils/demoStore');
Page({
  data: { item: null, mode: 'public', editing: false, analysis: null, saved: false, english: '', my: '', note: '', category: '', participate: true },
  onLoad(options) { this.id = options.id; this.mode = options.source === 'public' ? 'public' : 'personal'; let item = this.mode === 'public' ? store.findMaterial(this.id) : store.findPersonal(this.id); if (!item && this.mode === 'personal') item = mock.personalCards[0]; this.setData({ item, mode: this.mode, english: item.en, my: item.my || '', note: item.note || '', category: item.category || '', participate: item.participate !== false }); },
  onEnglishInput(e) { this.setData({ english: e.detail.value }); }, onMyInput(e) { this.setData({ my: e.detail.value }); }, onNoteInput(e) { this.setData({ note: e.detail.value }); },
  toggleEdit() { this.setData({ editing: !this.data.editing }); },
  save() { const english = this.data.english.trim().replace(/\s+/g, ' '); this.setData({ english, editing: false, saved: true }); wx.showToast({ title: '已保存', icon: 'none' }); },
  remember() { store.remember(this.id); this.setData({ saved: true, item: Object.assign({}, this.data.item, { joined: true }) }); wx.showToast({ title: '已加入我的英语', icon: 'none' }); },
  analyze() { const analysis = store.analyze(this.id, this.mode === 'personal'); this.setData({ analysis: Object.assign({}, analysis, { relatedText: analysis.related.join('、') }) }); },
  play() { wx.showToast({ title: 'Mock 发音播放', icon: 'none' }); },
  toggleParticipate() { this.setData({ participate: !this.data.participate }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
