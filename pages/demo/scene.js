const mock = require('../../utils/demoMock');
const store = require('../../utils/demoStore');

Page({
  data: { type: 'life', title: '生活英语', categories: [], selected: '', items: [], empty: false },
  onLoad(options) {
    const type = options.type === 'reading' ? 'reading' : 'life';
    const categories = mock.sceneCategories[type];
    this.setData({ type, title: type === 'reading' ? '阅读英语' : '生活英语', categories, selected: categories[0] });
    this.loadItems(categories[0]);
  },
  goBack() { wx.navigateBack({ delta: 1 }); },
  selectCategory(e) { const category = e.currentTarget.dataset.category; this.setData({ selected: category }); this.loadItems(category); },
  loadItems(category) {
    const items = mock.sceneMaterials.filter(item => item.type === this.data.type && item.category === category);
    const fallback = mock.sceneMaterials.filter(item => item.type === this.data.type);
    this.setData({ items: items.length ? items : fallback, empty: false });
  },
  remember(e) { store.remember(e.currentTarget.dataset.id); this.refreshItems(); },
  refreshItems() { this.setData({ items: this.data.items.map(item => Object.assign({}, item, { joined: !!store.state.joinedPersonal[item.id] })) }); },
  openDetail(e) { wx.navigateTo({ url: '/pages/demo/detail?id=' + e.currentTarget.dataset.id + '&source=public' }); },
  changeBatch() { this.setData({ items: this.data.items.slice().reverse() }); wx.showToast({ title: '已换一批内容', icon: 'none' }); },
  play(e) { wx.showToast({ title: 'Mock 发音播放', icon: 'none' }); }
});
