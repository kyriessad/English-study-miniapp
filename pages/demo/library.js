const api = require('../../utils/api/index');
const { toCardView, errorMessage } = require('../../utils/coreViewModels');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };

function toWordbookEntryView(entry, book) {
  return {
    id: entry.id,
    en: entry.englishText,
    zh: entry.chinese,
    bookCode: book.code,
    bookLabel: BOOK_MARKS[book.code] || book.title,
    source: `${BOOK_MARKS[book.code] || book.title} · 词汇书`,
    joined: entry.inLibrary,
    progressState: entry.progressState
  };
}

Page({
  data: {
    safeTop: 20,
    viewMode: 'personal',
    keyword: '',
    filter: 'all',
    managing: false,
    selectedIds: [],
    selectedMap: {},
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'public', label: '公开素材' },
      { key: 'self', label: '自己添加' }
    ],
    cards: [],
    filtered: [],
    wordbooks: [],
    bookFilters: [{ key: 'all', label: '全部' }],
    selectedBookCode: 'all',
    wordbookEntries: [],
    filteredWordbookEntries: [],
    wordbookLoaded: false,
    wordbookLoading: false,
    wordbookError: '',
    loading: false,
    error: ''
  },

  onReady() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  onShow() {
    if (this.data.viewMode === 'wordbooks') this.refreshWordbooks();
    else this.refresh();
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.cards.list({ limit: 100, offset: 0 });
      const cards = response.items.map(toCardView);
      this.setData({ cards, filtered: this.filterCards(cards) });
    } catch (error) {
      this.setData({ error: errorMessage(error, '我的英语加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  filterCards(cards) {
    const keyword = this.data.keyword.trim().toLowerCase();
    return cards.filter((card) => {
      const searchable = [card.en, card.zh, card.my, card.note, card.where, card.source, card.category]
        .join(' ')
        .toLowerCase();
      const matchesKeyword = !keyword || searchable.indexOf(keyword) >= 0;
      const matchesFilter = this.data.filter === 'all'
        || (this.data.filter === 'public' && card.source === '公开素材')
        || (this.data.filter === 'self' && card.source === '自己添加');
      return matchesKeyword && matchesFilter;
    });
  },

  filterWordbookEntries(entries) {
    const keyword = this.data.keyword.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesBook = this.data.selectedBookCode === 'all' || entry.bookCode === this.data.selectedBookCode;
      const matchesKeyword = !keyword || [entry.en, entry.zh, entry.source].join(' ').toLowerCase().indexOf(keyword) >= 0;
      return matchesBook && matchesKeyword;
    });
  },

  async refreshWordbooks() {
    if (this.data.wordbookLoading) return;
    this.setData({ wordbookLoading: true, wordbookError: '' });
    try {
      const wordbooks = await api.wordbooks.list();
      const pages = await Promise.all(wordbooks.map((book) => (
        api.wordbooks.listEntries(book.code, { limit: 20, offset: 0 })
      )));
      const entries = [];
      pages.forEach((page, index) => {
        page.items.forEach((entry) => entries.push(toWordbookEntryView(entry, wordbooks[index])));
      });
      const bookFilters = [{ key: 'all', label: '全部' }].concat(wordbooks.map((book) => ({
        key: book.code,
        label: BOOK_MARKS[book.code] || book.title
      })));
      this.setData({
        wordbooks,
        bookFilters,
        wordbookEntries: entries,
        filteredWordbookEntries: this.filterWordbookEntries(entries),
        wordbookLoaded: true
      });
    } catch (error) {
      this.setData({ wordbookError: errorMessage(error, '词汇书内容加载失败') });
    } finally {
      this.setData({ wordbookLoading: false });
    }
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.view;
    if (!['personal', 'wordbooks'].includes(viewMode) || viewMode === this.data.viewMode) return;
    this.setData({ viewMode, keyword: '', managing: false, selectedIds: [], selectedMap: {} });
    if (viewMode === 'wordbooks' && !this.data.wordbookLoaded) this.refreshWordbooks();
  },

  search(e) {
    this.setData({ keyword: e.detail.value }, () => {
      if (this.data.viewMode === 'wordbooks') {
        this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
      } else {
        this.setData({ filtered: this.filterCards(this.data.cards) });
      }
    });
  },
  clearSearch() {
    this.setData({ keyword: '' }, () => {
      if (this.data.viewMode === 'wordbooks') {
        this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
      } else {
        this.setData({ filtered: this.filterCards(this.data.cards) });
      }
    });
  },
  chooseFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => {
      this.setData({ filtered: this.filterCards(this.data.cards) });
    });
  },
  chooseBookFilter(e) {
    this.setData({ selectedBookCode: e.currentTarget.dataset.filter }, () => {
      this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
    });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=personal' });
  },
  openWordbookEntry(e) {
    wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=public' });
  },
  handleItemTap(e) {
    if (this.data.managing) this.toggleSelect(e);
    else this.open(e);
  },
  toggleManage() {
    this.setData({ managing: !this.data.managing, selectedIds: [], selectedMap: {} });
  },
  toggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    const selectedIds = this.data.selectedIds.slice();
    const index = selectedIds.indexOf(id);
    if (index >= 0) selectedIds.splice(index, 1);
    else selectedIds.push(id);
    const selectedMap = {};
    selectedIds.forEach((selectedId) => { selectedMap[selectedId] = true; });
    this.setData({ selectedIds, selectedMap });
  },
  selectAll() {
    const visibleIds = this.data.filtered.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => this.data.selectedMap[id]);
    const selectedIds = allSelected ? [] : visibleIds;
    const selectedMap = {};
    selectedIds.forEach((id) => { selectedMap[id] = true; });
    this.setData({ selectedIds, selectedMap });
  },
  deleteSelected() {
    const selectedIds = this.data.selectedIds;
    if (!selectedIds.length) return;
    wx.showModal({
      title: '删除选中内容？',
      content: '将删除选中的 ' + selectedIds.length + ' 条内容。',
      confirmText: '删除',
      confirmColor: '#b35d55',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await Promise.all(selectedIds.map((id) => {
            const card = this.data.cards.find((item) => item.id === id);
            return api.cards.remove(id, { baseVersion: card && card.version });
          }));
          this.setData({ selectedIds: [], selectedMap: {}, managing: false });
          this.refresh();
        } catch (error) {
          wx.showToast({ title: errorMessage(error, '删除失败，请重试'), icon: 'none' });
        }
      }
    });
  },
  retryLoad() {
    if (this.data.viewMode === 'wordbooks') this.refreshWordbooks();
    else this.refresh();
  },
  add() { wx.navigateTo({ url: '/pages/demo/add' }); }
});
