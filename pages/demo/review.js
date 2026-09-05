const store = require('../../utils/demoStore');
Page({ data: { size: 5, today: 2, sizes: [5, 10, 20] }, chooseSize(e) { this.setData({ size: Number(e.currentTarget.dataset.size) }); }, start() { wx.navigateTo({ url: '/pages/demo/review-session?size=' + this.data.size }); }, openLibrary() { wx.switchTab({ url: '/pages/demo/library' }); } });
