const test = require('node:test');
const assert = require('node:assert/strict');

let pageDefinition = null;
let validationHandler = async () => ({
  level: 'pass', category: 'word', normalizedText: 'because', warnings: [], errors: [], evidence: []
});
let addCardHandler = async () => ({ id: 'saved-card', backend_sync_status: 'synced' });
let downloadHandler = async () => '';

const storage = new Map();
global.wx = {
  getStorageSync(key) { return storage.get(key) || ''; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  showToast() {},
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
  addCard: (...args) => addCardHandler(...args),
  getCardById: async () => null,
  updateCard: async () => null,
  deleteCard: async () => null,
  updateBackendCardSyncState() {},
  DEFAULT_EXAM_SCENE: '日常',
  DEFAULT_EXAM_MODULE: '默认'
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
  getInputContext: () => ({ examScene: '日常', examModule: '默认' }),
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

function createPage(text = 'becuase', category = '单词') {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.data.deferNonCriticalReady = true;
  page.data.isReadonlyDetailMode = false;
  page.data.isLeavingPage = false;
  page.data.isEdit = false;
  page.data.form = {
    category,
    examScene: '日常',
    examModule: '默认',
    englishText: text,
    whereEncountered: '老友记',
    myUnderstanding: '用户自己的理解',
    notes: '用户自己的备注'
  };
  page.validationGeneration = 0;
  page.analysisGeneration = 0;
  page.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]));
    if (callback) callback();
  };
  return page;
}

test('editing clears an old warning immediately and the 1000ms preflight replaces it with silent PASS', async () => {
  const page = createPage();
  page.data.validationStatus = 'warning';
  page.data.validationIssues = [{ type: 'spelling' }];
  page.data.validationVisibleIssues = [{ type: 'spelling' }];
  page.data.validationInputKey = '单词\u0000becuase';
  let requests = 0;
  validationHandler = async (text) => {
    requests += 1;
    return { level: 'pass', category: 'word', normalizedText: text, warnings: [], errors: [], evidence: [] };
  };

  page.onEnglishInput({ detail: { value: 'because' } });
  assert.equal(page.data.validationStatus, 'idle');
  assert.deepEqual(page.data.validationVisibleIssues, []);
  assert.equal(requests, 0);

  await wait(1050);
  assert.equal(requests, 1);
  assert.equal(page.data.validationStatus, 'pass');
  assert.deepEqual(page.data.validationVisibleIssues, []);
  page.onUnload();
});

test('debounced validation auto switches category from backend word phrase and sentence', async () => {
  const labels = pageDefinition.data.categoryOptions;
  const cases = [
    { text: 'because', backendCategory: 'word', expectedCategory: labels[0] },
    { text: 'no way', backendCategory: 'phrase', expectedCategory: labels[1] },
    { text: 'I like this movie.', backendCategory: 'sentence', expectedCategory: labels[2] }
  ];

  for (const item of cases) {
    const page = createPage('', labels[0]);
    let requests = 0;
    validationHandler = async (text, category) => {
      requests += 1;
      assert.equal(text, item.text);
      assert.equal(category, labels[0]);
      return {
        level: 'pass',
        category: item.backendCategory,
        normalizedText: text,
        warnings: [],
        errors: [],
        evidence: []
      };
    };

    page.onEnglishInput({ detail: { value: item.text } });
    assert.equal(requests, 0);

    await wait(1050);
    assert.equal(requests, 1);
    assert.equal(page.data.form.category, item.expectedCategory);
    assert.equal(page.data.categoryIndex, page.data.categoryOptions.indexOf(item.expectedCategory));
    assert.equal(page.data.validationInputKey, `${item.expectedCategory}\u0000${item.text}`);
    page.onUnload();
  }
});

test('new input cancels old debounce timer before validation request is sent', async () => {
  const labels = pageDefinition.data.categoryOptions;
  const page = createPage('', labels[0]);
  const requestedTexts = [];
  validationHandler = async (text) => {
    requestedTexts.push(text);
    return { level: 'pass', category: 'phrase', normalizedText: text, warnings: [], errors: [], evidence: [] };
  };

  page.onEnglishInput({ detail: { value: 'no' } });
  await wait(500);
  page.onEnglishInput({ detail: { value: 'no way' } });
  await wait(1050);

  assert.deepEqual(requestedTexts, ['no way']);
  assert.equal(page.data.form.category, labels[1]);
  page.onUnload();
});

test('stale validation response cannot switch category after newer input', async () => {
  const labels = pageDefinition.data.categoryOptions;
  const page = createPage('', labels[0]);
  let releaseOldResponse;
  const oldResponse = new Promise((resolve) => { releaseOldResponse = resolve; });
  validationHandler = (text) => {
    if (text === 'no way') return oldResponse;
    return Promise.resolve({
      level: 'pass',
      category: 'sentence',
      normalizedText: text,
      warnings: [],
      errors: [],
      evidence: []
    });
  };

  page.onEnglishInput({ detail: { value: 'no way' } });
  await wait(1050);
  assert.equal(page.data.validationStatus, 'checking');

  page.onEnglishInput({ detail: { value: 'I like this movie.' } });
  await wait(1050);
  assert.equal(page.data.form.category, labels[2]);

  releaseOldResponse({
    level: 'pass',
    category: 'phrase',
    normalizedText: 'no way',
    warnings: [],
    errors: [],
    evidence: []
  });
  await wait(0);

  assert.equal(page.data.form.englishText, 'I like this movie.');
  assert.equal(page.data.form.category, labels[2]);
  assert.equal(page.data.validationInputKey, `${labels[2]}\u0000I like this movie.`);
  page.onUnload();
});

test('backend paragraph category does not auto switch existing form category', async () => {
  const labels = pageDefinition.data.categoryOptions;
  const page = createPage('', labels[2]);
  page.data.categoryIndex = page.data.categoryOptions.indexOf(labels[2]);
  const paragraph = 'This is the first sentence. This is the second sentence.';
  validationHandler = async (text) => ({
    level: 'pass',
    category: 'paragraph',
    normalizedText: text,
    warnings: [],
    errors: [],
    evidence: []
  });

  page.onEnglishInput({ detail: { value: paragraph } });
  await wait(1050);

  assert.equal(page.data.form.category, labels[2]);
  assert.equal(page.data.categoryIndex, page.data.categoryOptions.indexOf(labels[2]));
  assert.equal(page.data.validationInputKey, `${labels[2]}\u0000${paragraph}`);
  page.onUnload();
});
test('a rapid AI tap validates first and INVALID never starts AI', async () => {
  const page = createPage('我的');
  let analyzeCalls = 0;
  page.runInputAnalysis = () => { analyzeCalls += 1; };
  validationHandler = async () => ({
    level: 'error',
    category: 'unknown',
    normalizedText: '我的',
    warnings: [],
    errors: ['英文内容请只填写英文，不能包含中文字符。'],
    evidence: []
  });

  page.onAnalyzeTap();
  await wait(0);
  assert.equal(page.data.validationStatus, 'invalid');
  assert.equal(analyzeCalls, 0);
  assert.match(page.data.validationVisibleIssues[0].message, /混入了中文/);
});

test('WARNING proceeds to AI without a second confirmation', async () => {
  const page = createPage();
  let analyzed = null;
  page.runInputAnalysis = (text, category) => { analyzed = { text, category }; };
  validationHandler = async () => ({
    level: 'warning',
    category: 'word',
    normalizedText: 'becuase',
    warnings: ['拼写可能有误：becuase。你是不是想写 because？'],
    errors: [],
    evidence: [{ source: 'symspell', type: 'spelling', result: 'suggestion', polarity: 'warning' }]
  });

  page.onAnalyzeTap();
  await wait(0);
  assert.deepEqual(analyzed, { text: 'becuase', category: '单词' });
  assert.equal(page.data.validationStatus, 'warning');
});

test('CONTENT_WARNING consumes backend capability and never starts AI', async () => {
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

  page.onAnalyzeTap();
  await wait(0);
  assert.equal(analyzeCalls, 0);
  assert.equal(page.data.validationCanSave, true);
  assert.equal(page.data.validationCanAnalyze, false);
  assert.equal(page.data.validationCanPronounce, false);
});

test('CONTENT_WARNING can save without starting background AI', async () => {
  const page = createPage();
  let backgroundCalls = 0;
  let savedCalls = 0;
  let savedForm = null;
  page.runBackgroundEnglishCheck = () => { backgroundCalls += 1; };
  addCardHandler = async (form) => {
    savedCalls += 1;
    savedForm = form;
    return { id: 'content-warning-card', backend_sync_status: 'synced' };
  };
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

  await page.submitCard('back');
  assert.equal(savedCalls, 1);
  assert.equal(backgroundCalls, 0);
  assert.equal(savedForm.analysisStatus, 'failed');
});

test('CONTENT_WARNING never reaches pronunciation download', async () => {
  const page = createPage();
  page.data.isEdit = true;
  page.data.editPronunciationText = 'becuase';
  page.data.editPronunciationVoice = 'male';
  page.pronunciationController = {};
  let downloads = 0;
  downloadHandler = async () => { downloads += 1; return ''; };
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

  await page.onEditPronunciationTap();
  assert.equal(downloads, 0);
  assert.equal(page.data.validationCanPronounce, false);
});

test('a card API 422 returns to the input and preserves all other fields', async () => {
  const page = createPage('normal');
  const originalForm = JSON.parse(JSON.stringify(page.data.form));
  validationHandler = async () => ({
    level: 'pass', category: 'word', normalizedText: 'normal', warnings: [], errors: [], evidence: []
  });
  addCardHandler = async () => {
    throw {
      statusCode: 422,
      data: {
        detail: {
          code: 'invalid_english_content',
          normalizedText: 'normal',
          errors: ['内容需要包含英文。']
        }
      }
    };
  };

  await page.submitCard('back');
  assert.equal(page.data.validationStatus, 'invalid');
  assert.equal(page.data.form.whereEncountered, originalForm.whereEncountered);
  assert.equal(page.data.form.myUnderstanding, originalForm.myUnderstanding);
  assert.equal(page.data.form.notes, originalForm.notes);
  assert.equal(page.data.isSaving, false);
});

test('preflight outage becomes unavailable and does not invent an English error', async () => {
  const page = createPage('because');
  validationHandler = async () => { throw new Error('timeout'); };
  const result = await page.ensureEnglishValidation({ force: true, trigger: 'debounce' });
  assert.equal(result.status, 'unavailable');
  assert.equal(page.data.validationStatus, 'unavailable');
  assert.deepEqual(page.data.validationVisibleIssues, []);
});
