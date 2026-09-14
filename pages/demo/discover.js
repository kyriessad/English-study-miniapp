Page({
  data: { safeTop: 20, tabs: [{ key: 'life', title: '生活英语', sub: '从日常场景积累表达' }, { key: 'reading', title: '阅读英语', sub: '从真实阅读理解语境' }] },
  onLoad() { this.setData({ safeTop: (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 20 }); },
  open(e) { const key = e.currentTarget.dataset.key; wx.navigateTo({ url: '/pages/demo/scene?type=' + key }); },
  goBack() { wx.navigateBack({ delta: 1 }); }
});
