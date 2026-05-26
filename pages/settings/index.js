const DAILY_GOAL_KEY = 'dailyGoal';
const DAILY_GOAL_DEFAULT = 5;
const DAILY_GOAL_OPTIONS = [3, 5, 10, 15];
const DAILY_GOAL_LABELS = ['3 张', '5 张', '10 张', '15 张'];

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

function saveDailyGoal(value) {
  try {
    wx.setStorageSync(DAILY_GOAL_KEY, value);
    return true;
  } catch (_) {
    return false;
  }
}

Page({
  data: {
    dailyGoal: DAILY_GOAL_DEFAULT,
    dailyGoalIndex: 1,
    dailyGoalLabel: '5 张',
    dailyGoalLabels: DAILY_GOAL_LABELS
  },

  onShow() {
    const goal = readDailyGoal();
    const idx = DAILY_GOAL_OPTIONS.indexOf(goal);
    this.setData({
      dailyGoal: goal,
      dailyGoalIndex: idx !== -1 ? idx : 1,
      dailyGoalLabel: DAILY_GOAL_LABELS[idx !== -1 ? idx : 1]
    });
  },

  goToAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  onDailyGoalChange(e) {
    const idx = Number(e.detail.value);
    if (idx < 0 || idx >= DAILY_GOAL_OPTIONS.length) return;
    const goal = DAILY_GOAL_OPTIONS[idx];
    if (saveDailyGoal(goal)) {
      this.setData({
        dailyGoal: goal,
        dailyGoalIndex: idx,
        dailyGoalLabel: DAILY_GOAL_LABELS[idx]
      });
      wx.showToast({ title: '已更新', icon: 'none', duration: 1200 });
    } else {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  }
});
