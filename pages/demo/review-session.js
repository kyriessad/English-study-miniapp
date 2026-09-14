const api = require('../../utils/api/index');
const {
  newClientActionId,
  toReviewView,
  errorMessage
} = require('../../utils/coreViewModels');

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
    showDetailNotice: false,
    awaitingNext: false,
    detailReturnPending: false,
    pendingNext: null,
    done: false,
    submitting: false,
    loading: true,
    error: '',
    recapItems: []
  },

  onLoad(options) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.requestedSize = Number(options.size || 5);
    this.sessionId = String(options.session_id || '');
    this.setData({ safeTop: info.statusBarHeight || 20 });
    this.loadSession();
  },

  onShow() {
    if (this.data.detailReturnPending) this.returnFromDetail();
  },

  async loadSession() {
    this.setData({ loading: true, error: '' });
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
        this.setData({ loading: false });
        wx.showModal({
          title: '还没有可复习的英语',
          content: '先添加一条英语内容，或者从公开素材加入我的英语。',
          confirmText: '去添加',
          success: (result) => {
            if (result.confirm) wx.navigateTo({ url: '/pages/demo/add' });
            else wx.navigateBack({ delta: 1 });
          }
        });
        return;
      }
      this.setData({
        sessionId: session.sessionId,
        resumeToken: session.resumeToken || '',
        current,
        total: Number(session.progress.total || 0),
        currentNo: Math.min(Number(session.progress.reviewed || 0), Number(session.progress.total || 0)) + 1,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '复习加载失败') });
    }
  },

  retryLoad() { this.loadSession(); },

  choose(e) {
    if (this.data.answered || this.data.submitting) return;
    this.submitAnswer(String(e.currentTarget.dataset.optionId || ''));
  },

  unknown() {
    if (this.data.answered || this.data.submitting) return;
    this.submitAnswer('unknown');
  },

  async submitAnswer(optionId) {
    const current = this.data.current;
    if (!current || !optionId) return;
    const payload = this.pendingSubmission || {
      client_action_id: newClientActionId('personal-review'),
      session_id: this.data.sessionId,
      session_item_id: current.sessionItemId,
      card_id: current.id,
      question_id: current.questionId,
      selected_option_id: optionId
    };
    this.pendingSubmission = payload;
    this.setData({ submitting: true, selectedOptionId: optionId, error: '' });
    try {
      const result = await api.reviews.submitFeedback(payload);
      this.pendingSubmission = null;
      const nextItem = toReviewView(result.next_item);
      const isCorrect = result.is_correct === true;
      if (isCorrect) {
        const recapItem = Object.assign({}, current, {
          resultType: current.wrongCount > 1 ? 'detail' : (current.wrongCount === 1 ? 'hint' : 'direct')
        });
        this.setData({
          answered: true,
          isCorrect: true,
          showExample: false,
          awaitingNext: true,
          pendingNext: nextItem,
          done: !!result.done || result.transition === 'completed',
          recapItems: this.data.recapItems.concat(recapItem)
        });
        return;
      }
      if (result.transition === 'wrong_detail' || result.navigation === 'detail') {
        this.setData({
          current: nextItem || current,
          answered: true,
          isCorrect: false,
          showExample: false,
          awaitingNext: false
        });
        setTimeout(() => this.openDetail(), Number(result.detail_delay_ms || 150));
        return;
      }
      this.setData({
        current: nextItem || current,
        answered: true,
        isCorrect: false,
        showExample: true,
        showDetailNotice: false,
        awaitingNext: false
      });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '提交失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  next() {
    if (!this.data.answered) return;
    if (this.data.showExample) {
      this.setData({
        answered: false,
        selectedOptionId: '',
        showExample: false,
        showDetailNotice: false
      });
      return;
    }
    if (this.data.done || !this.data.pendingNext) {
      this.finishReview();
      return;
    }
    this.setData({
      current: this.data.pendingNext,
      currentNo: Math.min(this.data.currentNo + 1, this.data.total),
      selectedOptionId: '',
      answered: false,
      isCorrect: false,
      awaitingNext: false,
      pendingNext: null
    });
  },

  openDetail() {
    const current = this.data.current;
    if (!current) return;
    this.setData({ detailReturnPending: true });
    wx.navigateTo({
      url: '/pages/demo/detail?id=' + current.id + '&source=personal&fromReview=1'
    });
  },

  async returnFromDetail() {
    const current = this.data.current;
    if (!current || !this.data.resumeToken || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const session = await api.reviews.returnFromDetail(this.data.sessionId, {
        client_action_id: newClientActionId('review-detail-return'),
        session_item_id: current.sessionItemId,
        resume_token: this.data.resumeToken
      });
      this.setData({
        current: toReviewView(session.currentItem),
        resumeToken: session.resumeToken || this.data.resumeToken,
        detailReturnPending: false,
        answered: false,
        selectedOptionId: '',
        showDetailNotice: true,
        awaitingNext: false
      });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, '返回当前题失败，请重试'), icon: 'none' });
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
    wx.redirectTo({ url: '/pages/demo/review-recap' });
  },

  exit() { wx.navigateBack({ delta: 1 }); }
});
