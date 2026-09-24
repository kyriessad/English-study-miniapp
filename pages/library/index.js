const api = require('../../utils/api/index');
const { toCardView, toPassageView, errorMessage } = require('../../utils/coreViewModels');
const { attachTabPage } = require('../../utils/tabChrome');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };
const SORT_STORAGE_KEY = 'library.sortOrder.v1';
const SORT_OPTIONS = [
  { key: 'newest', label: '最近添加' },
  { key: 'oldest', label: '最早添加' }
];

function toSavedWordbookView(card, booksById) {
  const book = booksById[card.sourceWordbookId] || {};
  return {
    id: card.id,
    en: card.englishText,
    zh: card.understanding || card.translation,
    bookCode: book.code || '',
    bookLabel: BOOK_MARKS[book.code] || book.title || '词汇书',
    source: `${BOOK_MARKS[book.code] || book.title || '词汇书'} · 我的收藏`,
    sourceWordbookId: card.sourceWordbookId || ''
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
      { key: 'self', label: '自己添加' },
      { key: 'passage', label: '长文本' }
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
    passageError: '',
    hasMore: false,
    loadingMore: false,
    searchScopeLoading: false,
    wordbookHasMore: false,
    showBackToTop: false,
    swipedCardId: '',
    menuRightInset: 88,
    floatingTop: 76,
    tabEnter: false,
    swipeMaxPx: 110
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
      floatingTop,
      swipeMaxPx: Math.round((info.windowWidth || 375) * 220 / 750)
    });
  },

  onShow() {
    attachTabPage(this, 2);
    if (this.data.viewMode === 'wordbooks') this.refreshWordbooks();
    else this.refresh();
  },

  onUnload() { clearTimeout(this.completeBrowseTimer); },

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
      const cardResponse = await api.cards.list({ limit: 100, offset: 0 });
      let passageItems = [];
      try {
        const passageResponse = await api.passages.list({ limit: 100, offset: 0 });
        passageItems = passageResponse.items || [];
        this.passageOffset = passageItems.length;
        this.passageHasMore = passageItems.length < passageResponse.total;
        this.setData({ passageError: '' });
      } catch (_) {
        passageItems = this.data.cards.filter((item) => item.kind === 'passage').map((item) => item.raw);
        this.passageHasMore = false;
        this.setData({ passageError: '长文本加载失败，请重试；已加载的英语仍可查看。' });
      }
      this.cardOffset = cardResponse.items.length;
      this.cardHasMore = this.cardOffset < cardResponse.total;
      const cards = cardResponse.items.map(toCardView)
        .filter((card) => card.addChannel !== 'wordbook')
        .concat(passageItems.map(toPassageView));
      this.setData({ cards, filtered: this.filterCards(cards), swipedCardId: '', hasMore: !!(this.cardHasMore || this.passageHasMore) });
      if (this.data.keyword || this.data.filter !== 'all' || this.data.sortOrder === 'oldest') this.scheduleCompleteBrowseResults();
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
        || (this.data.filter === 'self' && card.source === '自己添加')
        || (this.data.filter === 'passage' && card.kind === 'passage');
      return matchesKeyword && matchesFilter;
    });
    const direction = this.data.sortOrder === 'oldest' ? 1 : -1;
    return filtered.slice().sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || '') || 0;
      const rightTime = Date.parse(right.createdAt || '') || 0;
      return (leftTime - rightTime) * direction;
    });
  },

  onReachBottom() { this.loadMore(); },
  scheduleCompleteBrowseResults() {
    clearTimeout(this.completeBrowseTimer);
    this.completeBrowseTimer = setTimeout(() => { this.completeBrowseResults(); }, 300);
  },
  async completeBrowseResults() {
    if (this.completeBrowsePromise) {
      await this.completeBrowsePromise;
      if (this.completeBrowseMode !== this.data.viewMode) return this.completeBrowseResults();
      return;
    }
    const mode = this.data.viewMode;
    this.completeBrowseMode = mode;
    this.completeBrowsePromise = (async () => {
      if (mode === 'wordbooks' ? !this.data.wordbookHasMore : !this.data.hasMore) return;
      this.setData({ searchScopeLoading: true });
      while (this.data.viewMode === mode && (mode === 'wordbooks' ? this.data.wordbookHasMore : this.data.hasMore)) {
        if (this.data.loading || this.data.wordbookLoading || this.data.loadingMore) {
          await new Promise((resolve) => setTimeout(resolve, 60));
          continue;
        }
        const before = mode === 'wordbooks'
          ? this.wordbookOffset
          : (this.cardOffset || 0) + (this.passageOffset || 0);
        await this.loadMore();
        const after = mode === 'wordbooks'
          ? this.wordbookOffset
          : (this.cardOffset || 0) + (this.passageOffset || 0);
        if (after === before || this.data.error || this.data.wordbookError) break;
      }
    })();
    try { await this.completeBrowsePromise; }
    finally {
      this.completeBrowsePromise = null;
      this.setData({ searchScopeLoading: false });
    }
  },
  async loadMore() {
    if (this.data.loadingMore || this.data.loading || this.data.wordbookLoading) return;
    if (this.data.viewMode === 'wordbooks') {
      if (!this.data.wordbookHasMore) return;
      this.setData({ loadingMore: true, wordbookError: '' });
      try {
        const response = await api.cards.list({ limit: 100, offset: this.wordbookOffset, add_channel: 'wordbook' });
        const books = {};
        this.data.wordbooks.forEach((book) => { books[book.id] = book; });
        this.wordbookOffset += response.items.length;
        const entries = this.data.wordbookEntries.concat(response.items.map((card) => toSavedWordbookView(card, books)));
        this.setData({ wordbookEntries: entries, filteredWordbookEntries: this.filterWordbookEntries(entries), wordbookHasMore: response.items.length > 0 && this.wordbookOffset < response.total });
      } catch (error) {
        this.setData({ wordbookError: errorMessage(error, '更多收藏加载失败，请重试') });
      } finally { this.setData({ loadingMore: false }); }
      return;
    }
    if (!this.data.hasMore) return;
    this.setData({ loadingMore: true, error: '' });
    try {
      // Commit each source independently: retry must not skip a successfully fetched page.
      if (this.cardHasMore) {
        const response = await api.cards.list({ limit: 100, offset: this.cardOffset });
        this.cardOffset += response.items.length;
        this.cardHasMore = response.items.length > 0 && this.cardOffset < response.total;
        const cards = this.data.cards.concat(response.items.map(toCardView).filter((card) => card.addChannel !== 'wordbook'));
        this.setData({ cards, filtered: this.filterCards(cards) });
      }
      if (this.passageHasMore) {
        const response = await api.passages.list({ limit: 100, offset: this.passageOffset });
        this.passageOffset += response.items.length;
        this.passageHasMore = response.items.length > 0 && this.passageOffset < response.total;
        const cards = this.data.cards.concat(response.items.map(toPassageView));
        this.setData({ cards, filtered: this.filterCards(cards) });
      }
    } catch (error) {
      this.setData({ error: errorMessage(error, '更多英语加载失败，请重试') });
    } finally {
      this.setData({ loadingMore: false, hasMore: !!(this.cardHasMore || this.passageHasMore) });
    }
  },

  resetFilters() {
    clearTimeout(this.completeBrowseTimer);
    this.setData({ keyword: '', filter: 'all', selectedBookCode: 'all' }, () => {
      this.setData({ filtered: this.filterCards(this.data.cards), filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
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
      const [wordbooks, cardResponse] = await Promise.all([
        api.wordbooks.list(),
        api.cards.list({ limit: 100, offset: 0, add_channel: 'wordbook' })
      ]);
      const booksById = {};
      wordbooks.forEach((book) => { booksById[book.id] = book; });
      const entries = (cardResponse.items || []).map((card) => toSavedWordbookView(card, booksById));
      this.wordbookOffset = (cardResponse.items || []).length;
      const bookFilters = [{ key: 'all', label: '全部' }].concat(wordbooks.map((book) => ({
        key: book.code,
        label: BOOK_MARKS[book.code] || book.title
      })));
      this.setData({
        wordbooks,
        bookFilters,
        wordbookEntries: entries,
        filteredWordbookEntries: this.filterWordbookEntries(entries),
        wordbookLoaded: true,
        wordbookHasMore: this.wordbookOffset < cardResponse.total
      });
      if (this.data.keyword || this.data.selectedBookCode !== 'all') this.scheduleCompleteBrowseResults();
    } catch (error) {
      this.setData({ wordbookError: errorMessage(error, '收藏加载失败') });
    } finally {
      this.setData({ wordbookLoading: false });
    }
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.view;
    if (!['personal', 'wordbooks'].includes(viewMode) || viewMode === this.data.viewMode) return;
    clearTimeout(this.completeBrowseTimer);
    this.setData({ viewMode, keyword: '', managing: false, selectedIds: [], selectedMap: {}, swipedCardId: '' });
    if (viewMode === 'wordbooks') {
      this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
      this.refreshWordbooks();
    } else {
      this.setData({ filtered: this.filterCards(this.data.cards) });
      this.refresh();
    }
  },

  search(e) {
    this.setData({ keyword: e.detail.value }, () => {
      if (this.data.viewMode === 'wordbooks') {
        this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
      } else {
        this.setData({ filtered: this.filterCards(this.data.cards) });
      }
      if (this.data.keyword.trim()) this.scheduleCompleteBrowseResults();
    });
  },
  clearSearch() {
    clearTimeout(this.completeBrowseTimer);
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
      if (this.data.filter !== 'all') this.scheduleCompleteBrowseResults();
    });
  },
  changeSort(e) {
    const sortIndex = Number(e.detail.value) || 0;
    const option = SORT_OPTIONS[sortIndex] || SORT_OPTIONS[0];
    try { wx.setStorageSync(SORT_STORAGE_KEY, option.key); } catch (_) {}
    this.setData({ sortIndex, sortOrder: option.key, swipedCardId: '' }, () => {
      this.setData({ filtered: this.filterCards(this.data.cards) });
      if (option.key === 'oldest') this.scheduleCompleteBrowseResults();
    });
  },
  chooseBookFilter(e) {
    this.setData({ selectedBookCode: e.currentTarget.dataset.filter }, () => {
      this.setData({ filteredWordbookEntries: this.filterWordbookEntries(this.data.wordbookEntries) });
      if (this.data.selectedBookCode !== 'all') this.scheduleCompleteBrowseResults();
    });
  },
  open(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.cards.find((entry) => entry.id === id);
    if (item && item.kind === 'passage') {
      wx.navigateTo({ url: '/pages/library/passage?id=' + encodeURIComponent(id) });
      return;
    }
    wx.navigateTo({ url: '/pages/library/detail?id=' + id + '&source=personal' });
  },
  openWordbookEntry(e) {
    wx.navigateTo({ url: '/pages/library/detail?id=' + e.currentTarget.dataset.id + '&source=personal' });
  },
  goWordbooks() { wx.navigateTo({ url: '/pages/wordbooks/index' }); },
  handleItemTap(e) {
    if (Date.now() < (this.ignoreCardTapUntil || 0)) return;
    const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    this.openCardById(id);
  },
  onCardTap(payload) {
    if (Date.now() < (this.ignoreCardTapUntil || 0)) return;
    this.openCardById(payload && payload.id);
  },
  openCardById(id) {
    const cardId = String(id || '');
    if (!cardId) return;
    if (this.data.managing) {
      this.toggleSelect({ currentTarget: { dataset: { id: cardId } } });
      return;
    }
    if (this.data.swipedCardId) {
      this.setData({ swipedCardId: '' });
      return;
    }
    this.open({ currentTarget: { dataset: { id: cardId } } });
  },
  onSwipeSettle(payload) {
    const open = Boolean(payload && payload.open);
    const id = open ? String(payload.id || '') : '';
    this.ignoreCardTapUntil = Date.now() + 280;
    if (id === this.data.swipedCardId) return;
    this.setData({ swipedCardId: id });
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
    const item = this.data.cards.find((entry) => entry.id === id);
    this.setData({ swipedCardId: '' });
    if (item && item.kind === 'passage') {
      wx.navigateTo({ url: '/pages/add/add?passageId=' + encodeURIComponent(id) });
      return;
    }
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
          if (card && card.kind === 'passage') {
            await api.passages.remove(id, { baseVersion: card.version });
          } else {
            await api.cards.remove(id, { baseVersion: card && card.version });
          }
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
    this.ignoreCardTapUntil = 0;
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
            if (card && card.kind === 'passage') {
              return api.passages.remove(id, { baseVersion: card.version });
            }
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
  goSettings() { wx.navigateTo({ url: '/pages/settings/index' }); },
  add() { wx.navigateTo({ url: '/pages/add/add' }); }
});
