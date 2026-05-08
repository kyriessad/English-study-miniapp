const {
  getTodayReview,
  submitReviewFeedback
} = require('../../utils/apiClient');

const DEFAULT_REVIEW_BATCH_SIZE = 5;
const VALID_REVIEW_BATCH_SIZES = [5, 10, 15];

// Legacy review cache kept for compatibility, not used as Phase 2 main review flow.

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
  if (cardType === 'phrase') {
    return '短语';
  }

  if (cardType === 'sentence') {
    return '句子';
  }

  return '单词';
}

function normalizeReviewItem(item) {
  if (!item) {
    return null;
  }

  return {
    ...item,
    id: item.card_id,
    englishText: item.content || '',
    category: getCardTypeLabel(item.card_type),
    myUnderstanding: item.understanding || '',
    notes: item.note || '',
    sessionItemId: item.session_item_id,
    cardId: item.card_id
  };
}

function normalizeProgress(progress) {
  return {
    reviewed: Math.max(Number(progress && progress.reviewed || 0), 0),
    total: Math.max(Number(progress && progress.total || 0), 0)
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
    mastered_count: Math.max(Number(source.mastered_count || 0), 0)
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

Page({
  data: {
    sessionId: '',
    reviewBatchSize: DEFAULT_REVIEW_BATCH_SIZE,
    progress: {
      reviewed: 0,
      total: 0
    },
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

    // Compatibility fields still referenced by older WXML/CSS branches.
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
    todayReviewSummary: {
      total: 0,
      easy: 0,
      good: 0,
      hard: 0,
      again: 0
    },
    masteredPercent: 0,
    needStrengthenPercent: 0,
    masteredPercentText: '0%',
    needStrengthenPercentText: '0%',
    hasMoreExtraTasks: false
  },

  onLoad() {
    this.loadBackendReviewSession({ restart: false });
  },

  onShow() {
    if (this.data.currentCard || this.data.isLoading || this.data.allDone) {
      return;
    }

    this.loadBackendReviewSession({ restart: false });
  },

  async loadBackendReviewSession({ restart = false } = {}) {
    const reviewBatchSize = getStoredReviewBatchSize();

    this.setData({
      isLoading: true,
      reviewError: '',
      reviewBatchSize,
      submittingFeedback: false,
      isSubmitting: false
    });

    try {
      const response = await getTodayReview({
        limit: reviewBatchSize,
        restart
      });
      const items = Array.isArray(response && response.items) ? response.items : [];
      const currentItem = items[0] || null;
      const currentCard = normalizeReviewItem(currentItem);
      const progress = normalizeProgress(response && response.progress);

      this.setData({
        sessionId: response && response.session_id ? response.session_id : '',
        progress,
        currentItem,
        currentCard,
        answerVisible: false,
        allDone: false,
        isLoading: false,
        reviewError: '',

        tasks: items.map(normalizeReviewItem).filter(Boolean),
        taskIds: items.map((item) => item.card_id).filter(Boolean),
        totalCount: progress.total,
        finishedCount: progress.reviewed,
        remainingCount: Math.max(progress.total - progress.reviewed, 0),
        currentTaskIndex: progress.reviewed,
        totalCardCount: progress.total || items.length,
        backendReviewSummary: normalizeSummary({}),
        summaryTip: ''
      });
    } catch (error) {
      console.warn('[review] load backend review session failed', error);
      this.setData({
        isLoading: false,
        reviewError: getErrorMessage(error, '复习任务加载失败，请稍后重试。'),
        currentItem: null,
        currentCard: null,
        progress: {
          reviewed: 0,
          total: 0
        },
        totalCount: 0,
        finishedCount: 0,
        remainingCount: 0
      });
    }
  },

  revealAnswer() {
    if (!this.data.currentCard || this.data.answerVisible) {
      return;
    }

    this.setData({
      answerVisible: true
    });
  },

  hideAnswer() {
    if (!this.data.currentCard || !this.data.answerVisible) {
      return;
    }

    this.setData({
      answerVisible: false
    });
  },

  async submitReview(event) {
    const result = event.currentTarget.dataset.result;
    const {
      sessionId,
      currentItem,
      submittingFeedback
    } = this.data;

    if (!sessionId || !currentItem || !result || submittingFeedback) {
      return;
    }

    this.setData({
      submittingFeedback: true,
      isSubmitting: true
    });

    try {
      const response = await submitReviewFeedback({
        session_id: sessionId,
        session_item_id: currentItem.session_item_id,
        card_id: currentItem.card_id,
        result
      });
      const progress = normalizeProgress(response && response.progress);

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
          totalCount: progress.total,
          finishedCount: progress.reviewed,
          remainingCount: 0,
          currentTaskIndex: progress.reviewed,
          backendReviewSummary,
          summaryTip: buildSummaryTip(backendReviewSummary)
        });
        return;
      }

      const nextItem = response && response.next_item ? response.next_item : null;
      const nextCard = normalizeReviewItem(nextItem);

      this.setData({
        currentItem: nextItem,
        currentCard: nextCard,
        progress,
        answerVisible: false,
        allDone: false,
        submittingFeedback: false,
        isSubmitting: false,
        totalCount: progress.total,
        finishedCount: progress.reviewed,
        remainingCount: Math.max(progress.total - progress.reviewed, 0),
        currentTaskIndex: progress.reviewed
      });
    } catch (error) {
      console.warn('[review] submit feedback failed', error);

      this.setData({
        submittingFeedback: false,
        isSubmitting: false
      });

      if (error && error.statusCode === 409) {
        wx.showToast({
          title: '当前卡片已提交，请继续下一张',
          icon: 'none'
        });
        this.loadBackendReviewSession({ restart: false });
        return;
      }

      wx.showToast({
        title: getErrorMessage(error, '反馈提交失败'),
        icon: 'none'
      });
    }
  },

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
      summaryTip: ''
    });
    this.loadBackendReviewSession({ restart: false });
  },

  editCurrentCard() {
    const { currentCard } = this.data;

    if (!currentCard || !currentCard.cardId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/add/add?id=${currentCard.cardId}&from=review`
    });
  },

  goToAddPage() {
    wx.navigateTo({
      url: '/pages/add/add'
    });
  },

  goToHomePage() {
    wx.navigateBack({
      delta: 1
    });
  },

  viewHistoryReviewedContent() {
    wx.navigateTo({
      url: '/pages/history_reviewed/history_index'
    });
  }
});
