const { getReviewOverview, createReviewSession, getTodayReviewed } = require('../../utils/apiClient');

const OVERVIEW_CACHE_KEY = 'reviewOverviewCache';
const TODAY_REVIEWED_CACHE_KEY = 'todayReviewedCache';

Page({
  data: {
    loading: true,
    offline: false,
    loadFailed: false,

    totalToday: 0,
    completedToday: 0,
    remaining: 0,
    isAllDone: false,
    activeSession: null,

    state: 'loading',
    stateLabel: '',
    stateSub: '',

    mainButtonLabel: '',
    mainButtonDisabled: false,

    todayReviewedEnabled: false,
    todayReviewedLabel: '今日已复习内容',

    masteredCount: 0,
    consolidateCount: 0
  },

  onLoad() {
    this._fetch();
  },

  async _fetch() {
    this.setData({ loading: true, offline: false, loadFailed: false });

    try {
      const overview = await getReviewOverview();
      wx.setStorageSync(OVERVIEW_CACHE_KEY, overview);
      this._applyOverview(overview, false);
    } catch (_) {
      const cached = wx.getStorageSync(OVERVIEW_CACHE_KEY);
      if (cached && typeof cached === 'object') {
        this._applyOverview(cached, true);
      } else {
        this.setData({
          loading: false,
          loadFailed: true,
          state: 'offline_empty'
        });
      }
    }
  },

  _applyOverview(overview, offline) {
    const suggested = (overview && overview.suggested) ? overview.suggested : {};
    const completed = (overview && overview.completed_suggested) ? overview.completed_suggested : {};

    const totalToday = Number(suggested.total_count || 0);
    const completedToday = Number(completed.total_count || 0);
    const remaining = Math.max(totalToday - completedToday, 0);
    const isAllDone = !!(overview && overview.is_all_done);
    const activeSession = (overview && overview.active_session) || null;

    let state, stateLabel, stateSub, mainButtonLabel, mainButtonDisabled;
    let todayReviewedEnabled = completedToday > 0;
    const todayReviewedLabel = completedToday > 0 ? '今日已复习内容' : '暂无复习内容';

    // Phase 6O-2A: Empty state — no tasks at all today
    if (!offline && totalToday === 0) {
      state = 'empty';
      stateLabel = '今天还没有复习任务';
      stateSub = '可以返回首页添加卡片，或开始学习已有卡片';
      mainButtonLabel = '返回首页';
      mainButtonDisabled = false;
    } else if (offline && totalToday === 0) {
      state = 'empty';
      stateLabel = '今天还没有复习任务';
      stateSub = '可以返回首页添加卡片，或开始学习已有卡片';
      mainButtonLabel = '返回首页';
      mainButtonDisabled = false;
      todayReviewedEnabled = false;
    } else if (offline) {
      state = 'offline_cached';
      stateLabel = '今日任务 ' + totalToday + ' 张卡片';

      if (completedToday >= totalToday && totalToday > 0) {
        stateSub = '今日复习了 ' + completedToday + ' 张卡片';
        mainButtonLabel = '继续复习';
        mainButtonDisabled = true;
      } else if (completedToday > 0) {
        stateSub = '今日已完成 ' + completedToday + ' 张，还有 ' + remaining + ' 张待复习';
        mainButtonLabel = '继续复习';
        mainButtonDisabled = true;
      } else {
        stateSub = '还未开始复习';
        mainButtonLabel = '开始复习';
        mainButtonDisabled = true;
      }
    } else if (isAllDone || (totalToday > 0 && completedToday >= totalToday)) {
      state = 'all_done';
      stateLabel = '今日任务完成';
      stateSub = '今日复习了 ' + completedToday + ' 张卡片';
      mainButtonLabel = '继续复习';
      mainButtonDisabled = false;
      this._fetchResultBreakdown();
    } else if (completedToday > 0 && completedToday < totalToday) {
      state = 'in_progress';
      stateLabel = completedToday + ' / ' + totalToday;
      stateSub = '今日进度';
      mainButtonLabel = '继续复习';
      mainButtonDisabled = false;
    } else {
      state = 'not_started';
      stateLabel = '今日任务 ' + totalToday + ' 张卡片';
      stateSub = '还未开始复习';
      mainButtonLabel = '开始复习';
      mainButtonDisabled = false;
    }

    this.setData({
      loading: false,
      offline,
      loadFailed: false,

      totalToday,
      completedToday,
      remaining,
      isAllDone,
      activeSession,

      state,
      stateLabel,
      stateSub,

      mainButtonLabel,
      mainButtonDisabled,

      todayReviewedEnabled,
      todayReviewedLabel
    });
  },

  async _fetchResultBreakdown() {
    try {
      const res = await getTodayReviewed();
      const items = (res && res.items) ? res.items : [];
      this._applyResultBreakdown(items);
    } catch (_) {
      const cached = wx.getStorageSync(TODAY_REVIEWED_CACHE_KEY) || [];
      if (Array.isArray(cached) && cached.length > 0) {
        this._applyResultBreakdownFromCache(cached);
      } else {
        this.setData({ masteredCount: 0, consolidateCount: 0 });
      }
    }
  },

  _applyResultBreakdown(items) {
    let mastered = 0;
    let consolidate = 0;
    for (let i = 0; i < items.length; i++) {
      const result = items[i].last_result || '';
      if (result === 'got_it' || result === 'fluent') {
        mastered++;
      } else if (result === 'forgot' || result === 'shaky') {
        consolidate++;
      }
    }
    this.setData({ masteredCount: mastered, consolidateCount: consolidate });
  },

  _applyResultBreakdownFromCache(cached) {
    let mastered = 0;
    let consolidate = 0;
    for (let i = 0; i < cached.length; i++) {
      const result = cached[i].lastResult || '';
      if (result === 'got_it' || result === 'fluent') {
        mastered++;
      } else if (result === 'forgot' || result === 'shaky') {
        consolidate++;
      }
    }
    this.setData({ masteredCount: mastered, consolidateCount: consolidate });
  },

  onMainButtonTap() {
    const { state, offline } = this.data;

    // Phase 6O-2A: Empty state — go home to add cards or start learning
    if (state === 'empty') {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    // Phase 6O-2A: All done — go home for extra learning
    if (state === 'all_done') {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    if (offline) {
      wx.showToast({ title: '当前无网络，请联网后继续', icon: 'none' });
      return;
    }

    this._startReview();
  },

  async _startReview() {
    const activeSession = this.data.activeSession;

    if (activeSession) {
      const sessionId = activeSession.id || activeSession.session_id || '';
      const sessionType = activeSession.session_type || 'daily_suggested';
      if (sessionId) {
        wx.navigateTo({
          url: '/pages/review/review?session_id=' + sessionId + '&session_type=' + sessionType
        });
        return;
      }
    }

    wx.showLoading({ title: '准备复习中...', mask: true });

    const chain = ['daily_suggested', 'new_only', 'free_review'];

    for (let i = 0; i < chain.length; i++) {
      const sessionType = chain[i];

      try {
        const result = await createReviewSession({ session_type: sessionType, limit: 5 });
        const sessionId = (result && (result.session_id || result.id)) ||
          (result && result.data && (result.data.session_id || result.data.id)) || '';
        const items = (result && result.items) || (result && result.data && result.data.items) || [];

        if (sessionId && Array.isArray(items) && items.length > 0) {
          wx.hideLoading();
          wx.navigateTo({
            url: '/pages/review/review?session_id=' + sessionId + '&session_type=' + sessionType
          });
          return;
        }
      } catch (_) {
        wx.hideLoading();
        wx.showToast({ title: '当前无网络，请联网后继续', icon: 'none' });
        return;
      }
    }

    wx.hideLoading();
    wx.showToast({ title: '暂无复习任务', icon: 'none' });
  },

  _navigateToTodayReviewed() {
    wx.navigateTo({ url: '/pages/today_reviewed/today_reviewed' });
  },

  onTodayReviewedTap() {
    if (!this.data.todayReviewedEnabled) return;
    this._navigateToTodayReviewed();
  },

  onHistoryTap() {
    wx.navigateTo({ url: '/pages/history_reviewed/history_index' });
  },

  onHomeTap() {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  onRetryTap() {
    this._fetch();
  }
});
