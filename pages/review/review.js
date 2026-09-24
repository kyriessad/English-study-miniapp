const api = require('../../utils/api/index');
const {
  newClientActionId,
  toReviewView,
  errorMessage
} = require('../../utils/coreViewModels');
const {
  createPronunciationController,
  getStoredVoice,
  DEFAULT_VOICE
} = require('../../utils/pronunciation');

const CORRECT_ADVANCE_DELAY_MS = 1400;
const WRONG_FEEDBACK_DURATION_MS = 1000;

Page({
  data: {
    safeTop: 20,
    sessionId: '',
    resumeToken: '',
    current: null,
    currentNo: 1,
    total: 0,
    selectedOptionId: '',
    answered: false,
    isCorrect: false,
    showExample: false,
    awaitingNext: false,
    detailReturnPending: false,
    pendingNext: null,
    done: false,
    submitting: false,
    phoneticDisplay: '',
    lexicalInfoLoaded: false,
    lexicalInfoLoading: false,
    pronunciationAvailable: false,
    pronunciationLoading: false,
    pronunciationPlaying: false,
    pronunciationVoice: DEFAULT_VOICE,
    loading: true,
    empty: false,
    error: '',
    submissionError: '',
    returnError: '',
    recapItems: []
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    const menuRightInset = menu && menu.left ? Math.max(0, (info.windowWidth || 375) - menu.left + 8) : 100;
    this.isPageUnloaded = false;
    this.pronunciationController = createPronunciationController(this);
    this.requestedSize = Number(options.size || 5);
    this.sessionId = String(options.session_id || '');
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      pronunciationVoice: getStoredVoice()
    });
    this.loadSession();
  },

  onShow() {
    this.pageHidden = false;
    if (this.needsDetail) { this.openDetail(); return; }
    if (this.data.awaitingNext) this.scheduleAdvance();
    if (!this.data.detailReturnPending) return;
    this.returnFromDetail();
  },

  onHide() {
    this.pageHidden = true;
    this.clearAdvanceTimer();
    if (this.detailTimer) { clearTimeout(this.detailTimer); this.detailTimer = null; }
  },

  onUnload() {
    this.isPageUnloaded = true;
    if (this.detailTimer) clearTimeout(this.detailTimer);
    this.clearAdvanceTimer();
    this.clearWrongFeedbackTimer();
    if (this.pronunciationController) {
      this.pronunciationController.destroy();
      this.pronunciationController = null;
    }
  },

  loadPronunciation(current) {
    if (!this.pronunciationController) return;
    this.pronunciationController.load(current ? current.en : '');
  },

  onPronunciationTap() {
    const current = this.data.current;
    if (!this.pronunciationController || !current) return;
    this.pronunciationController.play(current.en);
  },

  async loadSession() {
    this.setData({ loading: true, error: '', empty: false });
    try {
      let session;
      if (this.sessionId) {
        session = await api.reviews.getSession(this.sessionId);
      } else {
        session = await api.reviews.createSession({
          session_type: 'free_review',
          limit: this.requestedSize,
          restart: false
        });
        this.sessionId = session.sessionId;
      }
      const current = toReviewView(session.currentItem || session.items[0]);
      if (!session.sessionId || !current) {
        this.setData({ loading: false, empty: true });
        return;
      }
      this.setData({
        sessionId: session.sessionId,
        resumeToken: session.resumeToken || '',
        current,
        total: Number(session.progress.total || 0),
        currentNo: Math.min(Number(session.progress.reviewed || 0), Number(session.progress.total || 0)) + 1,
        loading: false
      }, () => {
        this.loadPronunciation(current);
        if (current.flowState === 'in_detail') this.openDetail();
      });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '复习加载失败') });
    }
  },

  retryLoad() { this.loadSession(); },

  choose(e) {
    if (this.data.answered || this.data.submitting || this.data.submissionError || this.data.returnError) return;
    this.submitAnswer(String(e.currentTarget.dataset.optionId || ''));
  },

  unknown() {
    if (this.data.answered || this.data.submitting || this.data.submissionError || this.data.returnError) return;
    this.submitAnswer('unknown');
  },

  chooseLegacy(e) {
    if (this.data.answered || this.data.submitting || this.data.submissionError || this.data.returnError) return;
    const result = String(e.currentTarget.dataset.result || '');
    if (['forgot', 'shaky', 'got_it', 'fluent'].includes(result)) this.submitAnswer('legacy:' + result);
  },

  async submitAnswer(optionId) {
    const current = this.data.current;
    if (!current || !optionId) return;
    const legacyResult = optionId === 'unknown' ? 'forgot' : (optionId.indexOf('legacy:') === 0 ? optionId.slice(7) : null);
    if (this.pendingSubmission && this.pendingSubmission.selected_option_id === 'unknown') this.pendingSubmission = null;
    if (this.pendingSubmission && !this.pendingSubmission.question_id) delete this.pendingSubmission.question_id;
    const payload = this.pendingSubmission || {
      client_action_id: newClientActionId('personal-review'),
      session_id: this.data.sessionId,
      session_item_id: current.sessionItemId,
      card_id: current.id,
      selected_option_id: legacyResult ? null : optionId,
      result: legacyResult
    };
    if (!this.pendingSubmission && current.questionId) payload.question_id = current.questionId;
    this.pendingSubmission = payload;
    this.setData({ submitting: true, selectedOptionId: optionId, error: '', submissionError: '' });
    try {
      const result = await api.reviews.submitFeedback(payload);
      this.pendingSubmission = null;
      const nextItem = toReviewView(result.next_item);
      const isCorrect = result.is_correct === true;
      if (isCorrect) {
        const recapItem = Object.assign({}, current, {
          resultType: current.sawDetail || current.wrongCount > 1
            ? 'detail'
            : (current.wrongCount === 1 ? 'hint' : 'direct')
        });
        this.triggerFeedbackHaptic();
        this.setData({
          answered: true,
          isCorrect: true,
          showExample: false,
          awaitingNext: true,
          pendingNext: nextItem,
          done: !!result.done || result.transition === 'completed',
          recapItems: this.data.recapItems.concat(recapItem)
        }, () => this.scheduleAdvance());
        return;
      }
      if (result.transition === 'wrong_detail' || result.navigation === 'detail') {
        this.triggerFeedbackHaptic();
        this.setData({
          current: nextItem || current,
          resumeToken: result.resume_token || this.data.resumeToken,
          answered: true,
          isCorrect: false,
          showExample: false,
          awaitingNext: false
        });
        this.needsDetail = true;
        this.detailTimer = setTimeout(() => { if (!this.isPageUnloaded && !this.pageHidden) this.openDetail(); }, Number(result.detail_delay_ms || 150));
        return;
      }
      const wrongCurrent = nextItem || current;
      this.triggerFeedbackHaptic();
      this.setData({
        answered: true,
        isCorrect: false,
        showExample: !!current.example,
        awaitingNext: false
      });
      wx.showToast({ title: '答错了，再想想', icon: 'none', duration: WRONG_FEEDBACK_DURATION_MS });
      this.clearWrongFeedbackTimer();
      this.wrongFeedbackTimer = setTimeout(() => {
        this.wrongFeedbackTimer = null;
        if (this.isPageUnloaded) return;
        this.setData({
          current: wrongCurrent,
          selectedOptionId: '',
          answered: false,
          showExample: !!wrongCurrent.example
        });
      }, WRONG_FEEDBACK_DURATION_MS);
    } catch (error) {
      this.setData({ submissionError: errorMessage(error, '提交失败，请重试这次作答') });
    } finally {
      this.setData({ submitting: false });
    }
  },

  retrySubmission() {
    if (this.pendingSubmission && !this.data.submitting) this.submitAnswer(this.pendingSubmission.result ? 'legacy:' + this.pendingSubmission.result : this.pendingSubmission.selected_option_id);
  },

  clearAdvanceTimer() {
    if (!this.advanceTimer) return;
    clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
  },

  clearWrongFeedbackTimer() {
    if (!this.wrongFeedbackTimer) return;
    clearTimeout(this.wrongFeedbackTimer);
    this.wrongFeedbackTimer = null;
  },

  triggerFeedbackHaptic() {
    if (typeof wx.vibrateShort !== 'function') return;
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (_) {
      // Some simulator and older-device environments do not support haptics.
    }
  },

  scheduleAdvance() {
    this.clearAdvanceTimer();
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      if (!this.pageHidden && !this.isPageUnloaded && this.data.answered && this.data.isCorrect) this.next();
    }, CORRECT_ADVANCE_DELAY_MS);
  },

  next() {
    if (!this.data.answered || !this.data.isCorrect) return;
    this.clearAdvanceTimer();
    if (this.data.done || !this.data.pendingNext) {
      this.finishReview();
      return;
    }
    const nextCurrent = this.data.pendingNext;
    this.setData({
      current: nextCurrent,
      currentNo: Math.min(this.data.currentNo + 1, this.data.total),
      selectedOptionId: '',
      answered: false,
      isCorrect: false,
      showExample: false,
      awaitingNext: false,
      pendingNext: null
    }, () => this.loadPronunciation(nextCurrent));
  },

  openDetail() {
    this.needsDetail = false;
    const current = this.data.current;
    if (!current) return;
    this.setData({
      detailReturnPending: true
    });
    wx.navigateTo({
      url: '/pages/library/detail?id=' + current.id + '&source=personal&fromReview=1'
    });
  },

  async returnFromDetail() {
    const current = this.data.current;
    if (!current || this.data.submitting) return;
    this.setData({ submitting: true, returnError: '' });
    try {
      let resumeToken = this.data.resumeToken;
      if (!resumeToken) {
        const activeSession = await api.reviews.getSession(this.data.sessionId);
        resumeToken = activeSession.resumeToken || '';
        if (resumeToken) this.setData({ resumeToken });
      }
      if (!resumeToken) throw new Error('无法恢复本轮复习，请退出后重新开始');
      const session = await api.reviews.returnFromDetail(this.data.sessionId, {
        client_action_id: newClientActionId('review-detail-return'),
        session_item_id: current.sessionItemId,
        resume_token: resumeToken
      });
      const returnedCurrent = toReviewView(session.currentItem);
      this.setData({
        current: returnedCurrent,
        resumeToken: session.resumeToken || resumeToken,
        detailReturnPending: false,
        answered: false,
        selectedOptionId: '',
        showExample: false,
        awaitingNext: false
      }, () => this.loadPronunciation(returnedCurrent));
    } catch (error) {
      this.setData({ returnError: errorMessage(error, '当前题恢复失败，请重试') });
    } finally {
      this.setData({ submitting: false });
    }
  },

  finishReview() {
    wx.setStorageSync('coreReviewRecap', {
      items: this.data.recapItems,
      total: this.data.recapItems.length,
      size: this.requestedSize
    });
    wx.redirectTo({ url: '/pages/review/recap' });
  },

  exit() {
    this.clearAdvanceTimer();
    wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/review/index' }); } });
  }
});
