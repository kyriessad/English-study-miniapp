const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');
const { attachTabPage } = require('../../utils/tabChrome');
const { dailyGoal, overviewView } = require('../../utils/reviewOverview');

Page({
  data: {
    safeTop: 20,
    today: 0,
    activeSessionId: '',
    loading: false,
    error: '',
    overviewLoading: true,
    overviewReady: false,
    hasReviewable: true,
    reviewCount: 0,
    newCount: 0,
    goalMet: false,
    reviewHeading: '让想记住的英语留下来',
    reviewAction: '开始今日复习',
    tabEnter: false
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  onShow() {
    attachTabPage(this, 1);
    this.loadOverview();
  },

  async loadOverview() {
    this.setData({ overviewLoading: true, error: '' });
    try {
      const overview = await api.reviews.getOverview({ daily_goal: dailyGoal() });
      this.setData(overviewView(overview));
    } catch (error) {
      this.setData({ error: errorMessage(error, '复习信息加载失败') });
    } finally {
      this.setData({ overviewLoading: false });
    }
  },

  reviewLimit() {
    try {
      const n = Number(wx.getStorageSync('dailyGoal'));
      if ([3, 5, 10, 15].indexOf(n) !== -1) return n;
    } catch (_) {}
    return 5;
  },

  async start() {
    if (this.data.loading || this.data.overviewLoading) return;
    if (this.data.overviewReady && !this.data.hasReviewable && !this.data.activeSessionId) {
      this.openDiscover();
      return;
    }
    const size = this.reviewLimit();
    if (this.data.activeSessionId) {
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + this.data.activeSessionId + '&size=' + size
      });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const session = await api.reviews.createSession({
        session_type: this.data.goalMet ? 'free_review' : 'daily_suggested',
        daily_goal: dailyGoal(),
        limit: size,
        restart: false
      });
      if (!session.sessionId || (!session.items.length && !session.currentItem)) {
        wx.showModal({
          title: '还没有可复习的英语',
          content: '先添加一条英语内容，或者从公开素材中挑选想记住的内容。',
          confirmText: '去添加',
          cancelText: '看看素材',
          success: (result) => {
            if (result.confirm) wx.navigateTo({ url: '/pages/add/add' });
            else wx.navigateTo({ url: '/pages/discover/index' });
          }
        });
        return;
      }
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + session.sessionId + '&size=' + size
      });
    } catch (error) {
      const message = errorMessage(error, '开始复习失败，请重试');
      if (/no review|没有|empty/i.test(message)) {
        wx.showToast({ title: '还没有可复习的英语', icon: 'none' });
      } else {
        this.setData({ error: message || '开始复习失败，请重试' });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  openHome() { wx.switchTab({ url: '/pages/index/index' }); },
  openLibrary() { wx.switchTab({ url: '/pages/library/index' }); },
  openWordbooks() { wx.navigateTo({ url: '/pages/wordbooks/index' }); },
  openDiscover() { wx.navigateTo({ url: '/pages/discover/index' }); },
  openToday() { wx.navigateTo({ url: '/pages/today_reviewed/today_reviewed' }); },
  openHistory() { wx.navigateTo({ url: '/pages/history_reviewed/history_index' }); }
});
