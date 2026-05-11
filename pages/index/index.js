const {
  getCards,
  refreshCardsCacheFromBackend,
  deleteCards,
  updateCardsMeta
} = require('../../utils/recordStorage');

const {
  EXAM_SCENE_OPTIONS,
  EXAM_MODULE_OPTIONS
} = require('../../utils/cardOptions');

const {
  getReviewOverview,
  getCardStats,
  createReviewSession
} = require('../../utils/apiClient');

const DEFAULT_CATEGORY = '单词';
const DEFAULT_EXAM_SCENE = '未分类';
const DEFAULT_EXAM_MODULE = '未分类';
const CATEGORY_FILTER_OPTIONS = ['全部', '单词', '短语', '句子'];
const EXAM_SCENE_FILTER_OPTIONS = ['全部'].concat(EXAM_SCENE_OPTIONS);
const EXAM_MODULE_FILTER_OPTIONS = ['全部'].concat(EXAM_MODULE_OPTIONS);
const BATCH_EXAM_SCENE_OPTIONS = EXAM_SCENE_OPTIONS.slice();
const BATCH_EXAM_MODULE_OPTIONS = EXAM_MODULE_OPTIONS.slice();
const retryingAnalysisCardIds = new Set();

const LIBRARY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '未学习' },
  { key: 'reviewing', label: '学习中' },
  { key: 'strengthening', label: '需加强' },
  { key: 'mastered', label: '已掌握' }
];

const STATE_LABELS = {
  new: '未学习',
  reviewing: '学习中',
  strengthening: '需加强',
  mastered: '已掌握'
};
const VALID_REVIEW_STATES = new Set(['new', 'reviewing', 'strengthening', 'mastered']);

function getStateLabel(state) {
  return STATE_LABELS[state] || '未学习';
}

/**
 * Extract the best available timestamp from a card (milliseconds since epoch).
 * Returns 0 if no usable timestamp is found.
 */
function getCardTimestampMs(card) {
  if (!card) return 0;
  var ts = card.updated_at || card.updatedAt || card.created_at || card.createdAt;
  if (!ts) ts = card.analysisUpdatedAt || card.analysis_updated_at;
  if (!ts) return 0;
  // If it's already a number, use it directly
  if (typeof ts === 'number') return ts > 0 ? ts : 0;
  // Try parsing number from string
  var num = Number(ts);
  if (num > 0) return num;
  // Try parsing as date string
  var d = new Date(ts);
  if (!isNaN(d.getTime())) return d.getTime();
  return 0;
}

/**
 * Determine the display status for a card in the library list.
 * Priority: needs_manual_fix > analysis failed > analysis pending (with staleness check) > is_review_ready=false > review state
 */
function getCardDisplayStatus(card) {
  if (!card) return { label: '未学习', className: 'state-new' };
  var analysisStatus = String(card.analysisStatus || card.analysis_status || '').trim();

  // Priority 1: card needs manual fix
  if (card.needs_manual_fix === true) {
    return { label: '需补全', className: 'status-fix-required' };
  }

  // Priority 2: analysis failed (unambiguous — always show 待重试)
  if (analysisStatus === 'failed') {
    return { label: '待重试', className: 'status-analysis-failed' };
  }

  // Priority 3: analysis pending — check freshness
  if (analysisStatus === 'pending') {
    var ts = getCardTimestampMs(card);
    var stale = ts === 0 || (Date.now() - ts > 300000); // 5 minutes
    if (stale) {
      return { label: '待重试', className: 'status-analysis-stale' };
    }
    return { label: 'AI分析中', className: 'status-analyzing' };
  }

  // Priority 4: card is not ready for review
  if (card.is_review_ready === false) {
    return { label: '准备中', className: 'status-preparing' };
  }

  // Default: show review state
  var stateV2 = card.reviewStateV2 || 'new';
  return { label: STATE_LABELS[stateV2] || '未学习', className: 'state-' + stateV2 };
}

/**
 * 4C-1a: Check if a new card has usable answer content for new-only study.
 * Compatible with both backend fields and local legacy structures.
 */
function isNewCardReadyForNewOnly(card) {
  if (!card) return false;

  // Backend explicitly says ready
  if (card.isReviewReady === true || card.is_review_ready === true) {
    return true;
  }

  // Backend explicitly says not ready — respect that
  if (card.isReviewReady === false || card.is_review_ready === false) {
    return false;
  }

  // No explicit ready flag: fallback to checking answer fields (local cards)
  var answerFields = [
    card.understanding,
    card.userUnderstanding,
    card.user_understanding,
    card.myUnderstanding,
    card.meaning,
    card.meaningCn,
    card.meaning_cn,
    card.translation,
    card.contextTranslation,
    card.context_translation,
    card.aiUnderstanding,
    card.ai_understanding,
    card.answer,
    card.chinese
  ];
  return answerFields.some(function (v) {
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/**
 * 4C-1a: Compute the state of the new-only study entry in the "未学习" tab.
 * Priority: ready > no cards > pending > manual_fix > other
 * Returns { enabled, label, subtitle }.
 */
function computeNewOnlyButtonState(cards) {
  var newCards = [];
  if (Array.isArray(cards)) {
    newCards = cards.filter(function (c) {
      if (!c) return false;
      var state = c.reviewStateV2 || c.review_state || c.reviewState || '';
      return state === 'new';
    });
  }

  var newTotal = newCards.length;
  var newReadyCount = 0;
  var newPendingCount = 0;
  var newManualFixCount = 0;
  var sampleNewCards = [];

  newCards.forEach(function (c) {
    var ready = isNewCardReadyForNewOnly(c);
    if (ready) newReadyCount += 1;

    var anStatus = String(c.analysisStatus || c.analysis_status || '').trim();
    if (anStatus === 'pending' || anStatus === 'analyzing') {
      newPendingCount += 1;
    }

    if (c.needsManualFix === true || c.needs_manual_fix === true) {
      newManualFixCount += 1;
    }

    if (sampleNewCards.length < 3) {
      sampleNewCards.push({
        englishText: c.englishText,
        reviewStateV2: c.reviewStateV2,
        review_state: c.review_state,
        analysisStatus: c.analysisStatus,
        analysis_status: c.analysis_status,
        isReviewReady: c.isReviewReady,
        is_review_ready: c.is_review_ready,
        needsManualFix: c.needsManualFix,
        needs_manual_fix: c.needs_manual_fix,
        understanding: c.understanding,
        userUnderstanding: c.userUnderstanding,
        user_understanding: c.user_understanding,
        meaning: c.meaning,
        meaningCn: c.meaningCn,
        translation: c.translation
      });
    }
  });

  if (newReadyCount > 0) {
    return { enabled: true, label: '学习几张新卡', subtitle: '还有 ' + newReadyCount + ' 张新卡可以开始学习' };
  }

  if (newTotal === 0) {
    return { enabled: false, label: '暂不可学', subtitle: '暂无未学习卡片' };
  }

  if (newPendingCount > 0) {
    return { enabled: false, label: '暂不可学', subtitle: '新卡释义生成中，稍后可学' };
  }

  if (newManualFixCount > 0) {
    return { enabled: false, label: '暂不可学', subtitle: '有新卡需要补全释义后才能学习' };
  }

  return { enabled: false, label: '暂不可学', subtitle: '暂无可学习新卡' };
}

function computeLibraryPreparationTip(filteredCards, currentLibraryTab) {
  if (currentLibraryTab !== 'new') return false;
  if (!Array.isArray(filteredCards) || filteredCards.length === 0) return false;
  return filteredCards.some(function (card) {
    if (card.is_review_ready === false) return true;
    if (card.needs_manual_fix === true) return true;
    var status = String(card.analysisStatus || card.analysis_status || '').trim();
    if (status === 'pending' || status === 'failed') return true;
    return false;
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，。,.!?;:()[\]{}"'`~@#$%^&*_+=\\/|-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeCardList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw !== 'object') return [];
  if (Array.isArray(raw.cards)) return raw.cards.filter(Boolean);
  if (Array.isArray(raw.items)) return raw.items.filter(Boolean);
  if (raw.data) {
    if (Array.isArray(raw.data)) return raw.data.filter(Boolean);
    if (typeof raw.data === 'object') {
      if (Array.isArray(raw.data.cards)) return raw.data.cards.filter(Boolean);
      if (Array.isArray(raw.data.items)) return raw.data.items.filter(Boolean);
    }
  }
  return [];
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
    getStateLabel(card.reviewStateV2),
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
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return [];
}

function getAnalysisProblems(card) {
  if (!card) return [];
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
    return { visible: true, label: '分析中', className: 'analysis-status-pending' };
  }
  if (status === 'failed') {
    return { visible: true, label: '待重试', className: 'analysis-status-failed' };
  }
  if (status === 'done' && getAnalysisProblems(card).length > 0) {
    return { visible: true, label: '需检查', className: 'analysis-status-warning' };
  }
  return { visible: false, label: '', className: '' };
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
  return { success, warnings, errors, raw: data };
}

/**
 * Pick the first valid number from a list of candidate values.
 * Returns 0 if none are valid. Uses nullish check to preserve real 0 values.
 */
function pickNumber() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== undefined && value !== null && value !== '') {
      var num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
  }
  return 0;
}

/**
 * Normalize review overview response, supporting both current nested backend
 * structure and future flat target structure.
 *
 * Nested structure: { suggested: { total, new, review, ... }, completed_suggested: {...}, active_session }
 * Flat target: { total_today, to_new, to_review, strengthening_in_review, active_session }
 *
 * Returns { totalToday, toNew, toReview, strengtheningInReview, activeSession, extraToday, raw }
 * where all numeric fields default to 0 and are guaranteed to be numbers.
 * extraToday: { newOnlyCount, freeReviewCount, totalCount } — supplementary counts from
 * raw.extra_today for cases where suggested block omits the field.
 */
function normalizeReviewOverview(raw) {
  if (!raw || typeof raw !== 'object') {
    return { totalToday: 0, toNew: 0, toReview: 0, strengtheningInReview: 0, activeSession: null, raw: raw || {} };
  }

  var suggested = (raw.suggested && typeof raw.suggested === 'object') ? raw.suggested : null;

  // toNew — tolerate multiple naming conventions
  var toNew = pickNumber(
    raw.to_new, raw.toNew, raw.new, raw.new_count,
    suggested && suggested.to_new, suggested && suggested.toNew,
    suggested && suggested.new, suggested && suggested.new_count
  );

  // toReview — tolerate multiple naming conventions
  var toReview = pickNumber(
    raw.to_review, raw.toReview, raw.review, raw.review_count,
    raw.due, raw.due_count,
    suggested && suggested.to_review, suggested && suggested.toReview,
    suggested && suggested.review, suggested && suggested.review_count,
    suggested && suggested.due, suggested && suggested.due_count
  );

  // strengtheningInReview — tolerate multiple naming conventions
  var strengtheningInReview = pickNumber(
    raw.strengthening_in_review, raw.strengtheningInReview,
    raw.strengthening, raw.strengthening_count,
    suggested && suggested.strengthening_in_review, suggested && suggested.strengtheningInReview,
    suggested && suggested.strengthening, suggested && suggested.strengthening_count
  );

  // totalToday — try direct fields first, fallback to sum of parts
  var totalToday = pickNumber(
    raw.total_today, raw.totalToday, raw.total, raw.today_total,
    suggested && suggested.total, suggested && suggested.total_today,
    suggested && suggested.totalToday, suggested && suggested.today_total,
    suggested && suggested.count, suggested && suggested.task_count,
    suggested && suggested.total_count
  );
  if (totalToday === 0 && (toNew > 0 || toReview > 0 || strengtheningInReview > 0)) {
    totalToday = toNew + toReview + strengtheningInReview;
  }

  var activeSession = raw.active_session || raw.activeSession || null;

  // 4C-3: is_all_done 且无 active_session 时，suggested 是计划量而非剩余量
  if (raw.is_all_done === true && !activeSession) {
    totalToday = 0;
    toNew = 0;
    toReview = 0;
    strengtheningInReview = 0;
  }

  // extra_today — supplementary counts for new/free/strengthening review
  var extraToday = (raw.extra_today && typeof raw.extra_today === 'object') ? raw.extra_today : null;
  var extraTodayResult = {
    newOnlyCount: pickNumber(extraToday && extraToday.new_only_count, extraToday && extraToday.newOnlyCount, extraToday && extraToday.new_count, extraToday && extraToday.newCount),
    freeReviewCount: pickNumber(extraToday && extraToday.free_review_count, extraToday && extraToday.freeReviewCount, extraToday && extraToday.free_count, extraToday && extraToday.freeCount),
    totalCount: pickNumber(extraToday && extraToday.total_count, extraToday && extraToday.totalCount)
  };

  return {
    totalToday: totalToday,
    toNew: toNew,
    toReview: toReview,
    strengtheningInReview: strengtheningInReview,
    activeSession: activeSession,
    extraToday: extraTodayResult,
    raw: raw
  };
}

function matchesExactFilter(value, selectedValue, fallbackValue) {
  const normalizedValue = value || fallbackValue;
  return selectedValue === '全部' || normalizedValue === selectedValue;
}

function decorateCards(cards, selectedCardIds) {
  const selectedSet = new Set(selectedCardIds || []);
  return (cards || []).map((card) => {
    const analysisStatusDisplay = getAnalysisStatusDisplay(card);
    const displayStatus = getCardDisplayStatus(card);
    const stateV2 = card.reviewStateV2 || 'new';
    return {
      ...card,
      englishPreview: getPreviewText(card.englishText),
      understandingPreview: getPreviewText(card.myUnderstanding),
      notesPreview: getPreviewText(card.notes),
      reviewStateV2: stateV2,
      stateLabel: getStateLabel(stateV2),
      stateClass: `state-${stateV2}`,
      displayStatusLabel: displayStatus.label,
      displayStatusClass: displayStatus.className,
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
    // Task dashboard
    reviewOverview: null,
    reviewOverviewError: false,
    totalToday: 0,
    toNew: 0,
    toReview: 0,
    strengtheningInReview: 0,
    hasActiveSession: false,
    activeSessionId: '',

    // Card library
    cardStats: null,
    libraryTabs: LIBRARY_TABS.map((t) => ({ ...t, count: 0 })),
    currentLibraryTab: 'all',

    // Cards
    cards: [],
    filteredCards: [],
    totalCardCount: 0,
    currentResultCount: 0,

    // Search & filters
    searchKeyword: '',
    isSearchActive: false,
    showFixedSearch: false,
    showMoreFilters: false,
    searchRestoreScrollTop: 0,

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

    // Management
    isManageMode: false,
    selectedCardIds: [],
    isBatchPanelVisible: false,
    batchPanelTitle: '',
    batchPanelType: '',
    batchPanelOptions: [],

    // Scroll
    homePageScrollTop: 0,
    lastPageScrollTop: 0,
    showBackToTop: false,

    // Review entry
    reviewEntryLoading: false,

    // Phase 4B: computed review actions
    reviewActions: {
      daily: { enabled: false, label: '暂无今日复习', sessionType: 'daily_suggested', disabledReason: '今天暂无推荐复习任务' },
      newOnly: { enabled: false, label: '暂无新卡可学', sessionType: 'new_only', disabledReason: '暂无可学习的新卡' },
      strengthening: { enabled: false, label: '暂无需加强卡片', sessionType: 'free_review', disabledReason: '暂无需加强卡片' }
    },
    showEmptyTaskTip: false,
    showLibraryPreparationTip: false,
    newOnlyEntryState: { enabled: false, label: '暂不可学', subtitle: '暂无未学习卡片' }
  },

  async onShow() {
    // Initialize requestSeq counters
    if (this._overviewReqSeq === undefined) this._overviewReqSeq = 0;
    if (this._statsReqSeq === undefined) this._statsReqSeq = 0;
    if (this._cardsReqSeq === undefined) this._cardsReqSeq = 0;

    // Check home refresh flag set by review page after feedback
    var homeNeedsRefresh = wx.getStorageSync('homeNeedsRefresh');
    if (homeNeedsRefresh) {
      wx.removeStorageSync('homeNeedsRefresh');
    }

    await this.loadLocalCache();
    this.triggerBackendLoginAfterHomeReady();
    this.loadAllBackendData();
  },

  triggerBackendLoginAfterHomeReady() {
    const app = getApp();
    if (!app || typeof app.initBackendLoginSafe !== 'function') return;
    if (this.backendLoginTriggered) return;
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
      await Promise.all([
        this.loadReviewOverview().catch((e) => console.warn('[index] pull refresh overview failed', e)),
        this.loadCardStats().catch((e) => console.warn('[index] pull refresh stats failed', e)),
        this.refreshBackendCards().catch((e) => console.warn('[index] pull refresh cards failed', e))
      ]);
    } finally {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  // ========== Local Cache ==========

  async loadLocalCache() {
    try {
      // Step 1: try getCards() first
      const result = await getCards();
      let localCards = normalizeCardList(result);

      // Step 2: if getCards() returned nothing, fall back to raw cardsCache
      if (localCards.length === 0) {
        try {
          const cardsCache = wx.getStorageSync('cardsCache');
          const cacheCards = normalizeCardList(cardsCache);
          if (cacheCards.length > 0) {
            console.log('[index] recovered ' + cacheCards.length + ' cards from cardsCache fallback');
            localCards = cacheCards;
          }
        } catch (e) { /* ignore storage read error */ }
      }

      // Step 3: if we have cards, set data immediately
      if (localCards.length > 0) {
        this.setData({ cards: localCards });

        // If on 'all' tab with no search/filter, show all cards directly
        const { currentLibraryTab, searchKeyword, selectedCategoryFilter, selectedExamSceneFilter, selectedExamModuleFilter, selectedCardIds } = this.data;
        const noSearch = !normalizeSearchText(searchKeyword);
        const noFilters = selectedCategoryFilter === '全部' && selectedExamSceneFilter === '全部' && selectedExamModuleFilter === '全部';
        if (currentLibraryTab === 'all' && noSearch && noFilters) {
          const decorated = decorateCards(localCards, selectedCardIds);
          this.setData({
            filteredCards: decorated,
            totalCardCount: localCards.length,
            currentResultCount: localCards.length,
            displayTotalCount: localCards.length,
            displayCurrentCount: localCards.length
          });
        } else {
          this.applyFilters();
        }

        this.computeLocalCardStats(localCards);
      } else {
        this.applyFilters();
        this.setData({ displayTotalCount: 0, displayCurrentCount: 0 });
      }

      // Step 4: Load cached review overview
      try {
        const cachedOverview = wx.getStorageSync('reviewOverviewCache');
        if (cachedOverview) {
          this.applyReviewOverview(cachedOverview);
        }
      } catch (e) { /* ignore */ }
    } catch (error) {
      console.warn('[index] loadLocalCache failed', error);
    }
  },

  // ========== Backend Data ==========

  async loadAllBackendData() {
    // Phase 4B-S Step 4: 冷启动无 token 时先登录再请求，避免 401
    var app = getApp();
    if (app && !app.globalData.backendAccessToken && typeof app.initBackendLoginSafe === 'function') {
      try {
        await app.initBackendLoginSafe();
      } catch (e) {
        // login 失败不阻塞首页，继续用本地缓存或空态兜底
      }
    }

    await Promise.all([
      this.loadReviewOverview(),
      this.loadCardStats(),
      this.refreshBackendCards()
    ]);
  },

  applyReviewOverview(overview) {
    if (!overview) return;
    var normalized = normalizeReviewOverview(overview);
    var totalToday = normalized.totalToday;
    var toNew = normalized.toNew;
    var toReview = normalized.toReview;
    var strengtheningInReview = normalized.strengtheningInReview;
    var activeSession = normalized.activeSession;

    var reviewActions = this.buildReviewActions(normalized);
    var allZero = totalToday === 0 && toNew === 0 && toReview === 0 && strengtheningInReview === 0 && !activeSession;

    this.setData({
      reviewOverview: normalized.raw,
      reviewOverviewError: false,
      totalToday: totalToday,
      toNew: toNew,
      toReview: toReview,
      strengtheningInReview: strengtheningInReview,
      hasActiveSession: !!activeSession,
      activeSessionId: activeSession ? activeSession.session_id : '',
      reviewActions: reviewActions,
      showEmptyTaskTip: allZero
    });
  },

  buildReviewActions(normalized) {
    if (!normalized) {
      return {
        daily: { enabled: false, label: '暂无今日复习', sessionType: 'daily_suggested', disabledReason: '今天暂无推荐复习任务' },
        newOnly: { enabled: false, label: '暂无新卡可学', sessionType: 'new_only', disabledReason: '暂无可学习的新卡' },
        strengthening: { enabled: false, label: '暂无需加强卡片', sessionType: 'free_review', disabledReason: '暂无需加强卡片' }
      };
    }
    var totalToday = normalized.totalToday || 0;
    var toNew = normalized.toNew || 0;
    var strengtheningInReview = normalized.strengtheningInReview || 0;
    var activeSession = normalized.activeSession || null;
    var raw = normalized.raw || {};

    // Daily / main button
    var daily;
    if (activeSession) {
      daily = { enabled: true, label: '继续复习', sessionType: 'daily_suggested' };
    } else if (totalToday > 0) {
      daily = { enabled: true, label: '开始今日复习', sessionType: 'daily_suggested' };
    } else {
      daily = { enabled: false, label: '暂无今日复习', sessionType: 'daily_suggested', disabledReason: '今天暂无推荐复习任务' };
    }

    // New cards button
    var newAvailable = toNew > 0 || Number(raw.new_available_count || 0) > 0 || Number(normalized.extraToday.newOnlyCount || 0) > 0;
    var newOnly;
    if (newAvailable) {
      newOnly = { enabled: true, label: '学习新卡', sessionType: 'new_only' };
    } else {
      newOnly = { enabled: false, label: '暂无新卡可学', sessionType: 'new_only', disabledReason: '暂无可学习的新卡' };
    }

    // Strengthening button
    var strengtheningAvailable = strengtheningInReview > 0 || Number(raw.strengthening_available_count || 0) > 0 || Number(normalized.extraToday.freeReviewCount || 0) > 0;
    var strengthening;
    if (strengtheningAvailable) {
      strengthening = { enabled: true, label: '复习需加强', sessionType: 'free_review' };
    } else {
      strengthening = { enabled: false, label: '暂无需加强卡片', sessionType: 'free_review', disabledReason: '暂无需加强卡片' };
    }

    return { daily: daily, newOnly: newOnly, strengthening: strengthening };
  },

  async loadReviewOverview() {
    var seq = ++this._overviewReqSeq;
    try {
      var overview = await getReviewOverview();
      if (seq !== this._overviewReqSeq) return;
      this.applyReviewOverview(overview);
      wx.setStorageSync('reviewOverviewCache', overview);
    } catch (error) {
      console.warn('[index] review overview fetch failed', error);
      if (seq !== this._overviewReqSeq) return;
      this.setData({
        reviewOverviewError: true,
        reviewActions: {
          daily: { enabled: false, label: '暂无今日复习', sessionType: 'daily_suggested', disabledReason: '今日任务暂不可用，请稍后再试' },
          newOnly: { enabled: false, label: '暂无新卡可学', sessionType: 'new_only', disabledReason: '今日任务暂不可用，请稍后再试' },
          strengthening: { enabled: false, label: '暂无需加强卡片', sessionType: 'free_review', disabledReason: '今日任务暂不可用，请稍后再试' }
        }
      });
    }
  },

  applyCardStats(stats) {
    if (!stats) return;
    const libraryTabs = this.data.libraryTabs.map((tab) => ({
      ...tab,
      count: tab.key === 'all' ? Number(stats.total || 0) : Number(stats[tab.key] || 0)
    }));
    this.setData({
      cardStats: stats,
      totalCardCount: Number(stats.total || 0),
      libraryTabs
    });
  },

  /**
   * Compute cardStats from local card array when backend stats are unavailable.
   * Only counts cards that match a valid review state; cards with unknown states
   * default to 'new' for display purposes.
   */
  computeLocalCardStats(cards) {
    if (!Array.isArray(cards)) return;
    const stats = { total: 0, new: 0, reviewing: 0, strengthening: 0, mastered: 0 };
    let unknownCount = 0;
    cards.forEach((c) => {
      stats.total += 1;
      const state = c.reviewStateV2 || c.review_state || '';
      if (VALID_REVIEW_STATES.has(state)) {
        stats[state] += 1;
      } else if (state) {
        console.warn('[index] unknown review_stateV2 for card', String(c && c.id || '').slice(0, 12), state);
        stats.new += 1;
      } else {
        unknownCount += 1;
      }
    });
    if (unknownCount > 0) {
      console.warn('[index] found ' + unknownCount + ' cards without review_state, shown in 全部 tab only');
    }
    this.applyCardStats(stats);
  },

  async loadCardStats() {
    var seq = ++this._statsReqSeq;
    try {
      var stats = await getCardStats();
      if (seq !== this._statsReqSeq) return;
      this.applyCardStats(stats);
    } catch (error) {
      console.warn('[index] card stats fetch failed', error);
    }
  },

  async refreshBackendCards() {
    var seq = ++this._cardsReqSeq;
    try {
      var freshCards = await refreshCardsCacheFromBackend();
      if (seq !== this._cardsReqSeq) return;
      if (Array.isArray(freshCards)) {
        this.setData({ cards: freshCards });
        this.applyFilters();
      }
    } catch (error) {
      console.warn('[index] backend cards refresh failed, using cached', error);
    }
  },

  // ========== Library Tab ==========

  onLibraryTabTap(event) {
    const { key } = event.currentTarget.dataset;
    if (!key || key === this.data.currentLibraryTab) return;
    this.setData({ currentLibraryTab: key });
    this.applyFilters();
  },

  // ========== Filtering ==========

  applyFilters() {
    // Guard: cards must always be an array; if not (e.g. getCards() wasn't awaited), fall back to []
    const rawCards = this.data.cards;
    const cards = Array.isArray(rawCards) ? rawCards : [];
    const {
      searchKeyword,
      currentLibraryTab,
      selectedCardIds,
      selectedCategoryFilter,
      selectedExamSceneFilter,
      selectedExamModuleFilter
    } = this.data;

    // Step 1: Filter by library tab (reviewStateV2)
    // Cards without reviewStateV2 (old cards) only show in "全部" tab
    let filtered = currentLibraryTab === 'all'
      ? cards.slice()
      : cards.filter((c) => {
          const state = c.reviewStateV2 || c.review_state || '';
          return VALID_REVIEW_STATES.has(state) && state === currentLibraryTab;
        });

    // Step 2: Category / exam scene / exam module
    filtered = filtered.filter((card) => {
      const matchCategory = matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY);
      const matchScene = matchesExactFilter(card.examScene, selectedExamSceneFilter, DEFAULT_EXAM_SCENE);
      const matchModule = matchesExactFilter(card.examModule, selectedExamModuleFilter, DEFAULT_EXAM_MODULE);
      return matchCategory && matchScene && matchModule;
    });

    // Step 3: Compute category/exam counts for filter UI
    const categoryCount = cards.filter((card) =>
      matchesExactFilter(card.category, selectedCategoryFilter, DEFAULT_CATEGORY)
    ).length;
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

    // Step 4: Search keyword
    const normalizedKeyword = normalizeSearchText(searchKeyword);
    const keywordList = getSearchTokens(searchKeyword);
    if (normalizedKeyword) {
      filtered = filtered.filter((card) => matchesCard(card, normalizedKeyword, keywordList));
    }

    // Step 5: Decorate
    const decoratedFilteredCards = decorateCards(filtered, selectedCardIds);

    const displayTotalCount = cards.length || (this.data.cardStats && this.data.cardStats.total) || 0;
    const displayCurrentCount = filtered.length || 0;

    this.setData({
      categoryCount,
      examSceneCount,
      examModuleCount,
      totalCardCount: cards.length,
      currentResultCount: filtered.length,
      filteredCards: decoratedFilteredCards,
      displayTotalCount,
      displayCurrentCount,
      showLibraryPreparationTip: computeLibraryPreparationTip(filtered, currentLibraryTab),
      newOnlyEntryState: computeNewOnlyButtonState(cards)
    });
  },

  // ========== Search ==========

  onSearchInput(event) {
    const value = event.detail.value || '';
    const wasSearching = !!normalizeSearchText(this.data.searchKeyword);
    const willSearching = !!normalizeSearchText(value);

    if (!wasSearching && willSearching) {
      this.setData({
        searchRestoreScrollTop: Number(this.data.homePageScrollTop || 0),
        isSearchActive: true,
        showBackToTop: false
      });
      this.setData({ searchKeyword: value });
      this.applyFilters();
      wx.pageScrollTo({ scrollTop: 0, duration: 120 });
      return;
    }

    if (wasSearching && !willSearching) {
      this.clearSearch();
      return;
    }

    this.setData({ searchKeyword: value });
    this.applyFilters();
  },

  clearSearch() {
    const restoreTop = Number(this.data.searchRestoreScrollTop || 0);
    this.setData({
      isSearchActive: false,
      showBackToTop: false,
      showFixedSearch: restoreTop > 180,
      searchKeyword: ''
    });
    this.applyFilters();
    wx.nextTick(() => {
      wx.pageScrollTo({ scrollTop: restoreTop, duration: 0 });
    });
  },

  toggleMoreFilters() {
    this.setData({ showMoreFilters: !this.data.showMoreFilters });
  },

  onCategoryFilterChange(event) {
    const categoryFilterIndex = Number(event.detail.value || 0);
    const selectedCategoryFilter = CATEGORY_FILTER_OPTIONS[categoryFilterIndex] || '全部';
    this.setData({ categoryFilterIndex, selectedCategoryFilter });
    this.applyFilters();
  },

  onExamSceneFilterChange(event) {
    const examSceneFilterIndex = Number(event.detail.value || 0);
    const selectedExamSceneFilter = EXAM_SCENE_FILTER_OPTIONS[examSceneFilterIndex] || '全部';
    this.setData({ examSceneFilterIndex, selectedExamSceneFilter });
    this.applyFilters();
  },

  onExamModuleFilterChange(event) {
    const examModuleFilterIndex = Number(event.detail.value || 0);
    const selectedExamModuleFilter = EXAM_MODULE_FILTER_OPTIONS[examModuleFilterIndex] || '全部';
    this.setData({ examModuleFilterIndex, selectedExamModuleFilter });
    this.applyFilters();
  },

  // ========== Review Entry ==========

  handleReviewActionTap(e) {
    const key = e.currentTarget.dataset.key;
    const action = this.data.reviewActions && this.data.reviewActions[key];
    if (!action) return;
    if (this.data.isManageMode) return;

    // Disabled action: show toast, no POST, no navigation
    if (!action.enabled) {
      wx.showToast({
        title: action.disabledReason || '当前暂不可用',
        icon: 'none'
      });
      return;
    }

    // Daily with active session: resume directly without creating new session
    if (key === 'daily' && this.data.hasActiveSession && this.data.activeSessionId) {
      wx.navigateTo({
        url: `/pages/review/review?session_id=${this.data.activeSessionId}`
      });
      return;
    }

    // Otherwise start a new review session of the specified type
    this.handleStartReview(action.sessionType);
  },

  async handleStartReview(sessionType) {
    if (this.data.reviewEntryLoading) return;

    this.setData({ reviewEntryLoading: true });
    wx.showLoading({ title: '准备复习中...', mask: true });

    try {
      const sessionData = sessionType === 'new_only'
        ? { session_type: 'new_only', limit: 5, restart: true }
        : { session_type: sessionType };
      const result = await createReviewSession(sessionData);
      const sessionId =
        (result && (result.session_id || result.id)) ||
        (result && result.data && (result.data.session_id || result.data.id)) ||
        '';
      const items = (result && result.items) || (result && result.data && result.data.items) || [];

      if (!sessionId && (!Array.isArray(items) || items.length === 0)) {
        // Backend returned no session and no items — no cards available
        this.loadAllBackendData();
        wx.showToast({
          title: '暂无可学习的卡片，首页数据已刷新',
          icon: 'none'
        });
        return;
      }

      if (!sessionId) {
        throw new Error('missing session_id');
      }

      wx.navigateTo({
        url: `/pages/review/review?session_id=${sessionId}`
      });
    } catch (error) {
      console.warn('[index] create review session failed', error);
      wx.showToast({
        title: '暂时无法开始复习，请稍后再试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
      this.setData({ reviewEntryLoading: false });
    }
  },

  // ========== 4C-1a: New-only Study Entry ==========

  /**
   * Extract active session from review overview with multiple field-name fallbacks.
   * Returns null if no active session is found.
   */
  _getActiveSession() {
    var overview = this.data.reviewOverview;
    if (!overview || typeof overview !== 'object') return null;
    var session = overview.active_session || overview.activeSession || null;
    // Must be a valid session object with a session_id or id field
    if (!session || typeof session !== 'object') return null;
    if (!session.session_id && !session.id) return null;
    return session;
  },

  async handleStartNewOnlySession() {
    if (this.data.reviewEntryLoading) return;

    const entryState = this.data.newOnlyEntryState || {};
    if (!entryState.enabled) {
      wx.showToast({
        title: entryState.hint || entryState.subtitle || '暂无可学习的新卡',
        icon: 'none'
      });
      return;
    }

    return this.doCreateNewOnlySession(true);
  },

  async doCreateNewOnlySession(restart) {
    if (this.data.reviewEntryLoading) return;

    var entryState = this.data.newOnlyEntryState || {};
    if (!entryState.enabled) {
      wx.showToast({
        title: entryState.hint || entryState.subtitle || '暂无可学习的新卡',
        icon: 'none'
      });
      return;
    }

    this.setData({ reviewEntryLoading: true });
    wx.showLoading({ title: '准备学习中...', mask: true });

    try {
      // 4C-1b: 主动新学的入口始终带 restart:true，避免被旧 active session 卡住
      var sessionData = { session_type: 'new_only', limit: 5, restart: true };
      var result = await createReviewSession(sessionData);

      // Extract session_id from response
      var sessionId = (result && (result.session_id || result.id)) ||
        (result && result.data && (result.data.session_id || result.data.id)) || '';

      var items = (result && result.items) || (result && result.data && result.data.items) || [];

      // No session_id and no items — no cards available
      if (!sessionId && (!Array.isArray(items) || items.length === 0)) {
        wx.hideLoading();
        this.setData({ reviewEntryLoading: false });
        wx.showToast({ title: '暂无可学习的新卡', icon: 'none' });
        this.loadAllBackendData();
        return;
      }

      // Session created but no items / remaining_count is 0
      var remainingCount = Number(result && (result.remaining_count || result.remainingCount || 0));
      if (sessionId && (!Array.isArray(items) || items.length === 0) && remainingCount === 0) {
        wx.hideLoading();
        this.setData({ reviewEntryLoading: false });
        wx.showToast({ title: '暂无可学习的新卡', icon: 'none' });
        this.loadAllBackendData();
        return;
      }

      // Navigate to existing review page
      wx.hideLoading();
      this.setData({ reviewEntryLoading: false });
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + sessionId + '&session_type=new_only&source=new_only'
      });
    } catch (err) {
      console.warn('[index] create new-only session failed', err);
      wx.hideLoading();
      this.setData({ reviewEntryLoading: false });
      wx.showToast({ title: '暂时无法开始学习，请稍后再试', icon: 'none' });
    }
  },

  goToAddPage() {
    if (this.data.isManageMode) return;
    wx.navigateTo({ url: '/pages/add/add' });
  },

  openCard(event) {
    const { id } = event.currentTarget.dataset;
    if (this.data.isManageMode) {
      this.toggleCardSelection(id);
      return;
    }
    wx.navigateTo({ url: `/pages/add/add?id=${id}` });
  },

  // ========== Management Mode ==========

  enterManageMode(initialCardId) {
    const nextSelectedIds = initialCardId ? [initialCardId] : [];
    this.setData({
      isManageMode: true,
      selectedCardIds: nextSelectedIds,
      showFixedSearch: false,
      showBackToTop: false,
      showMoreFilters: false
    });
    this.applyFilters();
  },

  exitManageMode() {
    this.closeBatchPanel();
    this.setData({ isManageMode: false, selectedCardIds: [] });
    this.applyFilters();
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

    this.setData({ selectedCardIds: nextSelectedIds });
    this.applyFilters();
  },

  selectAllCards() {
    const filteredCards = this.data.filteredCards || [];
    if (filteredCards.length === 0) {
      wx.showToast({ title: '当前没有可选卡片', icon: 'none' });
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
    this.setData({ selectedCardIds: nextSelectedIds });
    this.applyFilters();
  },

  onCardLongPress(event) {
    const { id } = event.currentTarget.dataset;
    if (this.data.isManageMode) {
      this.toggleCardSelection(id);
      return;
    }
    this.enterManageMode(id);
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
      wx.showToast({ title: '请先选择卡片', icon: 'none' });
      return;
    }
    this.openBatchPanel('examScene', '批量设置考试场景', BATCH_EXAM_SCENE_OPTIONS);
  },

  handleBatchAssignExamModule() {
    const selectedCardIds = this.data.selectedCardIds || [];
    if (selectedCardIds.length === 0) {
      wx.showToast({ title: '请先选择卡片', icon: 'none' });
      return;
    }
    this.openBatchPanel('examModule', '批量设置考试模块', BATCH_EXAM_MODULE_OPTIONS);
  },

  handleBatchDelete() {
    const selectedCardIds = this.data.selectedCardIds || [];
    if (selectedCardIds.length === 0) {
      wx.showToast({ title: '请先选择卡片', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '批量删除',
      content: `确定删除选中的 ${selectedCardIds.length} 张卡片吗？`,
      confirmText: '删除',
      confirmColor: '#b85c5c',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await deleteCards(selectedCardIds);
        } catch (error) {
          wx.showToast({ title: '批量删除失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        const deletedIdSet = new Set(selectedCardIds.map((id) => String(id)));
        const nextCards = (this.data.cards || []).filter((card) => !deletedIdSet.has(String(card.id)));
        this.setData({
          cards: nextCards,
          isManageMode: false,
          selectedCardIds: [],
          isBatchPanelVisible: false,
          batchPanelType: '',
          batchPanelTitle: '',
          batchPanelOptions: []
        });
        this.applyFilters();
        // Force refresh home data (overview / stats / cards list) from backend
        this.loadAllBackendData();
      }
    });
  },

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
      wx.showToast({ title: '批量更新失败', icon: 'none' });
      return;
    }
    this.closeBatchPanel();
    wx.showToast({ title: `已归类到${value}`, icon: 'success' });
    this.refreshBackendCards();
  },

  noop() {},

  // ========== Scroll ==========

  onPageScroll(event) {
    const scrollTop = Number(event.scrollTop || 0);
    const lastScrollTop = Number(this.data.lastPageScrollTop || 0);
    const isSearching = !!normalizeSearchText(this.data.searchKeyword);
    const isScrollingUp = scrollTop + 8 < lastScrollTop;
    const isScrollingDown = scrollTop > lastScrollTop + 8;

    const showFixedSearch = !this.data.isManageMode && scrollTop > 180;

    let showBackToTop = this.data.showBackToTop;
    if (scrollTop <= 120 || this.data.isManageMode || isSearching) {
      showBackToTop = false;
    }
    if (isScrollingDown) {
      showBackToTop = false;
    }
    if (!this.data.isManageMode && !isSearching && scrollTop > 220 && isScrollingUp) {
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
    wx.pageScrollTo({ scrollTop: 0, duration: 260 });
  }
});
