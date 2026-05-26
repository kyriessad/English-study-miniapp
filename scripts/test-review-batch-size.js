/**
 * Test: review batch size setting
 * Verifies: dailyGoal storage read/write, picker index mapping, session payload construction.
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error('FAIL [' + label + '] expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }
}

// ── Pure functions copied from pages/index/index.js ──────────────────────────

const DAILY_GOAL_OPTIONS = [3, 5, 10];
const DAILY_GOAL_DEFAULT = 5;

function readDailyGoalFromRaw(raw) {
  const n = Number(raw);
  if (DAILY_GOAL_OPTIONS.indexOf(n) !== -1) return n;
  return DAILY_GOAL_DEFAULT;
}

function dailyGoalToLimit(goal) {
  if (goal === 10) return 10;
  return 5;
}

// ── Pure functions copied from pages/settings/index.js ───────────────────────

const SETTINGS_OPTIONS = [3, 5, 10];
const SETTINGS_LABELS = ['3 张', '5 张', '10 张'];

function pickerIndexToGoal(idx) {
  return SETTINGS_OPTIONS[idx];
}

function pickerIndexToLabel(idx) {
  return SETTINGS_LABELS[idx];
}

function goalToPickerIndex(goal) {
  const idx = SETTINGS_OPTIONS.indexOf(goal);
  return idx !== -1 ? idx : 1;
}

// ── Session payload builder (mirrors _tryCreateSession logic) ─────────────────

function buildSessionPayload(sessionType, dailyGoal, needsRestart) {
  const payload = {
    session_type: sessionType,
    limit: dailyGoalToLimit(dailyGoal),
  };
  if (sessionType === 'daily_suggested') {
    payload.daily_goal = dailyGoal;
  }
  if (needsRestart) {
    payload.restart = true;
  }
  return payload;
}

// ── A: dailyGoalToLimit mapping ───────────────────────────────────────────────

assert('A1: dailyGoal=3 → limit=5', dailyGoalToLimit(3), 5);
assert('A2: dailyGoal=5 → limit=5', dailyGoalToLimit(5), 5);
assert('A3: dailyGoal=10 → limit=10', dailyGoalToLimit(10), 10);

// ── B: readDailyGoal parsing ─────────────────────────────────────────────────

assert('B1: stored 3 (number) → 3', readDailyGoalFromRaw(3), 3);
assert('B2: stored "3" (string) → 3', readDailyGoalFromRaw('3'), 3);
assert('B3: stored 5 → 5', readDailyGoalFromRaw(5), 5);
assert('B4: stored 10 → 10', readDailyGoalFromRaw(10), 10);
assert('B5: stored null → default 5', readDailyGoalFromRaw(null), 5);
assert('B6: stored undefined → default 5', readDailyGoalFromRaw(undefined), 5);
assert('B7: stored "" → default 5', readDailyGoalFromRaw(''), 5);
assert('B8: stored 7 (invalid) → default 5', readDailyGoalFromRaw(7), 5);
assert('B9: stored "abc" → default 5', readDailyGoalFromRaw('abc'), 5);
assert('B10: stored 0 → default 5', readDailyGoalFromRaw(0), 5);

// ── C: picker index ↔ goal mapping ──────────────────────────────────────────

assert('C1: index 0 → goal 3', pickerIndexToGoal(0), 3);
assert('C2: index 1 → goal 5', pickerIndexToGoal(1), 5);
assert('C3: index 2 → goal 10', pickerIndexToGoal(2), 10);
assert('C4: index 0 → label "3 张"', pickerIndexToLabel(0), '3 张');
assert('C5: index 1 → label "5 张"', pickerIndexToLabel(1), '5 张');
assert('C6: index 2 → label "10 张"', pickerIndexToLabel(2), '10 张');
assert('C7: goal=3 → picker index 0', goalToPickerIndex(3), 0);
assert('C8: goal=5 → picker index 1', goalToPickerIndex(5), 1);
assert('C9: goal=10 → picker index 2', goalToPickerIndex(10), 2);
assert('C10: goal=7 (invalid) → fallback index 1', goalToPickerIndex(7), 1);

// ── D: session payload construction ─────────────────────────────────────────

// D1-D3: daily_suggested reflects dailyGoal via daily_goal field
const p1 = buildSessionPayload('daily_suggested', 3, false);
assert('D1: daily_suggested dailyGoal=3 → limit=5', p1.limit, 5);
assert('D2: daily_suggested dailyGoal=3 → daily_goal=3', p1.daily_goal, 3);
assert('D3: daily_suggested no restart → no restart field', p1.restart, undefined);

const p2 = buildSessionPayload('daily_suggested', 10, false);
assert('D4: daily_suggested dailyGoal=10 → limit=10', p2.limit, 10);
assert('D5: daily_suggested dailyGoal=10 → daily_goal=10', p2.daily_goal, 10);

// D6-D8: new_only uses limit mapped from dailyGoal
const p3 = buildSessionPayload('new_only', 3, false);
assert('D6: new_only dailyGoal=3 → limit=5', p3.limit, 5);
assert('D7: new_only → no daily_goal field', p3.daily_goal, undefined);

const p4 = buildSessionPayload('new_only', 10, false);
assert('D8: new_only dailyGoal=10 → limit=10', p4.limit, 10);

// D9-D10: free_review uses limit mapped from dailyGoal
const p5 = buildSessionPayload('free_review', 5, false);
assert('D9: free_review dailyGoal=5 → limit=5', p5.limit, 5);

const p6 = buildSessionPayload('free_review', 10, true);
assert('D10: free_review dailyGoal=10 → limit=10', p6.limit, 10);
assert('D11: free_review restart=true included', p6.restart, true);

// D12: default goal (5) → limit=5 for all session types
['daily_suggested', 'new_only', 'free_review'].forEach(function(type, i) {
  const p = buildSessionPayload(type, 5, false);
  assert('D' + (12 + i) + ': ' + type + ' dailyGoal=5 → limit=5', p.limit, 5);
});

// ── Result ───────────────────────────────────────────────────────────────────

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
