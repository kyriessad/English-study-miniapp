const api = require('../../utils/api/index');
const {
  newClientActionId,
  toWordbookStudyView,
  errorMessage
} = require('../../utils/coreViewModels');
const {
  createPronunciationController,
  getStoredVoice,
  DEFAULT_VOICE
} = require('../../utils/pronunciation');
const { searchFreeExample } = require('../../utils/apiClient');

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightWord(sentence, word) {
  const text = String(sentence || '');
  const target = String(word || '').trim();
  if (!text) return [];
  if (!target) return [{ text, hit: false }];
  const parts = [];
  const matcher = new RegExp(escapeRegExp(target), 'ig');
  let lastIndex = 0;
  let match = matcher.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), hit: false });
    }
    parts.push({ text: match[0], hit: true });
    lastIndex = match.index + match[0].length;
    match = matcher.exec(text);
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

const BOOK_MARKS = { cet4: 'CET4', cet6: 'CET6', postgraduate: '考研', ielts: 'IELTS', toefl: 'TOEFL' };
const CORRECT_ADVANCE_DELAY_MS = 650;
const WRONG_FEEDBACK_DURATION_MS = 1000;

Page({
  data: {
    safeTop: 20,
    bookCode: '',
    bookLabel: '',
    sessionId: '',
    resumeToken: '',
    current: null,
    currentNo: 1,
    total: 0,
    selectedOptionId: '',
    answered: false,
    isCorrect: false,
    showExamplePrompt: false,
    exampleLoading: false,
    exampleSentence: '',
    exampleTranslation: '',
    exampleParts: [],
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
    this.bookCode = String(options.code || '');
    this.sessionId = String(options.session_id || '');
    this.setData({
      safeTop: info.statusBarHeight || 20,
      menuRightInset,
      bookCode: this.bookCode,
      bookLabel: BOOK_MARKS[this.bookCode] || this.bookCode.toUpperCase(),
      pronunciationVoice: getStoredVoice()
    });
    this.loadSession();
  },

  onShow() {
    this.pageHidden = false;
    if (this.needsDetail) { this.openDetail(); return; }
    if (this.data.awaitingNext) this.scheduleAdvance();
    if (!this.data.detailReturnPending) return;
    this.continueAfterDetail();
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

  applyCurrent(current, extra) {
    const showExamplePrompt = Boolean(current && current.itemKind === 'new' && Number(current.attemptNo || 1) === 1);
    this.setData(Object.assign({
      current,
      showExamplePrompt,
      exampleLoading: showExamplePrompt,
      exampleSentence: '',
      exampleTranslation: '',
      exampleParts: []
    }, extra || {}), () => {
      this.loadPronunciation(current);
      if (showExamplePrompt) this.loadExample(current);
    });
  },

  async loadExample(current) {
    if (!current || !current.en) {
      this.setData({ exampleLoading: false });
      return;
    }
    try {
      const result = await searchFreeExample(current.en);
      if (!this.data.current || this.data.current.id !== current.id) return;
      if (this.isPageUnloaded) return;
      const sentence = result && (result.exampleSentence || result.example_sentence) || '';
      this.setData({
        exampleLoading: false,
        exampleSentence: sentence,
        exampleTranslation: result && (result.exampleTranslation || result.example_translation) || '',
        exampleParts: highlightWord(sentence, current.en)
      });
    } catch (_) {
      if (!this.data.current || this.data.current.id !== current.id) return;
      this.setData({ exampleLoading: false, exampleParts: [] });
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
        session = await api.wordbooks.getReviewSession(this.sessionId);
      } else {
        session = await api.wordbooks.createReviewSession(this.bookCode, { restart: false });
        this.sessionId = session.sessionId;
      }
      const current = toWordbookStudyView(session.currentItem);
      if (!session.sessionId || session.status === 'empty' || !current) {
        this.setData({ loading: false, empty: true });
        return;
      }
      this.bookCode = session.bookCode || this.bookCode;
      this.applyCurrent(current, {
        sessionId: session.sessionId,
        resumeToken: session.resumeToken || '',
        bookCode: this.bookCode,
        bookLabel: BOOK_MARKS[this.bookCode] || this.bookCode.toUpperCase(),
        total: Number(session.progress.total || 0),
        currentNo: Math.min(Number(session.progress.completed || 0), Number(session.progress.total || 0)) + 1,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '学习任务加载失败') });
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

  async submitAnswer(optionId) {
    const current = this.data.current;
    if (!current || !optionId) return;
    const payload = this.pendingSubmission || {
      client_action_id: newClientActionId('wordbook-review'),
      session_item_id: current.sessionItemId,
      question_token: current.questionToken,
      selected_option_id: optionId
    };
    this.pendingSubmission = payload;
    this.setData({ submitting: true, selectedOptionId: payload.selected_option_id, error: '', submissionError: '' });
    try {
      const result = await api.wordbooks.submitReviewAnswer(this.data.sessionId, payload);
      this.pendingSubmission = null;
      const nextItem = toWordbookStudyView(result.currentItem);
      const isCorrect = result.isCorrect === true;
      if (isCorrect) {
        const recapItem = Object.assign({}, current, {
          resultType: current.wrongCount > 1 ? 'detail' : (current.wrongCount === 1 ? 'hint' : 'direct')
        });
        this.triggerFeedbackHaptic();
        this.setData({
          answered: true,
          isCorrect: true,
          awaitingNext: true,
          pendingNext: nextItem,
          done: result.status === 'completed' || result.transition === 'completed',
          recapItems: this.data.recapItems.concat(recapItem)
        }, () => this.scheduleAdvance());
        return;
      }
      this.triggerFeedbackHaptic();
      this.setData({
        answered: true,
        isCorrect: false,
        awaitingNext: false,
        pendingNext: nextItem,
        done: result.status === 'completed'
      });
      if (result.navigation === 'detail' || result.transition === 'wrong_detail' || result.transition === 'wrong_first') {
        this.needsDetail = true;
        this.detailTimer = setTimeout(() => { if (!this.isPageUnloaded && !this.pageHidden) this.openDetail(current); }, Number(result.detailDelayMs || 150));
        return;
      }
      wx.showToast({ title: '答错了，再想想', icon: 'none', duration: WRONG_FEEDBACK_DURATION_MS });
      this.clearWrongFeedbackTimer();
      this.wrongFeedbackTimer = setTimeout(() => {
        this.wrongFeedbackTimer = null;
        if (this.isPageUnloaded) return;
        this.continueAfterDetail();
      }, WRONG_FEEDBACK_DURATION_MS);
    } catch (error) {
      this.setData({ submissionError: errorMessage(error, '网络中断，本次作答尚未确认。请重试提交。') });
    } finally {
      this.setData({ submitting: false });
    }
  },

  retrySubmission() {
    if (this.pendingSubmission && !this.data.submitting) this.submitAnswer(this.pendingSubmission.selected_option_id);
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
    try { wx.vibrateShort({ type: 'light' }); } catch (_) {}
  },

  scheduleAdvance() {
    this.clearAdvanceTimer();
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      if (!this.pageHidden && !this.isPageUnloaded && this.data.answered && this.data.isCorrect) this.next();
    }, CORRECT_ADVANCE_DELAY_MS);
  },

  next() {
    if (!this.data.answered) return;
    if (this.data.done || !this.data.pendingNext) {
      this.finishReview();
      return;
    }
    const nextCurrent = this.data.pendingNext;
    this.applyCurrent(nextCurrent, {
      currentNo: Math.min(this.data.currentNo + 1, this.data.total),
      selectedOptionId: '',
      answered: false,
      isCorrect: false,
      awaitingNext: false,
      pendingNext: null
    });
  },

  openDetail(item) {
    this.needsDetail = false;
    const target = item || this.data.current;
    if (!target) return;
    this.setData({ detailReturnPending: true });
    wx.navigateTo({
      url: '/pages/library/detail?id=' + target.id + '&source=public&from=wordbook&book=' + encodeURIComponent(this.bookCode) + '&fromReview=1'
    });
  },

  continueAfterDetail() {
    if (this.data.current && this.data.current.flowState === 'in_detail') {
      this.returnFromDetail();
      return;
    }
    this.setData({ detailReturnPending: false });
    if (this.data.done || !this.data.pendingNext) {
      this.finishReview();
      return;
    }
    const nextCurrent = this.data.pendingNext;
    this.applyCurrent(nextCurrent, {
      currentNo: Math.min(this.data.currentNo + 1, this.data.total),
      selectedOptionId: '',
      answered: false,
      isCorrect: false,
      awaitingNext: false,
      pendingNext: null
    });
  },

  async returnFromDetail() {
    const current = this.data.current;
    if (!current || !this.data.resumeToken || this.data.submitting) return;
    this.setData({ submitting: true, returnError: '' });
    try {
      const session = await api.wordbooks.returnFromReviewDetail(this.data.sessionId, {
        client_action_id: newClientActionId('wordbook-detail-return'),
        session_item_id: current.sessionItemId,
        resume_token: this.data.resumeToken
      });
      const returnedCurrent = toWordbookStudyView(session.currentItem);
      this.applyCurrent(returnedCurrent || this.data.pendingNext, {
        resumeToken: session.resumeToken || this.data.resumeToken,
        detailReturnPending: false,
        answered: false,
        selectedOptionId: '',
        awaitingNext: false,
        pendingNext: null,
        done: session.status === 'completed'
      });
      if (session.status === 'completed' && !returnedCurrent) this.finishReview();
    } catch (error) {
      this.setData({ returnError: errorMessage(error, '当前题恢复失败，请重试') });
    } finally {
      this.setData({ submitting: false });
    }
  },

  finishReview() {
    wx.setStorageSync('wordbookStudyRecap', {
      items: this.data.recapItems,
      total: this.data.recapItems.length,
      bookCode: this.bookCode
    });
    wx.redirectTo({ url: '/pages/wordbooks/recap?code=' + encodeURIComponent(this.bookCode) });
  },

  exit() {
    this.clearAdvanceTimer();
    wx.navigateBack({ delta: 1, fail() { wx.navigateTo({ url: '/pages/wordbooks/index' }); } });
  }
});
