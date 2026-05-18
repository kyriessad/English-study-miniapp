const {
  getCards,
  refreshCardsCacheFromBackend,
  syncPendingCardsToBackend,
  deleteCards,
  updateCardsMeta,
  addCard
} = require('../../utils/cardStorageFacade');

const {
  EXAM_SCENE_OPTIONS,
  EXAM_MODULE_OPTIONS
} = require('../../utils/cardOptions');

const {
  getReviewOverview,
  getCardStats,
  createReviewSession,
  submitReviewFeedback,
  refreshBackendAuth
} = require('../../utils/apiClient');

const {
  getPendingActionCount,
  getDroppedActionCount,
  flushActionQueue,
  clearDroppedActions
} = require('../../utils/actionQueue');

const DAILY_GOAL_KEY = 'dailyGoal';
const DAILY_GOAL_DEFAULT = 5;
const DAILY_GOAL_OPTIONS = [3, 5, 10];

function readDailyGoal() {
  try {
    const raw = wx.getStorageSync(DAILY_GOAL_KEY);
    const n = Number(raw);
    if (DAILY_GOAL_OPTIONS.indexOf(n) !== -1) return n;
    return DAILY_GOAL_DEFAULT;
  } catch (_) {
    return DAILY_GOAL_DEFAULT;
  }
}

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
  { key: 'new', label: '待学习' },
  { key: 'reviewing', label: '复习中' },
  { key: 'strengthening', label: '待加强' },
  { key: 'mastered', label: '已掌握' }
];

const STATE_LABELS = {
  new: '待学习',
  reviewing: '复习中',
  strengthening: '待加强',
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
 * Phase 6G: Show review state only — no technical status labels.
 */
function getCardDisplayStatus(card) {
  if (!card) return { label: '待学习', className: 'state-new' };
  var stateV2 = card.reviewStateV2 || 'new';
  return { label: STATE_LABELS[stateV2] || '待学习', className: 'state-' + stateV2 };
}

/**
 * Phase 6G: Card is ready for review if it has English content and is not pending/local-only/deleted.
 */
function isNewCardReadyForNewOnly(card) {
  if (!card) return false;

  // pending / local-only cards cannot enter review (hard boundary)
  var syncStatus = String(card.backend_sync_status || card.backendSyncStatus || card.syncStatus || '').trim();
  if (syncStatus === 'pending' || card.local_only === true || card.localOnly === true) {
    return false;
  }

  // deleted cards cannot enter review
  if (card.deleted_at || card.deletedAt) {
    return false;
  }

  // New cards without explicit is_review_ready flag: content-only check
  var content = card.content || card.englishText || '';
  return typeof content === 'string' && content.trim().length > 0;
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
  var sampleNewCards = [];

  newCards.forEach(function (c) {
    var ready = isNewCardReadyForNewOnly(c);
    if (ready) newReadyCount += 1;

    var anStatus = String(c.analysisStatus || c.analysis_status || '').trim();
    if (anStatus === 'pending' || anStatus === 'analyzing') {
      newPendingCount += 1;
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

  return { enabled: false, label: '暂不可学', subtitle: '暂无可学习新卡' };
}

function computeLibraryPreparationTip(filteredCards, currentLibraryTab) {
  // Phase 6G: No technical status tips on home page.
  return false;
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
  // Phase 6G: Never show technical analysis status on the home page.
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

  // totalToday — try direct fields first, fallback to sum of parts.
  // Phase 6L-hotfix-4: 这里是 unique card count（今天需要处理的唯一卡片数），
  // 不是 review session dynamic steps。与复习页进度分母语义不同。
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

  // Phase 6L-hotfix-4: is_all_done 不归零任何计数字段。
  // "今日任务" / toNew / toReview / strengtheningInReview 始终反映
  // 当前有效卡片集合的实际数量，不受 session 完成状态影响。
  // 复习入口按钮的启用/禁用改用 isAllDone 字段单独控制。

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
    isAllDone: raw.is_all_done === true,
    raw: raw
  };
}

function matchesExactFilter(value, selectedValue, fallbackValue) {
  const normalizedValue = value || fallbackValue;
  return selectedValue === '全部' || normalizedValue === selectedValue;
}

/**
 * Phase 6O-3: Format relative last-review time using local date boundaries.
 * Returns empty string when lastReviewedAt is missing or invalid.
 */
function formatRelativeReviewTime(lastReviewedAt) {
  if (!lastReviewedAt) return '';

  var reviewedDate;
  try {
    reviewedDate = new Date(lastReviewedAt);
  } catch (_) {
    return '';
  }
  if (isNaN(reviewedDate.getTime())) return '';

  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var reviewedDay = new Date(reviewedDate.getFullYear(), reviewedDate.getMonth(), reviewedDate.getDate());

  var diffDays = Math.floor((today.getTime() - reviewedDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays <= 6) return diffDays + '天前';
  if (diffDays <= 13) return '1周前';
  if (diffDays <= 55) return Math.floor(diffDays / 7) + '周前';
  return '较久前';
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
      reviewCountText: (function() {
        var count = Number(card.reviewCount || 0);
        var syncStatus = String(card.backend_sync_status || card.backendSyncStatus || card.syncStatus || '').trim();
        var isLocalPending = syncStatus === 'pending' || card.local_only === true || card.localOnly === true;
        if (isLocalPending && count <= 0) return '已先保存';
        if (count <= 0) return '未复习';
        var relative = formatRelativeReviewTime(card.lastReviewedAt);
        if (relative) return '已复习 ' + count + ' 次 · 上次: ' + relative;
        return '已复习 ' + count + ' 次';
      })(),
      analysisStatusVisible: analysisStatusDisplay.visible,
      analysisStatusLabel: analysisStatusDisplay.label,
      analysisStatusClass: analysisStatusDisplay.className,
      selected: selectedSet.has(card.id)
    };
  });
}

/**
 * Phase 6O-2: Compute emotional daily status copy and review button label.
 * Pure function — no side effects.
 */
function computeDailyStatusCopy(totalToday, completedToday) {
  var t = Number(totalToday) || 0;
  var c = Number(completedToday) || 0;

  if (t > 0 && c >= t) {
    return { dailyStatusMessage: '今天的任务都完成了', reviewButtonLabel: '继续复习' };
  }
  if (c > 0 && c < t) {
    return { dailyStatusMessage: '正在学习中，继续加油', reviewButtonLabel: '继续复习' };
  }
  return { dailyStatusMessage: '新的一天，开始学习吧', reviewButtonLabel: '开始复习' };
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
    dashboardToLearn: 0,
    dashboardToStrengthen: 0,
    hasActiveSession: false,
    activeSessionId: '',
    activeSessionType: '',

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
    newOnlyEntryState: { enabled: false, label: '暂不可学', subtitle: '暂无未学习卡片' },

    // Phase 5-8B: action queue sync status
    pendingActionCount: 0,
    droppedActionCount: 0,
    syncingAction: false,

    // Phase 6C: home page polish
    completedToday: 0,
    creatingExampleCard: false,

    // Phase 6O-2: daily status copy
    dailyStatusMessage: '新的一天，开始学习吧',
    reviewButtonLabel: '开始复习',

    // Phase 6O-2A: hide new-study entry card when task is in progress
    hideNewStudyEntry: false,

    // Phase 6P-later-3: goal_progress display fields
    displayCompleted: 0,
    displayTotal: 0,
    progressPercent: 0,
    goalProgress: null,
    actualCompletedToday: 0,
    isGoalMet: false,
    isGoalOverachieved: false,
    isGoalBlocked: false
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

    // Check session restart flag set by Add page after saving new cards
    var reviewSessionNeedsRestart = wx.getStorageSync('reviewSessionNeedsRestart');
    if (reviewSessionNeedsRestart) {
      try { wx.removeStorageSync('reviewSessionNeedsRestart'); } catch (e) { /* ignore */ }
      try { wx.removeStorageSync('reviewOverviewCache'); } catch (e) { /* ignore */ }
      this._needsSessionRestart = true;
      this.setData({
        activeSessionId: '',
        hasActiveSession: false,
        reviewOverview: null
      });
    }

    await this.loadLocalCache();
    this._updateActionQueueStatus();
    this.triggerBackendLoginAfterHomeReady();
    this.loadAllBackendData();

    // Phase 5-8B: background flush — non-blocking, after local cache renders
    this._maybeStartBackgroundFlush();
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

      // Phase 6H: sync pending cards on pull refresh
      try {
        var syncResult = await syncPendingCardsToBackend();
        if (syncResult && syncResult.synced > 0) {
          console.log('[phase6h-pending-sync] refresh home after pull-refresh sync, synced', syncResult.synced);
          await this.refreshBackendCards();
        }
      } catch (syncErr) {
        console.warn('[phase6h-pending-sync] pull-refresh sync attempt failed', syncErr);
      }
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
        this.setData({
          cards: [],
          displayTotalCount: 0,
          displayCurrentCount: 0,
          dashboardToLearn: 0,
          dashboardToStrengthen: 0
        });
        this.applyFilters();
      }

      // Step 4: Load cached review overview
      try {
        const cachedOverview = wx.getStorageSync('reviewOverviewCache');
        if (cachedOverview) {
          this.applyReviewOverview(cachedOverview);
        } else {
          this.setData({
            reviewOverview: null,
            activeSessionId: '',
            activeSessionType: '',
            hasActiveSession: false
          });
        }
      } catch (e) { /* ignore */ }
    } catch (error) {
      console.warn('[index] loadLocalCache failed', error);
    }
  },

  // ========== Backend Data ==========

  async loadAllBackendData() {
    // Phase 5-8B: instance-level lock to prevent concurrent GET bursts from rapid onShow
    if (this._loadingHomeData) return;
    this._loadingHomeData = true;

    try {
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

      // Phase 6H: sync pending local cards to backend after data is loaded
      try {
        var syncResult = await syncPendingCardsToBackend();
        if (syncResult && syncResult.synced > 0) {
          console.log('[phase6h-pending-sync] refresh home after sync, synced', syncResult.synced);
          await this.refreshBackendCards();
        }
      } catch (syncErr) {
        console.warn('[phase6h-pending-sync] sync attempt failed', syncErr);
      }
    } finally {
      this._loadingHomeData = false;
    }
  },

  applyReviewOverview(overview) {
    if (!overview) return;
    var normalized = normalizeReviewOverview(overview);
    var totalToday = normalized.totalToday;
    var toNew = normalized.toNew;
    var toReview = normalized.toReview;
    var strengtheningInReview = normalized.strengtheningInReview;
    var activeSession = normalized.activeSession;

    var isAllDone = normalized.isAllDone || false;
    var reviewActions = this.buildReviewActions(normalized, isAllDone);
    var allZero = totalToday === 0 && toNew === 0 && toReview === 0 && strengtheningInReview === 0 && !activeSession;

    var completedToday = 0;
    var raw = normalized.raw || {};
    if (raw.completed_suggested && typeof raw.completed_suggested === 'object') {
      completedToday = pickNumber(
        raw.completed_suggested.total_count,
        raw.completed_suggested.total,
        raw.completed_suggested.total_today,
        raw.completed_suggested.count
      );
    }

    // Phase 6P-later-3: goal_progress display
    var goalProgress = null;
    var displayCompleted = completedToday;
    var displayTotal = totalToday;
    var actualCompletedToday = completedToday;
    var isGoalMet = false;
    var isGoalOverachieved = false;
    var isGoalBlocked = false;
    var dailyStatusMessage = '';
    var reviewButtonLabel = '';

    if (raw.goal_progress && typeof raw.goal_progress === 'object') {
      goalProgress = raw.goal_progress;
      var gp = goalProgress;
      displayCompleted = pickNumber(gp.display_numerator, 0);
      displayTotal = pickNumber(gp.display_denominator, 0);
      actualCompletedToday = pickNumber(gp.completed_unique_today, completedToday);
      isGoalMet = gp.is_goal_met === true;
      isGoalOverachieved = gp.is_overachieved === true;
      isGoalBlocked = gp.is_goal_blocked === true;

      // Goal-aware status message
      if (displayTotal === 0) {
        dailyStatusMessage = '新的一天，开始学习吧';
        reviewButtonLabel = '开始复习';
      } else if (isGoalMet && isGoalOverachieved) {
        dailyStatusMessage = '今天已完成 ' + actualCompletedToday + ' 张，超额完成';
        reviewButtonLabel = '继续复习';
      } else if (isGoalMet) {
        dailyStatusMessage = '今日目标已完成';
        reviewButtonLabel = '继续复习';
      } else if (isGoalBlocked) {
        var localCardCount = Array.isArray(this.data.cards) ? this.data.cards.length : (this.data.totalCardCount || 0);
        dailyStatusMessage = localCardCount > 0 ? '当前可学内容已完成，可以添加卡片继续' : '新的一天，开始学习吧';
        reviewButtonLabel = '继续复习';
      } else if (displayCompleted > 0 && displayCompleted < displayTotal) {
        dailyStatusMessage = '正在学习中，继续加油';
        reviewButtonLabel = '继续复习';
      } else {
        dailyStatusMessage = '新的一天，开始学习吧';
        reviewButtonLabel = '开始复习';
      }
    } else {
      // Fallback to old suggested / completed_suggested
      var statusCopy = computeDailyStatusCopy(totalToday, completedToday);
      dailyStatusMessage = statusCopy.dailyStatusMessage;
      reviewButtonLabel = statusCopy.reviewButtonLabel;
    }

    console.log('[phase6g-home-state] overview new_only_count', pickNumber(
      normalized.extraToday && normalized.extraToday.newOnlyCount,
      normalized.toNew,
      0
    ));
    console.log('[phase6g-home-state] overview totalToday', totalToday, 'toNew', toNew, 'toReview', toReview);
    console.log('[phase6p-later-3] goal_progress', goalProgress ? JSON.stringify({
      display_numerator: displayCompleted,
      display_denominator: displayTotal,
      completed_unique_today: actualCompletedToday,
      is_goal_met: isGoalMet,
      is_overachieved: isGoalOverachieved,
      is_goal_blocked: isGoalBlocked
    }) : 'missing, using fallback');

    // Phase 6O-2A: Hide new-study entry card when today's task is in progress.
    var hideNewStudyEntry = totalToday > 0 && completedToday < totalToday;

    this.setData({
      hideNewStudyEntry: hideNewStudyEntry,
      reviewOverview: normalized.raw,
      reviewOverviewError: false,
      totalToday: totalToday,
      toNew: toNew,
      toReview: toReview,
      strengtheningInReview: strengtheningInReview,
      hasActiveSession: !!activeSession,
      activeSessionId: activeSession ? (activeSession.id || activeSession.session_id || '') : '',
      activeSessionType: activeSession ? (activeSession.session_type || '') : '',
      reviewActions: reviewActions,
      showEmptyTaskTip: allZero,
      completedToday: completedToday,
      dailyStatusMessage: dailyStatusMessage,
      reviewButtonLabel: reviewButtonLabel,
      displayCompleted: displayCompleted,
      displayTotal: displayTotal,
      progressPercent: displayTotal > 0 ? Math.min(Math.round(displayCompleted / displayTotal * 100), 100) : 0,
      goalProgress: goalProgress,
      actualCompletedToday: actualCompletedToday,
      isGoalMet: isGoalMet,
      isGoalOverachieved: isGoalOverachieved,
      isGoalBlocked: isGoalBlocked
    });
  },

  buildReviewActions(normalized, isAllDone) {
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

    // Phase 6L-hotfix-4: isAllDone 优先控制每日复习按钮，避免 totalToday > 0
    // 但所有卡片已完成时按钮仍显示"开始今日复习"。
    var daily;
    if (activeSession) {
      daily = { enabled: true, label: '继续复习', sessionType: 'daily_suggested' };
    } else if (isAllDone) {
      daily = { enabled: false, label: '今日已完成', sessionType: 'daily_suggested', disabledReason: '今天任务已全部完成' };
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
      var dailyGoal = readDailyGoal();
      var overview = await getReviewOverview({ daily_goal: dailyGoal });
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

    // Phase 6G-hotfix: if local cards have more entries than the backend total
    // (e.g. pending cards not yet synced), compute stats locally for consistency.
    var localCardsCount = Array.isArray(this.data.cards) ? this.data.cards.length : 0;
    var backendTotal = Number(stats.total || 0);
    if (localCardsCount > backendTotal) {
      console.log('[phase6g-home-state] backend stats total=' + backendTotal + ' < local cards=' + localCardsCount + ', using local computation');
      this.computeLocalCardStats(this.data.cards);
      return;
    }

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
    cards.forEach((c) => {
      stats.total += 1;
      var state = c.reviewStateV2 || c.review_state || '';
      if (VALID_REVIEW_STATES.has(state)) {
        stats[state] += 1;
      } else if (state) {
        console.warn('[index] unknown review_stateV2 for card', String(c && c.id || '').slice(0, 12), state);
        stats.new += 1;
      } else {
        // Locally-created pending cards have empty reviewStateV2/review_state
        // but carry legacy reviewState (e.g. '未复习'). Map to v2 states.
        var legacyState = c.reviewState || '';
        if (legacyState === '未复习') {
          stats.new += 1;
        } else if (legacyState === '没记住' || legacyState === '模糊') {
          stats.strengthening += 1;
        } else if (legacyState === '记住了' || legacyState === '太简单') {
          stats.mastered += 1;
        } else {
          // No state at all — default to 'new' (matches decorateCards fallback)
          stats.new += 1;
        }
      }
    });
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
      }
      // Phase 6L-hotfix-2: Always re-apply filters after backend refresh,
      // even when freshCards is not an array or the seq matched. This ensures
      // displayCurrentCount / displayTotalCount / filteredCards stay in sync.
      this.applyFilters();
    } catch (error) {
      console.warn('[index] backend cards refresh failed, using cached', error);
      // Phase 6L-hotfix-2 (Problem A): Re-apply filters with cached cards so
      // the list never goes blank when the backend refresh fails.
      this.applyFilters();
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

    // Phase 6L-hotfix: save tab-filtered count before further filters
    // This is the denominator ("共 X 张") for the current tab context.
    const tabFilteredCount = filtered.length;

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

    // Phase 6L-hotfix: tabFilteredCount is the denominator for the current tab,
    // not cards.length. "共 tabFilteredCount 张 · 当前 filtered.length 张"
    // Phase 6L-hotfix-2 (Problem C): displayCurrentCount must never exceed displayTotalCount.
    // Race conditions between loadLocalCache, refreshBackendCards, and loadCardStats
    // can cause setData calls to interleave, producing 6/4 when local has 6
    // cards but backend only has 4. Clamp to prevent numerator > denominator.
    const displayTotalCount = tabFilteredCount;
    const displayCurrentCount = Math.min(filtered.length || 0, displayTotalCount);

    // Phase 6G: Compute local stats from the actual card list to stay consistent
    // even when backend stats lag (e.g. pending cards not yet synced).
    this.computeLocalCardStats(cards);

    // 4C-3: newOnlyEntryState — 以后端 overview.extra_today 为权威，本地兜底
    var tabNewOnlyState = computeNewOnlyButtonState(cards);
    var ov = this.data.reviewOverview;
    if (ov) {
      var extraToday = ov.extra_today || ov.extraToday || null;
      if (extraToday) {
        var rawCount = extraToday.new_only_count !== undefined ? extraToday.new_only_count : extraToday.newOnlyCount;
        if (rawCount !== undefined) {
          var count = Number(rawCount);
          if (!isNaN(count)) {
            // Phase 6G-hotfix: only use backend count to ENABLE, not to DISABLE.
            // If local computation already found ready cards, keep the enabled state.
            if (count > 0) {
              tabNewOnlyState = { enabled: true, label: '学习几张新卡', subtitle: '还有 ' + count + ' 张新卡可以开始学习' };
            } else if (!tabNewOnlyState.enabled) {
              // Backend says 0 AND local also found none — keep disabled
              tabNewOnlyState = { enabled: false, label: '暂无新可学', subtitle: '暂无可学习的新卡' };
            }
            // else: backend says 0 but local found ready cards — keep local enabled state
          }
        }
      }
    }

    console.log('[phase6g-home-state] cardsCache count', cards.length);
    console.log('[phase6g-home-state] filteredCards count', filtered.length);
    if (cards.length > 0) {
      console.log('[phase6g-home-state] card readiness fields', cards.map(function(c) {
        return {
          id: String(c.id || '').slice(0, 12),
          local_temp_id: String(c.local_temp_id || '').slice(0, 12),
          backend_sync_status: c.backend_sync_status || '',
          syncStatus: c.syncStatus || '',
          local_only: c.local_only,
          localOnly: c.localOnly,
          reviewStateV2: c.reviewStateV2 || '',
          review_state: c.review_state || '',
          reviewState: c.reviewState || '',
          content: String(c.content || c.englishText || '').slice(0, 20),
          deleted_at: c.deleted_at || '',
          deletedAt: c.deletedAt || '',
        };
      }));
    }

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
      newOnlyEntryState: tabNewOnlyState,
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

    var targetSessionType = action.sessionType;
    var activeSession = this._getActiveSession();

    // If active session matches target type, reuse it — no POST needed
    if (activeSession && this.data.activeSessionId) {
      var activeType = activeSession.session_type || activeSession.sessionType || '';
      if (activeType === targetSessionType) {
        wx.navigateTo({
          url: '/pages/review/review?session_id=' + this.data.activeSessionId +
              '&session_type=' + targetSessionType
        });
        return;
      }
    }

    // Otherwise create a new session (handleStartReview decides restart)
    this.handleStartReview(targetSessionType);
  },

  async handleStartReview(sessionType, opts) {
    if (this.data.reviewEntryLoading) return;

    this.setData({ reviewEntryLoading: true });
    wx.showLoading({ title: '准备复习中...', mask: true });

    try {
      // If a different-type active session exists, must pass restart=true to avoid 409.
      // Also force restart when explicitly requested (e.g. new cards were added).
      var forceRestart = !!(opts && opts.forceRestart);
      var activeSession = this._getActiveSession();
      var needsRestart = forceRestart || !!(activeSession &&
        (activeSession.session_type || activeSession.sessionType || '') !== sessionType);

      var sessionData = {
        session_type: sessionType,
        limit: 5,
        ...(needsRestart ? { restart: true } : {})
      };
      if (sessionType === 'daily_suggested') {
        sessionData.daily_goal = readDailyGoal();
      }
      const result = await createReviewSession(sessionData);
      const sessionId =
        (result && (result.session_id || result.id)) ||
        (result && result.data && (result.data.session_id || result.data.id)) ||
        '';
      const items = (result && result.items) || (result && result.data && result.data.items) || [];

      console.log('[phase6g-home-state] create review session result', JSON.stringify({
        session_id: sessionId,
        items_count: Array.isArray(items) ? items.length : 0,
        remaining_count: result && (result.remaining_count || result.remainingCount),
        session_type: sessionType,
      }));

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

      this._needsSessionRestart = false;
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + sessionId + '&session_type=' + sessionType
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

    // If an active new_only session already exists, reuse it — no POST needed
    var activeSession = this._getActiveSession();
    if (activeSession) {
      var activeType = activeSession.session_type || activeSession.sessionType || '';
      if (activeType === 'new_only') {
        var activeId = activeSession.session_id || activeSession.id || '';
        if (activeId) {
          wx.navigateTo({
            url: '/pages/review/review?session_id=' + activeId + '&session_type=new_only&source=new_only'
          });
          return;
        }
      }
    }

    this.setData({ reviewEntryLoading: true });
    wx.showLoading({ title: '准备学习中...', mask: true });

    try {
      // If a different-type active session blocks, restart:true abandons it
      var needsRestart = !!(activeSession &&
        (activeSession.session_type || activeSession.sessionType || '') !== 'new_only');
      var sessionData = {
        session_type: 'new_only',
        limit: 5,
        ...(needsRestart ? { restart: true } : {})
      };
      var result = await createReviewSession(sessionData);

      // Extract session_id from response
      var sessionId = (result && (result.session_id || result.id)) ||
        (result && result.data && (result.data.session_id || result.data.id)) || '';

      var items = (result && result.items) || (result && result.data && result.data.items) || [];

      console.log('[phase6g-home-state] create review session result (new_only)', JSON.stringify({
        session_id: sessionId,
        items_count: Array.isArray(items) ? items.length : 0,
        remaining_count: result && (result.remaining_count || result.remainingCount),
        session_type: 'new_only',
      }));

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

  onStatusOverviewTap() {
    if (this.data.isManageMode) return;
    wx.navigateTo({ url: '/pages/today_review_status/today_review_status' });
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  goToAddPage() {
    if (this.data.isManageMode) return;
    wx.navigateTo({ url: '/pages/add/add' });
  },

  goToReview() {
    if (this.data.isManageMode) return;
    if (this.data.reviewEntryLoading) return;

    // Phase 6O-2A: Always use fallback chain for learning action.
    // Even when today's task is done, the user can continue extra learning.

    // If new cards were added since last session, force a fresh session
    if (this._needsSessionRestart) {
      this.startReviewWithFallback('daily_suggested', { forceRestart: true });
      return;
    }

    // If active session exists, navigate directly — reuse existing logic
    var activeSession = this._getActiveSession();
    if (activeSession && this.data.activeSessionId) {
      var activeType = activeSession.session_type || activeSession.sessionType || '';
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + this.data.activeSessionId +
            '&session_type=' + activeType
      });
      return;
    }

    // No active session — start fallback chain
    this.startReviewWithFallback('daily_suggested');
  },

  /**
   * Phase 6L: Create a review session and return a structured result.
   * Returns { success, sessionId, sessionType } on success,
   * or { success: false, reason: 'empty' | 'network_error' } on failure.
   */
  async _tryCreateSession(sessionType, _a) {
    var opts = _a || {};
    var forceRestart = !!(opts && opts.forceRestart);
    var activeSession = this._getActiveSession();
    var activeType = activeSession ? (activeSession.session_type || activeSession.sessionType || '') : '';
    var needsRestart = forceRestart || (!!activeSession && activeType && activeType !== sessionType);

    try {
      var sessionData = {
        session_type: sessionType,
        limit: 5,
        ...(needsRestart ? { restart: true } : {})
      };
      if (sessionType === 'daily_suggested') {
        sessionData.daily_goal = readDailyGoal();
      }
      var result = await createReviewSession(sessionData);
      var sessionId = (result && (result.session_id || result.id)) ||
        (result && result.data && (result.data.session_id || result.data.id)) || '';
      var items = (result && result.items) || (result && result.data && result.data.items) || [];
      var remainingCount = Number(result && (result.remaining_count || result.remainingCount || 0));

      console.log('[phase6l-fallback] _tryCreateSession', JSON.stringify({
        sessionType: sessionType,
        sessionId: sessionId,
        itemsCount: Array.isArray(items) ? items.length : 0,
        remainingCount: remainingCount
      }));

      // Has real items — success
      if (sessionId && Array.isArray(items) && items.length > 0) {
        return { success: true, sessionId: sessionId, sessionType: sessionType };
      }

      // Has session but no items and no remaining — empty
      if (sessionId && remainingCount === 0) {
        return { success: false, reason: 'empty' };
      }

      // No session at all — empty
      return { success: false, reason: 'empty' };
    } catch (error) {
      console.warn('[phase6l-fallback] create session failed for', sessionType, error);
      return { success: false, reason: 'network_error' };
    }
  },

  /**
   * Phase 6L: Degradation chain for the main review button.
   * Tries daily_suggested → new_only → free_review in order.
   * On network error, stops immediately. On empty session, continues to next.
   */
  async startReviewWithFallback(initialSessionType, _a) {
    if (this.data.reviewEntryLoading) return;

    var opts = _a || {};
    var forceRestart = !!(opts && opts.forceRestart);

    this.setData({ reviewEntryLoading: true });
    wx.showLoading({ title: '准备复习中...', mask: true });

    var FALLBACK_CHAIN = ['daily_suggested', 'new_only', 'free_review'];
    var startIndex = FALLBACK_CHAIN.indexOf(initialSessionType);
    var chain = startIndex >= 0 ? FALLBACK_CHAIN.slice(startIndex) : FALLBACK_CHAIN;

    var lastReason = 'empty';
    var shouldRestart = forceRestart;

    for (var i = 0; i < chain.length; i++) {
      var sessionType = chain[i];
      var result = await this._tryCreateSession(sessionType, {
        forceRestart: shouldRestart
      });

      if (result.success) {
        wx.hideLoading();
        this.setData({ reviewEntryLoading: false });
        this._needsSessionRestart = false;
        wx.navigateTo({
          url: '/pages/review/review?session_id=' + result.sessionId +
              '&session_type=' + sessionType
        });
        return;
      }

      if (result.reason === 'network_error') {
        lastReason = 'network_error';
        break;
      }

      // Phase 6L-hotfix-2 (Problem B): If daily_suggested returned empty
      // without restart (reusing a stale session with 0 pending items),
      // retry immediately with restart before falling back to new_only.
      if (sessionType === 'daily_suggested' && !shouldRestart) {
        shouldRestart = true;
        var retryResult = await this._tryCreateSession('daily_suggested', {
          forceRestart: true
        });
        if (retryResult.success) {
          wx.hideLoading();
          this.setData({ reviewEntryLoading: false });
          this._needsSessionRestart = false;
          wx.navigateTo({
            url: '/pages/review/review?session_id=' + retryResult.sessionId +
                '&session_type=daily_suggested'
          });
          return;
        }
        if (retryResult.reason === 'network_error') {
          lastReason = 'network_error';
          break;
        }
        // Retry also returned empty — continue to next in chain
      }

      // Empty — prepare restart for the next attempt
      shouldRestart = true;
      lastReason = 'empty';
    }

    wx.hideLoading();
    this.setData({ reviewEntryLoading: false });

    if (lastReason === 'network_error') {
      this._showNoCardsAvailable('network_error');
    } else {
      this._showNoCardsAvailable('all_empty');
    }

    // Refresh overview data since it may be stale
    this.loadAllBackendData();
  },

  /**
   * Phase 6L: Show user-facing message when no review session can be created.
   * Checks local card state to give accurate guidance.
   */
  _showNoCardsAvailable(reason) {
    if (reason === 'network_error') {
      wx.showToast({
        title: '当前网络不可用，请稍后再试',
        icon: 'none'
      });
      return;
    }

    // reason === 'all_empty' — check local card state
    var cards = this.data.cards || [];
    var totalCardCount = this.data.totalCardCount || (Array.isArray(cards) ? cards.length : 0) || 0;

    if (totalCardCount === 0) {
      wx.showToast({
        title: '还没有卡片，先添加一张吧',
        icon: 'none'
      });
      return;
    }

    // Count synced (non-pending, non-local-only) cards
    var syncedCount = 0;
    if (Array.isArray(cards)) {
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!card) continue;
        var syncStatus = String(card.backend_sync_status || card.backendSyncStatus || card.syncStatus || '').trim();
        var isLocalOnly = card.local_only === true || card.localOnly === true;
        if (syncStatus !== 'pending' && !isLocalOnly) {
          syncedCount++;
        }
      }
    }

    if (syncedCount === 0) {
      wx.showToast({
        title: '当前网络不可用，请稍后再试',
        icon: 'none'
      });
    } else {
      wx.showToast({
        title: '暂无可复习内容，请下拉刷新后再试',
        icon: 'none'
      });
    }
  },

  handleCreateExampleCard(e) {
    if (this.data.creatingExampleCard) return;
    if (this.data.isManageMode) return;

    var cardType = e.currentTarget.dataset.type;
    var presets = {
      word: {
        englishText: 'clutch',
        myUnderstanding: '关键时刻顶得住',
        category: '单词',
        examScene: '未分类',
        examModule: '未分类',
        whereEncountered: 'NBA 解说',
        notes: 'NBA 解说里常见，用来形容关键时刻表现很稳。'
      },
      phrase: {
        englishText: 'break a leg',
        myUnderstanding: '祝你好运，尤其常用于演出或上台前',
        category: '短语',
        examScene: '未分类',
        examModule: '未分类',
        whereEncountered: '美剧 / 舞台表演',
        notes: '美剧或舞台表演场景里常见，不是真的"摔断腿"。'
      },
      sentence: {
        englishText: "I'll keep you posted.",
        myUnderstanding: '有进展我会告诉你',
        category: '句子',
        examScene: '未分类',
        examModule: '未分类',
        whereEncountered: '工作邮件',
        notes: '工作邮件或聊天里常见，表示后续会同步消息。'
      }
    };

    var form = presets[cardType];
    if (!form) return;

    var self = this;
    this.setData({ creatingExampleCard: true });

    addCard(form).then(function () {
      wx.showToast({
        title: '已保存',
        icon: 'success',
        duration: 2000
      });
      // Invalidate old active session so new cards enter the review pool
      try { wx.removeStorageSync('reviewOverviewCache'); } catch (e) { /* ignore */ }
      self.setData({ activeSessionId: '', hasActiveSession: false });
      self._needsSessionRestart = true;
      // Refresh home data
      self.loadAllBackendData();
      self.loadLocalCache();
    }).catch(function () {
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    }).then(function () {
      self.setData({ creatingExampleCard: false });
    });
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
        var deleteResult = { successIds: [], failedIds: [] };
        try {
          deleteResult = await deleteCards(selectedCardIds);
        } catch (error) {
          // Unexpected error (not per-card failures) — treat all as failed
          deleteResult = { successIds: [], failedIds: selectedCardIds.slice() };
        }
        var successIds = deleteResult.successIds || [];
        var failedIds = deleteResult.failedIds || [];

        // Show appropriate toast
        if (failedIds.length > 0) {
          if (successIds.length === 0) {
            wx.showToast({
              title: '删除失败，请稍后重试',
              icon: 'none',
              duration: 2000
            });
          } else {
            wx.showToast({
              title: '部分卡片删除失败，请稍后重试',
              icon: 'none',
              duration: 2000
            });
          }
        } else {
          wx.showToast({ title: '已删除', icon: 'success' });
        }

        // Only remove successfully deleted cards from UI
        var successIdSet = new Set(successIds.map(function (id) { return String(id); }));
        var nextCards = (this.data.cards || []).filter(function (card) {
          return !successIdSet.has(String(card.id));
        });
        this.setData({
          cards: nextCards,
          isManageMode: false,
          selectedCardIds: [],
          isBatchPanelVisible: false,
          batchPanelType: '',
          batchPanelTitle: '',
          batchPanelOptions: [],
          reviewOverview: null,
          reviewOverviewError: false,
          totalToday: 0,
          toNew: 0,
          toReview: 0,
          strengtheningInReview: 0,
          dashboardToLearn: 0,
          dashboardToStrengthen: 0,
          hasActiveSession: false,
          activeSessionId: '',
          activeSessionType: '',
          completedToday: 0,
          reviewActions: {
            daily: { enabled: false, label: '暂无今日复习', sessionType: 'daily_suggested', disabledReason: '今天暂无推荐复习任务' },
            newOnly: { enabled: false, label: '暂无新卡可学', sessionType: 'new_only', disabledReason: '暂无可学习的新卡' },
            strengthening: { enabled: false, label: '暂无需加强卡片', sessionType: 'free_review', disabledReason: '暂无需加强卡片' }
          },
          showEmptyTaskTip: false
        });
        this.applyFilters();
        // Compute local stats immediately for dashboard, backend will refine later
        this.computeLocalCardStats(nextCards);
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
  },

  // ========== Phase 5-8B: Action Queue Status & Background Flush ==========

  _updateActionQueueStatus() {
    try {
      var pending = getPendingActionCount();
      var dropped = getDroppedActionCount();
      this.setData({
        pendingActionCount: pending,
        droppedActionCount: dropped
      });
    } catch (e) {
      // silently ignore — actionQueue storage may be unavailable
    }
  },

  _maybeStartBackgroundFlush() {
    var self = this;
    var pending = getPendingActionCount();
    if (pending <= 0) {
      console.log('[home-action-queue] no pending action, skip');
      return;
    }

    console.log('[home-action-queue] pending found, background flush start');
    this.setData({ syncingAction: true });

    // Track pre-flush pending count for Toast decision
    var pendingBeforeFlush = pending;

      flushActionQueue({
        mode: 'background',
        sendAction: function (action) {
          return submitReviewFeedback({
            client_action_id: action.client_action_id,
            session_id: action.payload.session_id,
            session_item_id: action.payload.session_item_id,
            card_id: action.payload.card_id,
            result: action.payload.result
          });
        },
        onSynced: function (action, response) {
          console.log('[home-action-queue] synced action', action.client_action_id);
        },
        onDropped: function (action, error) {
          console.warn('[home-action-queue] action dropped', action.client_action_id, error);
        },
        onAuthError: function (action, error) {
          // apiClient.request already handles 401→refresh→replay.
          // If we reach here, token refresh also failed.
          console.warn('[home-action-queue] auth error during flush, giving up', error);
          return Promise.resolve(false);
        },
        onFlushStop: function (action, error, errorType) {
          console.warn('[home-action-queue] flush stopped', errorType, error);
        }
      }).then(function () {
        console.log('[home-action-queue] background flush done');
        self._updateActionQueueStatus();

        var pendingAfterFlush = getPendingActionCount();
        if (pendingBeforeFlush > 0 && pendingAfterFlush === 0) {
          wx.showToast({
            title: '已更新',
            icon: 'none',
            duration: 2500
          });
        }
      }).catch(function (err) {
        console.warn('[home-action-queue] background flush failed, keep queue', err);
        self._updateActionQueueStatus();
      }).finally(function () {
        self.setData({ syncingAction: false });
      });
  },

  onTapDroppedHint: function () {
    var self = this;
    var dropped = getDroppedActionCount();
    if (dropped <= 0) return;

    wx.showModal({
      title: '清除失效记录',
      content: '有 ' + dropped + ' 条离线复习记录由于无法同步已被标记为失效。清除后，系统将无法记录这部分复习进度，您后续可能会重复遇到这些卡片。是否确认清除？',
      confirmText: '清除',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        try {
          clearDroppedActions();
        } catch (e) {
          console.warn('[home-action-queue] clearDroppedActions failed', e);
        }
        self._updateActionQueueStatus();
        wx.showToast({
          title: '已清除失效记录',
          icon: 'success',
          duration: 2000
        });
      }
    });
  }
});
