const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apiPath = path.resolve(__dirname, '../utils/apiClient.js');
const storagePath = path.resolve(__dirname, '../utils/recordStorage.js');

function loadStorage(storage, listBackendCards, updateBackendCard = async () => {}) {
  global.wx = {
    getStorageSync(key) { return storage.get(key); },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); }
  };

  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: {
      BACKEND_AUTH_STORAGE_KEYS: { userId: 'backendUserId' },
      createBackendCard: async () => { throw new Error('offline'); },
      deleteBackendCard: async () => {},
      updateBackendCard,
      listBackendCards
    }
  };
  delete require.cache[storagePath];
  return require(storagePath);
}

test('card cache and sync cursor are isolated by backend user id', async () => {
  const storage = new Map([
    ['backendUserId', 'user-a'],
    ['cardsCache', Array.from({ length: 85 }, (_, id) => ({ id: `old-${id}` }))],
    ['cardsCache:user:user-a', [{ id: 'a-1', englishText: 'because' }]],
    ['cardsCache:user:user-b', [{ id: 'b-1' }, { id: 'b-2' }]],
    ['cardsLastSyncAt:user:user-b', '2026-08-01T00:00:00Z']
  ]);
  const requests = [];
  const cards = loadStorage(storage, async (params) => {
    requests.push(params);
    return { items: [], total: 0, sync_cursor: '2026-08-31T00:00:00Z' };
  });

  assert.equal((await cards.getCards()).length, 1);
  storage.set('backendUserId', 'user-b');
  assert.equal((await cards.getCards()).length, 2);

  const added = await cards.addCard({ category: '单词', englishText: 'because' });
  assert.equal((await cards.getCards()).length, 3);
  await cards.deleteCard(added.id);
  assert.equal((await cards.getCards()).length, 2);

  await cards.refreshCardsCacheFromBackend();
  assert.equal(requests[0].updated_since, '2026-08-01T00:00:00Z');
  assert.equal(requests[0].include_deleted, true);
  assert.equal(storage.get('cardsCache').length, 85, 'unscoped legacy cache is never adopted');
  assert.equal(storage.get('cardsCache:user:user-a').length, 1);

  const reloadedCards = loadStorage(storage, async () => ({ items: [], total: 0 }));
  assert.equal((await reloadedCards.getCards()).length, 2, 'restart keeps the current user cache');
});

test('card edit retries a safe background-analysis version bump and serializes encounters', async () => {
  const encounteredAt = '2026-09-24T00:00:00.000Z';
  const backendCard = {
    id: 'card-1',
    version: 2,
    content: 'because',
    content_normalized: 'because',
    card_type: 'word',
    participates_in_review: true,
    add_channel: 'manual',
    encounters: [{
      id: '00000000-0000-4000-8000-000000000001',
      where_encountered: 'A grammar book',
      context: '',
      encountered_at: encounteredAt
    }],
    understanding: 'old meaning',
    note: 'old note',
    where_encountered: 'A grammar book',
    analysis_status: 'done',
    analysis_level: 'pass',
    analysis_messages: [],
    understanding_source: 'user',
    review_count: 0,
    mastery_level: 0,
    created_at: encounteredAt,
    updated_at: encounteredAt
  };
  const localCard = {
    id: 'card-1',
    backend_card_id: 'card-1',
    backend_sync_status: 'synced',
    backend_synced_at: encounteredAt,
    version: 1,
    englishText: 'because',
    category: '单词',
    myUnderstanding: 'old meaning',
    notes: 'old note',
    whereEncountered: 'A grammar book',
    exampleSentence: '',
    exampleTranslation: '',
    participatesInReview: true,
    addChannel: 'manual',
    publicMaterialItemId: '',
    sourceWordbookId: '',
    encounters: [{
      id: '00000000-0000-4000-8000-000000000001',
      whereEncountered: 'A grammar book',
      context: '',
      encounteredAt
    }],
    translation: '',
    analysisStatus: 'done',
    reviewState: '未复习',
    reviewCount: 0
  };
  const storage = new Map([
    ['backendUserId', 'user-a'],
    ['cardsCache:user:user-a', [localCard]]
  ]);
  const updatePayloads = [];
  const cards = loadStorage(storage, async () => ({ items: [], total: 0 }), async (_id, payload) => {
    updatePayloads.push(payload);
    if (updatePayloads.length === 1) {
      const error = new Error('version changed by analysis');
      error.statusCode = 409;
      error.data = { detail: { code: 'card_version_conflict', server_card: backendCard } };
      throw error;
    }
    return {
      ...backendCard,
      version: 3,
      content: 'ineffable',
      content_normalized: 'ineffable',
      understanding: 'new meaning',
      note: 'new note',
      where_encountered: 'A novel',
      updated_at: '2026-09-24T00:00:01.000Z'
    };
  });

  const updated = await cards.updateCard('card-1', {
    ...localCard,
    englishText: 'ineffable',
    myUnderstanding: 'new meaning',
    notes: 'new note',
    whereEncountered: 'A novel'
  });

  assert.equal(updatePayloads.length, 2);
  assert.equal(updatePayloads[0].base_version, 1);
  assert.equal(updatePayloads[1].base_version, 2);
  assert.deepEqual(updatePayloads[1].encounters, [{
    id: '00000000-0000-4000-8000-000000000001',
    where_encountered: 'A grammar book',
    context: '',
    encountered_at: encounteredAt
  }]);
  assert.equal(updated.englishText, 'ineffable');
  assert.equal(updated.version, 3);
  assert.equal(updated.backend_sync_status, 'synced');
});
