const {
  getCards,
  syncLocalCacheWithCloud,
  deleteCards,
  updateCardsMeta,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE,
  getReviewStateLabel,
  getTodayReviewedCardsFromAll,
  getTodayReviewSummary,
  isDueCard
} = require('../../utils/recordStorage');

const {
  EXAM_SCENE_OPTIONS,
  EXAM_MODULE_OPTIONS
} = require('../../utils/cardOptions');



const DEFAULT_CATEGORY = '单词';
const CATEGORY_FILTER_OPTIONS = ['全部', '单词', '短语', '句子'];
const EXAM_SCENE_FILTER_OPTIONS = ['全部'].concat(EXAM_SCENE_OPTIONS);
const EXAM_MODULE_FILTER_OPTIONS = ['全部'].concat(EXAM_MODULE_OPTIONS);
const BATCH_EXAM_SCENE_OPTIONS = EXAM_SCENE_OPTIONS.slice();
const BATCH_EXAM_MODULE_OPTIONS = EXAM_MODULE_OPTIONS.slice();
const CLOUD_SYNC_COOLDOWN_MS = 60 * 1000;
let lastHomeCloudSyncAt = 0;

const HOME_QUICK_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待学习' },
  { key: 'weak', label: '待加强' },
  { key: 'mastered', label: '已掌握' }
];
const retryingAnalysisCardIds = new Set();


const TODAY_REVIEWED_QUICK_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'again', label: '没记住' },
  { key: 'hard', label: '模糊' },
  { key: 'good', label: '记住了' }
];

const HOME_ELEVATOR_LETTERS = [
  '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
];

function getHomeCardFirstLetter(card) {
  const text = String(card && (card.englishPreview || card.englishText) || '').trim();

  if (!text) {
    return '#';
  }

  const first = text[0].toUpperCase();

  if (first >= 'A' && first <= 'Z') {
    return first;
  }

  return '#';
}

function buildHomeAlphabetGroups(cards = []) {
  const groupMap = {};

  HOME_ELEVATOR_LETTERS.forEach((letter) => {
    groupMap[letter] = [];
  });

  (cards || []).forEach((card) => {
    const letter = getHomeCardFirstLetter(card);
    groupMap[letter].push(card);
  });

  return HOME_ELEVATOR_LETTERS
    .map((letter) => ({
      letter,
      id: `home-letter-${letter === '#' ? 'sharp' : letter}`,
      cards: groupMap[letter] || []
    }))
    .filter((group) => group.cards.length > 0);
}



function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，。,.!?;:()[\]{}"'`~@#$%^&*_+=\\/|-]+/g, ' ')
    .replace(/\s+/g, ' ');
}



function getSearchableText(card) {
  return [
    card.category,
    card.examScene,
    card.examModule,
    card.englishText,
    card.myUnderstanding,
    card.notes,
    card.updatedLabel,
    card.dateTime,
    card.date,
    card.time,
    getReviewStateLabel(card.reviewState),
    `复习${Number(card.reviewCount || 0)}次`
  ]
    .filter(Boolean)
    .join(' ');
}

function getSearchTokens(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function isShortEnglishKeyword(keyword) {
  return /^[a-z]+$/.test(keyword) && keyword.length <= 2;
}

function tokenMatches(token, keyword) {
  if (!token || !keyword) {
    return false;
  }

  if (isShortEnglishKeyword(keyword)) {
    return token === keyword;
  }

  return token === keyword || token.startsWith(keyword) || token.includes(keyword);
}

function matchesCard(card, normalizedKeyword, keywordList) {
  const searchableText = normalizeSearchText(getSearchableText(card));
  const searchableTokens = getSearchTokens(searchableText);

  if (!normalizedKeyword) {
    return true;
  }

  if (normalizedKeyword.includes(' ') && searchableText.includes(normalizedKeyword)) {
    return true;
  }

  if (keywordList.length === 1) {
    return searchableTokens.some((token) => tokenMatches(token, keywordList[0]));
  }

  return keywordList.every((keyword) => searchableTokens.some((token) => tokenMatches(token, keyword)));
}

function getPreviewText(value) {
  return String(value || '').trim();
}

function normalizeProblemList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  return [];
}

function getAnalysisProblems(card) {
  if (!card) {
    return [];
  }

  const directProblems = []
    .concat(normalizeProblemList(card.analysisWarnings))
    .concat(normalizeProblemList(card.analysisErrors))
    .concat(normalizeProblemList(card.warnings))
    .concat(normalizeProblemList(card.errors))
    .concat(normalizeProblemList(card.validationWarnings))
    .concat(normalizeProblemList(card.validationErrors));

  const result = card.analysisResult || card.validationResult || card.englishCheckResult || {};

  const resultProblems = []
    .concat(normalizeProblemList(result.warnings))
    .concat(normalizeProblemList(result.errors));

  return directProblems.concat(resultProblems);
}

function getAnalysisStatusDisplay(card) {
  const status = String(card && card.analysisStatus || '').trim();

  if (status === 'pending') {
    return {
      visible: true,
      label: '分析中',
      className: 'analysis-status-pending'
    };
  }

  if (status === 'failed') {
    return {
      visible: true,
      label: '待重试',
      className: 'analysis-status-failed'
    };
  }

  if (status === 'done' && getAnalysisProblems(card).length > 0) {
    return {
      visible: true,
      label: '需检查',
      className: 'analysis-status-warning'
    };
  }

  return {
    visible: false,
    label: '',
    className: ''
  };
}

function normalizeAnalyzeEnglishResult(cloudResult) {
  const raw = cloudResult && cloudResult.result ? cloudResult.result : cloudResult || {};
  const data = raw.data || raw.result || raw;

  const warnings = []
    .concat(normalizeProblemList(data.warnings))
    .concat(normalizeProblemList(data.analysisWarnings))
    .concat(normalizeProblemList(data.validationWarnings));

  const errors = []
    .concat(normalizeProblemList(data.errors))
    .concat(normalizeProblemList(data.analysisErrors))
    .concat(normalizeProblemList(data.validationErrors));

  const success = raw.success !== false && data.success !== false;

  return {
    success,
    warnings,
    errors,
    raw: data
  };
}

function getTodayReviewResultKey(card) {
  const result = String(card && card.lastReviewResult || '').trim();

  if (result === '没记住') {
    return 'again';
  }

  if (result === '模糊') {
    return 'hard';
  }

  if (result === '记住了' || result === '太简单') {
    return 'good';
  }

  return 'unknown';
}

function getTodayReviewDisplayLabel(card) {
  const result = String(card && card.lastReviewResult || '').trim();

  if (result === '太简单') {
    return '记住了';
  }

  if (result) {
    return result;
  }

  return getReviewStateLabel(card.reviewState);
}

function isHomeWeakCard(card) {
  const lastResult = String(card && card.lastReviewResult || '').trim();

  if (lastResult === '没记住' || lastResult === '模糊') {
    return true;
  }

  if (lastResult === '记住了' || lastResult === '太简单') {
    return false;
  }

  return Number(card.againCount || 0) >= 2 || Number(card.hardCount || 0) >= 2;
}

function isHomeMasteredCard(card) {
  return (
    Number(card.reviewCount || 0) > 0 &&
    !isDueCard(card) &&
    !isHomeWeakCard(card) &&
    (
      card.lastReviewResult === '记住了' ||
      card.lastReviewResult === '太简单' ||
      Number(card.goodCount || 0) >= 2 ||
      Number(card.easyCount || 0) >= 1
    )
  );
}

function isHomeTodoCard(card) {
  return card.reviewState === '未复习' || isDueCard(card);
}

function getHomeReviewDisplayLabel(card) {
  if (isHomeWeakCard(card)) {
    return '待加强';
  }

  if (isHomeTodoCard(card)) {
    return '待学习';
  }

  if (isHomeMasteredCard(card)) {
    return '已掌握';
  }

  return '待学习';
}

function getDailyMessage(todayLearnedCount, totalCardCount, pendingCount) {
  const learned = Number(todayLearnedCount || 0);
  const total = Number(totalCardCount || 0);
  const pending = Number(pendingCount || 0);

  if (total === 0) {
    return '先添加一张卡片，开始建立你的英语知识库。';
  }

  if (pending > 0 && learned > 0) {
    return `今天已学习 ${learned} 张，还有 ${pending} 张待学习。`;
  }

  if (pending > 0) {
    return `还有 ${pending} 张待学习，先完成一小轮。`;
  }

  if (learned > 0) {
    return `今天已学习 ${learned} 张，可以继续巩固一批。`;
  }

  return '当前没有待学习卡，可以继续巩固一批。';
}

function getHomeStatusKey(card) {
  if (isHomeWeakCard(card)) {
    return 'weak';
  }

  if (isHomeTodoCard(card)) {
    return 'todo';
  }

  if (isHomeMasteredCard(card)) {
    return 'mastered';
  }

  return 'todo';
}



function matchesExactFilter(value, selectedValue, fallbackValue) {
  const normalizedValue = value || fallbackValue;
  return selectedValue === '全部' || normalizedValue === selectedValue;
}

function matchesQuickFilter(card, quickFilter) {
  if (quickFilter === 'all') {
    return true;
  }

  if (quickFilter === 'todo') {
    return card.reviewState === '未复习' || isDueCard(card);
  }

  if (quickFilter === 'weak') {
    return isHomeWeakCard(card);
  }

  if (quickFilter === 'mastered') {
    const isWeak = isHomeWeakCard(card);

    return (
      Number(card.reviewCount || 0) > 0 &&
      !isDueCard(card) &&
      !isWeak &&
      (
        card.lastReviewResult === '记住了' ||
        card.lastReviewResult === '太简单' ||
        Number(card.goodCount || 0) >= 2 ||
        Number(card.easyCount || 0) >= 1
      )
    );
  }

  return true;
}

function buildHomeQuickFilterOptions(cards = []) {
  const counts = {
    all: cards.length,
    todo: 0,
    weak: 0,
    mastered: 0
  };

  (cards || []).forEach((card) => {
    if (matchesQuickFilter(card, 'todo')) {
      counts.todo += 1;
    }

    if (matchesQuickFilter(card, 'weak')) {
      counts.weak += 1;
    }

    if (matchesQuickFilter(card, 'mastered')) {
      counts.mastered += 1;
    }
  });

  return HOME_QUICK_FILTER_OPTIONS.map((item) => ({
    ...item,
    count: counts[item.key] || 0
  }));
}

function matchesTodayReviewedQuickFilter(card, quickFilter) {
  const result = String(card && card.lastReviewResult || '').trim();

  if (quickFilter === 'all') {
    return true;
  }

  if (quickFilter === 'again') {
    return result === '没记住';
  }

  if (quickFilter === 'hard') {
    return result === '模糊';
  }

  if (quickFilter === 'good') {
    return result === '记住了' || result === '太简单';
  }

  return true;
}

function buildTodayReviewedQuickFilterOptions(cards = []) {
  const counts = {
    all: cards.length,
    again: 0,
    hard: 0,
    good: 0
  };

  (cards || []).forEach((card) => {
    const result = String(card && card.lastReviewResult || '').trim();

    if (result === '没记住') {
      counts.again += 1;
    } else if (result === '模糊') {
      counts.hard += 1;
    } else if (result === '记住了' || result === '太简单') {
      counts.good += 1;
    }
  });

  return TODAY_REVIEWED_QUICK_FILTER_OPTIONS.map((item) => ({
    ...item,
    count: counts[item.key] || 0
  }));
}



function decorateCards(cards, selectedCardIds) {
  const selectedSet = new Set(selectedCardIds || []);

  return (cards || []).map((card) => {
    const reviewResultKey = getTodayReviewResultKey(card);
    const analysisStatusDisplay = getAnalysisStatusDisplay(card);

    return {
      ...card,
      englishPreview: getPreviewText(card.englishText),
      understandingPreview: getPreviewText(card.myUnderstanding),
      notesPreview: getPreviewText(card.notes),
      reviewStateLabel: getReviewStateLabel(card.reviewState),
      reviewDisplayLabel: getTodayReviewDisplayLabel(card),
      homeStatusLabel: getHomeReviewDisplayLabel(card),
      homeStatusClass: `home-status-${getHomeStatusKey(card)}`,
      reviewResultKey,
      reviewAccentClass: `review-accent-${reviewResultKey}`,
      reviewStatusClass: `status-${reviewResultKey}`,
      reviewCountText: `已复习 ${Number(card.reviewCount || 0)} 次`,
      analysisStatusVisible: analysisStatusDisplay.visible,
      analysisStatusLabel: analysisStatusDisplay.label,
      analysisStatusClass: analysisStatusDisplay.className,
      selected: selectedSet.has(card.id)
    };
  });
}

Page({
  data: {
    cards: [],
    filteredCards: [],
    showHomeFastScroll: false,
    homeFastScrollThumbTop: 0,
    homeFastScrollThumbStyle: 'top: 0%;',
    homePageScrollTop: 0,

    lastPageScrollTop: 0,
    showBackToTop: false,
    showFixedSearch: false,
    searchRestoreScrollTop: 0,
    isSearchActive: false,

    searchKeyword: '',

    quickFilterOptions: HOME_QUICK_FILTER_OPTIONS,
    selectedQuickFilter: 'all',
    showMoreFilters: false,

    totalCardCount: 0,
    currentResultCount: 0,

    categoryFilterOptions: CATEGORY_FILTER_OPTIONS,
    examSceneFilterOptions: EXAM_SCENE_FILTER_OPTIONS,
    examModuleFilterOptions: EXAM_MODULE_FILTER_OPTIONS,
    categoryFilterIndex: 0,
    examSceneFilterIndex: 0,
    examModuleFilterIndex: 0,
    selectedCategoryFilter: '全部',
    selectedExamSceneFilter: '全部',
    selectedExamModuleFilter: '全部',
    categoryCount: 0,
    examSceneCount: 0,
    examModuleCount: 0,
    isManageMode: false,
    selectedCardIds: [],
    isBatchPanelVisible: false,
    batchPanelTitle: '',
    batchPanelType: '',
    batchPanelOptions: [],
    pageMode: 'all', // all | today_reviewed
    pageModeTitle: '',
    pageModeSource: '',
    todayLearnedCount: 0,
    todayReviewSummary: {
      total: 0,
      easy: 0,
      good: 0,
      hard: 0,
      again: 0
    },
    pendingCount: 0,
    weakCount: 0,
    dailyMessage: '把卡住的英文留在这里，今天解决一点点。',
  },

  onShow() {
    try {
      this.loadTodayReviewSummary();
    } catch (error) {
      console.warn('[index] loadTodayReviewSummary failed, continue', error);
    }
  
    const viewModePayload = this.consumeIndexViewMode();
  
    this.loadCards(viewModePayload, {
      forceCloudSync: false
    });

    this.triggerBackendLoginAfterHomeReady();
  },

  triggerBackendLoginAfterHomeReady() {
    const app = getApp();

    if (!app || typeof app.initBackendLoginSafe !== 'function') {
      return;
    }

    if (this.backendLoginTriggered) {
      return;
    }

    this.backendLoginTriggered = true;

    setTimeout(() => {
      try {
        const loginPromise = app.initBackendLoginSafe();

        if (loginPromise && typeof loginPromise.catch === 'function') {
          loginPromise.catch((error) => {
            console.warn('[backend-auth] trigger backend login failed, continue without backend', error);
          });
        }
      } catch (error) {
        console.warn('[backend-auth] trigger backend login failed, continue without backend', error);
      }
    }, 300);
  },

  async onPullDownRefresh() {
    try {
      wx.showNavigationBarLoading();
      await this.loadCards(null, { forceCloudSync: true });
    } finally {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  consumeIndexViewMode() {
    const app = getApp();
    const payload = app && app.globalData ? app.globalData.indexViewMode : null;

    if (!payload || !payload.mode) {
      return null;
    }

    app.globalData.indexViewMode = null;
    return payload;
  },


  loadTodayReviewSummary() {
    const todayReviewSummary = getTodayReviewSummary();
  
    this.setData({
      todayReviewSummary,
      todayLearnedCount: Number(todayReviewSummary.total || 0)
    });
  },

  updateNavigationTitle(pageMode) {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
  
    if (!currentPage || currentPage.route !== 'pages/index/index') {
      return;
    }
  
    wx.setNavigationBarTitle({
      title: pageMode === 'today_reviewed' ? '今日复习内容' : '我的卡片'
    });
  },


  computePendingCount(cards) {
    const pending = (cards || []).filter((card) => matchesQuickFilter(card, 'todo')).length;
    const weak = (cards || []).filter((card) => matchesQuickFilter(card, 'weak')).length;
    const totalCardCount = this.data.totalCardCount || (cards || []).length;
    const msg = getDailyMessage(this.data.todayLearnedCount, totalCardCount, pending);

    this.setData({
      pendingCount: pending,
      weakCount: weak,
      dailyMessage: msg
    });
  },

  async loadCards(viewModePayload = null, options = {}) {
    const applyVisibleCards = (cards) => {
      let pageMode = this.data.pageMode;
      let pageModeTitle = this.data.pageModeTitle;
      let pageModeSource = this.data.pageModeSource;
      let visibleCards = cards;
  
      if (viewModePayload && viewModePayload.mode === 'today_reviewed') {
        pageMode = 'today_reviewed';
        pageModeTitle = '今日复习内容';
        pageModeSource = viewModePayload.source || '';
        visibleCards = getTodayReviewedCardsFromAll(cards);
      } else if (!viewModePayload && this.data.pageMode === 'today_reviewed') {
        pageMode = 'today_reviewed';
        pageModeTitle = '今日复习内容';
        visibleCards = getTodayReviewedCardsFromAll(cards);
      } else {
        pageMode = 'all';
        pageModeTitle = '';
        pageModeSource = '';
        visibleCards = cards;
      }
  

  this.setData({
    cards: visibleCards,
    pageMode,
    pageModeTitle,
    pageModeSource,
    quickFilterOptions: pageMode === 'today_reviewed'
      ? buildTodayReviewedQuickFilterOptions(visibleCards)
      : buildHomeQuickFilterOptions(visibleCards),
    selectedQuickFilter: this.data.selectedQuickFilter || 'all',
    showMoreFilters: pageMode === 'today_reviewed' ? this.data.showMoreFilters : false
  });

  this.updateNavigationTitle(pageMode);
  this.applySearch(this.data.searchKeyword, visibleCards, this.data.selectedCardIds);
      
    };
  
    try {
      const localCards = await getCards();
      applyVisibleCards(localCards);
      this.computePendingCount(localCards);

      if (options.skipCloudSync === true) {
        return;
      }
      
      const shouldSyncCloud = options.forceCloudSync === true ||
        Date.now() - lastHomeCloudSyncAt >= CLOUD_SYNC_COOLDOWN_MS;
      
      if (!shouldSyncCloud) {
        return;
      }
      
      try {
        const freshCards = await syncLocalCacheWithCloud();
        lastHomeCloudSyncAt = Date.now();
        applyVisibleCards(freshCards);
        this.computePendingCount(freshCards);
        this.retryFailedAnalysisInBackground(freshCards);
      } catch (syncError) {
        console.warn('[index] cloud sync failed, continue with local cards', syncError);
      }
    } catch (error) {
      wx.showToast({
        title: '卡片加载失败',
        icon: 'none'
      });
    }
  },

  applySearch(keyword, sourceCards, selectedCardIds) {
    const cards = sourceCards || this.data.cards;
    const selectedIds = selectedCardIds || this.data.selectedCardIds;
    const normalizedKeyword = normalizeSearchText(keyword);
    const keywordList = getSearchTokens(keyword);
    const {
      selectedCategoryFilter,
      selectedExamSceneFilter,
      selectedExamModuleFilter,
      selectedQuickFilter,
      pageMode
    } = this.data;
  
    const categoryCount = cards.filter((card) => {
      return matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY);
    }).length;
  
    const examSceneCount = cards.filter((card) => {
      const matchCategory = matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY);
      const matchScene = matchesExactFilter(card.examScene, selectedExamSceneFilter, DEFAULT_EXAM_SCENE);
      return matchCategory && matchScene;
    }).length;
  
    const examModuleCount = cards.filter((card) => {
      const matchCategory = matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY);
      const matchScene = matchesExactFilter(card.examScene, selectedExamSceneFilter, DEFAULT_EXAM_SCENE);
      const matchModule = matchesExactFilter(card.examModule, selectedExamModuleFilter, DEFAULT_EXAM_MODULE);
      return matchCategory && matchScene && matchModule;
    }).length;
  
    const filteredBySelect = cards.filter((card) => {
      const matchCategory = matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY);
      const matchExamScene = matchesExactFilter(card.examScene, selectedExamSceneFilter, DEFAULT_EXAM_SCENE);
      const matchExamModule = matchesExactFilter(card.examModule, selectedExamModuleFilter, DEFAULT_EXAM_MODULE);
  
      return matchCategory && matchExamScene && matchExamModule;
    });
  
    const nextQuickFilterOptions = pageMode === 'today_reviewed'
      ? buildTodayReviewedQuickFilterOptions(filteredBySelect)
      : buildHomeQuickFilterOptions(filteredBySelect);

const quickFilterKeys = nextQuickFilterOptions.map((item) => item.key);
const nextSelectedQuickFilter = quickFilterKeys.includes(selectedQuickFilter)
  ? selectedQuickFilter
  : 'all';

const filteredByQuick = filteredBySelect.filter((card) => {
  if (pageMode === 'today_reviewed') {
    return matchesTodayReviewedQuickFilter(card, nextSelectedQuickFilter);
  }

  return matchesQuickFilter(card, nextSelectedQuickFilter);
});

const finalFilteredCards = normalizedKeyword
  ? filteredByQuick.filter((card) => matchesCard(card, normalizedKeyword, keywordList))
  : filteredByQuick;

  const decoratedFilteredCards = decorateCards(finalFilteredCards, selectedIds);

  this.setData({
    categoryCount,
    examSceneCount,
    examModuleCount,
    searchKeyword: keyword,
    totalCardCount: cards.length,
    currentResultCount: finalFilteredCards.length,
    filteredCards: decoratedFilteredCards,

    // 这次暂时不用右侧快速滚动条，避免和“↑ 顶部”重复
    showHomeFastScroll: false,

    quickFilterOptions: nextQuickFilterOptions,
    selectedQuickFilter: nextSelectedQuickFilter
  });
},

onSearchInput(event) {
  const value = event.detail.value || '';
  const wasSearching = !!normalizeSearchText(this.data.searchKeyword);
  const willSearching = !!normalizeSearchText(value);

  // 从“非搜索状态”进入“搜索状态”：记录搜索前的位置
  if (!wasSearching && willSearching) {
    this.setData({
      searchRestoreScrollTop: Number(this.data.homePageScrollTop || 0),
      isSearchActive: true,
      showBackToTop: false
    });

    this.applySearch(value);

    // 搜索时回到顶部，方便直接看匹配结果
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 120
    });

    return;
  }

  // 用户手动删空输入框，也按“清空搜索”处理
  if (wasSearching && !willSearching) {
    this.clearSearch();
    return;
  }

  this.applySearch(value);
},

clearSearch() {
  const restoreTop = Number(this.data.searchRestoreScrollTop || 0);

  this.setData({
    isSearchActive: false,
    showBackToTop: false,
    showFixedSearch: restoreTop > 180
  });

  this.applySearch('');

  wx.nextTick(() => {
    wx.pageScrollTo({
      scrollTop: restoreTop,
      duration: 0
    });
  });
},

  onQuickFilterTap(event) {
    const { key } = event.currentTarget.dataset;

    if (!key || key === this.data.selectedQuickFilter) {
      return;
    }

    this.setData({
      selectedQuickFilter: key
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, this.data.selectedCardIds);
  },

  toggleMoreFilters() {
    this.setData({
      showMoreFilters: !this.data.showMoreFilters
    });
  },

  onPageScroll(event) {
    const scrollTop = Number(event.scrollTop || 0);
    const lastScrollTop = Number(this.data.lastPageScrollTop || 0);
  
    const isHomePage = this.data.pageMode !== 'today_reviewed';
    const isSearching = !!normalizeSearchText(this.data.searchKeyword);
    const isScrollingUp = scrollTop + 8 < lastScrollTop;
    const isScrollingDown = scrollTop > lastScrollTop + 8;
  
    const showFixedSearch = (
      isHomePage &&
      !this.data.isManageMode &&
      scrollTop > 180
    );
  
    let showBackToTop = this.data.showBackToTop;
  
    // 接近顶部、非首页、管理模式、搜索中：隐藏
    if (scrollTop <= 120 || !isHomePage || this.data.isManageMode || isSearching) {
      showBackToTop = false;
    }
  
    // 用户重新往下滑：隐藏
    if (isScrollingDown) {
      showBackToTop = false;
    }
  
    // 用户开始往上滑：显示
    if (
      isHomePage &&
      !this.data.isManageMode &&
      !isSearching &&
      scrollTop > 220 &&
      isScrollingUp
    ) {
      showBackToTop = true;
    }
  
    this.setData({
      homePageScrollTop: scrollTop,
      lastPageScrollTop: scrollTop,
      showFixedSearch,
      showBackToTop
    });
  },
  
  scrollToHomeTop() {
    this.setData({
      showBackToTop: false,
      showFixedSearch: false,
      homePageScrollTop: 0,
      lastPageScrollTop: 0
    });
  
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 260
    });
  },


  updateHomeFastScrollThumb(scrollTop) {
    if (!this.data.showHomeFastScroll) {
      return;
    }
  
    wx.createSelectorQuery()
      .in(this)
      .select('.home-page')
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
          homePageScrollTop: scrollTop,
          homeFastScrollThumbTop: thumbTop,
          homeFastScrollThumbStyle: `top: ${thumbTop}%;`
        });
      })
      .exec();
  },
  
  onHomeFastScrollTouchStart(event) {
    this.handleHomeFastScrollTouch(event);
  },
  
  onHomeFastScrollTouchMove(event) {
    this.handleHomeFastScrollTouch(event);
  },
  
  handleHomeFastScrollTouch(event) {
    if (!this.data.showHomeFastScroll) {
      return;
    }
  
    const touch = event.touches && event.touches[0];
  
    if (!touch) {
      return;
    }
  
    wx.createSelectorQuery()
      .in(this)
      .select('.home-fast-scroll-track')
      .boundingClientRect((trackRect) => {
        if (!trackRect || !trackRect.height) {
          return;
        }
  
        wx.createSelectorQuery()
          .in(this)
          .select('.home-page')
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
              homePageScrollTop: targetScrollTop,
              homeFastScrollThumbTop: thumbTop,
              homeFastScrollThumbStyle: `top: ${thumbTop}%;`
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

  scrollToHomeLetter(letter) {
    if (!letter || this.data.pageMode === 'today_reviewed') {
      return;
    }
  
    const targetId = `home-letter-${letter === '#' ? 'sharp' : letter}`;
  
    this.setData({
      activeHomeElevatorLetter: letter
    });
  
    wx.pageScrollTo({
      selector: `#${targetId}`,
      duration: 180
    });
  },
  
  onHomeElevatorTap(event) {
    const { letter } = event.currentTarget.dataset;
    this.scrollToHomeLetter(letter);
  },
  
  onHomeElevatorTouchStart(event) {
    this.handleHomeElevatorTouch(event);
  },
  
  onHomeElevatorTouchMove(event) {
    this.handleHomeElevatorTouch(event);
  },
  
  handleHomeElevatorTouch(event) {
    if (this.data.pageMode === 'today_reviewed') {
      return;
    }
  
    const touch = event.touches && event.touches[0];
  
    if (!touch) {
      return;
    }
  
    const letters = this.data.homeElevatorLetters || [];
  
    if (letters.length === 0) {
      return;
    }
  
    wx.createSelectorQuery()
      .in(this)
      .select('.home-elevator-bar')
      .boundingClientRect((rect) => {
        if (!rect || !rect.height) {
          return;
        }
  
        const offsetY = touch.clientY - rect.top;
        const ratio = Math.max(0, Math.min(1, offsetY / rect.height));
        const index = Math.min(letters.length - 1, Math.floor(ratio * letters.length));
        const letter = letters[index];
  
        if (letter && letter !== this.data.activeHomeElevatorLetter) {
          this.scrollToHomeLetter(letter);
        }
      })
      .exec();
  },



  onCategoryFilterChange(event) {
    const categoryFilterIndex = Number(event.detail.value || 0);
    const selectedCategoryFilter = CATEGORY_FILTER_OPTIONS[categoryFilterIndex] || '全部';

    this.setData({
      categoryFilterIndex,
      selectedCategoryFilter
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, this.data.selectedCardIds);
  },

  onExamSceneFilterChange(event) {
    const examSceneFilterIndex = Number(event.detail.value || 0);
    const selectedExamSceneFilter = EXAM_SCENE_FILTER_OPTIONS[examSceneFilterIndex] || '全部';

    this.setData({
      examSceneFilterIndex,
      selectedExamSceneFilter
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, this.data.selectedCardIds);
  },

  onExamModuleFilterChange(event) {
    const examModuleFilterIndex = Number(event.detail.value || 0);
    const selectedExamModuleFilter = EXAM_MODULE_FILTER_OPTIONS[examModuleFilterIndex] || '全部';

    this.setData({
      examModuleFilterIndex,
      selectedExamModuleFilter
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, this.data.selectedCardIds);
  },

  goToAddPage() {
    if (this.data.isManageMode) {
      return;
    }

    wx.navigateTo({
      url: '/pages/add/add'
    });
  },

  goToReviewPage() {
    if (this.data.isManageMode) {
      return;
    }

    wx.navigateTo({
      url: '/pages/review/review'
    });
  },


  enterManageMode(initialCardId) {
    const nextSelectedIds = initialCardId ? [initialCardId] : [];
  
    this.setData({
      isManageMode: true,
      selectedCardIds: nextSelectedIds,
      showFixedSearch: false,
      showBackToTop: false,
      showMoreFilters: false
    });
  
    this.applySearch(this.data.searchKeyword, this.data.cards, nextSelectedIds);
  },

  exitManageMode() {
    this.closeBatchPanel();

    this.setData({
      isManageMode: false,
      selectedCardIds: []
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, []);
  },

  toggleCardSelection(cardId) {
    const currentIds = this.data.selectedCardIds || [];
    const alreadySelected = currentIds.includes(cardId);
    const nextSelectedIds = alreadySelected
      ? currentIds.filter((item) => item !== cardId)
      : currentIds.concat(cardId);

    if (nextSelectedIds.length === 0) {
      this.exitManageMode();
      return;
    }

    this.setData({
      selectedCardIds: nextSelectedIds
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, nextSelectedIds);
  },

  selectAllCards() {
    const filteredCards = this.data.filteredCards || [];

    if (filteredCards.length === 0) {
      wx.showToast({
        title: '当前没有可选卡片',
        icon: 'none'
      });
      return;
    }

    const filteredCardIds = filteredCards.map((card) => card.id);
    const currentSelectedIds = this.data.selectedCardIds || [];
    const allFilteredSelected = filteredCardIds.every((id) => currentSelectedIds.includes(id));
    const nextSelectedIds = allFilteredSelected ? [] : filteredCardIds;

    if (nextSelectedIds.length === 0) {
      this.exitManageMode();
      return;
    }

    this.setData({
      selectedCardIds: nextSelectedIds
    });

    this.applySearch(this.data.searchKeyword, this.data.cards, nextSelectedIds);
  },

  openBatchPanel(type, title, options) {
    this.setData({
      isBatchPanelVisible: true,
      batchPanelType: type,
      batchPanelTitle: title,
      batchPanelOptions: options
    });
  },

  closeBatchPanel() {
    this.setData({
      isBatchPanelVisible: false,
      batchPanelType: '',
      batchPanelTitle: '',
      batchPanelOptions: []
    });
  },

  handleBatchAssignExamScene() {
    const selectedCardIds = this.data.selectedCardIds || [];

    if (selectedCardIds.length === 0) {
      wx.showToast({
        title: '请先选择卡片',
        icon: 'none'
      });
      return;
    }

    this.openBatchPanel('examScene', '批量设置考试场景', BATCH_EXAM_SCENE_OPTIONS);
  },

  handleBatchAssignExamModule() {
    const selectedCardIds = this.data.selectedCardIds || [];

    if (selectedCardIds.length === 0) {
      wx.showToast({
        title: '请先选择卡片',
        icon: 'none'
      });
      return;
    }

    this.openBatchPanel('examModule', '批量设置考试模块', BATCH_EXAM_MODULE_OPTIONS);
  },

  handleBatchDelete() {
    const selectedCardIds = this.data.selectedCardIds || [];

    if (selectedCardIds.length === 0) {
      wx.showToast({
        title: '请先选择卡片',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '批量删除',
      content: `确定删除选中的 ${selectedCardIds.length} 张卡片吗？`,
      confirmText: '删除',
      confirmColor: '#b85c5c',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }

        try {
          await deleteCards(selectedCardIds);
        } catch (error) {
          wx.showToast({
            title: '批量删除失败',
            icon: 'none'
          });
          return;
        }

        wx.showToast({
          title: '已删除',
          icon: 'success'
        });

        const deletedIdSet = new Set(selectedCardIds.map((id) => String(id)));

        const nextCards = (this.data.cards || []).filter((card) => {
          return !deletedIdSet.has(String(card.id));
        });

        const nextFilteredCards = (this.data.filteredCards || []).filter((card) => {
          return !deletedIdSet.has(String(card.id));
        });

        this.setData({
          cards: nextCards,
          filteredCards: nextFilteredCards,
          isManageMode: false,
          selectedCardIds: [],
          isBatchPanelVisible: false,
          batchPanelType: '',
          batchPanelTitle: '',
          batchPanelOptions: [],
          totalCardCount: nextCards.length,
          currentResultCount: nextFilteredCards.length
        });

        this.loadTodayReviewSummary();
        this.applySearch(this.data.searchKeyword, nextCards, []);
        this.computePendingCount(nextCards);
        
      }
    });
  },

  patchCardAnalysisState(cardId, patch) {
    const targetId = String(cardId);

    const nextCards = (this.data.cards || []).map((card) => {
      if (String(card.id) !== targetId) {
        return card;
      }

      return {
        ...card,
        ...patch
      };
    });

    this.setData({
      cards: nextCards
    });

    this.applySearch(this.data.searchKeyword, nextCards, this.data.selectedCardIds);
  },

  retryFailedAnalysisInBackground(cards = []) {
    if (this.data.pageMode === 'today_reviewed') {
      return;
    }

    const failedCards = (cards || [])
      .filter((card) => {
        return String(card && card.analysisStatus || '') === 'failed';
      })
      .slice(0, 3);

    failedCards.forEach((card) => {
      this.retryOneFailedAnalysis(card);
    });
  },

  async retryOneFailedAnalysis(card) {
    if (!card || !card.id || !card.englishText) {
      return;
    }

    const cardId = String(card.id);

    if (retryingAnalysisCardIds.has(cardId)) {
      return;
    }

    retryingAnalysisCardIds.add(cardId);

    try {
      const pendingPatch = {
        analysisStatus: 'pending',
        analysisRetriedAt: Date.now()
      };

      this.patchCardAnalysisState(card.id, pendingPatch);
      await updateCardsMeta([card.id], pendingPatch);

      const cloudResult = await wx.cloud.callFunction({
        name: 'analyzeEnglish',
        data: {
          englishText: card.englishText,
          text: card.englishText,
          category: card.category || DEFAULT_CATEGORY,
          examScene: card.examScene || DEFAULT_EXAM_SCENE,
          examModule: card.examModule || DEFAULT_EXAM_MODULE
        }
      });

      const normalized = normalizeAnalyzeEnglishResult(cloudResult);

      if (!normalized.success) {
        throw new Error('analyzeEnglish success=false');
      }

      const donePatch = {
        analysisStatus: 'done',
        analysisWarnings: normalized.warnings,
        analysisErrors: normalized.errors,
        analysisResult: normalized.raw,
        analysisUpdatedAt: Date.now()
      };

      this.patchCardAnalysisState(card.id, donePatch);
      await updateCardsMeta([card.id], donePatch);
    } catch (error) {
      const failedPatch = {
        analysisStatus: 'failed',
        analysisFailedAt: Date.now()
      };

      this.patchCardAnalysisState(card.id, failedPatch);

      try {
        await updateCardsMeta([card.id], failedPatch);
      } catch (updateError) {
        console.warn('更新分析失败状态失败', updateError);
      }

      console.warn('后台重试分析失败', error);
    } finally {
      retryingAnalysisCardIds.delete(cardId);
    }
  },

  noop() {},

  async onBatchPanelOptionTap(event) {
    const { value } = event.currentTarget.dataset;
    const { batchPanelType, selectedCardIds } = this.data;

    if (!value || !batchPanelType || !selectedCardIds.length) {
      this.closeBatchPanel();
      return;
    }

    try {
      if (batchPanelType === 'examScene') {
        await updateCardsMeta(selectedCardIds, { examScene: value });
      }

      if (batchPanelType === 'examModule') {
        await updateCardsMeta(selectedCardIds, { examModule: value });
      }
    } catch (error) {
      this.closeBatchPanel();
      wx.showToast({
        title: '批量更新失败',
        icon: 'none'
      });
      return;
    }

    this.closeBatchPanel();

    wx.showToast({
      title: `已归类到${value}`,
      icon: 'success'
    });

    this.loadCards();
  },

  onCardLongPress(event) {
    const { id } = event.currentTarget.dataset;

    if (this.data.isManageMode) {
      this.toggleCardSelection(id);
      return;
    }

    this.enterManageMode(id);
  },

  isTodayReviewedMode() {
    return this.data.pageMode === 'today_reviewed';
  },


  openCard(event) {
    const { id } = event.currentTarget.dataset;
  
    if (this.data.isManageMode) {
      this.toggleCardSelection(id);
      return;
    }
  
    const from = this.isTodayReviewedMode() ? 'today_reviewed' : '';
    const url = from
      ? `/pages/add/add?id=${id}&from=${from}`
      : `/pages/add/add?id=${id}`;
  
    wx.navigateTo({
      url
    });
  },



  exitTodayReviewedMode() {
    if (this.data.pageModeSource === 'review') {
      wx.navigateBack({
        delta: 1
      });
      return;
    }
  
    this.setData({
      pageMode: 'all',
      pageModeTitle: '',
      pageModeSource: ''
    });
  
    this.loadCards();
  }
});
