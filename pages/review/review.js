const {
  getTodayReview,
  submitReviewFeedback,
  getSessionSummary,
  refreshBackendAuth,
} = require('../../utils/apiClient');

const {
  getCards,
  getCardById,
} = require('../../utils/cardStorageFacade');

const {
  enqueueAction,
  flushActionQueue,
  getPendingActionCount,
  removeActionFromQueue,
  removeQueuedFeedbackActionsBySessionItemId,
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
    whereEncountered: item.where_encountered || '',
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

function decorateRepeat(card, seenCardIds) {
  if (!card) return card;
  var seen = Array.isArray(seenCardIds) ? seenCardIds : [];
  var cardId = card.cardId || card.card_id;
  if (cardId && seen.indexOf(String(cardId)) >= 0) {
    return Object.assign({}, card, { is_repeat: true });
  }
  return card;
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

    // Phase 6F-hotfix: display-layer progress (1-based, based on actual filtered items)
    displayCurrentNo: 1,
    displayTotal: 0,

    // Phase 8I-followup: track card_ids that the user has already submitted feedback for
    // in this client session, so reappear items can be marked is_repeat=true on the client
    // (backend ReviewItemResponse does not expose is_repeat).
    seenCardIds: [],

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
    currentSessionType: '',
    todayReviewSummary: { total: 0, easy: 0, good: 0, hard: 0, again: 0 },
    masteredPercent: 0,
    needStrengthenPercent: 0,
    masteredPercentText: '0%',
    needStrengthenPercentText: '0%',
    hasMoreExtraTasks: false,
    reviewMode: 'today',
  },

  onLoad(options) {
    const sessionId = (options && (options.session_id || options.sessionId)) || '';
    const sessionType = (options && (options.session_type || options.sessionType)) || '';
    const source = (options && options.source) || '';

    if (!sessionId) {
      wx.showToast({
        title: '复习上下文丢失，请重新开始',
        icon: 'none'
      });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/index/index' });
      }, 1500);
      return;
    }

    // 4C-1b: Support new_only review sessions
    var effectiveSessionType = sessionType || source || 'daily_suggested';
    if (effectiveSessionType === 'new_only') {
      this.setData({ reviewMode: 'new_only' });
    }

    this.setData({ currentSessionType: effectiveSessionType });

    this.loadBackendReviewSession({
      sessionType: effectiveSessionType
    });
  },

  onShow() {
    // Phase 6G: Refresh current card after returning from edit page
    if (this._returningFromEdit) {
      this._returningFromEdit = false;
      console.log('[phase6g-review-refresh] return from edit');
      this._refreshCurrentCardFromStorage();
      return;
    }

    if (this.data.currentCard || this.data.isLoading || this.data.allDone) {
      return;
    }

    // Phase 6O-2B: Pending actions from previous sessions are handled
    // by home page's background flush. Don't block review with sync UI.
    const pendingCount = getPendingActionCount();
    if (pendingCount > 0) {
      this.setData({ pendingActionCount: pendingCount });
    }

    // 4C-1b: Reload using stored session type from onLoad
    this.loadBackendReviewSession({ sessionType: this.data.currentSessionType || undefined });
  },

  // ========== Session Loading ==========

  async loadBackendReviewSession({ restart, sessionType } = {}) {
    // restart only when explicitly requested; reusing an existing session must not restart
    var effectiveRestart = restart === true;
    // Always carry sessionType so backend can match the correct active session
    if (!sessionType) {
      sessionType = this.data.currentSessionType || undefined;
    }
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
        restart: effectiveRestart,
        ...(sessionType ? { session_type: sessionType } : {}),
      });

      // Update session progress cache
      updateFromTodayResponse(response);

      var items = Array.isArray(response && response.items) ? response.items : [];

      // Phase 6C-hotfix-2: filter out items referencing deleted cards
      if (items.length > 0) {
        try {
          var cardsResult = await getCards();
          var localCards = Array.isArray(cardsResult) ? cardsResult : [];
          if (Array.isArray(cardsResult && cardsResult.cards)) {
            localCards = cardsResult.cards;
          }
          var existingCardIds = new Set();
          for (var ci = 0; ci < localCards.length; ci++) {
            if (localCards[ci] && localCards[ci].id) {
              existingCardIds.add(String(localCards[ci].id));
            }
          }
          var filteredItems = [];
          for (var fi = 0; fi < items.length; fi++) {
            var itemCardId = items[fi] && (items[fi].card_id || items[fi].id);
            if (itemCardId && existingCardIds.has(String(itemCardId))) {
              filteredItems.push(items[fi]);
            } else {
              console.warn('[review] filtered out item referencing deleted/missing card', itemCardId);
            }
          }
          // If all items were filtered out and we haven't restarted yet, re-fetch
          if (filteredItems.length === 0 && !effectiveRestart) {
            console.warn('[review] all session items reference deleted cards, re-fetching with restart');
            updateFromTodayResponse({});
            this.setData({ isLoading: false });
            return this.loadBackendReviewSession({ restart: true, sessionType: sessionType });
          }
          items = filteredItems;
        } catch (filterErr) {
          console.warn('[review] failed to filter session items against local cache, proceeding unfiltered', filterErr);
        }
      }

      var currentItem = items[0] || null;
      var currentCard = normalizeReviewItem(currentItem);
      var progress = normalizeProgress(response && response.progress);
      var pendingCount = getPendingActionCount();

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
        seenCardIds: [],
        // Phase 6L-hotfix-3: Use backend progress for dynamic total (includes reappear items).
        // items.length is only pending items; progress.total tracks the full session count.
        displayCurrentNo: items.length > 0 ? progress.reviewed + 1 : 0,
        displayTotal: progress.total || items.length,

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
      const isNetworkError = (
        !error ||
        (!error.statusCode && !error.data) ||
        (error.errMsg && /request:fail/i.test(error.errMsg))
      );
      const errorMessage = isNetworkError
        ? '网络不可用，请检查当前网络'
        : '暂时无法加载卡片，请稍后重试';
      this.setData({
        isLoading: false,
        pageState: 'error',
        reviewError: errorMessage,
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

    // Phase 8J: Dedupe any stale feedback action for the same session_item_id
    // (e.g. from an earlier foreground failure on a different result). The most
    // recent click is the user's true intent — we don't want an older action
    // racing it during a later background flush.
    try {
      removeQueuedFeedbackActionsBySessionItemId(currentItem.session_item_id);
    } catch (dedupErr) {
      console.warn('[review] feedback dedup failed before enqueue', dedupErr);
    }

    // Step 1: Enqueue action locally
    enqueueAction('review_feedback', {
      client_action_id: clientActionId,
      session_id: sessionId,
      session_item_id: currentItem.session_item_id,
      card_id: currentItem.card_id,
      result,
      created_at: new Date().toISOString(),
    });

    // Phase 8I-followup: remember this card_id so subsequent reappearances
    // of the same card in this session are marked as repeat (is_repeat=true).
    const currentCardId = currentItem && currentItem.card_id ? String(currentItem.card_id) : '';
    if (currentCardId) {
      const prevSeen = Array.isArray(this.data.seenCardIds) ? this.data.seenCardIds : [];
      if (prevSeen.indexOf(currentCardId) < 0) {
        this.setData({ seenCardIds: prevSeen.concat([currentCardId]) });
      }
    }

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
    // Set flag so home page refreshes overview/stats/cards on next onShow
    try { wx.setStorageSync('homeNeedsRefresh', true); } catch (e) { /* ignore storage write error */ }

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
      this.setData({
        submittingFeedback: false,
        isSubmitting: false,
      });

      wx.redirectTo({
        url: '/pages/today_reviewed/today_reviewed?from=review_complete',
        fail: () => {
          this.setData({
            progress,
            currentItem: null,
            currentCard: null,
            answerVisible: false,
            allDone: true,
            pageState: 'completed',
            totalCount: progress.total,
            finishedCount: progress.reviewed,
            remainingCount: 0,
            currentTaskIndex: progress.reviewed,
            batchItems: [],
            batchCurrentIndex: 0,
          });
        }
      });
      return;
    }

    // Move to next item from backend
    const nextItem = response && response.next_item ? response.next_item : null;
    const nextCard = decorateRepeat(normalizeReviewItem(nextItem), this.data.seenCardIds);
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
      // Phase 6L-hotfix-3: Use backend progress for dynamic display.
      // progress.total includes reappear items; batchItems.length is static.
      displayCurrentNo: progress.reviewed + 1,
      displayTotal: progress.total,
    });
  },

  /**
   * Phase 6O-2B: Foreground failure — block card advancement, stay on current card.
   * Offline review is not supported at this product stage.
   */
  _handleForegroundFailure(clientActionId, error) {
    console.warn('[review] foreground feedback failed, staying on current card', error);

    // Phase 8J: Drop the failed action from the local queue so it cannot
    // race a later click on the same session_item during background flush.
    // The user is explicitly told the click failed; they will retry, and
    // the next click is the action that should reach the backend.
    try {
      removeActionFromQueue(clientActionId);
    } catch (removeErr) {
      console.warn('[review] failed to remove failed feedback action from queue', removeErr);
    }

    // Reset submitting state — do NOT advance to next item
    this.setData({
      submittingFeedback: false,
      isSubmitting: false,
      pageState: 'active',
      currentClientActionId: '',
      pendingActionCount: getPendingActionCount(),
    });

    wx.showToast({
      title: '网络不可用，请检查当前网络',
      icon: 'none',
      duration: 2500,
    });
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
    const { batchItems, batchCurrentIndex, progress } = this.data;
    const nextIndex = batchCurrentIndex + 1;

    if (nextIndex < batchItems.length) {
      const nextItem = batchItems[nextIndex];
      const nextCard = decorateRepeat(normalizeReviewItem(nextItem), this.data.seenCardIds);
      this.setData({
        currentItem: nextItem,
        currentCard: nextCard,
        answerVisible: false,
        batchCurrentIndex: nextIndex,
        displayCurrentNo: nextIndex + 1,
        // Phase 6L-hotfix-3: Use backend total for denominator (includes reappear items).
        displayTotal: (progress && progress.total) || batchItems.length,
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
          try { wx.setStorageSync('homeNeedsRefresh', true); } catch (e) { /* ignore */ }
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
      var sessionType = this.data.currentSessionType || undefined;
      const todayResponse = await getTodayReview({
        limit: getStoredReviewBatchSize(),
        restart: false,
        ...(sessionType ? { session_type: sessionType } : {}),
      });

      updateFromTodayResponse(todayResponse);
      const pendingCount = getPendingActionCount();

      const items = Array.isArray(todayResponse && todayResponse.items) ? todayResponse.items : [];
      const currentItem = items[0] || null;
      const currentCard = decorateRepeat(normalizeReviewItem(currentItem), this.data.seenCardIds);
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
          // Phase 6L-hotfix-3: Use backend progress for dynamic total (includes reappear items).
          displayCurrentNo: items.length > 0 ? progress.reviewed + 1 : 0,
          displayTotal: progress.total || items.length,

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
    const progress = normalizeProgress(summaryResponse.progress);

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

  navigateToTodayReviewed() {
    wx.redirectTo({
      url: '/pages/today_reviewed/today_reviewed?from=review_done_fallback',
      fail: () => {
        wx.navigateTo({
          url: '/pages/today_reviewed/today_reviewed?from=review_done_fallback'
        });
      }
    });
  },

  editCurrentCard() {
    const { currentCard } = this.data;

    if (!currentCard || !currentCard.cardId) return;

    this._returningFromEdit = true;

    wx.navigateTo({
      url: `/pages/add/add?id=${currentCard.cardId}&from=review`,
    });
  },

  /**
   * Phase 6G: Refresh the current card data from local storage without rebuilding the session.
   * Called when returning from the Add page after editing.
   */
  async _refreshCurrentCardFromStorage() {
    const { currentCard, batchItems, batchCurrentIndex } = this.data;
    if (!currentCard || !currentCard.cardId) return;

    try {
      const updatedCard = await getCardById(currentCard.cardId);
      if (!updatedCard) return;

      console.log('[phase6g-review-refresh] loaded updated card', JSON.stringify({
        id: updatedCard.id,
        myUnderstanding: updatedCard.myUnderstanding,
        understanding: updatedCard.understanding,
        content: updatedCard.content,
        englishText: updatedCard.englishText,
      }));

      const newMyUnderstanding = updatedCard.myUnderstanding || updatedCard.understanding || '';
      const newNotes = updatedCard.notes || '';
      const newWhereEncountered = updatedCard.whereEncountered || '';
      const newEnglishText = updatedCard.content || updatedCard.englishText || currentCard.englishText;
      const newContent = updatedCard.content || updatedCard.englishText || currentCard.content;
      const newTranslation = updatedCard.translation || '';

      const updates = {
        'currentCard.myUnderstanding': newMyUnderstanding,
        'currentCard.notes': newNotes,
        'currentCard.whereEncountered': newWhereEncountered,
        'currentCard.englishText': newEnglishText,
        'currentCard.content': newContent,
        'currentCard.translation': newTranslation,
      };
      this.setData(updates);

      console.log('[phase6g-review-refresh] updated current card');

      // Also update the item in batchItems so session state is consistent
      if (Array.isArray(batchItems) && typeof batchCurrentIndex === 'number') {
        const idx = batchCurrentIndex;
        if (idx >= 0 && idx < batchItems.length) {
          const item = batchItems[idx];
          if (item && (item.card_id === currentCard.cardId || item.cardId === currentCard.cardId)) {
            const updatedBatchItems = batchItems.slice();
            updatedBatchItems[idx] = {
              ...item,
              understanding: newMyUnderstanding || item.understanding || '',
              note: newNotes || item.note || '',
              content: newContent || item.content || '',
            };
            this.setData({ batchItems: updatedBatchItems });
          }
        }
      }
    } catch (_) {
      // Silently ignore refresh failures — don't disrupt the review flow
    }
  },

  goToAddPage() {
    wx.navigateTo({
      url: '/pages/add/add',
    });
  },

  goToHomePage() {
    try { wx.setStorageSync('homeNeedsRefresh', true); } catch (e) { /* ignore */ }
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
