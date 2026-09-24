const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { overviewView } = require('../utils/reviewOverview');

function loadPage(relative, api = {}) {
  const file = path.resolve(__dirname, '..', relative);
  const realRequire = createRequire(file);
  const calls = [];
  let definition;
  const wx = {
    getStorageSync: () => 5, setStorageSync() {},
    navigateTo: (value) => calls.push(value.url),
    switchTab: (value) => calls.push(value.url),
    showToast() {}, showModal() {},
    enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {}
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: (value) => { definition = value; }, wx, console, setTimeout, clearTimeout,
    require: (name) => name.endsWith('/api/index') ? api : realRequire(name)
  }, { filename: file });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  page.setData = function (patch, callback) { Object.assign(this.data, patch); if (callback) callback(); };
  return { page, calls, wx };
}

test('overview respects explicit zero and separates no reviewable content from goal completion', () => {
  const state = overviewView({ goalProgress: { completed_unique_today: 0, has_any_reviewable_cards: false }, completedSuggested: { total_count: 9 } });
  assert.equal(state.today, 0);
  assert.equal(state.hasReviewable, false);
  assert.equal(state.reviewAction, '去挑一句英语');
  assert.equal(overviewView({ goalProgress: { is_goal_met: true } }).reviewAction, '再练一轮（可选）');
});

test('active session is offered before optional extra practice', () => {
  assert.equal(overviewView({ goalProgress: { is_goal_met: true }, activeSession: { id: 's1' } }).reviewAction, '继续上次复习');
});

for (const [domain, file] of [['personal', 'pages/review/review.js'], ['wordbook', 'pages/wordbooks/study.js']]) {
  test(`${domain} failed submission retries the identical action and original answer`, async () => {
    const requests = [];
    const submit = async (...args) => { requests.push(args.at(-1)); throw new Error('offline'); };
    const { page } = loadPage(file, { reviews: { submitFeedback: submit }, wordbooks: { submitReviewAnswer: submit } });
    page.data.current = { id: 'c1', sessionItemId: 'i1', questionId: 'q1', questionToken: 'token' };
    page.data.sessionId = 's1';
    await page.submitAnswer('option-a');
    assert.ok(page.data.submissionError);
    page.choose({ currentTarget: { dataset: { optionId: 'option-b' } } });
    assert.equal(requests.length, 1);
    await page.retrySubmission();
    assert.equal(requests.length, 2);
    assert.equal(requests[0], requests[1]);
    assert.equal(requests[1].selected_option_id, 'option-a');
    assert.equal(page.data.selectedOptionId, 'option-a');
  });

  test(`${domain} hiding cancels pending navigation`, () => {
    const { page } = loadPage(file);
    page.advanceTimer = setTimeout(() => assert.fail('advanced after hide'), 100);
    page.detailTimer = setTimeout(() => assert.fail('opened detail after hide'), 100);
    page.onHide();
    assert.equal(page.advanceTimer, null);
    assert.equal(page.detailTimer, null);
    assert.equal(page.pageHidden, true);
  });
}

test('personal library paginates past the first 100 and retains fetched cards on passage failure', async () => {
  const offsets = [];
  const { page } = loadPage('pages/library/index.js', {
    cards: { list: async (query) => { offsets.push(query.offset); return { total: 101, items: [{ id: 'last', englishText: 'last', addChannel: 'manual' }] }; } },
    passages: { list: async () => { throw new Error('offline'); } }
  });
  page.cardOffset = 100; page.cardHasMore = true;
  page.passageOffset = 100; page.passageHasMore = true;
  page.data.hasMore = true;
  await page.loadMore();
  assert.equal(offsets[0], 100);
  assert.equal(page.data.cards[0].id, 'last');
  assert.equal(page.cardOffset, 101);
  assert.equal(page.cardHasMore, false);
  assert.equal(page.data.hasMore, true);
  assert.ok(page.data.error);
  await page.loadMore();
  assert.equal(offsets.length, 1);
});

test('discovery discards a slower response from a previous category', async () => {
  let resolveOld;
  const { page } = loadPage('pages/discover/index.js', {
    discovery: { listCategoryItems: (category) => category === 'old' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve({ items: [{ id: 'new', content: 'new' }] }) }
  });
  page.data.selectedCategoryCode = 'old';
  const pending = page.loadItems(true);
  page.data.selectedCategoryCode = 'new';
  await page.loadItems(true);
  resolveOld({ items: [{ id: 'old', content: 'old' }] });
  await pending;
  assert.equal(page.data.items[0].id, 'new');
});

test('wordbook visible detail action opens the selected word', () => {
  const { page, calls } = loadPage('pages/wordbooks/detail.js');
  page.bookId = 'cet4';
  page.data.entries = [{ id: 'one' }, { id: 'two' }];
  page.selectedId = 'two';
  page.browseWordList();
  assert.ok(calls[0].includes('id=two&'));
});

test('wordbook card tap directly opens the tapped word detail', () => {
  const { page, calls } = loadPage('pages/wordbooks/detail.js');
  page.bookId = 'postgraduate';
  page.data.entries = [{ id: 'word-1', learned: false, meanings: [] }];
  page.setData = function (patch) { Object.assign(this.data, patch); };
  page.onCardTap({ id: 'word-1' });
  assert.equal(page.selectedId, 'word-1');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('/pages/library/detail?id=word-1'));
});

test('transport errors are presented as recoverable Chinese messages', () => {
  const { errorMessage } = require('../utils/coreViewModels');
  assert.equal(errorMessage({ errMsg: 'request:fail timeout' }), '连接超时，请检查网络后重试');
  assert.equal(errorMessage({ message: 'request:fail' }), '网络连接失败，请稍后重试');
  assert.equal(errorMessage({ statusCode: 502, message: 'request:ok' }), '服务暂时不可用，请稍后重试');
});

test('internal listening references are not shown as learning context', () => {
  const { extraExplanation } = require('../utils/detailExplanation');
  const { toReviewView } = require('../utils/coreViewModels');
  assert.equal(extraExplanation({ usage_scenario: 'listening:listen-001:1' }, 'Wait.', '等等。'), null);
  assert.equal(toReviewView({ content: 'Wait.', source_context: 'listening:listen-001:1' }).context, '');
  assert.equal(toReviewView({ content: 'Wait.', source_context: 'At the station.' }).context, 'At the station.');
});
