const api = require('../../utils/api/index');
const { toCardView, errorMessage } = require('../../utils/coreViewModels');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };
const SORT_STORAGE_KEY = 'library.sortOrder.v1';
const SORT_OPTIONS = [
  { key: 'newest', label: '最近添加' },
  { key: 'oldest', label: '最早添加' }
];

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
    sortOrder: 'newest',
    sortIndex: 0,
    sortOptions: SORT_OPTIONS,
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
    error: '',
    showBackToTop: false,
    swipedCardId: '',
    menuRightInset: 88,
    floatingTop: 76
  },

  onLoad() {
    this.lastScrollTop = 0;
    try {
      const storedOrder = wx.getStorageSync(SORT_STORAGE_KEY);
      const sortIndex = SORT_OPTIONS.findIndex((item) => item.key === storedOrder);
      if (sortIndex >= 0) {
        this.setData({ sortOrder: storedOrder, sortIndex });
      }
    } catch (_) {}
  },

  onReady() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 88;
    let floatingTop = (info.statusBarHeight || 20) + 52;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left && menu.bottom) {
        menuRightInset = Math.max(info.windowWidth - menu.left + 8, 0);
        floatingTop = menu.bottom + 12;
      }
    } catch (_) {}
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      floatingTop
    });
  },

  onShow() {
    if (this.data.viewMode === 'wordbooks') this.refreshWordbooks();
    else this.refresh();
  },

  onPageScroll(event) {
    const scrollTop = Number(event && event.scrollTop || 0);
    const delta = scrollTop - (this.lastScrollTop || 0);
    let showBackToTop = this.data.showBackToTop;
    if (scrollTop < 420) showBackToTop = false;
    else if (delta <= -8) showBackToTop = true;
    else if (delta >= 8) showBackToTop = false;
    this.lastScrollTop = scrollTop;
    const patch = {};
    if (showBackToTop !== this.data.showBackToTop) patch.showBackToTop = showBackToTop;
    if (this.data.swipedCardId) patch.swipedCardId = '';
    if (Object.keys(patch).length) this.setData(patch);
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.cards.list({ limit: 100, offset: 0 });
      const cards = response.items.map(toCardView);
      this.setData({ cards, filtered: this.filterCards(cards), swipedCardId: '' });
    } catch (error) {
      this.setData({ error: errorMessage(error, '我的英语加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  filterCards(cards) {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filtered = cards.filter((card) => {
      const searchable = [card.en, card.zh, card.my, card.note, card.where, card.source, card.category]
        .join(' ')
        .toLowerCase();
      const matchesKeyword = !keyword || searchable.indexOf(keyword) >= 0;
      const matchesFilter = this.data.filter === 'all'
        || (this.data.filter === 'public' && card.source === '公开素材')
        || (this.data.filter === 'self' && card.source === '自己添加');
      return matchesKeyword && matchesFilter;
    });
    const direction = this.data.sortOrder === 'oldest' ? 1 : -1;
    return filtered.slice().sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || '') || 0;
      const rightTime = Date.parse(right.createdAt || '') || 0;
      return (leftTime - rightTime) * direction;
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
    this.setData({ viewMode, keyword: '', managing: false, selectedIds: [], selectedMap: {}, swipedCardId: '' });
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
  changeSort(e) {
    const sortIndex = Number(e.detail.value) || 0;
    const option = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0];
    try { wx.setStorageSync(SORT_STORAGE_KEY, option.key); } catch (_) {}
    this.setData({ sortIndex, sortOrder: option.key, swipedCardId: '' }, () => {
      this.setData({ filtered: this.filterCards(this.data.cards) });
    });
  },
  chooseBookFilter(e) {
    this.setData({ selectedBookCode: e.currentTarget.dataset.filter }, () => {
      this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
    });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=personal' });
  },
  openWordbookEntry(e) {
    wx.navigateTo({ url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=public' });
  },
  handleItemTap(e) {
    if (Date.now() < (this.ignoreCardTapUntil || 0)) return;
    if (this.data.managing) {
      this.toggleSelect(e);
      return;
    }
    if (this.data.swipedCardId) {
      this.setData({ swipedCardId: '' });
      return;
    }
    this.open(e);
  },
  onCardTouchStart(e) {
    if (this.data.managing) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.cardTouch = {
      id: e.currentTarget.dataset.id,
      startX: touch.clientX,
      startY: touch.clientY,
      x: touch.clientX,
      y: touch.clientY
    };
  },
  onCardTouchMove(e) {
    if (!this.cardTouch || this.data.managing) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.cardTouch.x = touch.clientX;
    this.cardTouch.y = touch.clientY;
  },
  onCardTouchEnd(e) {
    if (!this.cardTouch || this.data.managing) return;
    const gesture = this.cardTouch;
    this.cardTouch = null;
    const touch = e.changedTouches && e.changedTouches[0];
    if (touch) {
      gesture.x = touch.clientX;
      gesture.y = touch.clientY;
    }
    const deltaX = gesture.x - gesture.startX;
    const deltaY = gesture.y - gesture.startY;
    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    this.ignoreCardTapUntil = Date.now() + 300;
    this.setData({ swipedCardId: deltaX < 0 ? gesture.id : '' });
  },
  onCardTouchCancel() {
    this.cardTouch = null;
  },
  onCardLongPress(e) {
    const id = e.currentTarget.dataset.id;
    this.ignoreCardTapUntil = Date.now() + 500;
    this.cardTouch = null;
    if (this.data.managing) {
      this.toggleSelect(e);
      return;
    }
    const selectedMap = {};
    selectedMap[id] = true;
    this.setData({
      managing: true,
      selectedIds: [id],
      selectedMap,
      swipedCardId: ''
    });
  },
  editCard(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ swipedCardId: '' });
    wx.navigateTo({ url: '/pages/add/add?id=' + encodeURIComponent(id) });
  },
  deleteCard(e) {
    const id = e.currentTarget.dataset.id;
    const card = this.data.cards.find((item) => item.id === id);
    this.setData({ swipedCardId: '' });
    wx.showModal({
      title: '删除这条内容？',
      content: '删除后将不再出现在“我的英语”中。',
      confirmText: '删除',
      confirmColor: '#b35d55',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.cards.remove(id, { baseVersion: card && card.version });
          const cards = this.data.cards.filter((item) => item.id !== id);
          this.setData({ cards, filtered: this.filterCards(cards) });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        } catch (error) {
          wx.showToast({ title: errorMessage(error, '删除失败，请重试'), icon: 'none' });
        }
      }
    });
  },
  toggleManage() {
    this.setData({ managing: !this.data.managing, selectedIds: [], selectedMap: {}, swipedCardId: '' });
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
          const selectedMap = this.data.selectedMap;
          const cards = this.data.cards.filter((item) => !selectedMap[item.id]);
          this.setData({
            cards,
            filtered: this.filterCards(cards),
            selectedIds: [],
            selectedMap: {},
            managing: false
          });
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
  backToTop() {
    this.lastScrollTop = 0;
    this.setData({ showBackToTop: false, swipedCardId: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },
  add() { wx.navigateTo({ url: '/pages/add/add' }); }
});
