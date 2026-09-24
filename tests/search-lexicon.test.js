const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSearchPage(response, searchImpl) {
  const file = path.resolve(__dirname, '..', 'pages/search/index.js');
  const calls = [];
  const played = [];
  let definition;
  const wx = {
    getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getSystemInfoSync: () => ({ statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({ left: 280 }),
    getStorageSync: () => [],
    setStorageSync() {},
    navigateBack() {},
    switchTab() {},
    navigateTo() {}
  };
  const realRequire = require;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: (value) => { definition = value; },
    wx,
    console,
    setTimeout,
    clearTimeout,
    require: (name) => {
      if (name.endsWith('/api/index')) {
        return { wordbooks: { search: async (...args) => {
          calls.push(args);
          return searchImpl ? searchImpl(...args) : response;
        } } };
      }
      if (name.endsWith('/pronunciation')) {
        return { createPronunciationController: () => ({
          playText(text) { played.push(text); },
          stop() {},
          destroy() {}
        }) };
      }
      if (name.endsWith('/discoveryPrefill')) return { saveDiscoveryPrefill() {} };
      return realRequire(path.resolve(path.dirname(file), name));
    }
  }, { filename: file });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  page.setData = (patch) => Object.assign(page.data, patch);
  return { page, calls, played };
}

test('search submits one unified lookup and drops provenance before rendering', async () => {
  const { page, calls, played } = loadSearchPage({
    exact_match: true,
    items: [{
      content: 'review',
      chinese: 'n. 检讨；v. 温习',
      pos: ['n', 'v'],
      senses: [{ pos: 'n', meanings: ['检讨'], examples: [] }],
      source: 'ecdict+local_model',
      source_model: 'qwen3:8b',
      sources: []
    }]
  });
  page.onLoad({});
  page.data.query = 'review';
  await page.submitQuery();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'review');
  assert.equal(calls[0][1], 12);
  assert.equal(calls[0][2].generateAi, true);
  assert.equal(page.data.results[0].content, 'review');
  assert.equal(page.data.results[0].source, undefined);
  assert.equal(page.data.results[0].sourceModel, undefined);
  assert.equal(page.data.results[0].senses[0].pos, 'n');

  page.playResult({ currentTarget: { dataset: { index: 0 } } });
  assert.deepEqual(played, ['review']);
});

test('search UI does not expose provider or route labels', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '..', 'pages/search/index.wxml'), 'utf8');
  assert.equal(/Qwen|AI 补充|qwen3:8b|source-route|source-pills/.test(wxml), false);
});

test('explicit submit can supersede an in-flight live lookup', async () => {
  const pending = [];
  const { page, calls } = loadSearchPage({ exact_match: false, items: [] }, () => (
    new Promise((resolve) => pending.push(resolve))
  ));
  page.onLoad({});
  page.data.query = 'longtailword';

  const live = page.searchDatabase('longtailword', false);
  await Promise.resolve();
  assert.equal(page.data.loading, true);

  const submitted = page.submitQuery();
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].generateAi, false);
  assert.equal(calls[1][2].generateAi, true);

  pending[0]({ exact_match: false, items: [] });
  pending[1]({ exact_match: true, items: [{ content: 'longtailword', chinese: '长尾词' }] });
  await Promise.all([live, submitted]);
  assert.equal(page.data.results[0].content, 'longtailword');
});
