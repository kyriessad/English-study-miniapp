const test = require('node:test');
const assert = require('node:assert/strict');

let pageDefinition = null;
let validationHandler = async () => ({
  level: 'pass',
  category: 'word',
  normalizedText: 'because',
  warnings: [],
  errors: [],
  evidence: [],
  canSave: true,
  canAnalyze: true,
  canPronounce: true
});
let downloadHandler = async () => '';
let toastTitles = [];

global.wx = {
  getStorageSync() { return ''; },
  setStorageSync() {},
  removeStorageSync() {},
  showToast(options) { toastTitles.push(options && options.title); },
  navigateBack() {},
  setNavigationBarTitle() {},
  pageScrollTo() {},
  createSelectorQuery() {
    return {
      select() { return this; },
      boundingClientRect() { return this; },
      selectViewport() { return this; },
      scrollOffset() { return this; },
      exec(callback) { callback([{ top: 0 }, { scrollTop: 0 }]); }
    };
  }
};
global.Page = function (definition) { pageDefinition = definition; };
global.getApp = function () { return { globalData: {} }; };
global.getCurrentPages = function () { return []; };

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../utils/cardStorageFacade', {
  addCard: async () => ({ id: 'saved-card', backend_sync_status: 'synced' }),
  getCardById: async () => null,
  updateCard: async () => null,
  deleteCard: async () => null,
  updateBackendCardSyncState() {},
  DEFAULT_EXAM_SCENE: 'daily',
  DEFAULT_EXAM_MODULE: 'default'
});
mockModule('../utils/apiClient', {
  updateBackendCard: async () => null,
  validateEnglish: (...args) => validationHandler(...args),
  analyzeEnglishDirect: async () => null,
  analyzeEnglishDirectStream: async () => null,
  downloadPronunciationAudio: (...args) => downloadHandler(...args),
  downloadDiagnosticTestAudio: (...args) => downloadHandler(...args),
  getLastTtsRequestId: () => '',
  logTtsDiagnostic() {}
});
mockModule('../utils/pronunciation', {
  createPronunciationController: () => null,
  getStoredVoice: () => 'female',
  DEFAULT_VOICE: 'female'
});
mockModule('../utils/inputContext', {
  getInputContext: () => ({ examScene: 'daily', examModule: 'default' }),
  saveInputContext() {}
});

require('../pages/add/add');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!cursor[parts[index]] || typeof cursor[parts[index]] !== 'object') cursor[parts[index]] = {};
    cursor = cursor[parts[index]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function createPage(text = 'becuase') {
  toastTitles = [];
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.data.deferNonCriticalReady = true;
  page.data.isReadonlyDetailMode = false;
  page.data.isLeavingPage = false;
  page.data.isEdit = false;
  page.data.form = {
    category: page.data.categoryOptions[0],
    examScene: 'daily',
    examModule: 'default',
    englishText: text,
    whereEncountered: 'source',
    myUnderstanding: 'understanding',
    notes: 'notes'
  };
  page.validationGeneration = 0;
  page.analysisGeneration = 0;
  page.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]));
    if (callback) callback();
  };
  return page;
}

test('AI restriction has inline reason before click and uses unified toast', async () => {
  const page = createPage();
  let analyzeCalls = 0;
  page.runInputAnalysis = () => { analyzeCalls += 1; };
  validationHandler = async () => ({
    level: 'warning',
    category: 'word',
    normalizedText: 'becuase',
    warnings: ['拼写可能有误：becuase。你是不是想写 because？'],
    errors: [],
    evidence: [{ source: 'symspell', type: 'spelling', result: 'suggestion', polarity: 'warning' }],
    warningTypes: ['CONTENT_WARNING'],
    canSave: true,
    canAnalyze: false,
    canPronounce: false
  });

  await page.ensureEnglishValidation({ force: true, trigger: 'debounce' });
  assert.equal(page.data.validationVisibleIssues.some((item) => item.type === 'capability'), true);

  page.onAnalyzeTap();
  await wait(0);
  assert.equal(analyzeCalls, 0);
  assert.deepEqual(toastTitles, ['请先修改英文内容']);
});

test('pronunciation restriction has inline reason before click and uses unified toast', async () => {
  const page = createPage('doomscroll');
  page.data.isEdit = true;
  page.pronunciationController = {};
  let downloads = 0;
  downloadHandler = async () => { downloads += 1; return ''; };
  validationHandler = async () => ({
    level: 'pass',
    category: 'word',
    normalizedText: 'doomscroll',
    warnings: [],
    errors: [],
    evidence: [{ source: 'ecdict', type: 'lexical_match', result: 'miss', polarity: 'neutral' }],
    canSave: true,
    canAnalyze: true,
    canPronounce: false
  });

  await page.ensureEnglishValidation({ force: true, trigger: 'debounce' });
  assert.deepEqual(page.data.validationVisibleIssues.map((item) => item.message), [
    '暂时无法确认这个词的可靠发音'
  ]);

  await page.onOriginalPronunciationTap();
  assert.equal(downloads, 0);
  assert.deepEqual(toastTitles, ['请先修改英文内容']);
});
