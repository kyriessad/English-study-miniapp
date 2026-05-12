const {
  getHistoryCardSummaries,
  filterHistoryCardSummariesByResult,
  getHistorySummaryStats
} = require('../../utils/historyReviewStorageFacade');

const RANGE_OPTIONS = [
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'all', label: '全部历史' }
];

const QUICK_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'again', label: '没记住' },
  { key: 'hard', label: '模糊' },
  { key: 'good', label: '记住了' }
];

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
    resultTagType: getResultTagType(item.lastResultInRange)
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
    historyPageScrollTop: 0
  },

  onShow() {
    this.loadHistoryData();
  },

  loadHistoryData() {
    const { selectedRange, selectedQuickFilter, searchKeyword } = this.data;
  
    const allSummaries = getHistoryCardSummaries(selectedRange);
    const statusFilteredSummaries = filterHistoryCardSummariesByResult(allSummaries, selectedQuickFilter);
    const searchedSummaries = searchHistoryCards(statusFilteredSummaries, searchKeyword);
    const decoratedCards = decorateHistoryCards(searchedSummaries);
    const stats = getHistorySummaryStats(selectedRange);
  
    this.setData({
      rangeOptions: RANGE_OPTIONS,
      quickFilterOptions: buildQuickFilterOptionsWithCounts(allSummaries),
      allSummaries,
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0,
      stats
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
  
    const statusFilteredSummaries = filterHistoryCardSummariesByResult(this.data.allSummaries, key);
    const searchedSummaries = searchHistoryCards(statusFilteredSummaries, this.data.searchKeyword);
    const decoratedCards = decorateHistoryCards(searchedSummaries);
  
    this.setData({
      selectedQuickFilter: key,
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0
    });
  
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });
  },

  onSearchInput(event) {
    const searchKeyword = event.detail.value || '';
    const statusFilteredSummaries = filterHistoryCardSummariesByResult(
      this.data.allSummaries,
      this.data.selectedQuickFilter
    );
    const searchedSummaries = searchHistoryCards(statusFilteredSummaries, searchKeyword);
    const decoratedCards = decorateHistoryCards(searchedSummaries);
  
    this.setData({
      searchKeyword,
      filteredCards: decoratedCards,
      historyDateGroups: buildHistoryDateGroups(decoratedCards),
      showHistoryFastScroll: decoratedCards.length >= 15,
      historyFastScrollThumbTop: 0,
      historyFastScrollThumbStyle: 'top: 0%;',
      historyPageScrollTop: 0
    });
  
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