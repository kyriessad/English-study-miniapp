const { getReviewOverview, createReviewSession, getTodayReviewed } = require('../../utils/apiClient');

const OVERVIEW_CACHE_KEY = 'reviewOverviewCache';
const TODAY_REVIEWED_CACHE_KEY = 'todayReviewedCache';

const DAILY_GOAL_KEY = 'dailyGoal';
const DAILY_GOAL_DEFAULT = 5;
const DAILY_GOAL_OPTIONS = [3, 5, 10, 15];

function readDailyGoal() {
  try {
    const raw = wx.getStorageSync(DAILY_GOAL_KEY);
    const n = Number(raw);
    if (DAILY_GOAL_OPTIONS.indexOf(n) !== -1) return n;
    return DAILY_GOAL_DEFAULT;
  } catch (_) {
    return DAILY_GOAL_DEFAULT;
  }
}

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

    dailyGoal: DAILY_GOAL_DEFAULT,

    masteredCount: 0,
    consolidateCount: 0,

    displayCompleted: 0,
    displayTotal: 0,
    actualCompletedToday: 0,
    isGoalMet: false,
    isGoalOverachieved: false,
    isGoalBlocked: false,
    hasAnyReviewableCards: true,
    goalProgress: null
  },

  onLoad() {
    this._fetch();
  },

  onShow() {
    const newGoal = readDailyGoal();
    this.setData({ dailyGoal: newGoal });
    if (!this.data.loading) {
      this._fetch();
    }
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  async _fetch() {
    this.setData({ loading: true, offline: false, loadFailed: false });

    try {
      const overview = await getReviewOverview({ daily_goal: readDailyGoal() });
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

    // Phase 6P-later-4: prefer goal_progress when available
    var goalProgress = (overview && overview.goal_progress && typeof overview.goal_progress === 'object')
      ? overview.goal_progress : null;

    var displayCompleted, displayTotal, actualCompletedToday;
    var isGoalMet, isGoalOverachieved, isGoalBlocked, hasAnyReviewableCards;
    var totalToday, completedToday, remaining, isAllDone;

    if (goalProgress) {
      displayCompleted = Number(goalProgress.display_numerator || 0);
      displayTotal = Number(goalProgress.display_denominator || 0);
      actualCompletedToday = Number(goalProgress.completed_unique_today != null
        ? goalProgress.completed_unique_today : displayCompleted);
      isGoalMet = goalProgress.is_goal_met === true;
      isGoalOverachieved = goalProgress.is_overachieved === true;
      isGoalBlocked = goalProgress.is_goal_blocked === true;
      hasAnyReviewableCards = goalProgress.has_any_reviewable_cards !== false;
      totalToday = Number(suggested.total_count || 0);
      completedToday = displayCompleted;
      remaining = Math.max(displayTotal - displayCompleted, 0);
      isAllDone = isGoalMet;
    } else {
      // Fallback: use legacy suggested / completed_suggested fields
      totalToday = Number(suggested.total_count || 0);
      completedToday = Number(completed.total_count || 0);
      remaining = Math.max(totalToday - completedToday, 0);
      isAllDone = !!(overview && overview.is_all_done);
      displayCompleted = completedToday;
      displayTotal = totalToday;
      actualCompletedToday = completedToday;
      isGoalMet = isAllDone || (totalToday > 0 && completedToday >= totalToday);
      isGoalOverachieved = false;
      isGoalBlocked = false;
      hasAnyReviewableCards = totalToday > 0;
    }

    const activeSession = (overview && overview.active_session) || null;

    let state, stateLabel, stateSub, mainButtonLabel, mainButtonDisabled;
    let todayReviewedEnabled = actualCompletedToday > 0;
    const todayReviewedLabel = todayReviewedEnabled ? '今天看过' : '暂无内容';

    if (!offline && displayTotal === 0) {
      state = 'empty';
      stateLabel = '今天还没有复习任务';
      stateSub = '可以返回首页添加卡片，或开始学习已有卡片';
      mainButtonLabel = '返回首页';
      mainButtonDisabled = false;
    } else if (offline && displayTotal === 0) {
      state = 'empty';
      stateLabel = '今天还没有复习任务';
      stateSub = '可以返回首页添加卡片，或开始学习已有卡片';
      mainButtonLabel = '返回首页';
      mainButtonDisabled = false;
      todayReviewedEnabled = false;
    } else if (offline) {
      state = 'offline_cached';
      stateLabel = '共 ' + displayTotal + ' 张';
      if (displayCompleted >= displayTotal && displayTotal > 0) {
        stateSub = '今日已完成 ' + actualCompletedToday + ' 张';
        mainButtonLabel = '继续复习';
      } else if (displayCompleted > 0) {
        stateSub = '今日已完成 ' + displayCompleted + ' 张，还有 ' + remaining + ' 张待复习';
        mainButtonLabel = '继续复习';
      } else {
        stateSub = '还未开始复习';
        mainButtonLabel = '开始复习';
      }
      mainButtonDisabled = true;
    } else if (isGoalOverachieved) {
      state = 'overachieved';
      stateLabel = '今天完成了 ' + actualCompletedToday + ' 张';
      stateSub = '目标 ' + displayTotal + ' / ' + displayTotal + ' · 已超额完成';
      mainButtonLabel = '继续复习';
      mainButtonDisabled = false;
      this._fetchResultBreakdown();
    } else if (isGoalMet) {
      state = 'all_done';
      stateLabel = '今日完成 ' + displayTotal + ' / ' + displayTotal;
      stateSub = '今天的复习完成了';
      mainButtonLabel = '继续复习';
      mainButtonDisabled = false;
      this._fetchResultBreakdown();
    } else if (isGoalBlocked) {
      state = 'goal_blocked';
      stateLabel = '今日完成 ' + displayCompleted + ' / ' + displayTotal;
      stateSub = '当前可学内容已完成，可以添加卡片继续';
      mainButtonLabel = '添加卡片';
      mainButtonDisabled = false;
    } else if (displayCompleted > 0 && displayCompleted < displayTotal) {
      state = 'in_progress';
      stateLabel = '今日完成 ' + displayCompleted + ' / ' + displayTotal;
      stateSub = '正在学习中，继续加油';
      mainButtonLabel = '继续复习';
      mainButtonDisabled = false;
    } else {
      state = 'not_started';
      stateLabel = '今日完成 0 / ' + displayTotal;
      stateSub = '还没开始，今天先复习一点';
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

      displayCompleted,
      displayTotal,
      actualCompletedToday,
      isGoalMet,
      isGoalOverachieved,
      isGoalBlocked,
      hasAnyReviewableCards,
      goalProgress,

      state,
      stateLabel,
      stateSub,

      mainButtonLabel,
      mainButtonDisabled,

      todayReviewedEnabled,
      todayReviewedLabel,

      dailyGoal: readDailyGoal()
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

    if (state === 'empty') {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    if (state === 'goal_blocked') {
      wx.navigateTo({ url: '/pages/add/add' });
      return;
    }

    if (state === 'all_done' || state === 'overachieved') {
      this._startReview();
      return;
    }

    if (offline) {
      wx.showToast({ title: '网络不可用，请检查当前网络', icon: 'none' });
      return;
    }

    this._startReview();
  },

  onSecondaryReviewTap() {
    if (this.data.offline) {
      wx.showToast({ title: '网络不可用，请检查当前网络', icon: 'none' });
      return;
    }
    this._startReview();
  },

  async _startReview() {
    if (this._reviewStarting) return;
    this._reviewStarting = true;

    const activeSession = this.data.activeSession;

    if (activeSession) {
      const sessionId = activeSession.id || activeSession.session_id || '';
      const sessionType = activeSession.session_type || 'daily_suggested';
      if (sessionId) {
        this._reviewStarting = false;
        wx.navigateTo({
          url: '/pages/review/review?session_id=' + sessionId + '&session_type=' + sessionType
        });
        return;
      }
    }

    wx.showLoading({ title: '准备复习中...', mask: true });

    const chain = ['daily_suggested', 'new_only', 'free_review'];
    var lastReason = 'empty';

    for (var i = 0; i < chain.length; i++) {
      const sessionType = chain[i];
      var stepReason;

      try {
        const sessionData = { session_type: sessionType, limit: 5 };
        if (sessionType === 'daily_suggested') {
          sessionData.daily_goal = readDailyGoal();
        }
        const result = await createReviewSession(sessionData);
        const sessionId = (result && (result.session_id || result.id)) ||
          (result && result.data && (result.data.session_id || result.data.id)) || '';
        const items = (result && result.items) || (result && result.data && result.data.items) || [];

        if (sessionId && Array.isArray(items) && items.length > 0) {
          wx.hideLoading();
          this._reviewStarting = false;
          wx.navigateTo({
            url: '/pages/review/review?session_id=' + sessionId + '&session_type=' + sessionType
          });
          return;
        }
        stepReason = 'empty';
      } catch (_) {
        stepReason = 'network_error';
      }

      if (stepReason === 'network_error') {
        lastReason = 'network_error';
        break;
      }
      lastReason = 'empty';
    }

    wx.hideLoading();
    this._reviewStarting = false;

    if (lastReason === 'network_error') {
      wx.showToast({ title: '网络不可用，请检查当前网络', icon: 'none' });
    } else {
      wx.showToast({ title: '暂无可复习内容，可以添加卡片继续', icon: 'none' });
    }
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
