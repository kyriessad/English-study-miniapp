const store = require('../../utils/demoStore');
Page({ data: { results: [] }, onLoad() { this.setData({ results: store.state.reviewResults }); }, open(e) { wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=personal' }); }, again() { wx.redirectTo({ url: '/pages/demo/review-session' }); }, home() { wx.switchTab({ url: '/pages/demo/review' }); } });
