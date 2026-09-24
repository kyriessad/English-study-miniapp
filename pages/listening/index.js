const api = require('../../utils/api/index');
const { errorMessage } = require('../../utils/coreViewModels');

function applyDifficultyFilter(items, difficulty) {
  const rows = items || [];
  if (!difficulty) return rows.slice();
  return rows.filter((item) => item.targetDifficulty === difficulty);
}

Page({
  data: {
    safeTop: 20,
    loading: true,
    error: '',
    allItems: [],
    items: [],
    difficultyFilters: [],
    selectedDifficulty: '',
    emptyFilter: false
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.listening.list();
      const allItems = response.items || [];
      const selectedDifficulty = this.data.selectedDifficulty || '';
      const items = applyDifficultyFilter(allItems, selectedDifficulty);
      this.setData({
        allItems,
        items,
        difficultyFilters: response.difficultyFilters || [],
        emptyFilter: !items.length && allItems.length > 0,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error, '听力素材加载失败') });
    }
  },

  onDifficultyTap(event) {
    const selectedDifficulty = String(event.currentTarget.dataset.code || '');
    const items = applyDifficultyFilter(this.data.allItems, selectedDifficulty);
    this.setData({
      selectedDifficulty,
      items,
      emptyFilter: !items.length && (this.data.allItems || []).length > 0
    });
  },

  retryLoad() { this.load(); },
  goBack() {
    wx.navigateBack({ fail() { wx.navigateTo({ url: '/pages/discover/index' }); } });
  },
  openItem(event) {
    const sourceId = String(event.currentTarget.dataset.id || '');
    if (!sourceId) return;
    wx.navigateTo({ url: '/pages/listening/play?id=' + encodeURIComponent(sourceId) });
  }
});
