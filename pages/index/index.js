const api = require('../../utils/api/index');
const { downloadPronunciationAudio } = require('../../utils/apiClient');
const { getStoredVoice } = require('../../utils/pronunciation');
const {
  toMaterialView,
  errorMessage
} = require('../../utils/coreViewModels');
const { attachTabPage } = require('../../utils/tabChrome');
const { addMaterialToLibrary, removeMaterialFromLibrary } = require('../../utils/materialLibrary');

function heroTextClass(text) {
  const length = String(text || '').trim().length;
  if (length > 68) return 'recommendation-english-small';
  if (length > 34) return 'recommendation-english-compact';
  return '';
}

Page({
  data: {
    featured: null,
    safeTop: 20,
    menuRightInset: 96,
    isAndroid: false,
    dateLabel: '',
    greeting: 'Good morning.',
    loading: false,
    error: '',
    savingIds: {},
    tabEnter: false,
    playingFeature: false
  },

  onLoad() {
    const now = new Date();
    this.setData(Object.assign({}, this.getChromeMetrics(), {
      dateLabel: this.formatDate(now),
      greeting: this.getGreeting(now.getHours())
    }));
  },

  onShow() {
    attachTabPage(this, 0);
    this.refresh();
  },

  getChromeMetrics() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const device = wx.getDeviceInfo ? wx.getDeviceInfo() : info;
    const platform = String((device && device.platform) || info.platform || '').toLowerCase();
    const isAndroid = platform === 'android';
    const safeTop = info.statusBarHeight || 20;
    let menuRightInset = 96;
    const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    if (menu && menu.left) menuRightInset = Math.max(info.windowWidth - menu.left + 10, 0);
    return { safeTop, menuRightInset, isAndroid };
  },

  formatDate(date) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  },

  getGreeting(hour) {
    if (hour >= 5 && hour < 12) return 'Good morning.';
    if (hour >= 12 && hour < 18) return 'Good afternoon.';
    return 'Good evening.';
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const daily = await api.discovery.getTodayQuote();
      const item = (daily.items || [])[0];
      const view = item ? toMaterialView(item) : null;
      this.setData({
        featured: view ? Object.assign({}, view, { heroTextClass: heroTextClass(view.en) }) : null
      });
    } catch (error) {
      this.setData({ error: errorMessage(error, '今日推荐加载失败') });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.refresh(); },
  goDiscover() { wx.navigateTo({ url: '/pages/discover/index' }); },
  goAdd() { wx.navigateTo({ url: '/pages/add/add' }); },
  openFeatured() {
    const featured = this.data.featured;
    if (!featured || !featured.id) return;
    wx.navigateTo({ url: '/pages/library/detail?id=' + featured.id + '&source=public' });
  },
  onUnload() {
    if (this.audioContext) {
      try { this.audioContext.destroy(); } catch (_) {}
      this.audioContext = null;
    }
  },

  async playFeature() {
    const text = String((this.data.featured && this.data.featured.en) || '').trim();
    if (!text || this.data.playingFeature) return;
    this.setData({ playingFeature: true });
    try {
      const path = await downloadPronunciationAudio(text, getStoredVoice());
      if (!this.audioContext) this.audioContext = wx.createInnerAudioContext();
      this.audioContext.stop();
      this.audioContext.src = path;
      this.audioContext.play();
    } catch (error) {
      wx.showToast({ title: '发音暂不可用', icon: 'none' });
    } finally {
      this.setData({ playingFeature: false });
    }
  },

  rememberHero() {
    const hero = this.data.featured;
    if (!hero) return;
    this.remember({ currentTarget: { dataset: { id: hero.id } } });
  },

  stopHeroFooterTap() {},

  async remember(e) {
    const id = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '');
    const current = this.data.featured && this.data.featured.id === id ? this.data.featured : null;
    if (!id || !current || this.data.savingIds[id]) return;
    this.savingLock = Object.assign({}, this.savingLock, { [id]: true });
    this.setData({ savingIds: Object.assign({}, this.data.savingIds, { [id]: true }) });
    try {
      if (current.saved) {
        await removeMaterialFromLibrary(current);
        this.setData({
          featured: Object.assign({}, current, { saved: false, joined: false, libraryCardId: '', libraryCardVersion: 0 })
        });
        wx.showToast({ title: '已从卡片中移除', icon: 'none' });
        return;
      }
      const card = await addMaterialToLibrary(id);
      this.setData({
        featured: Object.assign({}, current, {
          saved: true,
          joined: true,
          libraryCardId: card.id,
          libraryCardVersion: card.version
        })
      });
      wx.showToast({ title: '已加入卡片', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: errorMessage(error, current.saved ? '移除失败，请重试' : '加入失败，请重试'), icon: 'none' });
    } finally {
      const savingIds = Object.assign({}, this.data.savingIds);
      delete savingIds[id];
      if (this.savingLock) delete this.savingLock[id];
      this.setData({ savingIds });
    }
  }
});
