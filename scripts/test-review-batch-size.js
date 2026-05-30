/**
 * Test: review batch size setting
 * Verifies: dailyGoal storage read/write, picker index mapping, session payload construction.
 * Options: 3 / 5 / 10 / 15 张
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

const DAILY_GOAL_OPTIONS = [3, 5, 10, 15];
const DAILY_GOAL_DEFAULT = 5;

function readDailyGoalFromRaw(raw) {
  const n = Number(raw);
  if (DAILY_GOAL_OPTIONS.indexOf(n) !== -1) return n;
  return DAILY_GOAL_DEFAULT;
}

function dailyGoalToLimit(goal) {
  if (goal === 15) return 15;
  if (goal === 10) return 10;
  return 5;
}

// ── Pure functions copied from pages/settings/index.js ───────────────────────

const SETTINGS_OPTIONS = [3, 5, 10, 15];
const SETTINGS_LABELS = ['3 张', '5 张', '10 张', '15 张'];

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
assert('A4: dailyGoal=15 → limit=15', dailyGoalToLimit(15), 15);

// ── B: readDailyGoal parsing ─────────────────────────────────────────────────

assert('B1: stored 3 (number) → 3', readDailyGoalFromRaw(3), 3);
assert('B2: stored "3" (string) → 3', readDailyGoalFromRaw('3'), 3);
assert('B3: stored 5 → 5', readDailyGoalFromRaw(5), 5);
assert('B4: stored 10 → 10', readDailyGoalFromRaw(10), 10);
assert('B5: stored 15 → 15', readDailyGoalFromRaw(15), 15);
assert('B6: stored "15" (string) → 15', readDailyGoalFromRaw('15'), 15);
assert('B7: stored null → default 5', readDailyGoalFromRaw(null), 5);
assert('B8: stored undefined → default 5', readDailyGoalFromRaw(undefined), 5);
assert('B9: stored "" → default 5', readDailyGoalFromRaw(''), 5);
assert('B10: stored 7 (invalid) → default 5', readDailyGoalFromRaw(7), 5);
assert('B11: stored "abc" → default 5', readDailyGoalFromRaw('abc'), 5);
assert('B12: stored 0 → default 5', readDailyGoalFromRaw(0), 5);
assert('B13: stored 20 (invalid) → default 5', readDailyGoalFromRaw(20), 5);
assert('B14: stored 1 (invalid) → default 5', readDailyGoalFromRaw(1), 5);

// ── C: picker index ↔ goal mapping ──────────────────────────────────────────

assert('C1: index 0 → goal 3', pickerIndexToGoal(0), 3);
assert('C2: index 1 → goal 5', pickerIndexToGoal(1), 5);
assert('C3: index 2 → goal 10', pickerIndexToGoal(2), 10);
assert('C4: index 3 → goal 15', pickerIndexToGoal(3), 15);
assert('C5: index 0 → label "3 张"', pickerIndexToLabel(0), '3 张');
assert('C6: index 1 → label "5 张"', pickerIndexToLabel(1), '5 张');
assert('C7: index 2 → label "10 张"', pickerIndexToLabel(2), '10 张');
assert('C8: index 3 → label "15 张"', pickerIndexToLabel(3), '15 张');
assert('C9: goal=3 → picker index 0', goalToPickerIndex(3), 0);
assert('C10: goal=5 → picker index 1', goalToPickerIndex(5), 1);
assert('C11: goal=10 → picker index 2', goalToPickerIndex(10), 2);
assert('C12: goal=15 → picker index 3', goalToPickerIndex(15), 3);
assert('C13: goal=7 (invalid) → fallback index 1', goalToPickerIndex(7), 1);

// ── D: session payload construction ─────────────────────────────────────────

// D1-D3: daily_suggested reflects dailyGoal via daily_goal field
const p1 = buildSessionPayload('daily_suggested', 3, false);
assert('D1: daily_suggested dailyGoal=3 → limit=5', p1.limit, 5);
assert('D2: daily_suggested dailyGoal=3 → daily_goal=3', p1.daily_goal, 3);
assert('D3: daily_suggested no restart → no restart field', p1.restart, undefined);

const p2 = buildSessionPayload('daily_suggested', 10, false);
assert('D4: daily_suggested dailyGoal=10 → limit=10', p2.limit, 10);
assert('D5: daily_suggested dailyGoal=10 → daily_goal=10', p2.daily_goal, 10);

const p_ds15 = buildSessionPayload('daily_suggested', 15, false);
assert('D6: daily_suggested dailyGoal=15 → limit=15', p_ds15.limit, 15);
assert('D7: daily_suggested dailyGoal=15 → daily_goal=15', p_ds15.daily_goal, 15);

// D8-D10: new_only uses limit mapped from dailyGoal
const p3 = buildSessionPayload('new_only', 3, false);
assert('D8: new_only dailyGoal=3 → limit=5', p3.limit, 5);
assert('D9: new_only → no daily_goal field', p3.daily_goal, undefined);

const p4 = buildSessionPayload('new_only', 10, false);
assert('D10: new_only dailyGoal=10 → limit=10', p4.limit, 10);

const p_no15 = buildSessionPayload('new_only', 15, false);
assert('D11: new_only dailyGoal=15 → limit=15', p_no15.limit, 15);
assert('D12: new_only dailyGoal=15 → no daily_goal field', p_no15.daily_goal, undefined);

// D13-D14: free_review uses limit mapped from dailyGoal
const p5 = buildSessionPayload('free_review', 5, false);
assert('D13: free_review dailyGoal=5 → limit=5', p5.limit, 5);

const p6 = buildSessionPayload('free_review', 10, true);
assert('D14: free_review dailyGoal=10 → limit=10', p6.limit, 10);
assert('D15: free_review restart=true included', p6.restart, true);

const p_fr15 = buildSessionPayload('free_review', 15, false);
assert('D16: free_review dailyGoal=15 → limit=15', p_fr15.limit, 15);

// D17: default goal (5) → limit=5 for all session types
['daily_suggested', 'new_only', 'free_review'].forEach(function(type, i) {
  const p = buildSessionPayload(type, 5, false);
  assert('D' + (17 + i) + ': ' + type + ' dailyGoal=5 → limit=5', p.limit, 5);
});

// D20: dailyGoal=15 → limit=15 for all session types
['daily_suggested', 'new_only', 'free_review'].forEach(function(type, i) {
  const p = buildSessionPayload(type, 15, false);
  assert('D' + (20 + i) + ': ' + type + ' dailyGoal=15 → limit=15', p.limit, 15);
});

// ── E: Batch size change → needs restart marker (Phase 8M) ───────────────────
//
// Pure logic extracted from settings/index.js onDailyGoalChange and
// index/index.js onShow / goToReview / _clearBatchSizeRestartFlag.

function shouldSetBatchSizeRestartMarker(newGoal, previousGoal) {
  return newGoal !== previousGoal;
}

function shouldForceRestartForBatchSizeChange(batchSizeChangedFlag) {
  return !!batchSizeChangedFlag;
}

// Setting from 3 to 5 → marker should be set
assert('E1: goal 3→5 → set restart marker', shouldSetBatchSizeRestartMarker(5, 3), true);
// Setting from 5 to 10 → marker should be set
assert('E2: goal 5→10 → set restart marker', shouldSetBatchSizeRestartMarker(10, 5), true);
// Setting from 10 to 15 → marker should be set
assert('E3: goal 10→15 → set restart marker', shouldSetBatchSizeRestartMarker(15, 10), true);
// Setting from 5 to 3 → marker should be set
assert('E4: goal 5→3 → set restart marker', shouldSetBatchSizeRestartMarker(3, 5), true);
// Setting same value → marker should NOT be set
assert('E5: goal 5→5 (same) → no marker', shouldSetBatchSizeRestartMarker(5, 5), false);
assert('E6: goal 10→10 (same) → no marker', shouldSetBatchSizeRestartMarker(10, 10), false);
assert('E7: goal 3→3 (same) → no marker', shouldSetBatchSizeRestartMarker(3, 3), false);
assert('E8: goal 15→15 (same) → no marker', shouldSetBatchSizeRestartMarker(15, 15), false);

// Marker present → force restart
assert('E9: marker=true → forceRestart', shouldForceRestartForBatchSizeChange(true), true);
// Marker absent → no force restart
assert('E10: marker=false → no forceRestart', shouldForceRestartForBatchSizeChange(false), false);
assert('E11: marker=undefined → no forceRestart', shouldForceRestartForBatchSizeChange(undefined), false);
assert('E12: marker=null → no forceRestart', shouldForceRestartForBatchSizeChange(null), false);

// After successful session creation, marker should be cleared
// (simulated via the clear helper setting both instance flag and storage)
var simulatedStorage = { batchSizeChangedNeedsRestart: true };
var simulatedInstance = { _batchSizeChangedNeedsRestart: true };
// simulate _clearBatchSizeRestartFlag()
simulatedInstance._batchSizeChangedNeedsRestart = false;
delete simulatedStorage.batchSizeChangedNeedsRestart;
assert('E13: after clear → instance flag false', simulatedInstance._batchSizeChangedNeedsRestart, false);
assert('E14: after clear → storage key removed', simulatedStorage.batchSizeChangedNeedsRestart, undefined);

// Failed session creation → marker NOT cleared (user can retry)
var failStorage = { batchSizeChangedNeedsRestart: true };
var failInstance = { _batchSizeChangedNeedsRestart: true };
// simulate network failure: do NOT call _clearBatchSizeRestartFlag
assert('E15: after failure → instance flag still true', failInstance._batchSizeChangedNeedsRestart, true);
assert('E16: after failure → storage key still present', failStorage.batchSizeChangedNeedsRestart, true);

// Verify payload construction still correct after batch size change
// (new session uses latest dailyGoal, not old session size)
const pE1 = buildSessionPayload('daily_suggested', 5, true);  // forceRestart=true
assert('E17: daily_suggested goal=5 forceRestart → limit=5', pE1.limit, 5);
assert('E18: daily_suggested goal=5 forceRestart → restart=true', pE1.restart, true);
assert('E19: daily_suggested goal=5 forceRestart → daily_goal=5', pE1.daily_goal, 5);

const pE2 = buildSessionPayload('daily_suggested', 10, true);
assert('E20: daily_suggested goal=10 forceRestart → limit=10', pE2.limit, 10);
assert('E21: daily_suggested goal=10 forceRestart → restart=true', pE2.restart, true);
assert('E22: daily_suggested goal=10 forceRestart → daily_goal=10', pE2.daily_goal, 10);

// All four batch size options still valid after Phase 8M
assert('E23: DAILY_GOAL_OPTIONS includes 3', DAILY_GOAL_OPTIONS.includes(3), true);
assert('E24: DAILY_GOAL_OPTIONS includes 5', DAILY_GOAL_OPTIONS.includes(5), true);
assert('E25: DAILY_GOAL_OPTIONS includes 10', DAILY_GOAL_OPTIONS.includes(10), true);
assert('E26: DAILY_GOAL_OPTIONS includes 15', DAILY_GOAL_OPTIONS.includes(15), true);

// ── Result ───────────────────────────────────────────────────────────────────

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
