const test = require('node:test');
const assert = require('node:assert/strict');

test('wordbook entry detail mapper keeps arabic rank, neighbors and collocations', () => {
  const { mappers } = require('../utils/api/index');
  const mapped = mappers.mapWordbookEntryDetail({
    book: { id: 'b1', code: 'postgraduate', title: '考研', description: '', item_count: 3, user_state: { state: 'learning' } },
    entry: { id: 'e2', position: 2, content: 'variable', chinese: 'n.变量；adj.可变的', progress_state: 'not_started' },
    unmastered_rank: 2,
    unmastered_total: 5390,
    prev_entry: { id: 'e1', content: 'various' },
    next_entry: { id: 'e3', content: 'design' },
    collocations: [{ en: 'variable weather', zh: '多变的天气' }]
  });
  assert.equal(mapped.unmasteredRank, 2);
  assert.equal(mapped.unmasteredTotal, 5390);
  assert.equal(mapped.prevEntry.content, 'various');
  assert.equal(mapped.nextEntry.content, 'design');
  assert.equal(mapped.collocations[0].en, 'variable weather');
  assert.equal(mapped.exampleEn, '');
  assert.equal(mapped.entry.chinese.startsWith('n.'), true);
});

test('wordbook study mapper exposes due/new plan fields and item kind', () => {
  const { mappers } = require('../utils/api/index');
  const views = require('../utils/coreViewModels');
  const mapped = mappers.mapWordbook({
    id: 'book-1',
    code: 'cet4',
    title: 'CET4',
    description: 'Core words',
    item_count: 4383,
    user_state: {
      state: 'learning',
      learned_count: 162,
      item_count: 4383,
      unlearned_count: 4221,
      due_count: 18,
      upcoming_new_count: 20,
      new_words_per_session: 20,
      has_active_session: true
    }
  });
  assert.equal(mapped.userState.learnedCount, 162);
  assert.equal(mapped.userState.dueCount, 18);
  assert.equal(mapped.userState.upcomingNewCount, 20);
  assert.equal(mapped.userState.newWordsPerSession, 20);
  assert.equal(mapped.userState.hasActiveSession, true);

  const session = mappers.mapWordbookReviewSession({
    domain: 'wordbook',
    book_code: 'cet4',
    session_id: 's1',
    status: 'active',
    planned_new_count: 20,
    planned_review_count: 8,
    progress: { completed: 0, total: 28 },
    current_item: {
      session_item_id: 'i1',
      material_item_id: 'm1',
      question_token: 'q1',
      content: 'approach',
      chinese: '接近',
      item_kind: 'new',
      attempt_no: 1,
      wrong_count: 0,
      flow_state: 'question',
      options: [{ option_id: 'correct', text: '接近' }]
    }
  });
  assert.equal(session.plannedNewCount, 20);
  assert.equal(session.plannedReviewCount, 8);
  assert.equal(session.currentItem.itemKind, 'new');
  const view = views.toWordbookStudyView(session.currentItem);
  assert.equal(view.en, 'approach');
  assert.equal(view.itemKind, 'new');
  assert.equal(view.id, 'm1');
});

test('wordbook detail startLearning opens the study session', async () => {
  let pageDefinition = null;
  let navigationUrl = '';
  const calls = [];
  global.wx = {
    getWindowInfo() { return { statusBarHeight: 20 }; },
    getSystemInfoSync() { return { statusBarHeight: 20 }; },
    navigateTo({ url }) { navigationUrl = url; },
    navigateBack() {},
    showToast() {},
    showModal() {},
    pageScrollTo() {},
    getMenuButtonBoundingClientRect() { return { left: 280 }; }
  };
  global.Page = (definition) => { pageDefinition = definition; };
  const apiPath = require.resolve('../utils/api/index');
  const originalApi = require.cache[apiPath];
  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: {
      wordbooks: {
        async get() {
          return {
            book: {
              id: 'id-1', code: 'cet4', title: '大学英语四级词汇', description: 'Core',
              itemCount: 100,
              userState: {
                state: 'learning', learnedCount: 10, itemCount: 100, unlearnedCount: 90,
                dueCount: 4, upcomingNewCount: 20, newWordsPerSession: 20, hasActiveSession: false
              }
            }
          };
        },
        async listEntries(_code, params) {
          calls.push(['entries', params]);
          const learned = params && params.progress === 'learned';
          return {
            items: learned ? [] : [{ id: 'e1', englishText: 'approach', chinese: '接近', progressState: 'not_started', inLibrary: false }],
            total: learned ? 0 : 1,
            nextOffset: null
          };
        },
        async startOrContinue() { calls.push('start'); return {}; },
        async createReviewSession() {
          calls.push('session');
          return { sessionId: 'sess-1', status: 'active', progress: { total: 24 } };
        },
        async updateSettings() { return {}; },
        async addEntryToLibrary(_book, _id, _action, participates) {
          calls.push(['add', participates]);
          return { status: 'created', card: { id: 'card-1', version: 1 } };
        },
        async updateProgress(_book, id, payload) {
          calls.push(['progress', payload.status]);
          return {
            book: {
              id: 'id-1', code: 'cet4', title: '大学英语四级词汇', description: 'Core',
              itemCount: 100,
              userState: {
                state: 'learning', learnedCount: payload.status === 'learned' ? 11 : 10,
                itemCount: 100, unlearnedCount: payload.status === 'learned' ? 89 : 90,
                dueCount: 4, upcomingNewCount: 20, newWordsPerSession: 20, hasActiveSession: false
              }
            },
            entry: { id, progressState: payload.status === 'learned' ? 'learned' : 'not_started' }
          };
        }
      }
    }
  };
  delete require.cache[require.resolve('../pages/wordbooks/detail')];
  require('../pages/wordbooks/detail');
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (patch, cb) {
    Object.assign(this.data, patch);
    if (typeof cb === 'function') cb.call(this);
  };
  page.bookId = 'cet4';
  page.nextOffset = 0;
  await page.refresh();
  assert.equal(calls.find((item) => Array.isArray(item) && item[0] === 'entries')[1].progress, 'all');
  assert.equal(page.data.completed, false);
  assert.equal(page.data.ctaDisabled, false);
  assert.equal(page.data.dueCount, 4);
  assert.equal(page.data.upcomingNewCount, 20);
  assert.equal(page.data.progressPercentLabel, '10%');
  assert.deepEqual(page.data.filters.map((item) => item.label), ['全部', '未学', '学习中', '已掌握']);
  assert.equal(page.data.entries[0].statusKind, 'unlearned');
  assert.equal(page.data.entries[0].expanded, false);
  assert.equal(page.data.showMeanings, false);
  assert.deepEqual(page.data.entries[0].meanings, [{ pos: '', meaning: '接近' }]);
  assert.deepEqual(
    page.mapEntries([{
      id: 'e2',
      englishText: 'review',
      chinese: 'n检讨、复习、回顾、检阅;v温习、检讨、评论',
      progressState: 'not_started'
    }])[0].meanings,
    [
      { pos: 'n.', meaning: '检讨、复习、回顾、检阅' },
      { pos: 'v.', meaning: '温习、检讨、评论' }
    ]
  );
  page.onCardTap({ id: 'e1' });
  assert.equal(page.selectedId, 'e1');
  assert.equal(navigationUrl, '/pages/library/detail?id=e1&source=public&from=wordbook&book=cet4&sort=position&progress=all');
  page.toggleMeanings();
  assert.equal(page.data.showMeanings, true);
  page.toggleMeanings();
  assert.equal(page.data.showMeanings, false);
  page.browseWordList();
  assert.equal(
    navigationUrl,
    '/pages/library/detail?id=e1&source=public&from=wordbook&book=cet4&sort=position&progress=all'
  );
  await page.toggleFavorite({ currentTarget: { dataset: { id: 'e1' } } });
  assert.equal(page.data.entries[0].joined, true);
  assert.ok(calls.some((item) => item[0] === 'add' && item[1] === false));
  await page.startLearning();
  assert.ok(calls.includes('start'));
  assert.ok(calls.includes('session'));
  assert.equal(navigationUrl, '/pages/wordbooks/study?code=cet4&session_id=sess-1');
  page.applyDetail({
    book: {
      id: 'id-1', code: 'cet4', title: '大学英语四级词汇', description: 'Core',
      itemCount: 100,
      userState: {
        state: 'completed', learnedCount: 100, itemCount: 100, unlearnedCount: 0,
        dueCount: 0, upcomingNewCount: 0, newWordsPerSession: 20, hasActiveSession: false
      }
    }
  });
  assert.equal(page.data.completed, true);
  assert.equal(page.data.progressPercent, 100);
  assert.equal(page.data.ctaDisabled, false);
  page.nextOffset = 30;
  page.setData({ totalEntries: 100 });
  const progressCallsBeforeGuard = calls.filter((item) => item[0] === 'progress').length;
  await page.masterEntry({ currentTarget: { dataset: { id: 'e1' } } });
  assert.equal(calls.filter((item) => item[0] === 'progress').length, progressCallsBeforeGuard);
  page.data.progressFilter = 'not_started';
  await page.masterEntry({ currentTarget: { dataset: { id: 'e1' } } });
  assert.equal(page.data.entries.length, 0);
  assert.equal(page.nextOffset, 29);
  assert.equal(page.data.totalEntries, 99);
  await page.chooseFilter({ currentTarget: { dataset: { progress: 'learned' } } });
  assert.equal(page.data.progressFilter, 'learned');
  assert.equal(page.data.entries.length, 0);
  await page.changeSort({ detail: { value: '1' } });
  assert.equal(page.data.sortKey, 'alpha');
  const entryCalls = calls.filter((item) => item[0] === 'entries');
  assert.equal(entryCalls[entryCalls.length - 1][1].sort, 'alpha');
  assert.equal(entryCalls[entryCalls.length - 2][1].progress, 'learned');
  await page.chooseFilter({ currentTarget: { dataset: { progress: 'not_started' } } });
  const unlearnedRequest = calls.filter((item) => Array.isArray(item) && item[0] === 'entries').at(-1);
  assert.equal(unlearnedRequest[1].progress, 'not_started');
  if (originalApi) require.cache[apiPath] = originalApi;
  else delete require.cache[apiPath];
});
