const mock = require('../../utils/demoMock');
const store = require('../../utils/demoStore');
Page({
  data: { books: [] },
  onShow() { this.setData({ books: mock.books.map(book => Object.assign({}, book, { joined: !!store.state.joinedBooks[book.id] })) }); },
  openBook(e) { wx.navigateTo({ url: '/pages/demo/book-detail?id=' + e.currentTarget.dataset.id }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
