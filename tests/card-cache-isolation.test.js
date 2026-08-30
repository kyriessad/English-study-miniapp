const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apiPath = path.resolve(__dirname, '../utils/apiClient.js');
const storagePath = path.resolve(__dirname, '../utils/recordStorage.js');

function loadStorage(storage, listBackendCards) {
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
      updateBackendCard: async () => {},
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
