const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');

Page({
  data: {
    safeTop: 20,
    size: 5,
    today: 0,
    sizes: [5, 10, 15],
    activeSessionId: '',
    loading: false,
    error: ''
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  onShow() { this.loadOverview(); },

  async loadOverview() {
    try {
      const overview = await api.reviews.getOverview();
      const goal = overview.goalProgress || {};
      const completed = overview.completedSuggested || {};
      const active = overview.activeSession || {};
      this.setData({
        today: Number(goal.completed_unique_today || goal.completedUniqueToday || completed.total_count || completed.totalCount || 0),
        activeSessionId: active.id || active.session_id || '',
        error: ''
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '复习信息加载失败') });
    }
  },

  chooseSize(e) { this.setData({ size: Number(e.currentTarget.dataset.size) }); },

  async start() {
    if (this.data.loading) return;
    if (this.data.activeSessionId) {
      wx.navigateTo({
        url: '/pages/review/review?session_id=' + this.data.activeSessionId + '&size=' + this.data.size
      });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const session = await api.reviews.createSession({
        session_type: 'free_review',
        limit: this.data.size,
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
        url: '/pages/review/review?session_id=' + session.sessionId + '&size=' + this.data.size
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

  openLibrary() { wx.switchTab({ url: '/pages/library/index' }); },
  openDiscover() { wx.navigateTo({ url: '/pages/discover/index' }); }
});

