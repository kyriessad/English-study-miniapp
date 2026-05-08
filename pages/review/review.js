const {
  getTodayReview,
  submitReviewFeedback,
  getSessionSummary,
  refreshBackendAuth,
} = require('../../utils/apiClient');

const {
  enqueueAction,
  flushActionQueue,
  getPendingActionCount,
} = require('../../utils/actionQueue');

const {
  updateFromTodayResponse,
  updateFromFeedbackResponse,
  updateFromSummaryResponse,
  updatePendingActionCount,
  getCache,
} = require('../../utils/sessionProgressCache');

const DEFAULT_REVIEW_BATCH_SIZE = 5;
const VALID_REVIEW_BATCH_SIZES = [5, 10, 15];

// ========== Pure helpers ==========

function normalizeReviewBatchSize(value) {
  const numericValue = Number(value || DEFAULT_REVIEW_BATCH_SIZE);
  return VALID_REVIEW_BATCH_SIZES.includes(numericValue)
    ? numericValue
    : DEFAULT_REVIEW_BATCH_SIZE;
}

function getStoredReviewBatchSize() {
  try {
    return normalizeReviewBatchSize(wx.getStorageSync('reviewBatchSize'));
  } catch (error) {
    return DEFAULT_REVIEW_BATCH_SIZE;
  }
}

function getCardTypeLabel(cardType) {
  if (cardType === 'phrase') return '短语';
  if (cardType === 'sentence') return '句子';
  return '单词';
}

function normalizeReviewItem(item) {
  if (!item) return null;

  return {
    ...item,
    id: item.card_id,
    englishText: item.content || '',
    category: getCardTypeLabel(item.card_type),
    myUnderstanding: item.understanding || '',
    notes: item.note || '',
    sessionItemId: item.session_item_id,
    cardId: item.card_id,
  };
}

function normalizeProgress(progress) {
  return {
    reviewed: Math.max(Number(progress && progress.reviewed || 0), 0),
    total: Math.max(Number(progress && progress.total || 0), 0),
  };
}

function normalizeSummary(summary) {
  const source = summary || {};
  return {
    unique_card_count: Math.max(Number(source.unique_card_count || 0), 0),
    total_review_count: Math.max(Number(source.total_review_count || 0), 0),
    forgot: Math.max(Number(source.forgot || 0), 0),
    shaky: Math.max(Number(source.shaky || 0), 0),
    got_it: Math.max(Number(source.got_it || 0), 0),
    fluent: Math.max(Number(source.fluent || 0), 0),
    strengthening_count: Math.max(Number(source.strengthening_count || 0), 0),
    mastered_count: Math.max(Number(source.mastered_count || 0), 0),
  };
}

function buildSummaryTip(summary) {
  const weakCount = Number(summary.forgot || 0) + Number(summary.shaky || 0);
  const stableCount = Number(summary.got_it || 0) + Number(summary.fluent || 0);

  if (weakCount > stableCount) {
    return '今天有几张还不太稳，系统会帮你安排近期巩固。';
  }

  return '这轮掌握得不错，后续会按间隔继续复习。';
}

function getErrorMessage(error, fallbackMessage) {
  const detail = error && error.data && error.data.detail;

  if (typeof detail === 'string' && detail) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return fallbackMessage;
  }

  return fallbackMessage;
}

function generateClientActionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

Page({
  data: {
    // Phase 2 fields (kept for compatibility)
    sessionId: '',
    reviewBatchSize: DEFAULT_REVIEW_BATCH_SIZE,
    progress: { reviewed: 0, total: 0 },
    currentItem: null,
    currentCard: null,
    answerVisible: false,
    allDone: false,
    isLoading: false,
    isSubmitting: false,
    submittingFeedback: false,
    reviewError: '',
    backendReviewSummary: normalizeSummary({}),
    summaryTip: '',

    // Phase 3 new fields
    pageState: 'loading',        // loading | active | submitting | offline_playing | review_pending_sync | syncing | completed | error
    currentClientActionId: '',
    isFlushing: false,
    pendingActionCount: 0,
    needsRecovery: false,
    batchItems: [],              // Full batch items from the initial /today response
    batchCurrentIndex: 0,

    // Compatibility fields
    tasks: [],
    taskIds: [],
    totalCount: 0,
    finishedCount: 0,
    remainingCount: 0,
    currentTaskIndex: 0,
    totalCardCount: 0,
    hasUnfinishedSessionPrompt: false,
    unfinishedSessionText: '',
    pendingReviewSession: null,
    reviewMode: 'today',
    todayReviewSummary: { total: 0, easy: 0, good: 0, hard: 0, again: 0 },
    masteredPercent: 0,
    needStrengthenPercent: 0,
    masteredPercentText: '0%',
    needStrengthenPercentText: '0%',
    hasMoreExtraTasks: false,
  },

  onLoad() {
    this.loadBackendReviewSession({ restart: false });
  },

  onShow() {
    if (this.data.currentCard || this.data.isLoading || this.data.allDone) {
      return;
    }

    // Check if there are pending actions from a previous session
    const pendingCount = getPendingActionCount();
    if (pendingCount > 0) {
      this.setData({
        pendingActionCount: pendingCount,
        pageState: 'review_pending_sync',
      });
      return;
    }

    this.loadBackendReviewSession({ restart: false });
  },

  // ========== Session Loading ==========

  async loadBackendReviewSession({ restart = false } = {}) {
    const reviewBatchSize = getStoredReviewBatchSize();

    this.setData({
      pageState: 'loading',
      isLoading: true,
      reviewError: '',
      reviewBatchSize,
      submittingFeedback: false,
      isSubmitting: false,
    });

    try {
      const response = await getTodayReview({
        limit: reviewBatchSize,
        restart,
      });

      // Update session progress cache
      updateFromTodayResponse(response);

      const items = Array.isArray(response && response.items) ? response.items : [];
      const currentItem = items[0] || null;
      const currentCard = normalizeReviewItem(currentItem);
      const progress = normalizeProgress(response && response.progress);
      const pendingCount = getPendingActionCount();

      this.setData({
        sessionId: response && response.session_id ? response.session_id : '',
        progress,
        currentItem,
        currentCard,
        answerVisible: false,
        allDone: false,
        isLoading: false,
        reviewError: '',
        pageState: currentCard ? 'active' : 'completed',
        batchItems: items,
        batchCurrentIndex: 0,
        currentClientActionId: '',
        pendingActionCount: pendingCount,

        tasks: items.map(normalizeReviewItem).filter(Boolean),
        taskIds: items.map((item) => item.card_id).filter(Boolean),
        totalCount: progress.total,
        finishedCount: progress.reviewed,
        remainingCount: Math.max(progress.total - progress.reviewed, 0),
        currentTaskIndex: progress.reviewed,
        totalCardCount: progress.total || items.length,
        backendReviewSummary: normalizeSummary({}),
        summaryTip: '',
      });
    } catch (error) {
      console.warn('[review] load backend review session failed', error);
      this.setData({
        isLoading: false,
        pageState: 'error',
        reviewError: getErrorMessage(error, '复习任务加载失败，请稍后重试。'),
        currentItem: null,
        currentCard: null,
        progress: { reviewed: 0, total: 0 },
        totalCount: 0,
        finishedCount: 0,
        remainingCount: 0,
      });
    }
  },

  // ========== Card Reveal / Hide ==========

  revealAnswer() {
    if (!this.data.currentCard || this.data.answerVisible) return;

    this.setData({ answerVisible: true });
  },

  hideAnswer() {
    if (!this.data.currentCard || !this.data.answerVisible) return;

    this.setData({ answerVisible: false });
  },

  // ========== Phase 3: Submit Feedback with Action Queue ==========

  async submitReview(event) {
    const result = event.currentTarget.dataset.result;
    const { sessionId, currentItem, submittingFeedback, currentCard } = this.data;

    if (!sessionId || !currentItem || !result || submittingFeedback || !currentCard) {
      return;
    }

    const clientActionId = generateClientActionId();

    // Set submitting state
    this.setData({
      submittingFeedback: true,
      isSubmitting: true,
      currentClientActionId: clientActionId,
      pageState: 'submitting',
    });

    // Step 1: Enqueue action locally
    enqueueAction('review_feedback', {
      client_action_id: clientActionId,
      session_id: sessionId,
      session_item_id: currentItem.session_item_id,
      card_id: currentItem.card_id,
      result,
      created_at: new Date().toISOString(),
    });

    // Update pending action count
    const pendingCount = getPendingActionCount();
    this.setData({ pendingActionCount: pendingCount });
    updatePendingActionCount(pendingCount);

    // Step 2: Attempt foreground send
    try {
      const response = await submitReviewFeedback({
        client_action_id: clientActionId,
        session_id: sessionId,
        session_item_id: currentItem.session_item_id,
        card_id: currentItem.card_id,
        result,
      });

      // Foreground success — apply response if context matches
      this._handleForegroundSuccess(clientActionId, response);
    } catch (error) {
      // Foreground failed — continue with current batch if available
      this._handleForegroundFailure(clientActionId, error);
    }
  },

  /**
   * Foreground success: only apply if context is still valid.
   */
  _handleForegroundSuccess(clientActionId, response) {
    const { currentClientActionId, sessionId, currentItem, batchItems, batchCurrentIndex } = this.data;

    const canApply = (
      currentClientActionId === clientActionId &&
      sessionId === this.data.sessionId
    );

    // Update cache regardless of context match
    updateFromFeedbackResponse(response);
    this._removeProcessedAction(clientActionId);

    if (!canApply) {
      // Context mismatch: don't update active UI
      this.setData({
        submittingFeedback: false,
        isSubmitting: false,
        pendingActionCount: getPendingActionCount(),
      });
      return;
    }

    const progress = normalizeProgress(response && response.progress);

    if (response && response.status === 'ignored') {
      // Ignored response — reload session
      wx.showToast({ title: '当前卡片已提交，继续下一张', icon: 'none' });
      this.setData({
        submittingFeedback: false,
        isSubmitting: false,
        pageState: 'active',
      });
      this._moveToNextItem();
      return;
    }

    if (response && response.done) {
      const backendReviewSummary = normalizeSummary(response.summary);

      this.setData({
        progress,
        currentItem: null,
        currentCard: null,
        answerVisible: false,
        allDone: true,
        submittingFeedback: false,
        isSubmitting: false,
        pageState: 'completed',
        totalCount: progress.total,
        finishedCount: progress.reviewed,
        remainingCount: 0,
        currentTaskIndex: progress.reviewed,
        backendReviewSummary,
        summaryTip: buildSummaryTip(backendReviewSummary),
        batchItems: [],
        batchCurrentIndex: 0,
      });
      return;
    }

    // Move to next item from backend
    const nextItem = response && response.next_item ? response.next_item : null;
    const nextCard = normalizeReviewItem(nextItem);
    const nextIndex = batchCurrentIndex + 1;

    this.setData({
      currentItem: nextItem,
      currentCard: nextCard,
      progress,
      answerVisible: false,
      allDone: false,
      submittingFeedback: false,
      isSubmitting: false,
      pageState: 'active',
      totalCount: progress.total,
      finishedCount: progress.reviewed,
      remainingCount: Math.max(progress.total - progress.reviewed, 0),
      currentTaskIndex: progress.reviewed,
      currentClientActionId: '',
      batchCurrentIndex: nextIndex,
      pendingActionCount: getPendingActionCount(),
    });
  },

  /**
   * Foreground failure: continue playing current batch if items remain,
   * otherwise enter review_pending_sync.
   */
  _handleForegroundFailure(clientActionId, error) {
    console.warn('[review] foreground feedback failed, action queued', error);

    const { batchItems, batchCurrentIndex } = this.data;
    const nextBatchIndex = batchCurrentIndex + 1;

    // Check if there are more items in the current batch
    if (nextBatchIndex < batchItems.length) {
      // Continue playing current batch
      const nextItem = batchItems[nextBatchIndex];
      const nextCard = normalizeReviewItem(nextItem);

      this.setData({
        currentItem: nextItem,
        currentCard: nextCard,
        answerVisible: false,
        submittingFeedback: false,
        isSubmitting: false,
        pageState: 'offline_playing',
        currentClientActionId: '',
        batchCurrentIndex: nextBatchIndex,
        pendingActionCount: getPendingActionCount(),
      });
    } else {
      // Batch depleted, enter pending_sync
      this.setData({
        currentItem: null,
        currentCard: null,
        answerVisible: false,
        submittingFeedback: false,
        isSubmitting: false,
        pageState: 'review_pending_sync',
        currentClientActionId: '',
        pendingActionCount: getPendingActionCount(),
      });
    }
  },

  /**
   * Remove a processed action from the queue.
   */
  _removeProcessedAction(clientActionId) {
    const { markActionSynced, removeActionFromQueue } = require('../../utils/actionQueue');
    markActionSynced(clientActionId);
    removeActionFromQueue(clientActionId);
  },

  /**
   * Move to next item in batch (for ignored responses).
   */
  _moveToNextItem() {
    const { batchItems, batchCurrentIndex } = this.data;
    const nextIndex = batchCurrentIndex + 1;

    if (nextIndex < batchItems.length) {
      const nextItem = batchItems[nextIndex];
      const nextCard = normalizeReviewItem(nextItem);
      this.setData({
        currentItem: nextItem,
        currentCard: nextCard,
        answerVisible: false,
        batchCurrentIndex: nextIndex,
      });
    } else {
      this.loadBackendReviewSession({ restart: false });
    }
  },

  // ========== Phase 3: Retry Sync ==========

  async retrySync() {
    this.setData({
      pageState: 'syncing',
      isFlushing: true,
    });

    try {
      // Flush all pending actions
      await flushActionQueue({
        mode: 'background',
        sendAction: async (action) => {
          return submitReviewFeedback({
            client_action_id: action.client_action_id,
            session_id: action.payload.session_id,
            session_item_id: action.payload.session_item_id,
            card_id: action.payload.card_id,
            result: action.payload.result,
          });
        },
        onSynced: (action, response) => {
          updateFromFeedbackResponse(response);
        },
        onDropped: (action, error) => {
          console.warn('[review] action dropped during sync', action.client_action_id, error);
          if (error && error.data && error.data.ignored_reason === 'session_not_active') {
            this.setData({ needsRecovery: true });
          }
        },
        onAuthError: async (action, error) => {
          try {
            await refreshBackendAuth();
            return true;
          } catch (refreshError) {
            console.warn('[review] token refresh failed during sync', refreshError);
            return false;
          }
        },
        onFlushStop: (action, error, errorType) => {
          console.warn('[review] flush stopped', errorType, error);
        },
      });

      // After flush, reload today's review to get real state
      await this._recoverSession();
    } catch (error) {
      console.warn('[review] sync failed', error);
      this.setData({
        pageState: 'review_pending_sync',
        isFlushing: false,
        pendingActionCount: getPendingActionCount(),
      });
    }
  },

  /**
   * After sync, recover session state from backend.
   */
  async _recoverSession() {
    try {
      const todayResponse = await getTodayReview({
        limit: getStoredReviewBatchSize(),
        restart: false,
      });

      updateFromTodayResponse(todayResponse);
      const pendingCount = getPendingActionCount();

      const items = Array.isArray(todayResponse && todayResponse.items) ? todayResponse.items : [];
      const currentItem = items[0] || null;
      const currentCard = normalizeReviewItem(currentItem);
      const progress = normalizeProgress(todayResponse && todayResponse.progress);

      if (items.length > 0) {
        // There are items to review (possibly reappeared items)
        this.setData({
          sessionId: todayResponse.session_id || '',
          progress,
          currentItem,
          currentCard,
          answerVisible: false,
          allDone: false,
          pageState: 'active',
          isFlushing: false,
          batchItems: items,
          batchCurrentIndex: 0,
          pendingActionCount: pendingCount,
          currentClientActionId: '',

          totalCount: progress.total,
          finishedCount: progress.reviewed,
          remainingCount: Math.max(progress.total - progress.reviewed, 0),
          currentTaskIndex: progress.reviewed,

          needsRecovery: false,
        });

        // If there are reappeared items, show a tip
        if (currentCard && pendingCount > 0) {
          wx.showToast({
            title: '刚才有几张不太熟的卡片，现在继续巩固。',
            icon: 'none',
            duration: 3000,
          });
        }
      } else if (todayResponse && todayResponse.session_id) {
        // Session still exists but no items — try summary
        try {
          const summary = await getSessionSummary(todayResponse.session_id);
          updateFromSummaryResponse(summary);
          this._showCompletedFromSession(summary);
        } catch (summaryError) {
          this._showCompletedFromResponse(todayResponse);
        }
      } else {
        // No active items at all — completed state
        this.setData({
          allDone: true,
          pageState: 'completed',
          isFlushing: false,
          pendingActionCount: 0,
          progress: { reviewed: 0, total: 0 },
        });
      }
    } catch (error) {
      console.warn('[review] session recovery failed', error);
      this.setData({
        pageState: 'review_pending_sync',
        isFlushing: false,
      });
    }
  },

  _showCompletedFromSession(summaryResponse) {
    const summary = normalizeSummary(summaryResponse.summary);
    const progress = normalizeProgress(summaryResponse.progress);

    this.setData({
      allDone: true,
      pageState: 'completed',
      progress,
      currentItem: null,
      currentCard: null,
      backendReviewSummary: summary,
      summaryTip: buildSummaryTip(summary),
      isFlushing: false,
      pendingActionCount: 0,

      totalCount: progress.total,
      finishedCount: progress.reviewed,
      remainingCount: 0,
      currentTaskIndex: progress.reviewed,
    });
  },

  _showCompletedFromResponse(todayResponse) {
    const progress = normalizeProgress(todayResponse && todayResponse.progress);

    this.setData({
      allDone: true,
      pageState: 'completed',
      progress,
      currentItem: null,
      currentCard: null,
      isFlushing: false,
      pendingActionCount: 0,

      totalCount: progress.total,
      finishedCount: progress.reviewed,
      remainingCount: 0,
      currentTaskIndex: progress.reviewed,
    });
  },

  // ========== Navigation / Retry ==========

  retryLoadReview() {
    this.loadBackendReviewSession({ restart: false });
  },

  restartReviewSession() {
    this.loadBackendReviewSession({ restart: true });
  },

  continueReview() {
    this.setData({
      allDone: false,
      backendReviewSummary: normalizeSummary({}),
      summaryTip: '',
      pageState: 'loading',
    });
    this.loadBackendReviewSession({ restart: false });
  },

  editCurrentCard() {
    const { currentCard } = this.data;

    if (!currentCard || !currentCard.cardId) return;

    wx.navigateTo({
      url: `/pages/add/add?id=${currentCard.cardId}&from=review`,
    });
  },

  goToAddPage() {
    wx.navigateTo({
      url: '/pages/add/add',
    });
  },

  goToHomePage() {
    wx.navigateBack({
      delta: 1,
    });
  },

  viewHistoryReviewedContent() {
    wx.navigateTo({
      url: '/pages/history_reviewed/history_index',
    });
  },
});
