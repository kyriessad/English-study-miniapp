/**
 * Test: review feedback action queue dedup (Phase 8J)
 * Verifies:
 *   - removeActionFromQueue removes the failed foreground action by client_action_id
 *   - removeQueuedFeedbackActionsBySessionItemId dedupes same session_item_id only
 *   - other cards / sessions / action_types are not touched
 *   - same card_id but different session_item_id are not collapsed
 *   - empty / missing session_item_id is a no-op
 *
 * The actionQueue module reads/writes wx.getStorageSync. This script stubs
 * a minimal global `wx` so the module can be required directly without
 * the WeChat runtime.
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) {
    passed++;
  } else {
    failed++;
    console.error('FAIL [' + label + '] expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }
}

function assertTrue(label, value) {
  if (value === true) {
    passed++;
  } else {
    failed++;
    console.error('FAIL [' + label + '] expected=true actual=' + JSON.stringify(value));
  }
}

// ── Minimal wx stub backed by an in-memory object ──────────────────────────
const storage = Object.create(null);
global.wx = {
  getStorageSync(key) {
    return storage[key];
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
};

const actionQueue = require('../utils/actionQueue');
const {
  STORAGE_KEY,
  enqueueAction,
  removeActionFromQueue,
  removeQueuedFeedbackActionsBySessionItemId,
} = actionQueue;

function resetQueue() {
  storage[STORAGE_KEY] = [];
}

function readQueue() {
  return storage[STORAGE_KEY] || [];
}

function feedbackPayload(overrides) {
  return Object.assign(
    {
      client_action_id: 'cid-' + Math.random().toString(16).slice(2),
      session_id: 'sess-A',
      session_item_id: 'item-1',
      card_id: 'card-1',
      result: 'got_it',
    },
    overrides || {}
  );
}

// ── Test group 1: removeActionFromQueue (foreground failure path) ──────────
(function testRemoveByClientActionId_basic() {
  resetQueue();
  const p1 = feedbackPayload({ client_action_id: 'cid-1' });
  enqueueAction('review_feedback', p1);

  removeActionFromQueue('cid-1');

  assert('T1.1 removeActionFromQueue removes the matching client_action_id', readQueue().length, 0);
})();

(function testRemoveByClientActionId_noMatch() {
  resetQueue();
  const p1 = feedbackPayload({ client_action_id: 'cid-1' });
  enqueueAction('review_feedback', p1);

  removeActionFromQueue('cid-does-not-exist');

  assert('T1.2 removeActionFromQueue with unknown id is no-op', readQueue().length, 1);
})();

(function testRemoveByClientActionId_keepsOthers() {
  resetQueue();
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-1' }));
  enqueueAction('review_feedback', feedbackPayload({
    client_action_id: 'cid-2',
    session_item_id: 'item-2',
    card_id: 'card-2',
  }));

  removeActionFromQueue('cid-1');

  const q = readQueue();
  assert('T1.3 only the requested action is removed', q.length, 1);
  assert('T1.3 surviving client_action_id', q[0].client_action_id, 'cid-2');
})();

// ── Test group 2: dedup by session_item_id ─────────────────────────────────
(function testDedupSameSessionItem_singleStaleAction() {
  resetQueue();
  enqueueAction('review_feedback', feedbackPayload({
    client_action_id: 'cid-stale',
    session_item_id: 'item-1',
    result: 'got_it',
  }));

  const removed = removeQueuedFeedbackActionsBySessionItemId('item-1');
  enqueueAction('review_feedback', feedbackPayload({
    client_action_id: 'cid-fresh',
    session_item_id: 'item-1',
    result: 'forgot',
  }));

  assert('T2.1 dedup returns the removed client_action_id', removed, ['cid-stale']);
  const q = readQueue();
  assert('T2.1 only one feedback action remains for this item', q.length, 1);
  assert('T2.1 surviving action is the fresh one', q[0].client_action_id, 'cid-fresh');
  assert('T2.1 surviving result reflects last click', q[0].payload.result, 'forgot');
})();

(function testDedupSameSessionItem_multipleStaleActions() {
  resetQueue();
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-a', session_item_id: 'item-X', result: 'got_it' }));
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-b', session_item_id: 'item-X', result: 'shaky' }));
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-c', session_item_id: 'item-X', result: 'forgot' }));

  const removed = removeQueuedFeedbackActionsBySessionItemId('item-X');

  assert('T2.2 dedup removes all stale actions for the same item', removed.sort(), ['cid-a', 'cid-b', 'cid-c']);
  assert('T2.2 queue is empty after dedup', readQueue().length, 0);
})();

(function testDedupOnlyTouchesSameSessionItem() {
  resetQueue();
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-keep', session_item_id: 'item-other', card_id: 'card-other' }));
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-drop', session_item_id: 'item-target' }));

  const removed = removeQueuedFeedbackActionsBySessionItemId('item-target');

  assert('T2.3 only target item is removed', removed, ['cid-drop']);
  const q = readQueue();
  assert('T2.3 other item stays in queue', q.length, 1);
  assert('T2.3 surviving id', q[0].client_action_id, 'cid-keep');
})();

(function testDedupSameCardDifferentSessionItem() {
  resetQueue();
  // Same card_id (回炉同卡复现) but different session_item_id rows
  enqueueAction('review_feedback', feedbackPayload({
    client_action_id: 'cid-original',
    session_item_id: 'item-original',
    card_id: 'card-shared',
  }));
  enqueueAction('review_feedback', feedbackPayload({
    client_action_id: 'cid-repeat',
    session_item_id: 'item-repeat',
    card_id: 'card-shared',
  }));

  const removed = removeQueuedFeedbackActionsBySessionItemId('item-repeat');

  assert('T2.4 dedup does not collapse different session_item_ids of the same card', removed, ['cid-repeat']);
  const q = readQueue();
  assert('T2.4 original row survives', q.length, 1);
  assert('T2.4 surviving session_item_id', q[0].payload.session_item_id, 'item-original');
  assert('T2.4 surviving card_id', q[0].payload.card_id, 'card-shared');
})();

(function testDedupEmptySessionItem_isNoOp() {
  resetQueue();
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-1', session_item_id: 'item-1' }));

  const removed1 = removeQueuedFeedbackActionsBySessionItemId('');
  const removed2 = removeQueuedFeedbackActionsBySessionItemId(null);
  const removed3 = removeQueuedFeedbackActionsBySessionItemId(undefined);

  assert('T2.5 empty string returns []', removed1, []);
  assert('T2.5 null returns []', removed2, []);
  assert('T2.5 undefined returns []', removed3, []);
  assert('T2.5 queue is untouched', readQueue().length, 1);
})();

(function testDedupDoesNotTouchOtherActionTypes() {
  resetQueue();
  // Even though actionQueue only normalizes the review_feedback shape today,
  // we still want dedup to be type-safe against future action types.
  const queue = readQueue();
  queue.push({
    client_action_id: 'cid-other-type',
    action_type: 'something_else',
    status: 'pending',
    payload: { session_item_id: 'item-1' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    local_sequence: 99,
    retry_count: 0,
    max_retry_count: 3,
    last_error: '',
    last_error_type: '',
    next_retry_at: null,
  });
  storage[STORAGE_KEY] = queue;
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-feedback', session_item_id: 'item-1' }));

  const removed = removeQueuedFeedbackActionsBySessionItemId('item-1');

  assert('T2.6 dedup removes only review_feedback rows', removed, ['cid-feedback']);
  const q = readQueue();
  assert('T2.6 non-feedback row remains', q.length, 1);
  assert('T2.6 surviving action_type', q[0].action_type, 'something_else');
})();

// ── Test group 3: end-to-end simulation of the user flow ───────────────────
(function testFailureRetrySameResult_yieldsOneAction() {
  resetQueue();
  // First click: fails foreground → submitReview enqueues, _handleForegroundFailure removes.
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-first', session_item_id: 'item-1', result: 'got_it' }));
  // Simulate _handleForegroundFailure cleanup
  removeActionFromQueue('cid-first');
  // Second click on same result: dedup + enqueue
  removeQueuedFeedbackActionsBySessionItemId('item-1');
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-second', session_item_id: 'item-1', result: 'got_it' }));

  const q = readQueue();
  assert('T3.1 failure→retry leaves a single action', q.length, 1);
  assert('T3.1 surviving id is the latest click', q[0].client_action_id, 'cid-second');
  assert('T3.1 result matches latest intent', q[0].payload.result, 'got_it');
})();

(function testFailureRetryDifferentResult_keepsLatestIntent() {
  resetQueue();
  // First click "got_it" fails — foreground handler removes it from queue.
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-first', session_item_id: 'item-1', result: 'got_it' }));
  removeActionFromQueue('cid-first');

  // User changes their mind and clicks "forgot". Even if the failure cleanup
  // did not run (e.g. older builds, or extra defense-in-depth), the dedup
  // before enqueue still guarantees only the latest action survives.
  removeQueuedFeedbackActionsBySessionItemId('item-1');
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-second', session_item_id: 'item-1', result: 'forgot' }));

  const q = readQueue();
  assert('T3.2 only the latest intent survives', q.length, 1);
  assert('T3.2 result reflects user\'s last click', q[0].payload.result, 'forgot');
})();

(function testFailureCleanupSkipped_dedupStillProtects() {
  resetQueue();
  // Simulate an OLD build where _handleForegroundFailure does NOT clean up.
  // The first failed action lingers in the queue.
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-first', session_item_id: 'item-1', result: 'got_it' }));
  // No removeActionFromQueue here — defense-in-depth: dedup must still win.

  removeQueuedFeedbackActionsBySessionItemId('item-1');
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-second', session_item_id: 'item-1', result: 'forgot' }));

  const q = readQueue();
  assert('T3.3 dedup wipes the lingering stale action even without explicit cleanup', q.length, 1);
  assert('T3.3 surviving result is the user\'s last click', q[0].payload.result, 'forgot');
})();

(function testDifferentCardsAreIndependent() {
  resetQueue();
  // Card A enqueues + fails; Card B enqueues and survives.
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-A1', session_item_id: 'item-A', card_id: 'card-A', result: 'got_it' }));
  removeActionFromQueue('cid-A1');

  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-B1', session_item_id: 'item-B', card_id: 'card-B', result: 'fluent' }));

  // Card A retries
  removeQueuedFeedbackActionsBySessionItemId('item-A');
  enqueueAction('review_feedback', feedbackPayload({ client_action_id: 'cid-A2', session_item_id: 'item-A', card_id: 'card-A', result: 'forgot' }));

  const q = readQueue().sort((x, y) => x.client_action_id.localeCompare(y.client_action_id));
  assert('T3.4 both cards have one action each', q.length, 2);
  assert('T3.4 card A latest result', q[0].payload.result, 'forgot');
  assert('T3.4 card B untouched', q[1].payload.result, 'fluent');
})();

// ── Report ───────────────────────────────────────────────────────────────────
console.log('');
console.log('review action queue dedup 测试结果');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('  通过：' + passed + '，失败：' + failed);
if (failed === 0) {
  console.log('✅ 全部通过');
  process.exit(0);
} else {
  console.log('❌ 存在失败用例');
  process.exit(1);
}
