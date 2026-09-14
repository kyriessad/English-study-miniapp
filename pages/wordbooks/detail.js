const api = require('../../utils/api/index');
const { newClientActionId, errorMessage } = require('../../utils/coreViewModels');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };

Page({
  onReady() { this.setData({ safeTop: (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 20 }); },
  data: { safeTop: 20, book: null, entries: [], reviewedCount: 0, progressPercent: 0, loading: false, error: '' },
  onLoad(options) { this.bookId = options.id || 'cet4'; this.refresh(); },
  onShow() { this.refresh(); },
  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const [detail, list] = await Promise.all([
        api.wordbooks.get(this.bookId),
        api.wordbooks.listEntries(this.bookId, { limit: 50, offset: 0 })
      ]);
      const source = detail.book;
      const reviewedCount = source.userState.learnedCount;
      const count = source.itemCount;
      this.setData({
        book: {
          id: source.id,
          code: source.code,
          title: source.title,
          description: source.description,
          count,
          coverMark: BOOK_MARKS[source.code] || source.code.toUpperCase(),
          started: source.userState.state !== 'not_started'
        },
        entries: list.items.map((entry) => ({
          id: entry.id,
          en: entry.englishText,
          zh: entry.chinese,
          reviewed: entry.progressState === 'learned',
          joined: entry.inLibrary
        })),
        reviewedCount,
        progressPercent: count ? Math.min(100, reviewedCount / count * 100) : 0
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '词汇书详情加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },
  async startLearning() {
    try {
      await api.wordbooks.startOrContinue(this.bookId);
      wx.showToast({ title: '已开始学习', icon: 'success' });
      this.refresh();
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '开始学习失败'), icon: 'none' });
    }
  },
  openEntry(e) { wx.navigateTo({ url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=public' }); },
  async joinPersonal(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry || entry.joined) return;
    try {
      await api.wordbooks.addEntryToLibrary(this.bookId, id, newClientActionId('wordbook-entry'), true);
      this.setData({ entries: this.data.entries.map((item) => item.id === id ? Object.assign({}, item, { joined: true }) : item) });
      wx.showToast({ title: '已加入我的英语', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '加入失败，请重试'), icon: 'none' });
    }
  },
  retryLoad() { this.refresh(); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});

