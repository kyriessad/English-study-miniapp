const store = require('../../utils/demoStore');
Page({
  data: { book: null, entries: [], index: 0, selected: -1, answered: false, showAnswer: false },
  onLoad(options) { this.bookId = options.id || 'cet4'; const book = store.findBook(this.bookId); const entries = book.entries.map(entry => Object.assign({}, entry, { options: [entry.zh, '逐渐减少；拒绝', '支持；维持', '复杂的；困难的'] })); this.setData({ book, entries }); },
  get current() { return this.data.entries[this.data.index] || {}; },
  choose(e) { if (this.data.answered) return; const selected = Number(e.currentTarget.dataset.index); const current = this.data.entries[this.data.index]; const correct = selected === 0; this.setData({ selected, answered: true, showAnswer: !correct }); },
  next() { if (!this.data.answered) return; const next = this.data.index + 1; if (next >= this.data.entries.length) { wx.navigateTo({ url: '/pages/demo/review-recap?book=' + this.bookId }); return; } this.setData({ index: next, selected: -1, answered: false, showAnswer: false }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
