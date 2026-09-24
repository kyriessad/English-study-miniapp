const test = require('node:test');
const assert = require('node:assert/strict');

const storage = new Map();
let pageDefinition = null;
let navigationUrl = '';

global.wx = {
  getWindowInfo() { return { statusBarHeight: 20, windowWidth: 375 }; },
  getStorageSync(key) { return storage.get(key) || ''; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  setNavigationBarTitle() {},
  navigateTo({ url }) { navigationUrl = url; },
  pageScrollTo() {},
  createSelectorQuery() {
    return {
      select() { return this; }, boundingClientRect() { return this; },
      selectViewport() { return this; }, scrollOffset() { return this; },
      exec(callback) { callback([{ top: 0 }, { scrollTop: 0 }]); }
    };
  }
};
global.Page = (definition) => { pageDefinition = definition; };
global.getApp = () => ({ globalData: {} });
global.getCurrentPages = () => [];

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../utils/cardStorageFacade', {
  addCard: async () => null, getCardById: async () => null, updateCard: async () => null,
  deleteCard: async () => null, updateBackendCardSyncState() {},
  DEFAULT_EXAM_SCENE: '未分类', DEFAULT_EXAM_MODULE: '未分类'
});
mockModule('../utils/apiClient', {
  BACKEND_AUTH_STORAGE_KEYS: {}, updateBackendCard: async () => null,
  validateEnglish: async (text) => ({ level: 'pass', category: 'sentence', normalizedText: text }),
  analyzeEnglishDirect: async () => null, analyzeEnglishDirectStream: async () => null
});
mockModule('../utils/pronunciation', {
  createPronunciationController: () => ({ load() {}, destroy() {} }),
  getStoredVoice: () => 'male', DEFAULT_VOICE: 'male'
});
mockModule('../utils/inputContext', {
  getInputContext: () => ({ examScene: '未分类', examModule: '未分类' }), saveInputContext() {}
});

const { saveDiscoveryPrefill, STORAGE_KEY } = require('../utils/discoveryPrefill');
require('../pages/add/add');

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]));
    if (callback) callback();
  };
  return page;
}

test('discovery want-to-remember prefills existing add page and consumes transient state', () => {
  saveDiscoveryPrefill({
    id: 'material-1', content: 'Take your time.', chinese: '慢慢来。',
    card_type: 'sentence', source_label: '日常表达'
  }, '发现素材 · 日常表达');
  assert.ok(storage.has(STORAGE_KEY));

  const page = createPage();
  page.onLoad({ from: 'discovery' });
  assert.equal(page.data.form.englishText, 'Take your time.');
  assert.equal(page.data.form.myUnderstanding, '慢慢来。');
  assert.equal(page.data.form.category, '句子');
  assert.equal(page.data.form.whereEncountered, '发现素材 · 日常表达');
  assert.equal(storage.has(STORAGE_KEY), false);
  page.onUnload();
});

test('today quote prefill uses exact source label', () => {
  saveDiscoveryPrefill({
    id: 'quote-1', content: 'A quiet morning leaves room for a better question.',
    chinese: '清晨的宁静为更好的问题留出空间。', card_type: 'sentence'
  }, '今日一句');
  const page = createPage();
  page.onLoad({ from: 'today-quote' });
  assert.equal(page.data.form.whereEncountered, '今日一句');
  assert.equal(page.data.form.myUnderstanding, '清晨的宁静为更好的问题留出空间。');
  page.onUnload();
});
