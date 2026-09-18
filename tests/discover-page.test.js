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
  assert.equal(page.data.sourceItems[0].inLibrary, true);
  assert.equal(page.data.sourceItems[0].libraryCardId, 'card-1');
});

test('discover remembered tap removes the card and restores the button', async () => {
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
  assert.equal(page.data.sourceItems[0].inLibrary, false);
  assert.equal(page.data.sourceItems[0].libraryCardId, '');
});
