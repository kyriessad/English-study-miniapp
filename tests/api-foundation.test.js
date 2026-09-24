const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apiClientPath = path.resolve(__dirname, '../utils/apiClient.js');
const apiIndexPath = path.resolve(__dirname, '../utils/api/index.js');

function loadApiClient({ requestHandler, loginHandler } = {}) {
  const storage = new Map();
  const calls = [];
  global.getApp = () => ({ globalData: {} });
  global.wx = {
    getStorageSync(key) { return storage.get(key) || ''; },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); },
    login(options) {
      if (loginHandler) return loginHandler(options, calls);
      options.success({ code: 'code-1' });
    },
    request(options) {
      calls.push(options);
      if (requestHandler) return requestHandler(options, storage, calls);
      options.success({ statusCode: 200, data: {} });
    }
  };
  delete require.cache[apiClientPath];
  return { api: require(apiClientPath), storage, calls };
}

test('transport coalesces concurrent 401 refreshes and replays each request once', async () => {
  let loginCount = 0;
  let protectedCount = 0;
  const { api, storage } = loadApiClient({
    loginHandler(options) {
      loginCount += 1;
      setTimeout(() => options.success({ code: `code-${loginCount}` }), 0);
    },
    requestHandler(options, currentStorage) {
      if (options.url.endsWith('/api/auth/wechat-login')) {
        options.success({
          statusCode: 200,
          data: { user_id: 'user-a', access_token: 'token-a' }
        });
        return;
      }
      if (options.url.endsWith('/api/me')) {
        protectedCount += 1;
        if (protectedCount <= 3) {
          options.success({ statusCode: 401, data: { detail: 'expired' } });
        } else {
          options.success({ statusCode: 200, data: { id: 'user-a' } });
        }
        return;
      }
      options.success({ statusCode: 200, data: {} });
    }
  });

  const responses = await Promise.all([
    api.request({ url: '/api/me' }),
    api.request({ url: '/api/me' }),
    api.request({ url: '/api/me' })
  ]);

  assert.equal(loginCount, 1);
  assert.equal(protectedCount, 6);
  assert.equal(responses.length, 3);
  assert.equal(storage.get('backendAccessToken'), 'token-a');
});

test('logout invalidates an in-flight refresh and prevents auth restoration', async () => {
  let resolveLogin;
  let loginCount = 0;
  const { api, storage } = loadApiClient({
    loginHandler(options) {
      loginCount += 1;
      resolveLogin = options.success;
    },
    requestHandler(options) {
      options.success({ statusCode: 200, data: { user_id: 'user-a', access_token: 'token-a' } });
    }
  });

  const refresh = api.refreshBackendAuth();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await api.logoutBackendAuth();
  resolveLogin({ code: 'late-code' });

  await assert.rejects(refresh, (error) => error.code === 'AUTH_STATE_CHANGED');
  assert.equal(loginCount, 1);
  assert.equal(storage.has('backendAccessToken'), false);
  assert.equal(api.getBackendAuthState().status, 'unauthenticated');
});

test('discovery domain maps stable daily, category cursor, and public detail contracts', () => {
  const mappers = require('../utils/api/mappers');
  const daily = mappers.mapDailyDiscovery({
    display_date: '2026-09-13',
    timezone: 'Asia/Shanghai',
    batch_key: 'batch-1',
    items: [{
      id: 'item-1', content: 'Take your time.', chinese: '慢慢来。',
      domain: 'life', category_code: 'life.daily-life', category_title: '日常生活',
      in_library: true
    }]
  });
  assert.equal(daily.items.length, 1);
  assert.equal(daily.item.categoryCode, 'life.daily-life');
  assert.equal(daily.item.inLibrary, true);

  const page = mappers.mapDiscoveryCursorResponse({
    category: { code: 'life.daily-life', title: '日常生活', item_count: 2 },
    items: [{ id: 'item-1', content: 'Take your time.' }],
    limit: 1,
    next_cursor: 'cursor-1',
    has_more: true
  });
  assert.equal(page.category.itemCount, 2);
  assert.equal(page.nextCursor, 'cursor-1');
  assert.equal(page.hasMore, true);

  const detail = mappers.mapPublicMaterialDetail({
    item: { id: 'item-1', content: 'Take your time.' },
    analysis_status: 'failed',
    analysis_error: { code: 'public_analysis_failed', retryable: true }
  });
  assert.equal(detail.analysisStatus, 'failed');
  assert.equal(detail.item.id, 'item-1');
  assert.equal(detail.analysisError.retryable, true);
});

test('wordbook domain keeps progress and PersonalCard membership separate', () => {
  const mappers = require('../utils/api/mappers');
  const detail = mappers.mapWordbookDetail({
    book: {
      id: 'book-1', code: 'cet4', title: 'CET4', description: 'Core words', item_count: 500,
      user_state: {
        state: 'learning', learned_count: 12, item_count: 500, next_position: 13,
        started_at: '2026-09-13T00:00:00Z', last_accessed_at: '2026-09-13T01:00:00Z'
      }
    },
    next_entry: {
      id: 'entry-13', position: 13, content: 'curious', chinese: '好奇的',
      card_type: 'word', source_label: 'CET4', progress_state: 'learning', in_library: true
    }
  });
  assert.equal(detail.book.userState.learnedCount, 12);
  assert.equal(detail.book.userState.nextPosition, 13);
  assert.equal(detail.book.userState.dueCount, 0);
  assert.equal(detail.book.userState.newWordsPerSession, 20);
  assert.equal(detail.nextEntry.progressState, 'learning');
  assert.equal(detail.nextEntry.inLibrary, true);

  const page = mappers.mapWordbookEntryList({
    book: detail.book.raw,
    items: [detail.nextEntry.raw],
    total: 500,
    limit: 20,
    offset: 0,
    next_offset: 20
  });
  assert.equal(page.items[0].englishText, 'curious');
  assert.equal(page.nextOffset, 20);
});

test('transport errors are normalized as AppError with stable codes', async () => {
  const { api } = loadApiClient({
    requestHandler(options) {
      options.success({ statusCode: 422, data: { detail: 'invalid input' } });
    }
  });

  await assert.rejects(api.request({ url: '/api/me' }), (error) => {
    assert.equal(error.name, 'AppError');
    assert.equal(error.code, 'BUSINESS_ERROR');
    assert.equal(error.statusCode, 422);
    assert.equal(error.message, 'invalid input');
    return true;
  });
});

test('free example lookup uses the non-AI backend endpoint', async () => {
  const { api, calls } = loadApiClient({
    requestHandler(options) {
      options.success({
        statusCode: 200,
        data: {
          found: true,
          exampleSentence: 'Our galaxy is called the Milky Way.',
          exampleTranslation: '我们的星系叫银河系。',
          provider: 'tatoeba'
        }
      });
    }
  });

  const result = await api.searchFreeExample('the Milky Way');
  assert.equal(result.provider, 'tatoeba');
  assert.match(calls[0].url, /\/api\/examples\/search\?text=the%20Milky%20Way$/);
  assert.equal(calls[0].method, 'GET');
});

test('domain API and mappers expose stable camelCase boundaries', async () => {
  delete require.cache[apiIndexPath];
  const { mappers } = require(apiIndexPath);
  assert.deepEqual(mappers.mapCard({
    id: 'card-1', content: 'make it', content_normalized: 'make it',
    card_type: 'phrase', review_state: 'reviewing', next_review_at: '2026-09-12T00:00:00Z'
  }), {
    id: 'card-1', englishText: 'make it', normalizedText: 'make it', category: 'phrase',
    participatesInReview: true, addChannel: 'manual', publicMaterialItemId: null, sourceWordbookId: null,
    encounters: [],
    understanding: '', translation: '', note: '', whereEncountered: '', sourceContext: '', sourceUrl: '',
    exampleSentence: '', exampleTranslation: '', analysisStatus: '', isReviewReady: true, reviewState: 'reviewing',
    nextReviewAt: '2026-09-12T00:00:00Z', version: 0, deletedAt: null,
    raw: {
      id: 'card-1', content: 'make it', content_normalized: 'make it', card_type: 'phrase',
      review_state: 'reviewing', next_review_at: '2026-09-12T00:00:00Z'
    }
  });
  assert.deepEqual(mappers.mapCardListResponse({
    items: [], total: 0, limit: 20, offset: 40, sync_cursor: 'cursor-1', server_time: 'now'
  }), {
    items: [], total: 0, limit: 20, offset: 40, syncCursor: 'cursor-1', serverTime: 'now',
    raw: { items: [], total: 0, limit: 20, offset: 40, sync_cursor: 'cursor-1', server_time: 'now' }
  });
  assert.deepEqual(mappers.mapReviewSessionResponse({
    session_id: 'session-1', session_type: 'daily_suggested',
    progress: { reviewed: 1, total: 5 }, items: [{ session_item_id: 'item-1', card_id: 'card-1' }]
  }).items[0], {
    sessionItemId: 'item-1', cardId: 'card-1', questionId: '', content: '', translation: '', note: '',
    cardType: 'auto',
    whereEncountered: '', sourceContext: '', exampleSentence: '', exampleTranslation: '', understanding: '',
    options: [], isRepeat: false, attemptNo: 1, flowState: 'question', wrongCount: 0,
    raw: { session_item_id: 'item-1', card_id: 'card-1' }
  });

  const wordbookReview = mappers.mapWordbookReviewSession({
    domain: 'wordbook', book_id: 'book-1', book_code: 'cet4', session_id: 'session-2',
    resume_token: 'resume-1', status: 'active', progress: { completed: 0, total: 5 },
    current_item: {
      session_item_id: 'item-2', material_item_id: 'material-1', question_token: 'question-1',
      content: 'abandon', chinese: '放弃', attempt_no: 2, wrong_count: 1,
      flow_state: 'question', options: [{ option_id: 'correct', text: '放弃' }]
    },
    transition: 'wrong_first', navigation: 'stay', detail_delay_ms: 0, is_correct: false
  });
  assert.equal(wordbookReview.domain, 'wordbook');
  assert.equal(wordbookReview.resumeToken, 'resume-1');
  assert.equal(wordbookReview.currentItem.flowState, 'question');
  assert.equal(wordbookReview.currentItem.wrongCount, 1);
  assert.equal(wordbookReview.currentItem.itemKind, 'review');
  assert.equal(wordbookReview.currentItem.options[0].optionId, 'correct');
  assert.equal(wordbookReview.navigation, 'stay');
});

test('first-release view models join manual cards, public materials, and personal review', () => {
  const views = require('../utils/coreViewModels');
  const manual = views.toCardView({
    id: 'card-1', englishText: 'take it slow', understanding: '慢一点',
    whereEncountered: '播客', category: 'phrase', addChannel: 'manual',
    participatesInReview: true, version: 2
  });
  assert.equal(manual.source, '自己添加');
  assert.equal(manual.where, '播客');
  assert.equal(manual.participate, true);

  const material = views.toMaterialView({
    id: 'material-1', content: 'make room for', chinese: '为……留出空间',
    categoryTitle: '日常表达', packTitle: '生活英语', inLibrary: true
  }, { example_sentence: 'Make room for what matters.' });
  assert.equal(material.joined, true);
  assert.equal(material.sentence, 'Make room for what matters.');

  const review = views.toReviewView({
    session_item_id: 'session-item-1', card_id: 'card-1', question_id: 'question-1',
    content: 'take it slow', card_type: 'phrase', wrong_count: 1,
    where_encountered: '播客', source_context: 'A host was describing a slow morning.',
    example_sentence: 'Take it slow on your first day.', example_translation: '第一天慢慢来。',
    options: [{ option_id: 'correct', text: '慢一点' }]
  });
  assert.equal(review.wrongCount, 1);
  assert.equal(review.cardType, 'phrase');
  assert.equal(review.where, '播客');
  assert.equal(review.context, 'A host was describing a slow morning.');
  assert.equal(review.example, 'Take it slow on your first day.');
  assert.equal(review.options[0].optionId, 'correct');
  assert.match(views.newClientActionId(), /^[0-9a-f-]{36}$/);
});
