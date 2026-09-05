const mock = require('../../utils/demoMock');
const store = require('../../utils/demoStore');

Page({
  data: { featured: [] },

  onLoad() { this.refresh(); },
  onShow() { this.refresh(); },

  refresh() {
    const featured = mock.featured.slice(0, 3).map(item => Object.assign({}, item, {
      saved: !!store.state.joinedPersonal[item.id]
    }));
    this.setData({ featured });
  },

  goDiscover() { wx.navigateTo({ url: '/pages/demo/discover' }); },
  goAdd() { wx.navigateTo({ url: '/pages/demo/add' }); },
  openFeatured(e) { wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=public' }); },
  playFeature() { wx.showToast({ title: 'Mock 发音播放', icon: 'none' }); },
  remember(e) { store.remember(e.currentTarget.dataset.id); this.refresh(); }
});
