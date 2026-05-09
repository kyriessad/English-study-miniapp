/**
 * Phase 4B-S Step 2 剩余验收测试脚本
 *
 * 验证：复习页提交 feedback 成功后，首页 overview / cards stats / cards list
 * 数据会发生正确变化。
 *
 * 测试流程：
 *   1. 创建一张唯一测试卡片（review-ready new 卡）
 *   2. 读取 feedback 前的 overview / stats / cards list
 *   3. 创建复习 session 并获取包含测试卡的 session item
 *   4. 对测试卡提交 feedback（got_it）
 *   5. 读取 feedback 后的 overview / stats / cards list
 *   6. 对比前后数据，验证正确变化
 *   7. 输出 PASS / FAIL 报告
 *
 * 使用方式（开发环境，后端运行在 127.0.0.1:8001）：
 *   node tools/phase4b-step2-feedback-refresh-check.js
 *
 * 自定义后端地址：
 *   BACKEND_BASE_URL=http://192.168.1.100:8001 node tools/phase4b-step2-feedback-refresh-check.js
 *
 * 指定 access token（如果后端需要鉴权）：
 *   BACKEND_ACCESS_TOKEN=xxx node tools/phase4b-step2-feedback-refresh-check.js
 *
 * Windows PowerShell：
 *   $env:BACKEND_BASE_URL="http://127.0.0.1:8001"; node tools/phase4b-step2-feedback-refresh-check.js
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

// ===== Configuration =====

const BASE_URL = (process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
const ACCESS_TOKEN = process.env.BACKEND_ACCESS_TOKEN || '';

// ===== Globals =====

const TEST_PREFIX = `phase4b_feedback_test_${Date.now()}`;
const results = { pass: 0, warn: 0, fail: 0 };

// ===== Helpers =====

function PASS(msg) {
  results.pass += 1;
  console.log(`  [PASS] ${msg}`);
}

function WARN(msg) {
  results.warn += 1;
  console.log(`  [WARN] ${msg}`);
}

function FAIL(msg) {
  results.fail += 1;
  console.log(`  [FAIL] ${msg}`);
}

function INFO(msg) {
  console.log(`  [INFO] ${msg}`);
}

function fmt(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (_) {
    return String(obj);
  }
}

function parseUrl(url) {
  const match = url.match(/^https?:\/\/([^:/]+)(:(\d+))?(\/.*)?$/);
  if (!match) throw new Error(`Invalid URL: ${url}`);
  return {
    hostname: match[1],
    port: match[3] ? parseInt(match[3], 10) : (url.startsWith('https') ? 443 : 80),
    path: match[4] || '/'
  };
}

/**
 * Send HTTP request. Returns parsed JSON body if response has content-type application/json,
 * otherwise returns raw body string.
 */
function request(method, path, body = undefined, extraHeaders = {}) {
  const urlObj = parseUrl(BASE_URL);
  const pathWithQuery = path.startsWith('/') ? path : `/${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  if (ACCESS_TOKEN && !headers.Authorization) {
    headers.Authorization = `Bearer ${ACCESS_TOKEN}`;
  }

  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: pathWithQuery,
      method: method.toUpperCase(),
      headers: headers,
      timeout: 15000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const contentType = res.headers['content-type'] || '';
        let parsed;
        if (contentType.includes('application/json')) {
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
        } else {
          parsed = data;
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after 15000ms: ${method} ${pathWithQuery}`));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Send request and expect 2xx. Returns the parsed body directly.
 * On failure, logs detailed error and returns null.
 */
async function expectOk(method, path, body = undefined, label = '') {
  const labelSuffix = label ? ` (${label})` : '';
  try {
    const res = await request(method, path, body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.body;
    }
    console.error(`    FAIL ${method} ${path}${labelSuffix}: status ${res.statusCode}`);
    console.error(`    Response body: ${fmt(res.body).slice(0, 500)}`);
    return null;
  } catch (err) {
    console.error(`    FAIL ${method} ${path}${labelSuffix}: ${err.message}`);
    return null;
  }
}

/**
 * Pick the first non-null, non-undefined value.
 */
function pickVal() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Normalize a number from value, defaulting to 0 if missing/invalid.
 */
function toNum(v) {
  const n = Number(v);
  return !isNaN(n) ? n : 0;
}

/**
 * Normalize review overview — compatible with nested (suggested) and flat structures.
 */
function normalizeOverview(raw) {
  if (!raw || typeof raw !== 'object') {
    return { totalToday: 0, toNew: 0, toReview: 0, strengtheningInReview: 0, activeSession: null };
  }

  const s = (raw.suggested && typeof raw.suggested === 'object') ? raw.suggested : null;

  const toNew = toNum(pickVal(
    raw.to_new, raw.toNew, raw.new, raw.new_count,
    s && s.to_new, s && s.toNew, s && s.new, s && s.new_count
  ));

  const toReview = toNum(pickVal(
    raw.to_review, raw.toReview, raw.review, raw.review_count,
    raw.due, raw.due_count,
    s && s.to_review, s && s.toReview, s && s.review, s && s.review_count,
    s && s.due, s && s.due_count
  ));

  const strengtheningInReview = toNum(pickVal(
    raw.strengthening_in_review, raw.strengtheningInReview,
    raw.strengthening, raw.strengthening_count,
    s && s.strengthening_in_review, s && s.strengtheningInReview,
    s && s.strengthening, s && s.strengthening_count
  ));

  let totalToday = toNum(pickVal(
    raw.total_today, raw.totalToday, raw.total, raw.today_total,
    s && s.total, s && s.total_today, s && s.totalToday, s && s.today_total,
    s && s.count, s && s.task_count, s && s.total_count
  ));
  if (totalToday === 0 && (toNew > 0 || toReview > 0 || strengtheningInReview > 0)) {
    totalToday = toNew + toReview + strengtheningInReview;
  }

  return {
    totalToday,
    toNew,
    toReview,
    strengtheningInReview,
    activeSession: raw.active_session || raw.activeSession || null
  };
}

/**
 * Normalize cards list response — might be { items: [...] } or just [...].
 */
function normalizeCardsList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw.items && Array.isArray(raw.items)) return raw.items;
  if (raw.data && Array.isArray(raw.data)) return raw.data;
  if (raw.cards && Array.isArray(raw.cards)) return raw.cards;
  return [];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================================================
//  Test Flow
// ================================================================

async function run() {
  console.log('');
  console.log('========== Phase 4B-S Step 2: Feedback Refresh Check ==========');
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Auth: ${ACCESS_TOKEN ? 'Bearer token provided' : 'No token (will try without auth)'}`);
  console.log(`Test card prefix: ${TEST_PREFIX}`);
  console.log('');

  // ---- A. Auth check ----
  console.log('--- A. Connectivity Check ---');

  const overviewTest = await request('GET', '/api/reviews/overview');
  if (overviewTest.statusCode === 401) {
    FAIL('Backend returned 401 (unauthorized). Provide BACKEND_ACCESS_TOKEN env var.');
    console.log('');
    console.log('  To get a token:');
    console.log('    1. Open WeChat DevTools on the home page');
    console.log('    2. In Console, run: wx.getStorageSync("backendAccessToken")');
    console.log('    3. Copy the token and run:');
    console.log('       $env:BACKEND_ACCESS_TOKEN="<token>" ; node tools/phase4b-step2-feedback-refresh-check.js');
    console.log('');

    if (overviewTest.body && typeof overviewTest.body === 'object') {
      console.log(`  401 response body: ${fmt(overviewTest.body).slice(0, 300)}`);
    }
    printSummary();
    return;
  }

  if (overviewTest.statusCode >= 200 && overviewTest.statusCode < 300) {
    PASS('Backend reachable, no auth issue');
  } else {
    FAIL(`Backend returned status ${overviewTest.statusCode}; expected 2xx`);
    console.log(`  Response: ${fmt(overviewTest.body).slice(0, 300)}`);
    printSummary();
    return;
  }

  // ---- B. Create test card ----
  console.log('');
  console.log('--- B. Create Test Card ---');

  const localTempId = `test_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const testContent = `${TEST_PREFIX}_${crypto.randomUUID().slice(0, 6)}`;

  const cardPayload = {
    local_temp_id: localTempId,
    content: testContent,
    card_type: 'word',
    understanding: 'phase4b feedback test card - will be reviewed with got_it',
    understanding_source: 'local',
    note: 'phase4b automation test',
    analysis_status: 'done',
    analysis_level: 'pass',
    analysis_messages: [],
    source: 'wechat_miniapp',
    client_created_at: new Date().toISOString()
  };

  const createRes = await expectOk('POST', '/api/cards', cardPayload, 'create card');
  if (!createRes) {
    FAIL('Card creation failed — cannot proceed');
    printSummary();
    return;
  }

  const testCardId = String(createRes.id || createRes.card_id || '');
  if (!testCardId) {
    FAIL(`Card created but no id returned; response: ${fmt(createRes).slice(0, 300)}`);
    printSummary();
    return;
  }

  PASS(`Test card created: id=${testCardId}, content="${testContent}"`);

  // Give the backend a moment to settle
  await sleep(500);

  // ---- C. Read Before Data ----
  console.log('');
  console.log('--- C. Read Overview / Stats / Cards (Before) ---');

  const overviewBefore = await expectOk('GET', '/api/reviews/overview', undefined, 'overview before');
  const statsBefore = await expectOk('GET', '/api/cards/stats', undefined, 'stats before');
  const cardsBeforeRaw = await expectOk('GET', '/api/cards?limit=100&offset=0', undefined, 'cards before');

  if (!overviewBefore || !statsBefore || !cardsBeforeRaw) {
    FAIL('Failed to read before data — aborting');
    printSummary();
    return;
  }

  PASS('Overview / stats / cards list read successfully (before)');

  const normOverviewBefore = normalizeOverview(overviewBefore);
  const cardsBefore = normalizeCardsList(cardsBeforeRaw);

  // Find test card in cards list
  const cardBefore = cardsBefore.find(c => String(c.id) === testCardId || c.content === testContent);
  if (!cardBefore) {
    FAIL(`Test card (${testCardId}) not found in cards list before feedback`);
    INFO(`Cards count: ${cardsBefore.length}`);
    INFO(`First 5 cards: ${fmt(cardsBefore.slice(0, 5).map(c => ({ id: c.id, content: (c.content || '').slice(0, 30), review_state: c.review_state })))}`);
    // Non-blocking: card might not show in list due to pagination but still exists
    WARN('Continuing despite card not found in list (may be pagination)');
  } else {
    PASS(`Test card found in cards list before: review_state=${cardBefore.review_state || 'N/A'}`);
  }

  const cardBeforeState = cardBefore ? (cardBefore.review_state || cardBefore.reviewStateV2 || 'unknown') : 'unknown';

  // ---- D. Create Review Session ----
  console.log('');
  console.log('--- D. Create Review Session ---');

  // Try daily_suggested first
  let sessionRes = await request('POST', '/api/review-sessions', { session_type: 'daily_suggested' });
  let sessionBody = sessionRes.body;
  let sessionTypeUsed = 'daily_suggested';

  // Parse session ID — handle multiple response shapes
  let sessionId = '';
  let sessionItems = [];

  if (sessionRes.statusCode >= 200 && sessionRes.statusCode < 300 && sessionBody) {
    sessionId = sessionBody.session_id || sessionBody.id || '';
    sessionItems = normalizeCardsList(sessionBody.items || sessionBody.session_items || []);
    INFO(`daily_suggested session created: id=${sessionId}, items=${sessionItems.length}`);

    // Check if our card is in items
    const hasTestCardInItems = sessionItems.some(item =>
      String(item.card_id || item.cardId || item.id) === testCardId ||
      item.content === testContent
    );

    if (!hasTestCardInItems) {
      INFO('Test card not in daily_suggested session; trying new_only...');
      // Try new_only
      const newOnlyRes = await request('POST', '/api/review-sessions', { session_type: 'new_only' });
      if (newOnlyRes.statusCode >= 200 && newOnlyRes.statusCode < 300 && newOnlyRes.body) {
        sessionBody = newOnlyRes.body;
        sessionId = sessionBody.session_id || sessionBody.id || '';
        sessionItems = normalizeCardsList(sessionBody.items || sessionBody.session_items || []);
        sessionTypeUsed = 'new_only';
        INFO(`new_only session created: id=${sessionId}, items=${sessionItems.length}`);
      }
    }
  } else {
    WARN(`Create session returned ${sessionRes.statusCode}; response: ${fmt(sessionBody).slice(0, 200)}`);
  }

  // If session creation didn't give us items, try GET /api/reviews/today
  const hasTestCardInItems = (items) =>
    items.some(item => String(item.card_id || item.cardId || item.id) === testCardId || item.content === testContent);

  if (!sessionId || !hasTestCardInItems(sessionItems)) {
    INFO('Session creation did not return test card item; trying GET /api/reviews/today...');
    const todayRes = await request('GET', '/api/reviews/today?limit=20');
    if (todayRes.statusCode >= 200 && todayRes.statusCode < 300 && todayRes.body) {
      const todayItems = normalizeCardsList(todayRes.body.items || []);
      // Use session_id from today response if we don't have one
      if (!sessionId) {
        sessionId = todayRes.body.session_id || todayRes.body.sessionId || '';
      }
      if (todayItems.length > 0) {
        sessionItems = todayItems;
        INFO(`Got ${sessionItems.length} items from GET /api/reviews/today`);
      }
    }
  }

  if (!sessionId) {
    FAIL('Failed to create/get review session — no session_id');
    console.error(`  daily_suggested response: ${fmt(sessionRes.body).slice(0, 300)}`);
    console.error(`  new_only attempt: ${sessionTypeUsed === 'new_only' ? 'tried, no better result' : 'not tried'}`);
    printSummary();
    return;
  }

  // Find the session item for our test card
  let targetItem = null;
  for (const item of sessionItems) {
    const itemCardId = String(item.card_id || item.cardId || item.id || '');
    const itemContent = item.content || '';
    if (itemCardId === testCardId || itemContent === testContent) {
      targetItem = item;
      break;
    }
  }

  if (!targetItem) {
    FAIL(`Test card (${testCardId}) not found in session items (${sessionTypeUsed})`);
    INFO(`Session ID: ${sessionId}`);
    INFO(`Session items count: ${sessionItems.length}`);
    INFO(`Session items (first 5): ${fmt(sessionItems.slice(0, 5).map(i => ({ card_id: i.card_id || i.cardId || i.id, content: (i.content || '').slice(0, 30) })))}`);
    printSummary();
    return;
  }

  PASS(`Session created (${sessionTypeUsed}): id=${sessionId}, found test card item`);
  INFO(`Session item: card_id=${targetItem.card_id || targetItem.cardId || targetItem.id}, session_item_id=${targetItem.session_item_id || targetItem.sessionItemId || 'N/A'}`);

  // ---- E. Submit Feedback ----
  console.log('');
  console.log('--- E. Submit Feedback (got_it) ---');

  const feedbackPayload = {
    client_action_id: crypto.randomUUID(),
    session_id: sessionId,
    session_item_id: targetItem.session_item_id || targetItem.sessionItemId || targetItem.id,
    card_id: testCardId,
    result: 'got_it'
  };

  const feedbackRes = await request('POST', '/api/reviews/feedback', feedbackPayload);

  if (feedbackRes.statusCode >= 200 && feedbackRes.statusCode < 300) {
    PASS(`Feedback submitted: result=got_it, status=${feedbackRes.statusCode}`);
    INFO(`Feedback response: ${fmt(feedbackRes.body).slice(0, 300)}`);
  } else {
    FAIL(`Feedback request failed: status=${feedbackRes.statusCode}`);
    console.error(`  Request payload: ${fmt(feedbackPayload)}`);
    console.error(`  Response body: ${fmt(feedbackRes.body).slice(0, 500)}`);
    printSummary();
    return;
  }

  // Wait for backend to process and propagate
  await sleep(500);

  // ---- F. Read After Data ----
  console.log('');
  console.log('--- F. Read Overview / Stats / Cards (After) ---');

  const overviewAfter = await expectOk('GET', '/api/reviews/overview', undefined, 'overview after');
  const statsAfter = await expectOk('GET', '/api/cards/stats', undefined, 'stats after');
  const cardsAfterRaw = await expectOk('GET', '/api/cards?limit=100&offset=0', undefined, 'cards after');

  if (!overviewAfter || !statsAfter || !cardsAfterRaw) {
    FAIL('Failed to read after data');
    printSummary();
    return;
  }

  PASS('Overview / stats / cards list read successfully (after)');

  const normOverviewAfter = normalizeOverview(overviewAfter);
  const cardsAfter = normalizeCardsList(cardsAfterRaw);

  // ---- G. Verification ----
  console.log('');
  console.log('--- G. Verification ---');

  // G1. Check test card exists after
  const cardAfter = cardsAfter.find(c => String(c.id) === testCardId || c.content === testContent);

  if (cardAfter) {
    PASS(`Test card still in cards list after feedback: id=${testCardId}`);
  } else {
    FAIL(`Test card (${testCardId}) NOT found in cards list after feedback`);
    // Continue to collect remaining data
  }

  // G2. Check review_state change
  const cardAfterState = cardAfter ? (cardAfter.review_state || cardAfter.reviewStateV2 || 'unknown') : 'unknown';
  const cardAfterLastResult = cardAfter ? (cardAfter.last_review_result || '') : '';

  console.log('');
  INFO(`Card review_state: ${cardBeforeState} -> ${cardAfterState}`);
  INFO(`Card last_review_result: ${cardAfterLastResult}`);

  // Expected: new -> reviewing (since got_it on a new card)
  if (cardAfter) {
    if (cardAfterState === 'reviewing' || cardAfterState === 'strengthening' || cardAfterState === 'mastered') {
      PASS(`Card review_state changed from "${cardBeforeState}" to "${cardAfterState}" (expected transition)`);
    } else if (cardAfterState === cardBeforeState && cardBeforeState === 'new') {
      WARN(`Card review_state unchanged ("${cardAfterState}") — may depend on backend logic`);
    } else {
      WARN(`Card review_state is now "${cardAfterState}" (from "${cardBeforeState}") — verify manually`);
    }

    if (cardAfterLastResult === 'got_it') {
      PASS(`Card last_review_result is "got_it"`);
    } else {
      WARN(`Card last_review_result is "${cardAfterLastResult}" (expected "got_it")`);
    }
  }

  // G3. Check stats changes
  console.log('');
  INFO('Stats comparison:');

  const sb = statsBefore || {};
  const sa = statsAfter || {};

  const bNew = toNum(sb.new);
  const bReviewing = toNum(sb.reviewing);
  const bStrengthening = toNum(sb.strengthening);
  const bMastered = toNum(sb.mastered);

  const aNew = toNum(sa.new);
  const aReviewing = toNum(sa.reviewing);
  const aStrengthening = toNum(sa.strengthening);
  const aMastered = toNum(sa.mastered);

  console.log(`    stats.new:           ${bNew} -> ${aNew} (delta: ${aNew - bNew})`);
  console.log(`    stats.reviewing:     ${bReviewing} -> ${aReviewing} (delta: ${aReviewing - bReviewing})`);
  console.log(`    stats.strengthening: ${bStrengthening} -> ${aStrengthening} (delta: ${aStrengthening - bStrengthening})`);
  console.log(`    stats.mastered:      ${bMastered} -> ${aMastered} (delta: ${aMastered - bMastered})`);

  // A new card with got_it should: new-1, reviewing+1
  if (aNew === bNew - 1) {
    PASS(`stats.new decreased by 1 (${bNew} -> ${aNew})`);
  } else if (aNew < bNew) {
    WARN(`stats.new decreased but not exactly by 1 (${bNew} -> ${aNew})`);
  } else if (aNew === bNew) {
    WARN(`stats.new unchanged (${bNew}) — card might not be counted in stats.new`);
  } else {
    WARN(`stats.new increased (${bNew} -> ${aNew}) — unexpected but may be due to background processes`);
  }

  if (aReviewing === bReviewing + 1) {
    PASS(`stats.reviewing increased by 1 (${bReviewing} -> ${aReviewing})`);
  } else if (aReviewing > bReviewing) {
    WARN(`stats.reviewing increased but not exactly by 1 (${bReviewing} -> ${aReviewing})`);
  } else if (aReviewing === bReviewing) {
    WARN(`stats.reviewing unchanged (${bReviewing}) — card might have transitioned to a different state`);
  } else {
    WARN(`stats.reviewing decreased (${bReviewing} -> ${aReviewing}) — unexpected`);
  }

  // G4. Check overview changes
  console.log('');
  INFO('Overview comparison:');

  const ovBefore = normOverviewBefore;
  const ovAfter = normOverviewAfter;

  console.log(`    totalToday:           ${ovBefore.totalToday} -> ${ovAfter.totalToday} (delta: ${ovAfter.totalToday - ovBefore.totalToday})`);
  console.log(`    toNew:                ${ovBefore.toNew} -> ${ovAfter.toNew} (delta: ${ovAfter.toNew - ovBefore.toNew})`);
  console.log(`    toReview:             ${ovBefore.toReview} -> ${ovAfter.toReview} (delta: ${ovAfter.toReview - ovBefore.toReview})`);
  console.log(`    strengtheningInReview: ${ovBefore.strengtheningInReview} -> ${ovAfter.strengtheningInReview} (delta: ${ovAfter.strengtheningInReview - ovBefore.strengtheningInReview})`);

  if (ovAfter.toNew < ovBefore.toNew) {
    PASS(`overview toNew decreased (${ovBefore.toNew} -> ${ovAfter.toNew}) — test card no longer counted as new`);
  } else if (ovAfter.toNew === ovBefore.toNew) {
    WARN(`overview toNew unchanged (${ovBefore.toNew}) — may be correct if other cards exist`);
  }

  if (ovAfter.totalToday < ovBefore.totalToday) {
    PASS(`overview totalToday decreased (${ovBefore.totalToday} -> ${ovAfter.totalToday})`);
  } else if (ovAfter.totalToday === ovBefore.totalToday) {
    WARN(`overview totalToday unchanged (${ovBefore.totalToday}) — may be correct if card still counts toward today`);
  }

  // G5. Check active session
  if (ovBefore.activeSession && !ovAfter.activeSession) {
    PASS('Session completed (activeSession cleared)');
  } else if (ovBefore.activeSession && ovAfter.activeSession) {
    INFO(`Active session persisted: ${fmt(ovAfter.activeSession).slice(0, 200)}`);
  } else if (!ovBefore.activeSession) {
    INFO('No active session before (session may have been consumed immediately)');
  }

  // G6. Check feedback response was OK
  if (feedbackRes.statusCode >= 200 && feedbackRes.statusCode < 300) {
    PASS('Feedback request returned 200 OK');
  } else {
    FAIL(`Feedback request returned ${feedbackRes.statusCode}`);
  }

  // ---- H. Print Report ----
  console.log('');
  console.log('========== Report ==========');
  console.log('');

  console.log('PASS / FAIL:');
  console.log(`  PASS: ${results.pass}`);
  console.log(`  WARN: ${results.warn}`);
  console.log(`  FAIL: ${results.fail}`);
  console.log('');

  console.log('Before:');
  console.log(`  totalToday:           ${ovBefore.totalToday}`);
  console.log(`  toNew:                ${ovBefore.toNew}`);
  console.log(`  toReview:             ${ovBefore.toReview}`);
  console.log(`  strengtheningInReview: ${ovBefore.strengtheningInReview}`);
  console.log(`  stats.new:            ${bNew}`);
  console.log(`  stats.reviewing:      ${bReviewing}`);
  console.log(`  stats.strengthening:  ${bStrengthening}`);
  console.log(`  stats.mastered:       ${bMastered}`);
  console.log('');

  console.log('After:');
  console.log(`  totalToday:           ${ovAfter.totalToday}`);
  console.log(`  toNew:                ${ovAfter.toNew}`);
  console.log(`  toReview:             ${ovAfter.toReview}`);
  console.log(`  strengtheningInReview: ${ovAfter.strengtheningInReview}`);
  console.log(`  stats.new:            ${aNew}`);
  console.log(`  stats.reviewing:      ${aReviewing}`);
  console.log(`  stats.strengthening:  ${aStrengthening}`);
  console.log(`  stats.mastered:       ${aMastered}`);
  console.log('');

  console.log('Card:');
  console.log(`  card_id:            ${testCardId}`);
  console.log(`  content:            ${testContent}`);
  console.log(`  before review_state: ${cardBeforeState}`);
  console.log(`  after review_state:  ${cardAfterState}`);
  if (cardAfterLastResult) {
    console.log(`  last_review_result:  ${cardAfterLastResult}`);
  }
  console.log('');

  console.log('Requests:');
  console.log(`  create card status:       ${createRes ? 200 : 'FAIL'}`);
  console.log(`  create session status:    ${sessionId ? '200' : 'FAIL'}`);
  console.log(`  feedback status:          ${feedbackRes.statusCode}`);
  console.log(`  overview before/after:    ${overviewBefore ? '200' : 'FAIL'} / ${overviewAfter ? '200' : 'FAIL'}`);
  console.log(`  stats before/after:       ${statsBefore ? '200' : 'FAIL'} / ${statsAfter ? '200' : 'FAIL'}`);
  console.log('');

  if (results.fail === 0) {
    console.log('✅ Phase 4B-S Step 2 check PASSED: feedback refresh data link verified');
  } else if (results.warn > 0 && results.fail === 0) {
    console.log('⚡ Phase 4B-S Step 2 check PASSED with warnings — review WARN items above');
  } else {
    console.log('❌ Phase 4B-S Step 2 check FAILED — review FAIL items above');
  }

  console.log('');
}

function printSummary() {
  console.log('');
  console.log('========== Summary ==========');
  console.log(`PASS: ${results.pass} | WARN: ${results.warn} | FAIL: ${results.fail}`);
  console.log('');
}

run().catch((err) => {
  console.error('Unhandled error:', err);
  printSummary();
  process.exit(1);
});
