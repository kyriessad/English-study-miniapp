const { logoutBackendAuth } = require('../../utils/apiClient');
const { getStoredVoice, saveStoredVoice } = require('../../utils/pronunciation');

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
    safeTop: 20,
    dailyGoal: DAILY_GOAL_DEFAULT,
    dailyGoalIndex: 1,
    dailyGoalLabel: '5 张',
    dailyGoalLabels: DAILY_GOAL_LABELS,
    pronunciationVoice: getStoredVoice(),
    pronunciationVoiceLabel: getStoredVoice() === 'female' ? '\u5973\u58f0' : '\u7537\u58f0'
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
  },

  goBack() {
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/library/index' }); } });
  },

  onShow() {
    const goal = readDailyGoal();
    const idx = DAILY_GOAL_OPTIONS.indexOf(goal);
    const voice = getStoredVoice();
    this.setData({
      dailyGoal: goal,
      dailyGoalIndex: idx !== -1 ? idx : 1,
      dailyGoalLabel: DAILY_GOAL_LABELS[idx !== -1 ? idx : 1],
      pronunciationVoice: voice,
      pronunciationVoiceLabel: voice === 'female' ? '\u5973\u58f0' : '\u7537\u58f0'
    });
  },

  onPronunciationPreferenceTap(event) {
    const voice = event && event.currentTarget && event.currentTarget.dataset.voice;
    if (voice !== 'male' && voice !== 'female') return;
    saveStoredVoice(voice);
    this.setData({
      pronunciationVoice: voice,
      pronunciationVoiceLabel: voice === 'female' ? '\u5973\u58f0' : '\u7537\u58f0'
    });
  },

  goToAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  logoutBackend() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能继续同步数据。',
      success: async (response) => {
        if (!response.confirm) return;
        try {
          await logoutBackendAuth();
          wx.showToast({ title: '已退出登录', icon: 'none' });
        } catch (error) {
          wx.showToast({ title: '退出失败，请重试', icon: 'none' });
        }
      }
    });
  },

  onDailyGoalChange(e) {
    const idx = Number(e.detail.value);
    if (idx < 0 || idx >= DAILY_GOAL_OPTIONS.length) return;
    const goal = DAILY_GOAL_OPTIONS[idx];
    const previousGoal = this.data.dailyGoal;
    if (saveDailyGoal(goal)) {
      if (goal !== previousGoal) {
        try { wx.setStorageSync('batchSizeChangedNeedsRestart', true); } catch (_) {}
      }
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
