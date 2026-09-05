const store = require('../../utils/demoStore');
Page({
  data: { book: null, entries: [] },
  onLoad(options) { this.bookId = options.id || 'cet4'; this.refresh(); },
  onShow() { if (this.bookId) this.refresh(); },
  refresh() { const book = store.findBook(this.bookId); this.setData({ book: Object.assign({}, book, { joined: !!store.state.joinedBooks[this.bookId] }), entries: store.getBookEntries(this.bookId) }); },
  joinBook() { store.toggleBook(this.bookId); this.refresh(); wx.showToast({ title: this.data.book.joined ? '已停止学习' : '已加入词汇书', icon: 'none' }); },
  joinPersonal(e) { store.joinPersonal(e.currentTarget.dataset.id); this.refresh(); wx.showToast({ title: '已加入我的英语', icon: 'none' }); },
  startReview() { if (!store.state.joinedBooks[this.bookId]) store.toggleBook(this.bookId); wx.navigateTo({ url: '/pages/demo/book-review?id=' + this.bookId }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
