const store = require('../../utils/demoStore');
Page({
  data: { cards: [], index: 0, current: null, selected: -1, answered: false, reveal: false, attempt: 0 },
  onLoad(options) { const cards = store.startReview(options.size || store.state.reviewSize); this.setData({ cards, current: cards[0] }); },
  choose(e) { if (this.data.answered) return; const selected = Number(e.currentTarget.dataset.index); const result = store.answerReview(this.data.current.id, selected, false); if (!result.correct && result.attempts === 1) { this.setData({ selected, answered: true, reveal: false, attempt: 1 }); return; } this.setData({ selected, answered: true, reveal: result.reveal, attempt: result.attempts }); },
  unknown() { if (this.data.answered) return; const result = store.answerReview(this.data.current.id, -1, true); if (result.attempts === 1) { this.setData({ answered: true, reveal: false, selected: -1, attempt: 1 }); } else { this.setData({ answered: true, reveal: true, selected: -1, attempt: result.attempts }); } },
  next() { if (!this.data.answered) return; const next = store.state.reviewIndex; if (next >= this.data.cards.length) { wx.redirectTo({ url: '/pages/demo/review-recap' }); return; } this.setData({ index: next, current: this.data.cards[next], selected: -1, answered: false, reveal: false, attempt: 0 }); },
  exit() { wx.navigateBack({ delta: 1 }); }
});
