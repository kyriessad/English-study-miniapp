Page({
  data: { english: '', understanding: '', saved: false },
  onEnglishInput(e) { this.setData({ english: e.detail.value }); },
  onUnderstandingInput(e) { this.setData({ understanding: e.detail.value }); },
  useExample(e) { this.setData({ english: e.currentTarget.dataset.value }); },
  save() {
    if (!this.data.english.trim()) { wx.showToast({ title: '先写下英文', icon: 'none' }); return; }
    this.setData({ saved: true });
    wx.showToast({ title: '已加入我的英语', icon: 'none' });
  },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
