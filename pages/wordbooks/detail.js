const api = require('../../utils/api/index');
const { newClientActionId, errorMessage } = require('../../utils/coreViewModels');
const { removeMaterialFromLibrary } = require('../../utils/materialLibrary');

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };
const NEW_WORD_OPTIONS = [5, 10, 15, 20, 30, 50];
const PAGE_SIZE = 30;
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'not_started', label: '未学' },
  { key: 'learning', label: '学习中' },
  { key: 'learned', label: '已掌握' }
];
const SORT_OPTIONS = [
  { key: 'position', label: '默认顺序' },
  { key: 'alpha', label: 'A-Z' }
];

const POS_LABELS = new Set(['n', 'v', 'adj', 'adv', 'prep', 'pron', 'conj', 'aux', 'abbr', 'phr', 'vt', 'vi', 'art', 'num', 'int', 'det']);

function parseWordbookMeanings(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(/[;；]+/).map((segment) => {
    const part = segment.trim();
    const match = part.match(/^([a-z]{1,8})\.?\s*(.*)$/i);
    const token = match ? String(match[1] || '').toLowerCase() : '';
    if (!match || !POS_LABELS.has(token) || !match[2].trim()) {
      return { pos: '', meaning: part };
    }
    return {
      pos: token + '.',
      meaning: match[2].trim()
    };
  }).filter((item) => item.meaning);
}

function swipeWidthPx(progressFilter, windowWidth) {
  const widthInRpx = progressFilter === 'all' ? 112 : 248;
  return Math.round((windowWidth || 375) * widthInRpx / 750);
}

function progressMeta(state) {
  if (state === 'learned') return { statusLabel: '已掌握', statusKind: 'mastered' };
  if (state === 'learning') return { statusLabel: '学习中', statusKind: 'learning' };
  return { statusLabel: '未学', statusKind: 'unlearned' };
}

function formatPercent(value) {
  const percent = Number(value) || 0;
  if (percent <= 0) return '0%';
  if (percent >= 99.95) return '100%';
  if (percent < 10) return percent.toFixed(1) + '%';
  return Math.round(percent) + '%';
}

Page({
  data: {
    safeTop: 20,
    menuRightInset: 88,
    book: null,
    learnedCount: 0,
    itemCount: 0,
    dueCount: 0,
    upcomingNewCount: 0,
    newWordsPerSession: 20,
    newWordIndex: 3,
    newWordOptions: NEW_WORD_OPTIONS,
    progressPercent: 0,
    progressPercentLabel: '0%',
    completed: false,
    hasActiveSession: false,
    ctaDisabled: false,
    filters: FILTERS,
    progressFilter: 'all',
    sortOptions: SORT_OPTIONS,
    sortIndex: 0,
    sortKey: 'position',
    showMeanings: false,
    entries: [],
    totalEntries: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: '',
    selectedId: '',
    swipedCardId: '',
    swipeMaxPx: 56
  },

  onLoad(options) {
    this.bookId = options.id || 'cet4';
    this.nextOffset = 0;
    this.reloadToken = 0;
    this.hasShown = false;
    this.expandedIds = {};
    this.selectedId = '';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let menuRightInset = 88;
    try {
      const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 8, 0);
    } catch (_) {}
    this.windowWidth = info.windowWidth || 375;
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      swipeMaxPx: swipeWidthPx(this.data.progressFilter, this.windowWidth),
      selectedId: ''
    });
    this.refresh();
  },

  onShow() {
    if (!this.hasShown) {
      this.hasShown = true;
      return;
    }
    this.refresh();
  },

  onReachBottom() { this.loadMore(); },

  onPageScroll() {
    if (this.data.swipedCardId) this.setData({ swipedCardId: '' });
  },

  applyDetail(detail) {
    const source = detail.book;
    const state = source.userState;
    const learnedCount = state.learnedCount;
    const itemCount = source.itemCount;
    const newWordsPerSession = state.newWordsPerSession || 20;
    const newWordIndex = Math.max(0, NEW_WORD_OPTIONS.indexOf(newWordsPerSession));
    const completed = state.state === 'completed' || (itemCount > 0 && learnedCount >= itemCount);
    const progressPercent = itemCount ? Math.min(100, learnedCount / itemCount * 100) : 0;
    this.setData({
      book: {
        id: source.id,
        code: source.code,
        title: source.title,
        description: source.description,
        count: itemCount,
        coverMark: BOOK_MARKS[source.code] || source.code.toUpperCase(),
        started: state.state !== 'not_started'
      },
      learnedCount,
      itemCount,
      hasActiveSession: !!state.hasActiveSession,
      dueCount: state.dueCount,
      upcomingNewCount: state.upcomingNewCount,
      newWordsPerSession,
      newWordIndex: newWordIndex < 0 ? 3 : newWordIndex,
      progressPercent,
      progressPercentLabel: formatPercent(progressPercent),
      completed,
      ctaDisabled: itemCount <= 0
    });
  },

  mapEntries(items) {
    const expandedIds = this.expandedIds || {};
    const selectedId = this.selectedId || '';
    return (items || []).map((entry) => {
      const meta = progressMeta(entry.progressState);
      return {
        id: entry.id,
        en: entry.englishText,
        zh: entry.chinese,
        learned: entry.progressState === 'learned',
        statusLabel: meta.statusLabel,
        statusKind: meta.statusKind,
        joined: entry.inLibrary,
        meanings: parseWordbookMeanings(entry.chinese),
        expanded: Boolean(expandedIds[entry.id]),
        selected: selectedId === entry.id
      };
    });
  },

  decorateEntries(entries) {
    const expandedIds = this.expandedIds || {};
    const selectedId = this.selectedId || '';
    return (entries || []).map((entry) => Object.assign({}, entry, {
      expanded: Boolean(expandedIds[entry.id]),
      selected: selectedId === entry.id
    }));
  },

  async refresh() {
    const token = (this.reloadToken || 0) + 1;
    this.reloadToken = token;
    this.nextOffset = 0;
    this.setData({ loading: true, error: '' });
    try {
      const [detail, list] = await Promise.all([
        api.wordbooks.get(this.bookId),
        api.wordbooks.listEntries(this.bookId, {
          limit: PAGE_SIZE,
          offset: 0,
          progress: this.data.progressFilter,
          sort: this.data.sortKey
        })
      ]);
      if (token !== this.reloadToken) return;
      this.applyDetail(detail);
      const entries = this.mapEntries(list.items);
      this.nextOffset = list.nextOffset == null ? entries.length : list.nextOffset;
      this.setData({
        entries,
        totalEntries: list.total,
        hasMore: list.nextOffset != null
      });
    } catch (error) {
      if (token !== this.reloadToken) return;
      this.setData({ error: errorMessage(error, '词汇书详情加载失败') });
    } finally {
      if (token === this.reloadToken) this.setData({ loading: false });
    }
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    const token = this.reloadToken;
    this.setData({ loadingMore: true });
    try {
      const list = await api.wordbooks.listEntries(this.bookId, {
        limit: PAGE_SIZE,
        offset: this.nextOffset,
        progress: this.data.progressFilter,
        sort: this.data.sortKey
      });
      if (token !== this.reloadToken) return;
      const extra = this.mapEntries(list.items);
      const entries = this.data.entries.concat(extra);
      this.nextOffset = list.nextOffset == null ? this.nextOffset + extra.length : list.nextOffset;
      this.setData({
        entries,
        totalEntries: list.total,
        hasMore: list.nextOffset != null
      });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '继续加载失败'), icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  chooseFilter(e) {
    const progressFilter = e.currentTarget.dataset.progress || e.currentTarget.dataset.filter;
    if (!progressFilter || progressFilter === this.data.progressFilter) return;
    this.expandedIds = {};
    this.selectedId = '';
    this.setData({
      progressFilter,
      selectedId: '',
      swipedCardId: '',
      swipeMaxPx: swipeWidthPx(progressFilter, this.windowWidth),
      entries: [],
      totalEntries: 0,
      hasMore: false
    }, () => this.refresh());
  },

  changeSort(e) {
    const sortIndex = Number.parseInt(e.detail.value, 10);
    const option = SORT_OPTIONS[Number.isFinite(sortIndex) ? sortIndex : 0] || SORT_OPTIONS[0];
    if (option.key === this.data.sortKey && sortIndex === this.data.sortIndex) return;
    this.expandedIds = {};
    this.selectedId = '';
    this.setData({
      sortIndex: Number.isFinite(sortIndex) ? sortIndex : 0,
      sortKey: option.key,
      selectedId: '',
      swipedCardId: '',
      entries: [],
      hasMore: false
    }, () => this.refresh());
  },

  toggleMeanings() {
    this.setData({ showMeanings: !this.data.showMeanings });
  },

  async changeNewWordCount(e) {
    const newWordIndex = Number(e.detail.value) || 0;
    const value = NEW_WORD_OPTIONS[newWordIndex] || 20;
    if (value === this.data.newWordsPerSession) return;
    try {
      const detail = await api.wordbooks.updateSettings(this.bookId, value);
      this.applyDetail(detail);
      wx.showToast({ title: '每次学习 ' + value + ' 词', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '设置失败'), icon: 'none' });
    }
  },

  async startLearning() {
    if (this.data.ctaDisabled || this.starting) return;
    this.starting = true;
    try {
      await api.wordbooks.startOrContinue(this.bookId);
      const session = await api.wordbooks.createReviewSession(this.bookId, {
        new_words_per_session: this.data.newWordsPerSession,
        restart: false
      });
      if (!session.sessionId || session.status === 'empty') {
        wx.showToast({ title: '这本书还没有词', icon: 'none' });
        this.refresh();
        return;
      }
      wx.navigateTo({
        url: '/pages/wordbooks/study?code=' + encodeURIComponent(this.bookId) + '&session_id=' + encodeURIComponent(session.sessionId)
      });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '开始学习失败'), icon: 'none' });
    } finally {
      this.starting = false;
    }
  },

  browseWordList() {
    const selected = this.data.entries.find((item) => item.id === this.selectedId);
    const fallback = this.data.entries.find((item) => !item.learned) || this.data.entries[0];
    const target = selected || fallback;
    if (!target) {
      wx.showToast({ title: '这一栏暂时没有词', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/library/detail?id=' + target.id
        + '&source=public&from=wordbook&book=' + encodeURIComponent(this.bookId)
        + '&sort=' + encodeURIComponent(this.data.sortKey || 'position')
        + '&progress=' + encodeURIComponent(this.data.progressFilter || 'all')
    });
  },

  open(event) {
    this.selectedId = String(event.currentTarget.dataset.id || '');
    this.browseWordList();
  },

  onCardTap(payload) {
    if (Date.now() < (this.ignoreCardTapUntil || 0)) return;
    const id = String(payload && payload.id || '');
    if (!id) return;
    this.selectedId = id;
    this.browseWordList();
  },

  onSwipeSettle(payload) {
    const open = Boolean(payload && payload.open);
    const id = open ? String(payload.id || '') : '';
    this.ignoreCardTapUntil = Date.now() + 280;
    if (id === this.data.swipedCardId) return;
    this.setData({ swipedCardId: id });
  },

  expandEntry(id) {
    if (!id) return;
    if (this.data.swipedCardId) {
      this.setData({ swipedCardId: '' });
      return;
    }
    this.selectedId = id;
    this.setData({
      selectedId: id,
      entries: this.decorateEntries(this.data.entries)
    });
  },

  async ensureStarted() {
    if (this.data.book && this.data.book.started) return;
    const detail = await api.wordbooks.startOrContinue(this.bookId);
    this.applyDetail(detail);
  },

  async masterEntry(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const entry = this.data.entries.find((item) => item.id === id);
    if (!['not_started', 'learning'].includes(this.data.progressFilter)) {
      wx.showToast({ title: '请在“未学”或“学习中”里标记掌握', icon: 'none' });
      return;
    }
    if (!entry || this.updatingProgress) return;
    this.updatingProgress = true;
    try {
      await this.ensureStarted();
      const result = await api.wordbooks.updateProgress(this.bookId, id, {
        clientActionId: newClientActionId('wordbook-progress'),
        status: 'learned'
      });
      this.applyDetail({ book: result.book });
      if (this.data.progressFilter !== 'learned') {
        this.expandedIds = this.expandedIds || {};
        delete this.expandedIds[id];
        if (this.selectedId === id) this.selectedId = '';
        this.setData({
          selectedId: this.selectedId,
          swipedCardId: '',
          entries: this.data.entries.filter((item) => item.id !== id)
        });
      } else {
        this.setData({
          swipedCardId: '',
          entries: this.decorateEntries(this.data.entries.map((item) => (
            item.id === id ? Object.assign({}, item, { learned: true, statusKind: 'mastered', statusLabel: '已掌握' }) : item
          )))
        });
      }
      this.nextOffset = Math.max(0, this.nextOffset - 1);
      this.setData({ totalEntries: Math.max(0, this.data.totalEntries - 1) });
      wx.showToast({ title: '已移至已掌握', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '标记失败，请重试'), icon: 'none' });
    } finally {
      this.updatingProgress = false;
    }
  },

  async relearnEntry(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry || this.updatingProgress) return;
    this.updatingProgress = true;
    try {
      await this.ensureStarted();
      const result = await api.wordbooks.updateProgress(this.bookId, id, {
        clientActionId: newClientActionId('wordbook-progress'),
        status: 'not_started'
      });
      this.applyDetail({ book: result.book });
      this.expandedIds = this.expandedIds || {};
      delete this.expandedIds[id];
      if (this.selectedId === id) this.selectedId = '';
      this.setData({
        selectedId: this.selectedId,
        swipedCardId: '',
        entries: this.data.entries.filter((item) => item.id !== id)
      });
      this.nextOffset = Math.max(0, this.nextOffset - 1);
      this.setData({ totalEntries: Math.max(0, this.data.totalEntries - 1) });
      wx.showToast({ title: '已恢复原词表顺序', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '重学失败，请重试'), icon: 'none' });
    } finally {
      this.updatingProgress = false;
    }
  },

  async toggleFavorite(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry || this.togglingFavorite) return;
    this.togglingFavorite = true;
    try {
      if (entry.joined) {
        await removeMaterialFromLibrary({ id: entry.id, en: entry.en });
      this.setData({
        swipedCardId: '',
        entries: this.data.entries.map((item) => item.id === id ? Object.assign({}, item, { joined: false }) : item)
      });
        wx.showToast({ title: '已取消词书收藏', icon: 'none' });
        return;
      }
      await api.wordbooks.addEntryToLibrary(this.bookId, id, newClientActionId('wordbook-entry'), false);
      this.setData({
        swipedCardId: '',
        entries: this.data.entries.map((item) => item.id === id ? Object.assign({}, item, { joined: true }) : item)
      });
      wx.showToast({ title: '已加入词书收藏', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, entry.joined ? '取消失败，请重试' : '收藏失败，请重试'), icon: 'none' });
    } finally {
      this.togglingFavorite = false;
    }
  },

  retryLoad() { this.refresh(); },
  goBack() { wx.navigateBack({ delta: 1 }); },
  goHome() { wx.switchTab({ url: '/pages/index/index' }); }
});
