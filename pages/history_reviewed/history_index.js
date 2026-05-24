const {
  getHistoryCardSummaries,
  filterHistoryCardSummariesByResult,
  getHistorySummaryStats
} = require('../../utils/historyReviewStorageFacade');

const { getReviewHistory, getReviewHistorySummary } = require('../../utils/apiClient');

const RANGE_OPTIONS = [
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'all', label: '全部历史' }
];

const QUICK_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'weak', label: '有点忘了' },
  { key: 'good', label: '记得' }
];

// Legacy fallback only: maps old local reviewRecords labels to tagType
function getResultTagType(result) {
  if (result === '没记住') {
    return 'again';
  }

  if (result === '模糊') {
    return 'hard';
  }

  if (result === '记住了' || result === '太简单') {
    return 'good';
  }

  return 'default';
}

function formatShortReviewTime(dateText, timeText) {
  if (!dateText) {
    return '—';
  }

  const today = new Date();
  const todayText = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayText = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, '0'),
    String(yesterday.getDate()).padStart(2, '0')
  ].join('-');

  if (dateText === todayText) {
    return timeText ? `今天 ${timeText}` : '今天';
  }

  if (dateText === yesterdayText) {
    return timeText ? `昨天 ${timeText}` : '昨天';
  }

  const parts = String(dateText).split('-');

  if (parts.length >= 3) {
    return `${Number(parts[1])}月${Number(parts[2])}日`;
  }

  return dateText;
}

function decorateHistoryCards(cards = []) {
  return (cards || []).map((item) => ({
    ...item,
    lastResultText: item.lastResultInRange || '—',
    lastReviewDisplay: formatShortReviewTime(
      item.lastReviewDateInRange,
      item.lastReviewTimeInRange
    ),
    resultTagType: item._rawResult
      ? (REVIEW_RESULT_TAG_TYPES[item._rawResult] || 'default')
      : getResultTagType(item.lastResultInRange)
  }));
}

function formatHistoryDateTitle(dateText) {
  if (!dateText) {
    return '未知日期';
  }

  const parts = String(dateText).split('-');

  if (parts.length >= 3) {
    return `${Number(parts[1])}-${Number(parts[2])}`;
  }

  return dateText;
}

function buildHistoryDateGroups(cards = []) {
  const groupMap = {};

  (cards || []).forEach((card) => {
    const dateKey = card.lastReviewDateInRange || 'unknown';

    if (!groupMap[dateKey]) {
      groupMap[dateKey] = [];
    }

    groupMap[dateKey].push(card);
  });

  return Object.keys(groupMap)
    .sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return String(b).localeCompare(String(a));
    })
    .map((dateKey) => ({
      dateKey,
      title: formatHistoryDateTitle(dateKey),
      cards: groupMap[dateKey]
    }));
}


function searchHistoryCards(cards = [], keyword = '') {
  const text = String(keyword || '').trim().toLowerCase();

  if (!text) {
    return cards || [];
  }

  return (cards || []).filter((item) => {
    const fields = [
      item.englishText,
      item.myUnderstanding,
      item.note,
      item.notes,
      item.category,
      item.examScene,
      item.examModule,
      item.whereEncountered,
      item.lastResultInRange
    ];

    return fields.some((field) =>
      String(field || '').toLowerCase().includes(text)
    );
  });
}

function buildQuickFilterOptionsWithCounts(allSummaries = []) {
  const weakCount = filterHistoryCardSummariesByResult(allSummaries, 'again').length
    + filterHistoryCardSummariesByResult(allSummaries, 'hard').length;
  const countMap = {
    all: allSummaries.length,
    weak: weakCount,
    good: filterHistoryCardSummariesByResult(allSummaries, 'good').length
  };

  return QUICK_FILTER_OPTIONS.map((item) => ({
    ...item,
    count: Number(countMap[item.key] || 0),
    displayLabel: `${item.label}（${Number(countMap[item.key] || 0)}）`
  }));
}

// Phase 5-1C: backend history result labels
const REVIEW_RESULT_LABELS = {
  forgot: '想不起来',
  shaky: '不太稳',
  got_it: '基本掌握',
  fluent: '很熟了'
};

const REVIEW_RESULT_TAG_TYPES = {
  forgot: 'again',
  shaky: 'hard',
  got_it: 'good',
  fluent: 'fluent'
};

const CARD_TYPE_MAP = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
};

function mapBackendHistoryItem(item) {
  const reviewedAt = new Date(item.last_reviewed_at);
  const year = reviewedAt.getFullYear();
  const month = String(reviewedAt.getMonth() + 1).padStart(2, '0');
  const day = String(reviewedAt.getDate()).padStart(2, '0');
  const hours = String(reviewedAt.getHours()).padStart(2, '0');
  const minutes = String(reviewedAt.getMinutes()).padStart(2, '0');

  return {
    logId: item.review_log_id ? String(item.review_log_id) : '',
    cardId: String(item.card_id),
    englishText: item.content || '',
    myUnderstanding: item.understanding || '',
    notes: item.note || '',
    category: CARD_TYPE_MAP[item.card_type] || '单词',
    examScene: item.exam_scene || '未分类',
    examModule: item.exam_module || '未分类',
    whereEncountered: item.where_encountered || '',
    reviewCountInRange: item.review_count_in_range,
    lastResultInRange: REVIEW_RESULT_LABELS[item.last_result] || '—',
    lastReviewDateInRange: `${year}-${month}-${day}`,
    lastReviewTimeInRange: `${hours}:${minutes}`,
    _rawResult: item.last_result
  };
}

function buildBackendQuickFilterOptions(cards = []) {
  const total = cards.length;
  const weakCount = cards.filter((c) => c._rawResult === 'forgot' || c._rawResult === 'shaky').length;
  const goodCount = cards.filter((c) => c._rawResult === 'got_it' || c._rawResult === 'fluent').length;

  return QUICK_FILTER_OPTIONS.map((opt) => {
    let cnt;
    if (opt.key === 'all') cnt = total;
    else if (opt.key === 'weak') cnt = weakCount;
    else cnt = goodCount;
    return { ...opt, count: cnt, displayLabel: `${opt.label}（${cnt}）` };
  });
}

function buildBackendHistoryParams(rangeKey, resultKey, activeSearchKeyword, limit = 100, offset = 0) {
  const params = { limit, offset };

  if (rangeKey !== 'all') {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    params.date_to = `${y}-${m}-${d}`;

    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - (rangeKey === '7d' ? 7 : 30));
    const fy = fromDate.getFullYear();
    const fm = String(fromDate.getMonth() + 1).padStart(2, '0');
    const fd = String(fromDate.getDate()).padStart(2, '0');
    params.date_from = `${fy}-${fm}-${fd}`;
  }

  const trimmedSearch = (activeSearchKeyword || '').trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }

  if (resultKey === 'weak') {
    params.result = ['forgot', 'shaky'];
  } else if (resultKey === 'good') {
    params.result = ['got_it', 'fluent'];
  }
  // 'all' — no result param

  return params;
}

function computeHistoryStatsFromItems(items = []) {
  const totalReviewsInRange = items.reduce(
    (sum, item) => sum + Number(item.reviewCountInRange || 0),
    0
  );
  return {
    totalReviewsInRange,
    totalCardsInRange: items.length
  };
}

function normalizeBackendHistorySummary(summary) {
  const counts = (summary && summary.latest_result_card_counts) || {};
  const totalCards = summary.unique_cards || 0;
  const totalReviews = summary.total_reviews || 0;

  const quickFilterOptions = QUICK_FILTER_OPTIONS.map((opt) => {
    let cnt;
    if (opt.key === 'all') {
      cnt = totalCards;
    } else if (opt.key === 'weak') {
      cnt = (counts.forgot || 0) + (counts.shaky || 0);
    } else {
      cnt = (counts.got_it || 0) + (counts.fluent || 0);
    }
    return { ...opt, count: cnt, displayLabel: `${opt.label}（${cnt}）` };
  });

  return {
    stats: {
      totalReviewsInRange: totalReviews,
      totalCardsInRange: totalCards
    },
    quickFilterOptions
  };
}

Page({
  data: {
    rangeOptions: RANGE_OPTIONS,
    quickFilterOptions: QUICK_FILTER_OPTIONS,

    selectedRange: '7d',
    selectedRangeLabel: '近7天',
    rangeIndex: 0,
    selectedQuickFilter: 'all',
    searchKeyword: '',
    activeSearchKeyword: '',

    statsDisplayText: '',
    stats: {
      totalReviewsInRange: 0,
      totalCardsInRange: 0
    },

    allSummaries: [],
    filteredCards: [],
    historyDateGroups: [],
    showHistoryFastScroll: false,
    historyFastScrollThumbTop: 0,
    historyFastScrollThumbStyle: 'top: 0%;',
    historyPageScrollTop: 0,

    backendHistoryLimit: 100,
    backendHistoryTotal: 0,
    backendHistoryHasMore: false,
    backendHistoryLoadingMore: false,
    historyRequestSeq: 0,
    usingBackendHistory: false,
    summaryLoadFailed: false,
    offlineEmpty: false
  },

  onShow() {
    this.loadHistoryData();
  },

  async loadHistoryData({ refreshSummary = true } = {}) {
    const { selectedRange, selectedQuickFilter, activeSearchKeyword } = this.data;
    const requestSeq = (this.data.historyRequestSeq || 0) + 1;

    this.setData({
      historyRequestSeq: requestSeq,
      backendHistoryTotal: 0,
      backendHistoryHasMore: false,
      backendHistoryLoadingMore: false,
      usingBackendHistory: false,
      summaryLoadFailed: false,
      offlineEmpty: false
    });

    try {
      const params = buildBackendHistoryParams(selectedRange, selectedQuickFilter, activeSearchKeyword, this.data.backendHistoryLimit || 100, 0);
      const response = await getReviewHistory(params);

      if (requestSeq !== this.data.historyRequestSeq) {
        console.log('[history-page] stale list response ignored', requestSeq);
        return;
      }

      if (response && Array.isArray(response.items)) {
        // HTTP 200: backend is available regardless of empty result
        this.setData({ usingBackendHistory: true });

        if (response.items.length > 0) {
          console.log('[history-summary] backend list success, use backend summary');
          await this._renderBackendData(response, requestSeq, { refreshSummary });
          return;
        }

        // Backend returned empty list — not a backend failure
        if (requestSeq === this.data.historyRequestSeq) {
          if (refreshSummary) {
            this._renderEmpty();
          } else {
            this._renderBackendEmpty();
          }
        }
        return;
      }

      if (requestSeq === this.data.historyRequestSeq) {
        this._renderEmpty();
      }
    } catch (error) {
      if (requestSeq !== this.data.historyRequestSeq) return;
      console.warn('[history-summary] backend list failed, use local stats', error);
      if (this._hasLocalHistory(this.data.selectedRange)) {
        this._fallbackToLocalHistory();
        this.setData({ offlineEmpty: false });
      } else {
        this.setData({ offlineEmpty: true });
      }
    }
  },

  async _renderBackendData(response, requestSeq, { refreshSummary = true } = {}) {
    const allMapped = (response.items || []).map(mapBackendHistoryItem);
    const loadedCount = allMapped.length;
    const total = Number(response.total || loadedCount);

    if (refreshSummary) {
      const { selectedRange, activeSearchKeyword } = this.data;
      const summaryParams = {};
      if (selectedRange !== 'all') {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        summaryParams.date_to = `${y}-${m}-${d}`;

        const fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - (selectedRange === '7d' ? 7 : 30));
        const fy = fromDate.getFullYear();
        const fm = String(fromDate.getMonth() + 1).padStart(2, '0');
        const fd = String(fromDate.getDate()).padStart(2, '0');
        summaryParams.date_from = `${fy}-${fm}-${fd}`;
      }

      const trimmedSearch = (activeSearchKeyword || '').trim();
      if (trimmedSearch) {
        summaryParams.search = trimmedSearch;
      }

      const wasSummaryPreviouslyFailed = this.data.summaryLoadFailed;
      let stats;
      let quickFilterOptions;
      let summaryLoadFailed = false;

      try {
        const summaryRes = await this.fetchBackendHistorySummary(summaryParams);
        if (requestSeq !== this.data.historyRequestSeq) {
          console.log('[history-page] stale summary response ignored', requestSeq);
          return;
        }
        console.log('[history-summary] backend summary success', summaryRes);
        const normalized = normalizeBackendHistorySummary(summaryRes);
        stats = normalized.stats;
        quickFilterOptions = normalized.quickFilterOptions;
      } catch (summaryErr) {
        if (requestSeq !== this.data.historyRequestSeq) return;
        console.warn('[history-summary] backend summary failed, not falling back to page-one stats', summaryErr);
        summaryLoadFailed = true;
        stats = { totalReviewsInRange: '-', totalCardsInRange: '-' };
        quickFilterOptions = QUICK_FILTER_OPTIONS.map((opt) => ({
          ...opt,
          count: '-',
          displayLabel: `${opt.label}（-）`
        }));

        if (!wasSummaryPreviouslyFailed) {
          wx.showToast({
            title: '统计数据拉取失败，但不影响复习',
            icon: 'none'
          });
        }
      }

      const hasMore = loadedCount < total;
      const statsLabel = this.data.selectedRangeLabel || '';
      const statsDisplayText = (stats && typeof stats.totalCardsInRange === 'number')
        ? statsLabel + '看过 ' + stats.totalCardsInRange + ' 张·共 ' + stats.totalReviewsInRange + ' 次'
        : '';
      this.setData({
        quickFilterOptions,
        allSummaries: allMapped,
        stats,
        statsDisplayText,
        usingBackendHistory: true,
        summaryLoadFailed,
        backendHistoryTotal: total,
        backendHistoryHasMore: hasMore,
        backendHistoryLoadingMore: false
      });
    } else {
      const hasMore = loadedCount < total;
      this.setData({
        allSummaries: allMapped,
        usingBackendHistory: true,
        backendHistoryTotal: total,
        backendHistoryHasMore: hasMore,
        backendHistoryLoadingMore: false
      });
    }

    this._renderHistoryDisplayList(allMapped);
    this._scrollHistoryToTop();
  },

  _renderHistoryDisplayList(rawList) {
    const decoratedCards = decorateHistoryCards(rawList);
    this.setData({
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0
    });
  },

  async fetchBackendHistorySummary(params) {
    return await getReviewHistorySummary(params);
  },

  onReachBottom() {
    this._loadMoreBackendHistory();
  },

  async _loadMoreBackendHistory() {
    if (this.data.backendHistoryLoadingMore) return;
    if (!this.data.backendHistoryHasMore) return;
    if (!this.data.usingBackendHistory) return;

    const requestSeq = this.data.historyRequestSeq;
    this.setData({ backendHistoryLoadingMore: true });

    try {
      const { selectedRange, selectedQuickFilter, activeSearchKeyword } = this.data;
      const params = buildBackendHistoryParams(selectedRange, selectedQuickFilter, activeSearchKeyword,
        this.data.backendHistoryLimit || 100,
        this.data.allSummaries.length);

      const response = await getReviewHistory(params);

      if (requestSeq !== this.data.historyRequestSeq) {
        console.log('[history-page] stale load more response ignored', requestSeq);
        this.setData({ backendHistoryLoadingMore: false });
        return;
      }

      if (!response || !Array.isArray(response.items)) {
        this.setData({ backendHistoryLoadingMore: false });
        wx.showToast({ title: '加载更多失败', icon: 'none' });
        return;
      }

      const mappedItems = (response.items || []).map(mapBackendHistoryItem);
      const nextAllSummaries = this.data.allSummaries.concat(mappedItems);
      const total = Number(response.total || nextAllSummaries.length);
      const hasMore = nextAllSummaries.length < total;

      this.setData({
        allSummaries: nextAllSummaries,
        backendHistoryTotal: total,
        backendHistoryHasMore: hasMore,
        backendHistoryLoadingMore: false
      });

      this._renderHistoryDisplayList(nextAllSummaries);
    } catch (error) {
      if (requestSeq !== this.data.historyRequestSeq) return;
      console.warn('[history-page] load more failed', error);
      this.setData({ backendHistoryLoadingMore: false });
      wx.showToast({ title: '加载更多失败', icon: 'none' });
    }
  },

  _fallbackToLocalHistory() {
    const { selectedRange, selectedQuickFilter, activeSearchKeyword } = this.data;

    const allSummaries = getHistoryCardSummaries(selectedRange).map(function(item) {
      return Object.assign({}, item, { logId: item.logId || item.cardId || '' });
    });
    let statusFilteredSummaries;
    if (selectedQuickFilter === 'weak') {
      const againItems = filterHistoryCardSummariesByResult(allSummaries, 'again');
      const hardItems = filterHistoryCardSummariesByResult(allSummaries, 'hard');
      statusFilteredSummaries = againItems.concat(hardItems);
    } else {
      statusFilteredSummaries = filterHistoryCardSummariesByResult(allSummaries, selectedQuickFilter);
    }
    const searchedSummaries = searchHistoryCards(statusFilteredSummaries, activeSearchKeyword);
    const decoratedCards = decorateHistoryCards(searchedSummaries);
    const stats = getHistorySummaryStats(selectedRange);
    const statsLabel = this.data.selectedRangeLabel || '';
    const statsDisplayText = (stats && typeof stats.totalCardsInRange === 'number')
      ? statsLabel + '看过 ' + stats.totalCardsInRange + ' 张·共 ' + stats.totalReviewsInRange + ' 次'
      : '';

    this.setData({
      quickFilterOptions: buildQuickFilterOptionsWithCounts(allSummaries),
      allSummaries,
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0,
      stats,
      statsDisplayText,
      usingBackendHistory: false
    });
  },

  // 后端成功返回空列表不等于后端不可用，空状态渲染不能切换数据源模式
  _renderEmpty() {
    const defaultStats = { totalReviewsInRange: 0, totalCardsInRange: 0 };
    const statsLabel = this.data.selectedRangeLabel || '';
    const statsDisplayText = statsLabel + '看过 0 张·共 0 次';

    this.setData({
      quickFilterOptions: QUICK_FILTER_OPTIONS.map((opt) => ({
        ...opt,
        count: 0,
        displayLabel: `${opt.label}（0）`
      })),
      allSummaries: [],
      filteredCards: [],
      historyDateGroups: [],
      showHistoryFastScroll: false,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0,
      stats: defaultStats,
      statsDisplayText
    });
  },

  _renderBackendEmpty() {
    this.setData({
      allSummaries: [],
      filteredCards: [],
      historyDateGroups: [],
      showHistoryFastScroll: false,
      backendHistoryTotal: 0,
      backendHistoryHasMore: false,
      backendHistoryLoadingMore: false,
      usingBackendHistory: true
    });
  },

  _scrollHistoryToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });
  },

  _hasLocalHistory(rangeKey) {
    try {
      const stats = getHistorySummaryStats(rangeKey);
      return stats && stats.totalReviewsInRange > 0;
    } catch (e) {
      return false;
    }
  },

  _applyFrontendFilters() {
    const { allSummaries, selectedQuickFilter, activeSearchKeyword } = this.data;
    const isBackendData = allSummaries.length > 0 && !!allSummaries[0]._rawResult;

    let resultFiltered = allSummaries;
    if (selectedQuickFilter !== 'all') {
      if (isBackendData) {
        if (selectedQuickFilter === 'weak') {
          resultFiltered = allSummaries.filter((item) => item._rawResult === 'forgot' || item._rawResult === 'shaky');
        } else if (selectedQuickFilter === 'good') {
          resultFiltered = allSummaries.filter((item) => item._rawResult === 'got_it' || item._rawResult === 'fluent');
        }
      } else {
        if (selectedQuickFilter === 'weak') {
          const againItems = filterHistoryCardSummariesByResult(allSummaries, 'again');
          const hardItems = filterHistoryCardSummariesByResult(allSummaries, 'hard');
          resultFiltered = againItems.concat(hardItems);
        } else {
          resultFiltered = filterHistoryCardSummariesByResult(allSummaries, selectedQuickFilter);
        }
      }
    }

    const searched = searchHistoryCards(resultFiltered, activeSearchKeyword);
    const decorated = decorateHistoryCards(searched);

    this.setData({
      filteredCards: decorated,
      historyDateGroups: buildHistoryDateGroups(decorated),
      showHistoryFastScroll: decorated.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0
    });
  },

  onRangeChange(event) {
    const rangeIndex = Number(event.detail.value || 0);
    const selectedOption = RANGE_OPTIONS[rangeIndex] || RANGE_OPTIONS[0];

    this.setData({
      rangeIndex,
      selectedRange: selectedOption.key,
      selectedRangeLabel: selectedOption.label
    });

    this.loadHistoryData();
  },



  onQuickFilterTap(event) {
    const { key } = event.currentTarget.dataset;

    if (!key || key === this.data.selectedQuickFilter) {
      return;
    }

    this.setData({ selectedQuickFilter: key });

    this.loadHistoryData({ refreshSummary: false });

    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });
  },

  onSearchInput(event) {
    const searchKeyword = event.detail.value || '';

    this.setData({ searchKeyword });

    // Auto-clear when input becomes empty while there was an active search
    // Covers: Backspace/Delete to empty without pressing Enter
    if (searchKeyword.trim() === '' && this.data.activeSearchKeyword) {
      this._resetHistorySearch();
    }
  },

  onSearchConfirm(event) {
    const keyword = (event.detail.value || '').trim();
    this.setData({ activeSearchKeyword: keyword });

    if (this.data.usingBackendHistory) {
      this.loadHistoryData({ refreshSummary: true });
    } else {
      this._applyFrontendFilters();
    }
  },

  onSearchClear() {
    this._resetHistorySearch();
  },

  _resetHistorySearch() {
    this.setData({ searchKeyword: '', activeSearchKeyword: '' });

    if (this.data.usingBackendHistory) {
      this.loadHistoryData({ refreshSummary: true });
    } else {
      this._applyFrontendFilters();
    }
  },

  onPageScroll(event) {
    const scrollTop = Number(event.scrollTop || 0);
  
    this.updateHistoryFastScrollThumb(scrollTop);
  },
  
  updateHistoryFastScrollThumb(scrollTop) {
    if (!this.data.showHistoryFastScroll) {
      return;
    }
  
    wx.createSelectorQuery()
      .in(this)
      .select('.history-page')
      .boundingClientRect((pageRect) => {
        if (!pageRect) {
          return;
        }
  
        const systemInfo = wx.getSystemInfoSync();
        const windowHeight = systemInfo.windowHeight || 0;
        const pageHeight = pageRect.height || 0;
        const maxScrollTop = Math.max(pageHeight - windowHeight, 1);
        const ratio = Math.max(0, Math.min(1, scrollTop / maxScrollTop));
  
        const thumbTop = Math.round(ratio * 100);

        this.setData({
          historyPageScrollTop: scrollTop,
          historyFastScrollThumbTop: thumbTop,
          historyFastScrollThumbStyle: `top: ${thumbTop}%;`
        });
      })
      .exec();
  },
  
  onHistoryFastScrollTouchStart(event) {
    this.handleHistoryFastScrollTouch(event);
  },
  
  onHistoryFastScrollTouchMove(event) {
    this.handleHistoryFastScrollTouch(event);
  },
  
  handleHistoryFastScrollTouch(event) {
    if (!this.data.showHistoryFastScroll) {
      return;
    }
  
    const touch = event.touches && event.touches[0];
  
    if (!touch) {
      return;
    }
  
    wx.createSelectorQuery()
      .in(this)
      .select('.history-fast-scroll-track')
      .boundingClientRect((trackRect) => {
        if (!trackRect || !trackRect.height) {
          return;
        }
  
        wx.createSelectorQuery()
          .in(this)
          .select('.history-page')
          .boundingClientRect((pageRect) => {
            if (!pageRect) {
              return;
            }
  
            const systemInfo = wx.getSystemInfoSync();
            const windowHeight = systemInfo.windowHeight || 0;
            const pageHeight = pageRect.height || 0;
            const maxScrollTop = Math.max(pageHeight - windowHeight, 0);
  
            const offsetY = touch.clientY - trackRect.top;
            const ratio = Math.max(0, Math.min(1, offsetY / trackRect.height));
            const targetScrollTop = Math.round(maxScrollTop * ratio);
  
            const thumbTop = Math.round(ratio * 100);

            this.setData({
              historyPageScrollTop: targetScrollTop,
              historyFastScrollThumbTop: thumbTop,
              historyFastScrollThumbStyle: `top: ${thumbTop}%;`
            });
  
            wx.pageScrollTo({
              scrollTop: targetScrollTop,
              duration: 0
            });
          })
          .exec();
      })
      .exec();
  },

  onHistoryItemTap(e) {
    const id = e.currentTarget.dataset.id;

    if (!id) {
      wx.showToast({
        title: '缺少历史记录 ID',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/history_detail/history_detail?id=${id}`
    });
  },

  openCard(event) {
    const { id } = event.currentTarget.dataset;

    if (!id) {
      return;
    }

    wx.navigateTo({
      url: `/pages/add/add?id=${id}&from=history`
    });
  }
});