const test = require('node:test');
const assert = require('node:assert/strict');

let pageDefinition = null;

global.wx = {
  getStorageSync() { return ''; },
  setStorageSync() {}
};
global.Page = function (definition) {
  pageDefinition = definition;
};
global.getApp = function () {
  return { globalData: {} };
};
global.getCurrentPages = function () {
  return [];
};

const apiClient = require('../utils/apiClient');
require('../pages/add/add');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, message, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(5);
  }
  assert.fail(message);
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') {
      cursor[parts[i]] = {};
    }
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function createPage(text = "I'm down.") {
  const page = Object.assign({}, pageDefinition);
  page.data = {
    isLeavingPage: false,
    form: {
      englishText: text,
      myUnderstanding: '',
      notes: ''
    }
  };
  page.analysisGeneration = 1;
  page.setDataCalls = [];
  page.setData = function (patch, callback) {
    this.setDataCalls.push(patch);
    Object.keys(patch).forEach((key) => setByPath(this.data, key, patch[key]));
    if (typeof callback === 'function') callback();
  };
  page._beginStreamPreview(text, 1, Date.now());
  return page;
}

function seedAiAnalysis(page, label = '旧结果 A') {
  Object.assign(page.data, {
    validationResult: { canSave: true },
    englishValidationMessage: '旧校验结果',
    englishValidationType: 'info',
    suggestionText: label,
    suggestionSourceText: page.data.form.englishText,
    showSuggestion: true,
    understandingSuggestion: label,
    understandingVisible: true,
    aiExampleSentence: 'Old example.',
    aiExampleTranslation: '旧例句。',
    aiSynonymsDisplay: 'old 旧',
    aiSimilarPhrasesDisplay: 'previous 以前的',
    aiExpressionTypeLabel: '口语',
    aiAlternativeMeanings: [{ meaning: '旧义', note: '' }],
    aiUsageScenario: '旧场景',
    aiDialogueEnglish: ['Old dialogue.'],
    aiDialogueChinese: ['旧对话。'],
    aiRelatedDisplay: 'old 旧',
    aiAnalysisSource: 'ollama',
    aiAnalysisModel: 'qwen3:8b',
    notesExampleAvailable: true,
    referenceApplied: true
  });
}

function assertAiAnalysisEmpty(page) {
  assert.equal(page.data.validationResult, null);
  assert.equal(page.data.englishValidationMessage, '');
  assert.equal(page.data.suggestionText, '');
  assert.equal(page.data.suggestionSourceText, '');
  assert.equal(page.data.showSuggestion, false);
  assert.equal(page.data.understandingSuggestion, '');
  assert.equal(page.data.understandingVisible, false);
  assert.equal(page.data.aiExampleSentence, '');
  assert.equal(page.data.aiExampleTranslation, '');
  assert.equal(page.data.aiSynonymsDisplay, '');
  assert.equal(page.data.aiSimilarPhrasesDisplay, '');
  assert.equal(page.data.aiExpressionTypeLabel, '');
  assert.deepEqual(page.data.aiAlternativeMeanings, []);
  assert.equal(page.data.aiUsageScenario, '');
  assert.deepEqual(page.data.aiDialogueEnglish, []);
  assert.deepEqual(page.data.aiDialogueChinese, []);
  assert.equal(page.data.aiRelatedDisplay, '');
  assert.equal(page.data.aiAnalysisSource, '');
  assert.equal(page.data.aiAnalysisModel, '');
  assert.equal(page.data.notesExampleAvailable, false);
  assert.equal(page.data.referenceApplied, false);
}

function encodeEvent(event) {
  return new TextEncoder().encode(JSON.stringify(event) + '\n');
}

test('RequestTask chunk listener reassembles Chinese split across UTF-8 chunks', async () => {
  let requestOptions = null;
  let chunkListener = null;
  let eventTypes = [];

  global.wx.request = function (options) {
    requestOptions = options;
    return {
      onChunkReceived(listener) {
        chunkListener = listener;
      },
      abort() {}
    };
  };

  const resultPromise = apiClient.analyzeEnglishDirectStream(
    "I'm down.",
    '句子',
    (event) => eventTypes.push(event.type)
  );

  assert.equal(requestOptions.enableChunked, true);
  assert.equal(requestOptions.onChunkReceived, undefined);
  assert.equal(typeof chunkListener, 'function');

  const payload = [
    JSON.stringify({ type: 'delta', field: 'meaning', text: '这里', seq: 1, attempt: 1 }),
    JSON.stringify({ type: 'final', data: { translation: '这里表示愿意' }, attempt: 1 }),
    JSON.stringify({ type: 'done' })
  ].join('\n') + '\n';
  const bytes = new TextEncoder().encode(payload);
  const splitAt = bytes.indexOf(0xE8) + 1;

  chunkListener({ data: bytes.slice(0, splitAt).buffer });
  chunkListener({ data: bytes.slice(splitAt).buffer });

  const result = await resultPromise;
  assert.deepEqual(result, { translation: '这里表示愿意' });
  assert.deepEqual(eventTypes, ['delta', 'final', 'done']);
});

test('delta appends per field and is merged into a throttled UI update', async () => {
  const page = createPage();
  const startedAt = Date.now();

  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '这里', seq: 1, attempt: 1 },
    "I'm down.", 1, startedAt
  );
  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '通常表示愿意', seq: 2, attempt: 1 },
    "I'm down.", 1, startedAt
  );
  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '重复内容', seq: 2, attempt: 1 },
    "I'm down.", 1, startedAt
  );

  assert.equal(page.setDataCalls.length, 0);
  await wait(80);
  assert.equal(page.data.suggestionText, '这里通常表示愿意');
  assert.equal(page.setDataCalls.length, 1);
});

test('reset clears attempt 1 and field replaces provisional content', async () => {
  const page = createPage();
  const startedAt = Date.now();

  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '第一轮', seq: 1, attempt: 1 },
    "I'm down.", 1, startedAt
  );
  await wait(80);
  assert.equal(page.data.suggestionText, '第一轮');

  page.handleStreamAnalysisEvent(
    { type: 'reset', attempt: 2 },
    "I'm down.", 1, startedAt
  );
  assert.equal(page.data.suggestionText, '');

  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '第二轮临时', seq: 1, attempt: 2 },
    "I'm down.", 1, startedAt
  );
  page.handleStreamAnalysisEvent(
    { type: 'field', field: 'meaning', value: '第二轮字段', attempt: 2 },
    "I'm down.", 1, startedAt
  );
  assert.equal(page.data.suggestionText, '第二轮字段');
  assert.equal(page.data.suggestionText.includes('第一轮'), false);
});

test('the production stream chain automatically applies final.data as authoritative UI state', async () => {
  const page = createPage();
  page.data.form.category = '句子';

  global.wx.request = function (options) {
    let chunkListener = null;
    return {
      onChunkReceived(listener) {
        chunkListener = listener;
        setTimeout(() => {
          const delta = new TextEncoder().encode(
            JSON.stringify({ type: 'delta', field: 'meaning', text: '临时解释', seq: 1, attempt: 1 }) + '\n'
          );
          chunkListener({ data: delta.buffer });
        }, 0);

        setTimeout(() => {
          const finalData = {
            ok: true,
            level: 'ok',
            normalizedText: "I'm down.",
            category: 'sentence',
            errors: [],
            warnings: [],
            translation: '最终权威结果',
            provider: 'ollama',
            exampleSentence: 'I am down for it.',
            exampleTranslation: '我愿意。',
            usageScenario: '朋友之间',
            expressionType: 'colloquial',
            alternativeMeanings: [],
            dialogue: { english: [], chinese: [] },
            synonyms: [],
            similarPhrases: [],
            analysisSource: 'ollama',
            analysisModel: 'qwen3:8b'
          };
          const ending = new TextEncoder().encode([
            JSON.stringify({ type: 'final', data: finalData, attempt: 1 }),
            JSON.stringify({ type: 'done' })
          ].join('\n') + '\n');
          chunkListener({ data: ending.buffer });
          options.success({ statusCode: 200, data: new ArrayBuffer(0) });
        }, 85);
      },
      abort() {
        options.fail({ errMsg: 'request:fail abort' });
      }
    };
  };

  await page.runInputAnalysis("I'm down.", '句子');

  assert.equal(
    page.setDataCalls.some((patch) => patch.suggestionText === '临时解释'),
    true
  );
  assert.equal(page.data.suggestionText, '最终权威结果');
  assert.equal(page.data.suggestionText.includes('临时解释'), false);
});

test('direct fallback reuses the key and replaces a partial stream instead of appending', async () => {
  const page = createPage();
  page.data.form.category = '句子';
  let streamKey = '';
  let directKey = '';
  let streamRequests = 0;
  let directRequests = 0;

  global.wx.request = function (options) {
    if (options.url.endsWith('/api/analyze-english/stream')) {
      streamRequests += 1;
      streamKey = options.header['Idempotency-Key'];
      return {
        onChunkReceived(listener) {
          setTimeout(() => {
            const delta = new TextEncoder().encode(
              JSON.stringify({ type: 'delta', field: 'meaning', text: '半截临时内容', seq: 1, attempt: 1 }) + '\n'
            );
            listener({ data: delta.buffer });
          }, 0);
          setTimeout(() => {
            options.success({ statusCode: 200, data: new ArrayBuffer(0) });
          }, 85);
        },
        abort() {
          options.fail({ errMsg: 'request:fail abort' });
        }
      };
    }

    if (options.url.endsWith('/api/analyze-english')) {
      directRequests += 1;
      directKey = options.header['Idempotency-Key'];
      setTimeout(() => {
        options.success({
          statusCode: 200,
          data: {
            ok: true,
            level: 'ok',
            normalizedText: "I'm down.",
            category: 'sentence',
            errors: [],
            warnings: [],
            translation: 'direct 最终结果',
            provider: 'ollama',
            exampleSentence: 'I am down for it.',
            exampleTranslation: '我愿意。',
            usageScenario: '朋友之间',
            expressionType: 'colloquial',
            alternativeMeanings: [],
            dialogue: { english: [], chinese: [] },
            synonyms: [],
            similarPhrases: [],
            analysisSource: 'ollama',
            analysisModel: 'qwen3:8b'
          }
        });
      }, 0);
      return { abort() {} };
    }

    throw new Error('unexpected request: ' + options.url);
  };

  await page.runInputAnalysis("I'm down.", '句子');

  assert.equal(page.setDataCalls.some((patch) => patch.suggestionText === '半截临时内容'), true);
  assert.equal(page.data.suggestionText, 'direct 最终结果');
  assert.equal(page.data.suggestionText.includes('半截'), false);
  assert.equal(streamRequests, 1);
  assert.equal(directRequests, 1);
  assert.equal(directKey, streamKey);
});

test('AI analyze clears an old final immediately and bypasses the existing AI cache', async () => {
  const page = createPage();
  page.data.form.category = '句子';
  page.data.isReadonlyDetailMode = false;
  page.data.isAnalyzing = false;
  seedAiAnalysis(page);

  let cacheReads = 0;
  let streamRequest = null;
  page.getAnalyzeCacheItem = function () {
    cacheReads += 1;
    return { understanding: { candidate: '缓存结果' } };
  };

  global.wx.request = function (options) {
    streamRequest = options;
    return {
      onChunkReceived() {},
      abort() {
        options.fail({ errMsg: 'request:fail abort' });
      }
    };
  };

  page.onAnalyzeTap();

  assertAiAnalysisEmpty(page);
  assert.equal(page.data.isAnalyzing, true);
  assert.ok(streamRequest, 'explicit AI analyze must create a new stream HTTP request');
  assert.equal(streamRequest.data.forceRefresh, true);
  assert.equal(cacheReads, 0, 'force refresh must bypass the old frontend AI cache');
  assert.ok(streamRequest.header['Idempotency-Key']);

  page.onCancelAnalyzeTap();
  await wait(0);
  assertAiAnalysisEmpty(page);
  assert.equal(page.data.isAnalyzing, false);
});

test('regenerate clears final A, and cancelling partial B leaves the whole AI area empty', async () => {
  const page = createPage();
  page.data.form.category = '句子';
  page.data.isRegenerating = false;
  page.data.translating = false;
  seedAiAnalysis(page, '完整结果 A');

  let streamRequest = null;
  let chunkListener = null;
  let cacheWrites = 0;
  page.setAnalyzeCacheItem = function () {
    cacheWrites += 1;
  };

  global.wx.request = function (options) {
    streamRequest = options;
    return {
      onChunkReceived(listener) {
        chunkListener = listener;
      },
      abort() {
        options.fail({ errMsg: 'request:fail abort' });
      }
    };
  };

  const regeneration = page.regenerateAnalysis();

  assertAiAnalysisEmpty(page);
  assert.equal(page.data.isAnalyzing, true);
  assert.equal(page.data.isRegenerating, true);
  assert.ok(streamRequest, 'regenerate must create a new stream HTTP request');
  assert.equal(streamRequest.data.forceRefresh, true);
  assert.ok(streamRequest.header['Idempotency-Key']);

  const partial = encodeEvent({
    type: 'delta',
    field: 'meaning',
    text: '结果 B 的半成品',
    seq: 1,
    attempt: 1
  });
  chunkListener({ data: partial.buffer });
  await wait(80);
  assert.equal(page.data.suggestionText, '结果 B 的半成品');

  page.onCancelAnalyzeTap();
  await regeneration;

  assertAiAnalysisEmpty(page);
  assert.equal(page.data.isAnalyzing, false);
  assert.equal(page.data.isRegenerating, false);
  assert.equal(cacheWrites, 0, 'a cancelled generation must not enter the AI cache');
});

test('two rapid cancel and restart cycles create fresh stream tasks and keys', async () => {
  const page = createPage();
  page.data.form.category = '句子';
  page.data.isReadonlyDetailMode = false;
  page.data.isAnalyzing = false;
  page.data.isRegenerating = false;
  page.data.translating = false;

  const streamRequests = [];
  let directRequests = 0;
  const cacheWrites = [];
  page.setAnalyzeCacheItem = function (cacheKey, value) {
    cacheWrites.push({ cacheKey, value });
  };

  global.wx.request = function (options) {
    if (options.url.endsWith('/api/analyze-english/stream')) {
      const record = {
        options,
        key: options.header['Idempotency-Key'],
        listener: null,
        abortCount: 0
      };
      streamRequests.push(record);
      return {
        onChunkReceived(listener) {
          record.listener = listener;
        },
        abort() {
          record.abortCount += 1;
          // Match the real RequestTask race: abort() returns before fail()
          // settles the old Promise and reaches its finally block. Deliberately
          // omit the word "abort": stale generation identity must still prevent
          // the cancelled request from entering direct fallback.
          setTimeout(() => options.fail({ errMsg: 'request:fail socket closed' }), 20);
        }
      };
    }

    if (options.url.endsWith('/api/analyze-english')) {
      directRequests += 1;
      throw new Error('cancel must not trigger direct fallback');
    }

    throw new Error('unexpected request: ' + options.url);
  };

  function emitDelta(record, text, seq = 1) {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ type: 'delta', field: 'meaning', text, seq, attempt: 1 }) + '\n'
    );
    record.listener({ data: bytes.buffer });
  }

  function finish(record, translation) {
    const finalData = {
      ok: true,
      level: 'ok',
      normalizedText: "I'm down.",
      category: 'sentence',
      errors: [],
      warnings: [],
      translation,
      provider: 'ollama',
      exampleSentence: 'I am down for it.',
      exampleTranslation: '我愿意。',
      usageScenario: '朋友之间',
      expressionType: 'colloquial',
      alternativeMeanings: [],
      dialogue: { english: [], chinese: [] },
      synonyms: [],
      similarPhrases: [],
      analysisSource: 'ollama',
      analysisModel: 'qwen3:8b'
    };
    const bytes = new TextEncoder().encode([
      JSON.stringify({ type: 'final', data: finalData, attempt: 1 }),
      JSON.stringify({ type: 'done' })
    ].join('\n') + '\n');
    record.listener({ data: bytes.buffer });
    record.options.success({ statusCode: 200, data: new ArrayBuffer(0) });
  }

  page.onAnalyzeTap();
  await waitFor(() => streamRequests.length === 1, 'first stream request was not created');
  emitDelta(streamRequests[0], '第一', 1);
  emitDelta(streamRequests[0], '轮', 2);
  emitDelta(streamRequests[0], '临时', 3);
  await wait(80);
  assert.equal(page.data.suggestionText, '第一轮临时');

  page.onCancelAnalyzeTap();
  assert.equal(page.data.isAnalyzing, false);
  assert.equal(page._activeStreamTask, null);
  assert.equal(Object.keys(page._inflightAnalyze || {}).length, 0);
  assertAiAnalysisEmpty(page);
  page.onAnalyzeTap();
  assert.equal(streamRequests.length, 2, 'first restart must create a new HTTP stream immediately');
  assert.notEqual(streamRequests[1].key, streamRequests[0].key);
  assert.equal(streamRequests[1].options.data.forceRefresh, true);

  // Late chunk/final/success/finally from request 1 must not overwrite request
  // 2 or put the cancelled generation into the cache.
  emitDelta(streamRequests[0], '旧请求一晚到', 4);
  finish(streamRequests[0], '旧请求一晚到的最终结果');
  emitDelta(streamRequests[1], '第二', 1);
  emitDelta(streamRequests[1], '轮', 2);
  emitDelta(streamRequests[1], '临时', 3);
  await wait(80);
  assert.equal(page.data.suggestionText, '第二轮临时');
  assert.equal(cacheWrites.length, 0);

  page.onCancelAnalyzeTap();
  assert.equal(page.data.isAnalyzing, false);
  assert.equal(page._activeStreamTask, null);
  assert.equal(Object.keys(page._inflightAnalyze || {}).length, 0);
  assertAiAnalysisEmpty(page);
  page.onAnalyzeTap();
  assert.equal(streamRequests.length, 3, 'second restart must also create a new HTTP stream immediately');
  assert.notEqual(streamRequests[2].key, streamRequests[1].key);
  assert.equal(new Set(streamRequests.map((item) => item.key)).size, 3);

  // Request 2 may settle after request 3 is active; its stale finally must not
  // clear request 3's preview timer or task reference.
  emitDelta(streamRequests[1], '旧请求二晚到', 4);
  finish(streamRequests[1], '旧请求二晚到的最终结果');
  emitDelta(streamRequests[2], '第三', 1);
  emitDelta(streamRequests[2], '轮', 2);
  emitDelta(streamRequests[2], '临时', 3);
  await wait(80);
  assert.equal(page.data.suggestionText, '第三轮临时');
  assert.equal(page._activeStreamTask && page._activeStreamTask.task !== null, true);
  assert.equal(cacheWrites.length, 0);

  finish(streamRequests[2], '第三轮最终结果');
  await waitFor(() => page.data.isAnalyzing === false, 'third stream did not complete');
  assert.equal(page.data.suggestionText, '第三轮最终结果');
  assert.equal(streamRequests[0].abortCount, 1);
  assert.equal(streamRequests[1].abortCount, 1);
  assert.equal(directRequests, 0);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0].value.understanding.candidate, '第三轮最终结果');
  assert.equal(page._activeStreamTask, null);
  assert.equal(Object.keys(page._inflightAnalyze || {}).length, 0);
});

test('cancel clears the pending timer so no later provisional setData occurs', async () => {
  const page = createPage();

  page.handleStreamAnalysisEvent(
    { type: 'delta', field: 'meaning', text: '不应显示', seq: 1, attempt: 1 },
    "I'm down.", 1, Date.now()
  );
  page.invalidatePendingAnalysis();
  page.abortActiveAnalysis();

  await wait(80);
  assert.equal(page.setDataCalls.length, 0);
  assert.equal(page.data.suggestionText, undefined);
});
