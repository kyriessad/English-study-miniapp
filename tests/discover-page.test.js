const test = require('node:test');
const assert = require('node:assert/strict');

let pageDefinition = null;
let navigationUrl = '';

const storage = new Map();
global.wx = {
  getWindowInfo() { return { statusBarHeight: 20 }; },
  getSystemInfoSync() { return { statusBarHeight: 20 }; },
  getStorageSync(key) { return storage.get(key) || ''; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  navigateTo({ url }) { navigationUrl = url; },
  redirectTo({ url }) { navigationUrl = url; },
  navigateBack() {},
  switchTab() {},
  showToast() {},
  stopPullDownRefresh() {}
};
global.Page = (definition) => { pageDefinition = definition; };

require('../pages/discover/index');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

test('discover without domain stays on the scene hub', () => {
  const page = createPage();
  page.onLoad({});
  assert.equal(page.data.viewMode, 'hub');
  assert.equal(page.data.domain, '');
});

test('discover hub listening option opens listening list', () => {
  const page = createPage();
  page.onLoad({});
  navigationUrl = '';
  page.openHubOption({ currentTarget: { dataset: { key: 'listening' } } });
  assert.equal(navigationUrl, '/pages/listening/index');
});

test('discover hub books option opens wordbooks', () => {
  const page = createPage();
  page.onLoad({});
  navigationUrl = '';
  page.openHubOption({ currentTarget: { dataset: { key: 'books' } } });
  assert.equal(navigationUrl, '/pages/wordbooks/index');
});

test('discover hub life option opens the life list on the same page', () => {
  const page = createPage();
  page.loadCategories = async () => {};
  page.onLoad({});
  page.openHubOption({ currentTarget: { dataset: { key: 'life' } } });
  assert.equal(page.data.viewMode, 'list');
  assert.equal(page.data.domain, 'life');
  assert.equal(page.data.domainTitle, '生活英语');
});

test('discover back from list returns to hub when opened from hub', () => {
  const page = createPage();
  page.loadCategories = async () => {};
  page.onLoad({});
  page.openHubOption({ currentTarget: { dataset: { key: 'reading' } } });
  page.goBack();
  assert.equal(page.data.viewMode, 'hub');
});

test('discover content tap opens public material detail', () => {
  const page = createPage();
  navigationUrl = '';
  page.onItemTap({ currentTarget: { dataset: { id: 'material-42' } } });
  assert.equal(navigationUrl, '/pages/library/detail?id=material-42&source=public');
});

test('discover remember tap adds locally without opening the add page', async () => {
  const api = require('../utils/api/index');
  api.discovery.addToLibrary = async () => ({ status: 'created', card: { id: 'card-1', version: 3 } });
  const page = createPage();
  navigationUrl = '';
  page.data.sourceItems = [{
    id: 'material-42',
    content: 'Take your time.',
    chinese: '慢慢来。',
    inLibrary: false,
    categoryTitle: '日常生活'
  }];
  page.data.items = page.data.sourceItems.slice();
  await page.onRememberTap({ currentTarget: { dataset: { id: 'material-42' } } });
  assert.equal(navigationUrl, '');
  assert.equal(page.data.sourceItems[0].id, 'material-42');
  assert.equal(page.data.items[0].id, 'material-42');
  assert.equal(page.data.sourceItems[0].inLibrary, true);
  assert.equal(page.data.sourceItems[0].libraryCardId, 'card-1');
});

test('discover remember tap keeps the card in place among neighbors', async () => {
  const api = require('../utils/api/index');
  api.discovery.addToLibrary = async () => ({ status: 'created', card: { id: 'card-1', version: 3 } });
  const page = createPage();
  page.data.sourceItems = [
    { id: 'material-1', content: 'First.', chinese: '一', inLibrary: false },
    { id: 'material-2', content: 'Second.', chinese: '二', inLibrary: false }
  ];
  page.data.items = page.data.sourceItems.slice();
  await page.onRememberTap({ currentTarget: { dataset: { id: 'material-1' } } });
  assert.deepEqual(page.data.items.map((item) => item.id), ['material-1', 'material-2']);
  assert.equal(page.data.items[0].inLibrary, true);
});

test('discover remembered tap opens detail without deleting saved English', async () => {
  const api = require('../utils/api/index');
  api.cards.remove = async () => ({ id: 'card-1' });
  const page = createPage();
  page.data.sourceItems = [{
    id: 'material-42',
    content: 'Take your time.',
    chinese: '慢慢来。',
    inLibrary: true,
    libraryCardId: 'card-1',
    libraryCardVersion: 3
  }];
  page.data.items = page.data.sourceItems.slice();
  await page.onRememberTap({ currentTarget: { dataset: { id: 'material-42' } } });
  assert.equal(page.data.sourceItems[0].id, 'material-42');
  assert.equal(page.data.items[0].id, 'material-42');
  assert.equal(page.data.sourceItems[0].inLibrary, true);
  assert.equal(page.data.sourceItems[0].libraryCardId, 'card-1');
  assert.equal(navigationUrl, '/pages/library/detail?id=material-42&source=public');
});
