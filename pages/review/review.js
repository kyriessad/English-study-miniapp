const {
  getTodayReview,
  submitReviewFeedback,
} = require('../../utils/apiClient');

const {
  createPronunciationController,
  getStoredVoice,
  DEFAULT_VOICE
} = require('../../utils/pronunciation');

const DEFAULT_REVIEW_BATCH_SIZE = 5;
const VALID_REVIEW_BATCH_SIZES = [5, 10, 15];
const OPTION_PREVIEW_LIMIT = 48;

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

function generateClientActionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function formatOptionText(text, expanded) {
  const value = String(text || '');
  if (expanded || value.length <= OPTION_PREVIEW_LIMIT) {
    return value;
  }
  return value.slice(0, OPTION_PREVIEW_LIMIT) + '...';
}

function normalizeOptions(options, expandedMap) {
  const map = expandedMap || {};
  return (Array.isArray(options) ? options : []).map(function(option) {
    const optionId = String(option && (option.option_id || option.optionId) || '');
    const text = String(option && option.text || '');
    const expanded = Boolean(map[optionId]);
    return {
      optionId,
      text,
      displayText: formatOptionText(text, expanded),
      expanded,
      isLong: text.length > OPTION_PREVIEW_LIMIT
    };
  }).filter(function(option) {
    return option.optionId && option.text;
  });
}

function normalizeReviewItem(item, expandedMap) {
  if (!item) return null;
  return {
    raw: item,
    id: item.card_id,
    cardId: item.card_id,
    sessionItemId: item.session_item_id,
    questionId: item.question_id || '',
    englishText: item.content || '',
    category: getCardTypeLabel(item.card_type),
    myUnderstanding: item.understanding || '',
    whereEncountered: item.where_encountered || '',
    notes: item.note || '',
    isRepeat: Boolean(item.is_repeat),
    attemptNo: Number(item.attempt_no || 1),
    options: normalizeOptions(item.options || [], expandedMap || {})
  };
}

function normalizeProgress(progress) {
  return {
    reviewed: Math.max(Number(progress && progress.reviewed || 0), 0),
    total: Math.max(Number(progress && progress.total || 0), 0)
  };
}

function getErrorMessage(error, fallbackMessage) {
  const detail = error && error.data && error.data.detail;
  if (typeof detail === 'string' && detail) return detail;
  return fallbackMessage;
}

Page({
  data: {
    sessionId: '',
    currentSessionType: 'daily_suggested',
    reviewBatchSize: DEFAULT_REVIEW_BATCH_SIZE,
    progress: { reviewed: 0, total: 0 },
    currentItem: null,
    currentCard: null,
    pageState: 'loading',
    reviewError: '',
    submittingFeedback: false,
    selectedOptionId: '',
    optionExpanded: {},
    questionStartedAt: 0,
    displayCurrentNo: 0,
    displayTotal: 0,
    allDone: false,
    phoneticDisplay: '',
    lexicalInfoLoaded: false,
    pronunciationAvailable: false,
    pronunciationLoading: false,
    pronunciationPlaying: false,
    pronunciationVoice: DEFAULT_VOICE
  },

  onLoad(options) {
    this.pronunciationController = createPronunciationController(this);
    this.setData({ pronunciationVoice: getStoredVoice() });

    const sessionId = (options && (options.session_id || options.sessionId)) || '';
    const sessionType = (options && (options.session_type || options.sessionType)) || 'daily_suggested';
    this.setData({
      sessionId,
      currentSessionType: sessionType
    });
    this.loadBackendReviewSession({ sessionType });
  },

  onShow() {
    if (this._returningFromEdit) {
      this._returningFromEdit = false;
      this.loadBackendReviewSession({ sessionType: this.data.currentSessionType });
    }
  },

  onUnload() {
    if (this.pronunciationController) {
      this.pronunciationController.destroy();
      this.pronunciationController = null;
    }
  },

  loadLexicalInfoForCard(card) {
    if (!this.pronunciationController) return;
    this.pronunciationController.load(card && card.englishText ? card.englishText : '');
  },

  onPronunciationTap() {
    if (!this.pronunciationController || !this.data.currentCard) return;
    this.pronunciationController.play(this.data.currentCard.englishText || '');
  },

  onPronunciationLongPress() {
    if (!this.pronunciationController) return;
    this.pronunciationController.playDiagnosticTestAudio(false);
    setTimeout(() => {
      if (this.pronunciationController) {
        this.pronunciationController.playDiagnosticTestAudio(true);
      }
    }, 2000);
  },

  onVoiceSwitchMale() {
    if (!this.pronunciationController) return;
    this.pronunciationController.setVoice('male');
    this.setData({ pronunciationVoice: 'male' });
  },

  onVoiceSwitchFemale() {
    if (!this.pronunciationController) return;
    this.pronunciationController.setVoice('female');
    this.setData({ pronunciationVoice: 'female' });
  },

  async loadBackendReviewSession({ restart, sessionType } = {}) {
    const reviewBatchSize = getStoredReviewBatchSize();
    const effectiveSessionType = sessionType || this.data.currentSessionType || 'daily_suggested';
    this.setData({
      pageState: 'loading',
      reviewError: '',
      submittingFeedback: false,
      selectedOptionId: '',
      optionExpanded: {},
      reviewBatchSize
    });

    try {
      const response = await getTodayReview({
        limit: reviewBatchSize,
        restart: restart === true,
        session_type: effectiveSessionType
      });
      const items = Array.isArray(response && response.items) ? response.items : [];
      const currentItem = items[0] || null;
      const currentCard = normalizeReviewItem(currentItem, {});
      const progress = normalizeProgress(response && response.progress);
      const isDone = !currentCard;
      this.setData({
        sessionId: response && response.session_id ? response.session_id : this.data.sessionId,
        currentSessionType: effectiveSessionType,
        progress,
        currentItem,
        currentCard,
        pageState: isDone ? 'completed' : 'active',
        allDone: isDone,
        displayCurrentNo: currentCard ? progress.reviewed + 1 : 0,
        displayTotal: progress.total || items.length,
        questionStartedAt: currentCard ? Date.now() : 0
      });
      this.loadLexicalInfoForCard(currentCard);
    } catch (error) {
      this.setData({
        pageState: 'error',
        reviewError: getErrorMessage(error, '暂时无法加载复习题，请稍后重试'),
        currentItem: null,
        currentCard: null,
        allDone: false
      });
    }
  },

  async onOptionTap(event) {
    if (this.data.submittingFeedback) return;
    const optionId = event.currentTarget.dataset.optionId || '';
    const currentCard = this.data.currentCard;
    const currentItem = this.data.currentItem;
    const sessionId = this.data.sessionId;
    if (!optionId || !currentCard || !currentItem || !sessionId || !currentCard.questionId) return;

    const responseTimeMs = Math.max(Date.now() - Number(this.data.questionStartedAt || Date.now()), 0);
    this.setData({
      submittingFeedback: true,
      selectedOptionId: optionId,
      pageState: 'submitting'
    });

    try {
      const response = await submitReviewFeedback({
        client_action_id: generateClientActionId(),
        session_id: sessionId,
        session_item_id: currentItem.session_item_id,
        card_id: currentItem.card_id,
        question_id: currentCard.questionId,
        selected_option_id: optionId,
        response_time_ms: responseTimeMs
      });

      if (typeof response.is_correct === 'boolean') {
        wx.showToast({
          title: response.is_correct ? 'Correct' : 'Wrong',
          icon: 'none',
          duration: 700
        });
      }
      this.applyFeedbackResponse(response);
    } catch (error) {
      let message = getErrorMessage(error, '提交失败，请重试');
      if (message === 'stale_question') {
        wx.showToast({ title: '卡片已更新，正在重新加载', icon: 'none', duration: 1800 });
        this.loadBackendReviewSession({ sessionType: this.data.currentSessionType });
        return;
      }
      this.setData({
        submittingFeedback: false,
        selectedOptionId: '',
        pageState: 'active'
      });
      wx.showToast({ title: message, icon: 'none', duration: 2200 });
    }
  },

  applyFeedbackResponse(response) {
    const progress = normalizeProgress(response && response.progress);
    if (response && response.done) {
      this.setData({
        submittingFeedback: false,
        selectedOptionId: '',
        currentItem: null,
        currentCard: null,
        progress,
        pageState: 'completed',
        allDone: true,
        displayCurrentNo: 0,
        displayTotal: progress.total
      });
      this.loadLexicalInfoForCard(null);
      return;
    }

    const nextItem = response && response.next_item ? response.next_item : null;
    const nextCard = normalizeReviewItem(nextItem, {});
    this.setData({
      submittingFeedback: false,
      selectedOptionId: '',
      optionExpanded: {},
      currentItem: nextItem,
      currentCard: nextCard,
      progress,
      pageState: nextCard ? 'active' : 'completed',
      allDone: !nextCard,
      displayCurrentNo: nextCard ? progress.reviewed + 1 : 0,
      displayTotal: progress.total,
      questionStartedAt: nextCard ? Date.now() : 0
    });
    this.loadLexicalInfoForCard(nextCard);
  },

  toggleOptionExpand(event) {
    const optionId = event.currentTarget.dataset.optionId || '';
    const currentCard = this.data.currentCard;
    if (!optionId || !currentCard) return;
    const expanded = Object.assign({}, this.data.optionExpanded || {});
    expanded[optionId] = !expanded[optionId];
    const nextCard = Object.assign({}, currentCard, {
      options: normalizeOptions(currentCard.options || [], expanded)
    });
    this.setData({
      optionExpanded: expanded,
      currentCard: nextCard
    });
  },

  retryLoadReview() {
    this.loadBackendReviewSession({ sessionType: this.data.currentSessionType });
  },

  restartReviewSession() {
    this.loadBackendReviewSession({ restart: true, sessionType: this.data.currentSessionType });
  },

  editCurrentCard() {
    if (!this.data.currentCard || !this.data.currentCard.cardId) return;
    this._returningFromEdit = true;
    wx.navigateTo({
      url: `/pages/add/add?id=${this.data.currentCard.cardId}&from=review`
    });
  },

  goToAddPage() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  goToHomePage() {
    try { wx.setStorageSync('homeNeedsRefresh', true); } catch (e) { /* ignore */ }
    wx.navigateBack({ delta: 1 });
  },

  navigateToTodayReviewed() {
    wx.navigateTo({ url: '/pages/today_reviewed/today_reviewed?from=review_complete' });
  }
});
