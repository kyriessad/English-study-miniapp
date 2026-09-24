const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };
const BOOK_COLORS = { cet4: '#dce9d8', cet6: '#e0eadf', postgraduate: '#e7eee0', ielts: '#dce9d8', toefl: '#e0eadf' };

function toBookView(book) {
  const learnedCount = book.userState.learnedCount;
  const count = book.itemCount;
  return {
    id: book.id,
    code: book.code,
    title: book.title,
    description: book.description,
    count,
    learnedCount,
    started: book.userState.state !== 'not_started',
    completed: book.userState.state === 'completed',
    coverMark: BOOK_MARKS[book.code] || book.code.toUpperCase(),
    color: BOOK_COLORS[book.code] || '#dce9d8'
  };
}

Page({
  data: { safeTop: 20, books: [], loading: false, error: '' },
  onLoad() {
    this.setData({ safeTop: (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 20 });
    this.refresh();
  },
  onShow() { this.refresh(); },
  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const books = (await api.wordbooks.list()).map(toBookView);
      this.setData({ books });
    } catch (error) {
      this.setData({ error: errorMessage(error, '词汇书加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },
  retryLoad() { this.refresh(); },
  openBook(e) { wx.navigateTo({ url: '/pages/wordbooks/detail?id=' + e.currentTarget.dataset.code }); },
  goBack() { wx.navigateBack({ delta: 1 }); },
  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
