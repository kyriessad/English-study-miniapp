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
  { key: 'again', label: '想不起来' },
  { key: 'hard', label: '不太稳' },
  { key: 'good', label: '已掌握' }
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
    reviewCountText: `本时段复习 ${Number(item.reviewCountInRange || 0)} 次`,
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
      item.lastResultInRange
    ];

    return fields.some((field) =>
      String(field || '').toLowerCase().includes(text)
    );
  });
}

function buildQuickFilterOptionsWithCounts(allSummaries = []) {
  const countMap = {
    all: allSummaries.length,
    again: filterHistoryCardSummariesByResult(allSummaries, 'again').length,
    hard: filterHistoryCardSummariesByResult(allSummaries, 'hard').length,
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
  fluent: 'good'
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
    cardId: String(item.card_id),
    englishText: item.content || '',
    myUnderstanding: item.understanding || '',
    notes: item.note || '',
    category: CARD_TYPE_MAP[item.card_type] || '单词',
    examScene: item.exam_scene || '未分类',
    examModule: item.exam_module || '未分类',
    reviewCountInRange: item.review_count_in_range,
    lastResultInRange: REVIEW_RESULT_LABELS[item.last_result] || '—',
    lastReviewDateInRange: `${year}-${month}-${day}`,
    lastReviewTimeInRange: `${hours}:${minutes}`,
    _rawResult: item.last_result
  };
}

function buildBackendQuickFilterOptions(cards = []) {
  const total = cards.length;
  const againCount = cards.filter((c) => c._rawResult === 'forgot').length;
  const hardCount = cards.filter((c) => c._rawResult === 'shaky').length;
  const goodCount = cards.filter((c) => c._rawResult === 'got_it' || c._rawResult === 'fluent').length;

  return QUICK_FILTER_OPTIONS.map((opt) => {
    let cnt;
    if (opt.key === 'all') cnt = total;
    else if (opt.key === 'again') cnt = againCount;
    else if (opt.key === 'hard') cnt = hardCount;
    else cnt = goodCount;
    return { ...opt, count: cnt, displayLabel: `${opt.label}（${cnt}）` };
  });
}

function buildBackendHistoryParams(rangeKey, resultKey, searchKeyword, limit = 100, offset = 0) {
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

  const trimmedSearch = (searchKeyword || '').trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }

  if (resultKey === 'again') {
    params.result = 'forgot';
  } else if (resultKey === 'hard') {
    params.result = 'shaky';
  }
  // 'good' handled frontend-side (covers got_it + fluent)

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
    } else if (opt.key === 'again') {
      cnt = counts.forgot || 0;
    } else if (opt.key === 'hard') {
      cnt = counts.shaky || 0;
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
    usingBackendHistory: false
  },

  onShow() {
    this.loadHistoryData();
  },

  async loadHistoryData() {
    const { selectedRange, selectedQuickFilter, searchKeyword } = this.data;
    const requestSeq = (this.data.historyRequestSeq || 0) + 1;

    this.setData({
      historyRequestSeq: requestSeq,
      backendHistoryTotal: 0,
      backendHistoryHasMore: false,
      backendHistoryLoadingMore: false,
      usingBackendHistory: false
    });

    try {
      const params = buildBackendHistoryParams(selectedRange, selectedQuickFilter, searchKeyword,this.data.backendHistoryLimit || 100,
        0);
      const response = await getReviewHistory(params);

      if (requestSeq !== this.data.historyRequestSeq) {
        console.log('[history-page] stale list response ignored', requestSeq);
        return;
      }

      if (response && Array.isArray(response.items)) {
        if (response.items.length > 0) {
          console.log('[history-summary] backend list success, use backend summary');
          await this._renderBackendData(response, selectedQuickFilter, requestSeq);
          return;
        }
        // Backend returned empty — fallback if local has legacy data
        if (this._hasLocalHistory(selectedRange)) {
          if (requestSeq === this.data.historyRequestSeq) {
            this._fallbackToLocalHistory();
          }
          return;
        }
      }

      if (requestSeq === this.data.historyRequestSeq) {
        this._renderEmpty();
      }
    } catch (error) {
      if (requestSeq !== this.data.historyRequestSeq) return;
      console.warn('[history-summary] backend list failed, use local stats', error);
      this._fallbackToLocalHistory();
    }
  },

  async _renderBackendData(response, selectedQuickFilter, requestSeq) {
    const allMapped = (response.items || []).map(mapBackendHistoryItem);

    const loadedCount = allMapped.length;
    const total = Number(response.total || loadedCount);

    let filtered = allMapped;
    if (selectedQuickFilter === 'good') {
      filtered = allMapped.filter((item) => item._rawResult === 'got_it' || item._rawResult === 'fluent');
    }

    const decoratedCards = decorateHistoryCards(filtered);

    // Phase 5-2C: fetch backend summary for top stats and filter counts
    const { selectedRange } = this.data;
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

    let stats;
    let quickFilterOptions;

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
      console.warn('[history-summary] backend summary failed, fallback to backend list stats', summaryErr);
      stats = computeHistoryStatsFromItems(allMapped);
      quickFilterOptions = buildBackendQuickFilterOptions(allMapped);
    }

    const hasMore = loadedCount < total;

    this.setData({
      quickFilterOptions,
      allSummaries: allMapped,
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0,
      stats,
      usingBackendHistory: true,
      backendHistoryTotal: total,
      backendHistoryHasMore: hasMore
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
      const { selectedRange, selectedQuickFilter, searchKeyword } = this.data;
      const params = buildBackendHistoryParams(selectedRange, selectedQuickFilter, searchKeyword,
        this.data.backendHistoryLimit || 100,
        this.data.allSummaries.length);
      params.limit = this.data.backendHistoryLimit || 100;
      params.offset = this.data.allSummaries.length;

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

      this._applyFrontendFilters();
    } catch (error) {
      if (requestSeq !== this.data.historyRequestSeq) return;
      console.warn('[history-page] load more failed', error);
      this.setData({ backendHistoryLoadingMore: false });
      wx.showToast({ title: '加载更多失败', icon: 'none' });
    }
  },

  _fallbackToLocalHistory() {
    const { selectedRange, selectedQuickFilter, searchKeyword } = this.data;

    const allSummaries = getHistoryCardSummaries(selectedRange);
    const statusFilteredSummaries = filterHistoryCardSummariesByResult(allSummaries, selectedQuickFilter);
    const searchedSummaries = searchHistoryCards(statusFilteredSummaries, searchKeyword);
    const decoratedCards = decorateHistoryCards(searchedSummaries);
    const stats = getHistorySummaryStats(selectedRange);

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
      usingBackendHistory: false
    });
  },

  _renderEmpty() {
    const defaultStats = { totalReviewsInRange: 0, totalCardsInRange: 0 };

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
      usingBackendHistory: false
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
    const { allSummaries, selectedQuickFilter, searchKeyword } = this.data;
    const isBackendData = allSummaries.length > 0 && !!allSummaries[0]._rawResult;

    let resultFiltered = allSummaries;
    if (selectedQuickFilter !== 'all') {
      if (isBackendData) {
        if (selectedQuickFilter === 'again') {
          resultFiltered = allSummaries.filter((item) => item._rawResult === 'forgot');
        } else if (selectedQuickFilter === 'hard') {
          resultFiltered = allSummaries.filter((item) => item._rawResult === 'shaky');
        } else if (selectedQuickFilter === 'good') {
          resultFiltered = allSummaries.filter((item) => item._rawResult === 'got_it' || item._rawResult === 'fluent');
        }
      } else {
        resultFiltered = filterHistoryCardSummariesByResult(allSummaries, selectedQuickFilter);
      }
    }

    const searched = searchHistoryCards(resultFiltered, searchKeyword);
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
    this._applyFrontendFilters();

    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });
  },

  onSearchInput(event) {
    const searchKeyword = event.detail.value || '';

    this.setData({ searchKeyword });
    this._applyFrontendFilters();

    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });
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