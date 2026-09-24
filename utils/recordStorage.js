const {
  BACKEND_AUTH_STORAGE_KEYS,
  createBackendCard,
  deleteBackendCard,
  listBackendCards,
  updateBackendCard
} = require('./apiClient');

// =====================================================================
// Phase 4D-1: 职责分区注释
//
// 分区标识说明：
//   [CURRENT]              — 当前主链路，切勿删除
//   [COMPAT-HISTORY]       — 历史复习页依赖，不能删（只读旧 reviewRecords）
//   [LEGACY]               — 旧逻辑，无页面直接调用，暂保留，后续再评估
//   [DEAD-CANDIDATE]       — 无页面调用，确认无用前不能删除
//   [CROSS-ZONE UTILITY]   — 被多个分区使用的工具函数
//   [CORE]                 — 当前/兼容/旧逻辑共用的核心函数
// =====================================================================

const STORAGE_KEY = 'cardsCache';
const CARDS_LAST_SYNC_KEY = 'cardsLastSyncAt';
const REVIEW_BATCH_SIZE = 5;

const SYNC_STATUS_SYNCED = 'synced';
const SYNC_STATUS_PENDING = 'pending';
const SYNC_STATUS_FAILED = 'failed';
const SYNC_STATUS_PENDING_DELETE = 'pending_delete';

const BACKEND_SYNC_STATUS_PENDING = 'pending';
const BACKEND_SYNC_STATUS_SYNCED = 'synced';
const BACKEND_SYNC_STATUS_FAILED = 'failed';

let backgroundBackendRefresh = null;
let pendingSyncInProgress = false;

// 增量同步游标：上次成功同步服务端的最新 updated_at（ISO 字符串）。
// null 表示尚未从 storage 恢复，恢复后为 '' 表示无游标（强制全量同步）。

function getCardStorageScope() {
  try {
    const userId = trimValue(wx.getStorageSync(BACKEND_AUTH_STORAGE_KEYS.userId));
    return userId ? `user:${userId}` : 'anonymous';
  } catch (_) {
    return 'anonymous';
  }
}

function getScopedStorageKey(baseKey, scope = getCardStorageScope()) {
  return `${baseKey}:${scope}`;
}

const BACKEND_CATEGORY_TO_CARD_TYPE = {
  '\u5355\u8bcd': 'word',
  '\u77ed\u8bed': 'phrase',
  '\u53e5\u5b50': 'sentence'
};
const BACKEND_CARD_TYPE_TO_CATEGORY = {
  word: '\u5355\u8bcd',
  phrase: '\u77ed\u8bed',
  sentence: '\u53e5\u5b50'
};
const BACKEND_REVIEW_RESULT_TO_STATE = {
  again: '\u6ca1\u8bb0\u4f4f',
  hard: '\u6a21\u7cca',
  good: '\u8bb0\u4f4f\u4e86',
  easy: '\u592a\u7b80\u5355',
  forgot: '\u6ca1\u8bb0\u4f4f',
  shaky: '\u6a21\u7cca',
  got_it: '\u8bb0\u4f4f\u4e86',
  fluent: '\u592a\u7b80\u5355'
};
const PHASE2_REVIEW_STATES = ['new', 'strengthening', 'reviewing', 'mastered'];
const BACKEND_INITIAL_REVIEW_STATE = '\u672a\u590d\u4e60';

const DEFAULT_CATEGORY = '单词';
const DEFAULT_EXAM_SCENE = '未分类';
const DEFAULT_EXAM_MODULE = '未分类';

const REVIEW_STATES = ['未复习', '没记住', '模糊', '记住了', '太简单'];
const TODAY_REVIEW_CACHE_PREFIX = 'todayReviewedCardIds';
const TODAY_REVIEW_SUMMARY_PREFIX = 'todayReviewSummary';
const REVIEW_RECORDS_STORAGE_KEY = 'reviewRecords';

const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30, 60];
const MAX_MASTERY_LEVEL = REVIEW_INTERVAL_DAYS.length - 1;

// ===== [CROSS-ZONE UTILITY] 基础工具函数 =====

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function trimValue(value) {
  return String(value || '').trim();
}

function pickFirstDefinedValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
}

// ===== [LEGACY] 旧本地复习逻辑 — 今日复习缓存（updateReviewResult 不再走通，无页面调用）=====
function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  return `${year}-${month}-${day}`;
}

function getTodayReviewCacheKey(date = new Date()) {
  return `${TODAY_REVIEW_CACHE_PREFIX}_${getTodayDateKey(date)}`;
}

function getTodayReviewSummaryKey(date = new Date()) {
  return `${TODAY_REVIEW_SUMMARY_PREFIX}_${getTodayDateKey(date)}`;
}

function createEmptyTodayReviewSummary() {
  return {
    total: 0,
    easy: 0,
    good: 0,
    hard: 0,
    again: 0
  };
}

function normalizeTodayReviewSummary(summary = {}) {
  return {
    total: Math.max(Number(summary.total || 0), 0),
    easy: Math.max(Number(summary.easy || 0), 0),
    good: Math.max(Number(summary.good || 0), 0),
    hard: Math.max(Number(summary.hard || 0), 0),
    again: Math.max(Number(summary.again || 0), 0)
  };
}

function getTodayReviewSummary(date = new Date()) {
  const todayCardIds = getTodayReviewedCardIds(date);

  if (todayCardIds.length === 0) {
    return createEmptyTodayReviewSummary();
  }

  const allCards = getLocalCards({ includeDeleted: true });
  const summary = createEmptyTodayReviewSummary();

  for (const card of allCards) {
    if (!todayCardIds.includes(String(card.id))) {
      continue;
    }

    const result = normalizeReviewState(card.lastReviewResult);
    summary.total += 1;

    if (result === '没记住') {
      summary.again += 1;
    } else if (result === '模糊') {
      summary.hard += 1;
    } else if (result === '记住了') {
      summary.good += 1;
    } else if (result === '太简单') {
      summary.easy += 1;
    }
  }

  return summary;
}

function saveTodayReviewSummary(summary = {}, date = new Date()) {
  const cacheKey = getTodayReviewSummaryKey(date);
  const normalizedSummary = normalizeTodayReviewSummary(summary);
  wx.setStorageSync(cacheKey, normalizedSummary);
  return normalizedSummary;
}

function markTodayReviewSummary(reviewState, date = new Date()) {
  const normalizedState = normalizeReviewState(reviewState);

  if (normalizedState === '未复习') {
    return getTodayReviewSummary(date);
  }

  const currentSummary = getTodayReviewSummary(date);
  const nextSummary = {
    ...currentSummary,
    total: currentSummary.total + 1
  };

  if (normalizedState === '太简单') {
    nextSummary.easy += 1;
  } else if (normalizedState === '记住了') {
    nextSummary.good += 1;
  } else if (normalizedState === '模糊') {
    nextSummary.hard += 1;
  } else if (normalizedState === '没记住') {
    nextSummary.again += 1;
  }

  return saveTodayReviewSummary(nextSummary, date);
}


function normalizeCardId(cardId) {
  return String(cardId || '').trim();
}

function getTodayReviewedCardIds(date = new Date()) {
  const cacheKey = getTodayReviewCacheKey(date);
  const ids = wx.getStorageSync(cacheKey);

  if (!Array.isArray(ids)) {
    return [];
  }

  return Array.from(new Set(ids.map(normalizeCardId).filter(Boolean)));
}

function saveTodayReviewedCardIds(cardIds = [], date = new Date()) {
  const cacheKey = getTodayReviewCacheKey(date);
  const normalizedIds = Array.from(new Set((cardIds || []).map(normalizeCardId).filter(Boolean)));
  wx.setStorageSync(cacheKey, normalizedIds);
  return normalizedIds;
}

function markCardReviewedToday(cardId, date = new Date()) {
  const currentIds = getTodayReviewedCardIds(date);
  const normalizedId = normalizeCardId(cardId);

  if (!normalizedId) {
    return currentIds;
  }

  if (currentIds.includes(normalizedId)) {
    return currentIds;
  }

  const nextIds = currentIds.concat(normalizedId);
  saveTodayReviewedCardIds(nextIds, date);
  return nextIds;
}

function getTodayReviewedCardsFromAll(cards = [], date = new Date()) {
  const todayIds = new Set(getTodayReviewedCardIds(date));

  if (todayIds.size === 0) {
    return [];
  }

  return (cards || [])
    .filter((card) => todayIds.has(String(card.id)))
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.lastReviewedAt || 0).getTime() || 0;
      const rightTime = new Date(right.lastReviewedAt || 0).getTime() || 0;
      return rightTime - leftTime;
    });
}

// ===== [COMPAT-HISTORY] 历史复习记录兼容层 =====
// 历史页 pages/history_reviewed/history_index 当前读取旧本地 reviewRecords；
// 新复习主链路已走后端 submitReviewFeedback，不再写入 reviewRecords，
// 因此历史页数据存在断档。Phase 4D-1 只标记，不修复。
function createReviewRecordId(cardId) {
  return `rr_${Date.now()}_${String(cardId || '').trim()}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildReviewSnapshot(card = {}) {
  const normalizedCard = normalizeCard(card || {});

  return {
    englishText: trimValue(normalizedCard.englishText),
    myUnderstanding: trimValue(normalizedCard.myUnderstanding),
    notes: trimValue(normalizedCard.notes),
    category: trimValue(normalizedCard.category || DEFAULT_CATEGORY),
    examScene: trimValue(normalizedCard.examScene || DEFAULT_EXAM_SCENE),
    examModule: trimValue(normalizedCard.examModule || DEFAULT_EXAM_MODULE),
    reviewState: normalizeReviewState(normalizedCard.reviewState),
    reviewCount: Math.max(Number(normalizedCard.reviewCount || 0), 0),
    lastReviewResult: trimValue(normalizedCard.lastReviewResult || ''),
    lastReviewedAt: toIsoString(normalizedCard.lastReviewedAt),
    nextReviewAt: toIsoString(normalizedCard.nextReviewAt),
    masteryLevel: normalizeMasteryLevel(normalizedCard.masteryLevel)
  };
}

function getSnapshotField(record, fieldName) {
  if (record && record.snapshot && Object.prototype.hasOwnProperty.call(record.snapshot, fieldName)) {
    return record.snapshot[fieldName];
  }

  return record ? record[fieldName] : '';
}

function getReviewRecords() {
  const records = wx.getStorageSync(REVIEW_RECORDS_STORAGE_KEY);

  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .filter((item) => item && String(item.cardId || '').trim())
    .slice()
    .sort((left, right) => Number(right.reviewedAt || 0) - Number(left.reviewedAt || 0));
}

function saveReviewRecords(records = []) {
  const normalizedRecords = (records || [])
    .filter((item) => item && String(item.cardId || '').trim())
    .slice()
    .sort((left, right) => Number(right.reviewedAt || 0) - Number(left.reviewedAt || 0));

  wx.setStorageSync(REVIEW_RECORDS_STORAGE_KEY, normalizedRecords);
  return normalizedRecords;
}

function appendReviewRecord(card, result, reviewedAt = new Date()) {
  const normalizedCard = normalizeCard(card || {});
  const normalizedResult = normalizeReviewState(result);
  const timeInfo = createTimeInfo(reviewedAt);

  if (!normalizedCard.id || normalizedResult === '未复习') {
    return null;
  }

  const snapshot = buildReviewSnapshot(normalizedCard);

  const record = {
    id: createReviewRecordId(normalizedCard.id),
    cardId: String(normalizedCard.id),

    reviewedAt: reviewedAt.getTime(),
    reviewDate: timeInfo.date,
    reviewTime: timeInfo.time,

    result: normalizedResult,

    // 新增：真正的历史快照
    snapshot,

    // 下面这些旧字段先保留，兼容你现有旧逻辑/旧数据
    englishText: snapshot.englishText,
    myUnderstanding: snapshot.myUnderstanding,
    notes: snapshot.notes,

    category: snapshot.category,
    examScene: snapshot.examScene,
    examModule: snapshot.examModule,

    reviewCountAfter: snapshot.reviewCount,
    lastReviewedAtAfter: snapshot.lastReviewedAt,
    nextReviewAtAfter: snapshot.nextReviewAt
  };

  const currentRecords = getReviewRecords();
  currentRecords.unshift(record);
  saveReviewRecords(currentRecords);

  return record;
}

function getRangeStartTime(rangeKey, now = Date.now()) {
  if (rangeKey === '7d') {
    return now - 7 * 24 * 60 * 60 * 1000;
  }

  if (rangeKey === '30d') {
    return now - 30 * 24 * 60 * 60 * 1000;
  }

  return 0;
}

function getReviewRecordsByRange(rangeKey = 'all') {
  const allRecords = getReviewRecords();

  if (rangeKey === 'all') {
    return allRecords;
  }

  const now = Date.now();
  const startTime = getRangeStartTime(rangeKey, now);

  return allRecords.filter((record) => {
    const reviewedAt = Number(record.reviewedAt || 0);
    return reviewedAt >= startTime && reviewedAt <= now;
  });
}

function getHistoryCardSummaries(rangeKey = 'all') {
  const records = getReviewRecordsByRange(rangeKey);
  const summaryMap = new Map();

  (records || []).forEach((record) => {
    const cardId = String(record.cardId || '').trim();

    if (!cardId) {
      return;
    }

    const recordEnglishText = trimValue(getSnapshotField(record, 'englishText'));
    const recordMyUnderstanding = trimValue(getSnapshotField(record, 'myUnderstanding'));
    const recordNotes = trimValue(getSnapshotField(record, 'notes'));

    const recordCategory = trimValue(
      getSnapshotField(record, 'category') || DEFAULT_CATEGORY
    );
    const recordExamScene = trimValue(
      getSnapshotField(record, 'examScene') || DEFAULT_EXAM_SCENE
    );
    const recordExamModule = trimValue(
      getSnapshotField(record, 'examModule') || DEFAULT_EXAM_MODULE
    );

    const existing = summaryMap.get(cardId);

    if (!existing) {
      summaryMap.set(cardId, {
        cardId,
        englishText: recordEnglishText,
        myUnderstanding: recordMyUnderstanding,
        notes: recordNotes,

        category: recordCategory,
        examScene: recordExamScene,
        examModule: recordExamModule,

        reviewCountInRange: 1,
        lastResultInRange: trimValue(record.result),
        lastReviewedAtInRange: Number(record.reviewedAt || 0),
        lastReviewDateInRange: trimValue(record.reviewDate),
        lastReviewTimeInRange: trimValue(record.reviewTime)
      });
      return;
    }

    existing.reviewCountInRange += 1;

    if (Number(record.reviewedAt || 0) > Number(existing.lastReviewedAtInRange || 0)) {
      existing.lastResultInRange = trimValue(record.result);
      existing.lastReviewedAtInRange = Number(record.reviewedAt || 0);
      existing.lastReviewDateInRange = trimValue(record.reviewDate);
      existing.lastReviewTimeInRange = trimValue(record.reviewTime);

      existing.englishText = recordEnglishText || existing.englishText;
      existing.myUnderstanding = recordMyUnderstanding || existing.myUnderstanding;
      existing.notes = recordNotes || existing.notes;
      existing.category = recordCategory || existing.category;
      existing.examScene = recordExamScene || existing.examScene;
      existing.examModule = recordExamModule || existing.examModule;
    }
  });

  return Array.from(summaryMap.values()).sort((left, right) => {
    return Number(right.lastReviewedAtInRange || 0) - Number(left.lastReviewedAtInRange || 0);
  });
}

function filterHistoryCardSummariesByResult(summaries = [], quickFilter = 'all') {
  if (quickFilter === 'all') {
    return summaries;
  }

  if (quickFilter === 'again') {
    return summaries.filter((item) => item.lastResultInRange === '没记住');
  }

  if (quickFilter === 'hard') {
    return summaries.filter((item) => item.lastResultInRange === '模糊');
  }

  if (quickFilter === 'good') {
    return summaries.filter((item) => (
      item.lastResultInRange === '记住了' || item.lastResultInRange === '太简单'
    ));
  }

  return summaries;
}

function getHistorySummaryStats(rangeKey = 'all') {
  const records = getReviewRecordsByRange(rangeKey);
  const cardIdSet = new Set(
    (records || [])
      .map((item) => String(item.cardId || '').trim())
      .filter(Boolean)
  );

  return {
    totalReviewsInRange: records.length,
    totalCardsInRange: cardIdSet.size
  };
}

// ===== End of [COMPAT-HISTORY] =====

// ===== [CURRENT] 工具函数 / 后端数据同步工具 =====



function createCardId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLocalTempId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createTimeInfo(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();

  return {
    timestamp: date.getTime(),
    date: `${year}-${padNumber(month)}-${padNumber(day)}`,
    time: `${padNumber(hours)}:${padNumber(minutes)}`,
    dateTime: `${year}-${padNumber(month)}-${padNumber(day)} ${padNumber(hours)}:${padNumber(minutes)}`,
    updatedLabel: `最近修改于${year}年${month}月${day}日${hours}点${padNumber(minutes)}分`
  };
}

function parseBackendDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function mapCategoryToBackendCardType(category) {
  return BACKEND_CATEGORY_TO_CARD_TYPE[trimValue(category)] || 'word';
}

function mapBackendCardTypeToCategory(cardType) {
  return BACKEND_CARD_TYPE_TO_CATEGORY[trimValue(cardType)] || DEFAULT_CATEGORY;
}

function mapBackendReviewResult(result) {
  return BACKEND_REVIEW_RESULT_TO_STATE[trimValue(result)] || '';
}

function getBackendAnalysisLevelFromLocal(card = {}) {
  if (Array.isArray(card.analysisErrors) && card.analysisErrors.length > 0) {
    return 'error';
  }

  if (Array.isArray(card.analysisWarnings) && card.analysisWarnings.length > 0) {
    return 'warning';
  }

  return 'pass';
}

function buildBackendAnalysisMessagesFromLocal(card = {}) {
  return []
    .concat(Array.isArray(card.analysisErrors) ? card.analysisErrors : [])
    .concat(Array.isArray(card.analysisWarnings) ? card.analysisWarnings : [])
    .map((item) => trimValue(item))
    .filter(Boolean);
}

function buildBackendEncounterPayloads(encounters) {
  if (!Array.isArray(encounters)) return [];
  return encounters.map((encounter) => {
    const source = encounter || {};
    const whereEncountered = trimValue(source.where_encountered || source.whereEncountered || '');
    if (!whereEncountered) return null;

    const payload = { where_encountered: whereEncountered };
    const id = trimValue(source.id || '');
    if (id) payload.id = id;
    if (source.context !== undefined && source.context !== null) {
      payload.context = trimValue(source.context);
    }
    const encounteredAt = source.encountered_at || source.encounteredAt;
    if (encounteredAt) payload.encountered_at = encounteredAt;
    return payload;
  }).filter(Boolean);
}

function buildBackendCardCreatePayload(form = {}) {
  const fields = buildCardFields(form, {});
  const localTempId = trimValue(form.local_temp_id || form.localTempId || '') || createLocalTempId();

  const payload = {
    local_temp_id: localTempId,
    content: trimValue(fields.englishText),
    card_type: mapCategoryToBackendCardType(fields.category),
    understanding: trimValue(fields.myUnderstanding) || null,
    note: trimValue(fields.notes) || null,
    where_encountered: trimValue(fields.whereEncountered) || null,
    example_sentence: trimValue(fields.exampleSentence) || null,
    example_translation: trimValue(fields.exampleTranslation) || null,
    participates_in_review: fields.participatesInReview !== false,
    add_channel: trimValue(fields.addChannel || fields.sourceChannel || '') || 'manual',
    public_material_item_id: fields.publicMaterialItemId || null,
    source_wordbook_id: fields.sourceWordbookId || null,
    encounters: buildBackendEncounterPayloads(fields.encounters),
    translation: trimValue(fields.translation) || null,
    analysis_status: trimValue(fields.analysisStatus) || 'pending',
    analysis_level: getBackendAnalysisLevelFromLocal(fields),
    analysis_messages: buildBackendAnalysisMessagesFromLocal(fields),
    understanding_source: trimValue(fields.understandingSource) || 'local'
  };

  

  return payload;
}

function buildBackendCardPatchPayload(form = {}, fallbackCard = {}) {
  const fields = buildCardFields(form, fallbackCard);

  return {
    content: trimValue(fields.englishText),
    card_type: mapCategoryToBackendCardType(fields.category),
    understanding: trimValue(fields.myUnderstanding) || null,
    note: trimValue(fields.notes) || null,
    where_encountered: trimValue(fields.whereEncountered) || null,
    example_sentence: trimValue(fields.exampleSentence) || null,
    example_translation: trimValue(fields.exampleTranslation) || null,
    participates_in_review: fields.participatesInReview !== false,
    add_channel: trimValue(fields.addChannel || fields.sourceChannel || '') || 'manual',
    public_material_item_id: fields.publicMaterialItemId || null,
    source_wordbook_id: fields.sourceWordbookId || null,
    encounters: buildBackendEncounterPayloads(fields.encounters),
    translation: trimValue(fields.translation) || null
  };
}

function normalizeBackendCardToLocal(backendCard = {}, fallbackCard = {}) {
  const now = new Date();
  const createdDate = parseBackendDate(backendCard.created_at, now);
  const updatedDate = parseBackendDate(backendCard.updated_at, createdDate);
  const createdInfo = createTimeInfo(createdDate);
  const updatedInfo = createTimeInfo(updatedDate);
  const analysisMessages = Array.isArray(backendCard.analysis_messages)
    ? backendCard.analysis_messages
    : [];
  const analysisLevel = trimValue(backendCard.analysis_level);
  const reviewCount = Math.max(Number(backendCard.review_count || 0), 0);
  const lastReviewResult = mapBackendReviewResult(backendCard.last_review_result);

  return normalizeCard({
    ...fallbackCard,
    id: trimValue(backendCard.id || fallbackCard.id),
    local_temp_id: trimValue(backendCard.local_temp_id || fallbackCard.local_temp_id || ''),
    backend_card_id: trimValue(backendCard.id || fallbackCard.backend_card_id || ''),
    version: Math.max(Number(backendCard.version || fallbackCard.version || 1), 1),
    backend_sync_status: BACKEND_SYNC_STATUS_SYNCED,
    backend_synced_at: new Date().toISOString(),
    backend_sync_error: '',
    category: mapBackendCardTypeToCategory(backendCard.card_type),
    examScene: trimValue(backendCard.exam_scene || DEFAULT_EXAM_SCENE),
    examModule: trimValue(backendCard.exam_module || DEFAULT_EXAM_MODULE),
    englishText: trimValue(backendCard.content),
    myUnderstanding: trimValue(backendCard.understanding || ''),
    notes: trimValue(backendCard.note || ''),
    whereEncountered: trimValue(backendCard.where_encountered || ''),
    exampleSentence: trimValue(backendCard.example_sentence || ''),
    exampleTranslation: trimValue(backendCard.example_translation || ''),
    participatesInReview: backendCard.participates_in_review !== false,
    addChannel: trimValue(backendCard.add_channel || 'manual'),
    publicMaterialItemId: trimValue(backendCard.public_material_item_id || ''),
    sourceWordbookId: trimValue(backendCard.source_wordbook_id || ''),
    encounters: Array.isArray(backendCard.encounters) ? backendCard.encounters.map((item) => ({
      id: trimValue(item.id),
      whereEncountered: trimValue(item.where_encountered || item.whereEncountered || ''),
      context: trimValue(item.context || ''),
      encounteredAt: toIsoString(item.encountered_at || item.encounteredAt)
    })) : [],
    reviewState: reviewCount > 0
      ? (lastReviewResult || fallbackCard.reviewState || BACKEND_INITIAL_REVIEW_STATE)
      : BACKEND_INITIAL_REVIEW_STATE,
    reviewCount,
    lastReviewedAt: toIsoString(backendCard.last_reviewed_at),
    nextReviewAt: toIsoString(backendCard.next_review_at),
    masteryLevel: Math.max(Number(backendCard.mastery_level || fallbackCard.masteryLevel || 0), 0),
    againCount: Math.max(Number(backendCard.again_count || 0), 0),
    hardCount: Math.max(Number(backendCard.hard_count || 0), 0),
    goodCount: Math.max(Number(backendCard.good_count || 0), 0),
    easyCount: Math.max(Number(backendCard.easy_count || 0), 0),
    lastReviewResult,
    reviewStateV2: trimValue(pickFirstDefinedValue(
      backendCard.review_state,
      fallbackCard.reviewStateV2,
      fallbackCard.review_state,
      'new'
    )),
    masteryScore: Math.max(Number(pickFirstDefinedValue(
      backendCard.mastery_score,
      fallbackCard.masteryScore,
      fallbackCard.mastery_score,
      0
    )), 0),
    recoveryStage: Math.max(Number(pickFirstDefinedValue(
      backendCard.recovery_stage,
      fallbackCard.recoveryStage,
      fallbackCard.recovery_stage,
      0
    )), 0),
    forgotCount: Math.max(Number(pickFirstDefinedValue(
      backendCard.forgot_count,
      fallbackCard.forgotCount,
      fallbackCard.forgot_count,
      0
    )), 0),
    shakyCount: Math.max(Number(pickFirstDefinedValue(
      backendCard.shaky_count,
      fallbackCard.shakyCount,
      fallbackCard.shaky_count,
      0
    )), 0),
    gotItCount: Math.max(Number(pickFirstDefinedValue(
      backendCard.got_it_count,
      fallbackCard.gotItCount,
      fallbackCard.got_it_count,
      0
    )), 0),
    fluentCount: Math.max(Number(pickFirstDefinedValue(
      backendCard.fluent_count,
      fallbackCard.fluentCount,
      fallbackCard.fluent_count,
      0
    )), 0),
    syncStatus: SYNC_STATUS_SYNCED,
    syncError: '',
    deleted: Boolean(backendCard.deleted_at),
    date: updatedInfo.date,
    time: updatedInfo.time,
    dateTime: updatedInfo.dateTime,
    updatedLabel: updatedInfo.updatedLabel,
    createdAt: createdInfo.timestamp,
    updatedAt: updatedInfo.timestamp,
    analysisStatus: trimValue(backendCard.analysis_status || ''),
    analysisWarnings: analysisLevel === 'warning' ? analysisMessages : [],
    analysisErrors: analysisLevel === 'error' ? analysisMessages : [],
    analysisSource: 'backend',
    understandingSource: trimValue(backendCard.understanding_source || ''),
    analyzedAt: toIsoString(backendCard.updated_at)
  });
}

// ===== [CURRENT] 安全字段比较 =====
function safeNormalize(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function cardsNeedUpdate(backendCard, form, currentCard) {
  var formEnglishText = pickFirstDefinedValue(form.englishText, currentCard && currentCard.englishText, '');
  var formUnderstanding = pickFirstDefinedValue(form.myUnderstanding, currentCard && currentCard.myUnderstanding, '');
  var formNote = pickFirstDefinedValue(form.note, form.notes, currentCard && currentCard.note, currentCard && currentCard.notes, '');
  var formTranslation = pickFirstDefinedValue(form.translation, currentCard && currentCard.translation, '');
  var formCategory = pickFirstDefinedValue(form.category, currentCard && currentCard.category, '');
  var formExamScene = pickFirstDefinedValue(form.examScene, currentCard && currentCard.examScene, '');
  var formExamModule = pickFirstDefinedValue(form.examModule, currentCard && currentCard.examModule, '');
  var formWhereEncountered = pickFirstDefinedValue(form.whereEncountered, currentCard && currentCard.whereEncountered, '');
  var formExampleSentence = pickFirstDefinedValue(form.exampleSentence, currentCard && currentCard.exampleSentence, '');
  var formExampleTranslation = pickFirstDefinedValue(form.exampleTranslation, currentCard && currentCard.exampleTranslation, '');

  if (safeNormalize(backendCard.content) !== safeNormalize(formEnglishText)) return true;
  if (safeNormalize(backendCard.understanding) !== safeNormalize(formUnderstanding)) return true;
  if (safeNormalize(backendCard.note) !== safeNormalize(formNote)) return true;
  if (safeNormalize(backendCard.translation) !== safeNormalize(formTranslation)) return true;
  if (safeNormalize(backendCard.card_type) !== safeNormalize(mapCategoryToBackendCardType(formCategory))) return true;
  if (safeNormalize(backendCard.exam_scene) !== safeNormalize(formExamScene)) return true;
  if (safeNormalize(backendCard.exam_module) !== safeNormalize(formExamModule)) return true;
  if (safeNormalize(backendCard.where_encountered) !== safeNormalize(formWhereEncountered)) return true;
  if (safeNormalize(backendCard.example_sentence) !== safeNormalize(formExampleSentence)) return true;
  if (safeNormalize(backendCard.example_translation) !== safeNormalize(formExampleTranslation)) return true;

  return false;
}

// ===== [CURRENT] 后端同步错误格式化 =====
function getBackendEnglishValidationDetail(error) {
  const detail = error && error.data && error.data.detail;
  if (!detail || typeof detail !== 'object') {
    return null;
  }
  return detail.code === 'invalid_english_content' ? detail : null;
}

function isBackendEnglishValidationError(error) {
  return Number(error && error.statusCode) === 422 && !!getBackendEnglishValidationDetail(error);
}

function formatBackendSyncErrorText(error) {
  if (!error) return 'sync_failed';
  const errMsg = trimValue(error.errMsg || error.message || '');
  if (errMsg) return errMsg.slice(0, 500);
  const statusCode = error.statusCode ? `status ${error.statusCode}: ` : '';
  const validationDetail = getBackendEnglishValidationDetail(error);
  if (validationDetail && validationDetail.message) {
    return (statusCode + trimValue(validationDetail.message)).slice(0, 500);
  }
  const detail = trimValue(
    (error.data && error.data.detail) || (error.data && error.data.message) || ''
  );
  return (statusCode + (detail || 'sync_failed')).slice(0, 500);
}

// ===== [CURRENT] 卡片 CRUD — upsertCachedCard / removeCachedCards / sortCards / getCardSortTime =====
function upsertCachedCard(card) {
  const normalizedCard = normalizeCard(card);
  const normalizedId = normalizeCardId(normalizedCard.id);
  const normalizedBackendId = trimValue(normalizedCard.backend_card_id || '');
  const normalizedLocalTempId = trimValue(normalizedCard.local_temp_id || '');

  const nextCards = getStoredCardsRaw().filter((item) => {
    const itemId = normalizeCardId(item && item.id);
    const itemBackendId = trimValue(item && item.backend_card_id || '');
    const itemLocalTempId = trimValue(item && item.local_temp_id || '');

    return !(
      (normalizedId && itemId === normalizedId) ||
      (normalizedBackendId && itemBackendId === normalizedBackendId) ||
      (normalizedLocalTempId && itemLocalTempId === normalizedLocalTempId)
    );
  });

  saveLocalCards([normalizedCard].concat(nextCards));
  return normalizedCard;
}

function removeCachedCards(cardIds = []) {
  const idSet = new Set((cardIds || []).map(normalizeCardId).filter(Boolean));

  if (idSet.size === 0) {
    return getLocalCards();
  }

  const nextCards = getStoredCardsRaw().filter((card) => !idSet.has(normalizeCardId(card && card.id)));
  saveLocalCards(nextCards);
  return getLocalCards();
}

function sortCards(cards) {
  return (cards || []).slice().sort((left, right) => {
    const leftTime = left.updatedAt || left.createdAt || 0;
    const rightTime = right.updatedAt || right.createdAt || 0;
    return rightTime - leftTime;
  });
}

function getCardSortTime(card) {
  return Number(card && (card.updatedAt || card.createdAt) || 0);
}

// ===== [LEGACY] 旧微信云同步 — isUnsyncedStatus / choosePreferredCard =====
function isUnsyncedStatus(status) {
  return status === SYNC_STATUS_PENDING ||
    status === SYNC_STATUS_FAILED ||
    status === SYNC_STATUS_PENDING_DELETE;
}

function choosePreferredCard(existingCard, candidateCard) {
  if (!existingCard) {
    return candidateCard;
  }

  if (!candidateCard) {
    return existingCard;
  }

  // Explicit guard: backend pending-update card wins over synced to prevent
  // offline edits being overwritten by a stale backend refresh.
  const existingBackendPending = existingCard.backend_sync_status === BACKEND_SYNC_STATUS_PENDING;
  const candidateBackendPending = candidateCard.backend_sync_status === BACKEND_SYNC_STATUS_PENDING;

  if (existingBackendPending !== candidateBackendPending) {
    return existingBackendPending ? existingCard : candidateCard;
  }

  const existingUnsynced = isUnsyncedStatus(existingCard.syncStatus);
  const candidateUnsynced = isUnsyncedStatus(candidateCard.syncStatus);

  if (existingUnsynced !== candidateUnsynced) {
    return candidateUnsynced ? candidateCard : existingCard;
  }


  const existingTime = getCardSortTime(existingCard);
  const candidateTime = getCardSortTime(candidateCard);

  if (candidateTime !== existingTime) {
    return candidateTime > existingTime ? candidateCard : existingCard;
  }

  if (!existingCard._id && candidateCard._id) {
    return candidateCard;
  }

  return candidateCard;
}

function normalizeMasteryLevel(value) {
  const level = Math.floor(Number(value || 0));

  if (Number.isNaN(level)) {
    return 0;
  }

  return Math.max(0, Math.min(level, MAX_MASTERY_LEVEL));
}

function getNextMasteryLevel(currentLevel, reviewState) {
  const state = normalizeReviewState(reviewState);
  const L = normalizeMasteryLevel(currentLevel);

  if (state === '没记住') {
    // 低等级卡确实没掌握，回到底部；高等级老卡偶发失误，不一棒子打回原形
    if (L >= 4) {
      return Math.max(Math.floor(L / 2), 1);
    }

    return 0;
  }

  if (state === '模糊') {
    // 新卡给 2 天缓冲；老卡相对降一级，避免断崖式惩罚
    if (L === 0) {
      return 1;
    }

    return Math.max(L - 1, 1);
  }

  if (state === '记住了') {
    // 新卡首日分流：记住了直接到 4 天；老卡稳步升一级
    if (L === 0) {
      return 2;
    }

    return Math.min(L + 1, MAX_MASTERY_LEVEL);
  }

  if (state === '太简单') {
    // 新卡首日分流：太简单直接到 7 天；老卡连跳两级
    if (L === 0) {
      return 3;
    }

    return Math.min(L + 2, MAX_MASTERY_LEVEL);
  }

  return L;
}

function getReviewIntervalDaysByLevel(level) {
  const normalizedLevel = normalizeMasteryLevel(level);
  return REVIEW_INTERVAL_DAYS[normalizedLevel] || REVIEW_INTERVAL_DAYS[0];
}

function normalizeReviewState(value) {
  const state = trimValue(value || '');
  return REVIEW_STATES.includes(state) ? state : '未复习';
}

function toIsoString(value) {
  const text = trimValue(value || '');
  if (!text) {
    return '';
  }

  const time = new Date(text).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

function normalizeLastReviewResult(value, reviewCount = 0, fallbackState = '') {
  if (!reviewCount) {
    return '';
  }

  const text = trimValue(value || '');

  if (text === '有点难') {
    return '模糊';
  }

  if (text === '会了') {
    return '记住了';
  }

  if (text && REVIEW_STATES.includes(text) && text !== '未复习') {
    return text;
  }

  const normalizedFallback = normalizeReviewState(fallbackState);
  return normalizedFallback === '未复习' ? '' : normalizedFallback;
}


function createInitialReviewFields() {
  return {
    reviewState: '未复习',
    reviewCount: 0,
    lastReviewedAt: '',
    nextReviewAt: '',
    masteryLevel: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
    streakGood: 0,
    lastReviewResult: ''
  };
}


function createInitialSyncFields() {
  return {
    syncStatus: SYNC_STATUS_SYNCED,
    syncError: '',
    deleted: false
  };
}

function createInitialBackendSyncFields() {
  return {
    backend_card_id: '',
    backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
    backend_synced_at: '',
    backend_sync_error: ''
  };
}

function normalizeBackendSyncStatus(status) {
  const normalizedStatus = trimValue(status);

  if (
    normalizedStatus === BACKEND_SYNC_STATUS_PENDING ||
    normalizedStatus === BACKEND_SYNC_STATUS_SYNCED ||
    normalizedStatus === BACKEND_SYNC_STATUS_FAILED
  ) {
    return normalizedStatus;
  }

  return '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => trimValue(item))
    .filter(Boolean);
}

function normalizeAnalysisStatus(value) {
  const status = trimValue(value || '');

  if (status === 'pending' || status === 'done' || status === 'failed') {
    return status;
  }

  return '';
}

function createInitialAnalysisFields() {
  return {
    analysisStatus: '',
    analysisWarnings: [],
    analysisErrors: [],
    analysisSource: '',
    understandingSource: '',
    analyzeCacheKey: '',
    analyzedAt: ''
  };
}

function getReviewStateLabel(state) {
  return normalizeReviewState(state);
}

function addMinutes(baseDate, minutes) {
  return new Date(baseDate.getTime() + minutes * 60 * 1000);
}

function addDays(baseDate, days) {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function calcGoodDaysByStreak(streakGood) {
  if (streakGood <= 1) return 3;
  if (streakGood === 2) return 7;
  if (streakGood === 3) return 14;
  if (streakGood === 4) return 30;
  return 45;
}

function calcEasyDaysByStreak(streakGood) {
  if (streakGood <= 1) return 7;
  if (streakGood === 2) return 15;
  if (streakGood === 3) return 30;
  return 45;
}


function calcNextReviewAt(card, reviewState, reviewedAt = new Date()) {
  const state = normalizeReviewState(reviewState);

  if (state === '未复习') {
    return reviewedAt.toISOString();
  }

  const currentMasteryLevel = normalizeMasteryLevel(card && card.masteryLevel);
  const nextMasteryLevel = getNextMasteryLevel(currentMasteryLevel, state);
  const intervalDays = getReviewIntervalDaysByLevel(nextMasteryLevel);

  return addDays(reviewedAt, intervalDays).toISOString();
}

function migrateLegacyReviewedCard(card) {
  const source = card || {};
  const hasNewReviewFields =
    Object.prototype.hasOwnProperty.call(source, 'reviewState') ||
    Object.prototype.hasOwnProperty.call(source, 'reviewCount') ||
    Object.prototype.hasOwnProperty.call(source, 'lastReviewedAt') ||
    Object.prototype.hasOwnProperty.call(source, 'nextReviewAt') ||
    Object.prototype.hasOwnProperty.call(source, 'againCount') ||
    Object.prototype.hasOwnProperty.call(source, 'hardCount') ||
    Object.prototype.hasOwnProperty.call(source, 'goodCount') ||
    Object.prototype.hasOwnProperty.call(source, 'lastReviewResult');

  if (hasNewReviewFields) {
    return { ...source };
  }

  const reviewed = Boolean(source.reviewed);
  const base = createInitialReviewFields();

  if (!reviewed) {
    const migrated = {
      ...source,
      ...base
    };
    delete migrated.reviewed;
    return migrated;
  }

  const reviewedAt = source.updatedAt
    ? new Date(source.updatedAt)
    : new Date();

    const migrated = {
      ...source,
      reviewState: '记住了',
      reviewCount: 1,
      lastReviewedAt: reviewedAt.toISOString(),
      nextReviewAt: reviewedAt.toISOString(),
      masteryLevel: 2,
      againCount: 0,
      hardCount: 0,
      goodCount: 1,
      easyCount: 0,
      streakGood: 1,
      lastReviewResult: '记住了'
    };

  delete migrated.reviewed;
  return migrated;
}

// [CORE] normalizeCard — 被 [CURRENT]、[COMPAT-HISTORY]、[LEGACY] 共用
function normalizeCard(card) {
  const source = migrateLegacyReviewedCard(card || {});
  const normalizedReviewCount = Math.max(Number(source.reviewCount || 0), 0);

  let normalizedReviewState = normalizeReviewState(source.reviewState);
  if (normalizedReviewState === '有点难') {
    normalizedReviewState = '模糊';
  }
  if (normalizedReviewState === '会了') {
    normalizedReviewState = '记住了';
  }

  return {
    ...source,
    category: trimValue(source.category || DEFAULT_CATEGORY),
    examScene: trimValue(source.examScene || DEFAULT_EXAM_SCENE),
    examModule: trimValue(source.examModule || DEFAULT_EXAM_MODULE),
    englishText: trimValue(source.englishText),
    myUnderstanding: trimValue(source.myUnderstanding),
    notes: trimValue(source.notes),
    whereEncountered: trimValue(source.whereEncountered || ''),
    exampleSentence: trimValue(source.exampleSentence || source.example_sentence || ''),
    exampleTranslation: trimValue(source.exampleTranslation || source.example_translation || ''),
    participatesInReview: source.participatesInReview !== false,
    addChannel: trimValue(source.addChannel || source.add_channel || 'manual'),
    publicMaterialItemId: trimValue(source.publicMaterialItemId || source.public_material_item_id || ''),
    sourceWordbookId: trimValue(source.sourceWordbookId || source.source_wordbook_id || ''),
    encounters: Array.isArray(source.encounters) ? source.encounters : [],
    local_temp_id: trimValue(source.local_temp_id || source.localTempId || ''),
    reviewState: normalizedReviewState,
    reviewCount: normalizedReviewCount,
    lastReviewedAt: toIsoString(source.lastReviewedAt),
    nextReviewAt: toIsoString(source.nextReviewAt),
    masteryLevel: normalizeMasteryLevel(source.masteryLevel),
    againCount: Math.max(Number(source.againCount || 0), 0),
    hardCount: Math.max(Number(source.hardCount || 0), 0),
    goodCount: Math.max(Number(source.goodCount || 0), 0),
    easyCount: Math.max(Number(source.easyCount || 0), 0),
    streakGood: Math.max(Number(source.streakGood || 0), 0),
    lastReviewResult: normalizeLastReviewResult(
      source.lastReviewResult,
      normalizedReviewCount,
      normalizedReviewState
    ),
    syncStatus: trimValue(source.syncStatus || SYNC_STATUS_SYNCED),
    syncError: trimValue(source.syncError || ''),
    deleted: Boolean(source.deleted),
    backend_card_id: trimValue(source.backend_card_id || source.backendCardId || ''),
    backend_sync_status: normalizeBackendSyncStatus(
      source.backend_sync_status || source.backendSyncStatus || ''
    ),
    backend_synced_at: toIsoString(source.backend_synced_at || source.backendSyncedAt),
    backend_sync_error: trimValue(source.backend_sync_error || source.backendSyncError || ''),

    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisWarnings: normalizeStringArray(source.analysisWarnings),
    analysisErrors: normalizeStringArray(source.analysisErrors),
    analysisSource: trimValue(source.analysisSource || ''),
    understandingSource: trimValue(source.understandingSource || ''),
    analyzeCacheKey: trimValue(source.analyzeCacheKey || ''),
    analyzedAt: toIsoString(source.analyzedAt),

    reviewStateV2: PHASE2_REVIEW_STATES.includes(trimValue(pickFirstDefinedValue(
      source.reviewStateV2,
      source.review_state,
      ''
    )))
      ? trimValue(pickFirstDefinedValue(
          source.reviewStateV2,
          source.review_state,
          ''
        ))
      : '',
    masteryScore: Math.max(Number(pickFirstDefinedValue(
      source.masteryScore,
      source.mastery_score,
      0
    )), 0),
    recoveryStage: Math.max(Number(pickFirstDefinedValue(
      source.recoveryStage,
      source.recovery_stage,
      0
    )), 0),
    forgotCount: Math.max(Number(pickFirstDefinedValue(
      source.forgotCount,
      source.forgot_count,
      0
    )), 0),
    shakyCount: Math.max(Number(pickFirstDefinedValue(
      source.shakyCount,
      source.shaky_count,
      0
    )), 0),
    gotItCount: Math.max(Number(pickFirstDefinedValue(
      source.gotItCount,
      source.got_it_count,
      0
    )), 0),
    fluentCount: Math.max(Number(pickFirstDefinedValue(
      source.fluentCount,
      source.fluent_count,
      0
    )), 0)
  };
}

function dedupeCards(cards) {
  const cardMap = new Map();

  (cards || []).forEach((card, index) => {
    const normalizedCard = normalizeCard(card);
    const rawId = trimValue(normalizedCard.id);
    const cardKey = rawId || `__index__${index}`;
    const existingCard = cardMap.get(cardKey);

    cardMap.set(cardKey, choosePreferredCard(existingCard, normalizedCard));
  });

  return sortCards(Array.from(cardMap.values()));
}

// [CORE] getStoredCardsRaw — 存储基元，全文件依赖
function getStoredCardsRaw(storageKey = getScopedStorageKey(STORAGE_KEY)) {
  const cards = wx.getStorageSync(storageKey);

  if (Array.isArray(cards)) {
    return dedupeCards(cards);
  }

  return [];
}

function getLocalCards(options = {}) {
  const { includeDeleted = false } = options;
  const cards = getStoredCardsRaw();

  if (includeDeleted) {
    return cards;
  }

  return cards.filter((card) => !card.deleted);
}

// [CORE] saveLocalCards — 存储基元，全文件依赖
function saveLocalCards(cards, storageKey = getScopedStorageKey(STORAGE_KEY)) {
  wx.setStorageSync(storageKey, dedupeCards(cards));
}





function getFieldValue(source, fallback, fieldName, defaultValue = '') {
  if (Object.prototype.hasOwnProperty.call(source, fieldName)) {
    return source[fieldName];
  }

  if (Object.prototype.hasOwnProperty.call(fallback, fieldName)) {
    return fallback[fieldName];
  }

  return defaultValue;
}

function buildCardFields(form, fallbackCard) {
  const source = form || {};
  const fallback = fallbackCard || {};

  return {
    category: trimValue(getFieldValue(source, fallback, 'category', DEFAULT_CATEGORY) || DEFAULT_CATEGORY),
    examScene: trimValue(getFieldValue(source, fallback, 'examScene', DEFAULT_EXAM_SCENE) || DEFAULT_EXAM_SCENE),
    examModule: trimValue(getFieldValue(source, fallback, 'examModule', DEFAULT_EXAM_MODULE) || DEFAULT_EXAM_MODULE),
    englishText: trimValue(getFieldValue(source, fallback, 'englishText', '')),
    myUnderstanding: trimValue(getFieldValue(source, fallback, 'myUnderstanding', '')),
    notes: trimValue(getFieldValue(source, fallback, 'notes', '')),
    whereEncountered: trimValue(getFieldValue(source, fallback, 'whereEncountered', '')),
    exampleSentence: trimValue(getFieldValue(source, fallback, 'exampleSentence', '')),
    exampleTranslation: trimValue(getFieldValue(source, fallback, 'exampleTranslation', '')),
    participatesInReview: getFieldValue(source, fallback, 'participatesInReview', true) !== false,
    addChannel: trimValue(getFieldValue(source, fallback, 'addChannel', 'manual') || 'manual'),
    publicMaterialItemId: trimValue(getFieldValue(source, fallback, 'publicMaterialItemId', '')),
    sourceWordbookId: trimValue(getFieldValue(source, fallback, 'sourceWordbookId', '')),
    encounters: Array.isArray(getFieldValue(source, fallback, 'encounters', []))
      ? getFieldValue(source, fallback, 'encounters', [])
      : [],
    reviewState: normalizeReviewState(getFieldValue(source, fallback, 'reviewState', '未复习')),
    reviewCount: Math.max(Number(
      Object.prototype.hasOwnProperty.call(source, 'reviewCount')
        ? source.reviewCount
        : fallback.reviewCount || 0
    ), 0),
    lastReviewedAt: toIsoString(
      Object.prototype.hasOwnProperty.call(source, 'lastReviewedAt')
        ? source.lastReviewedAt
        : fallback.lastReviewedAt || ''
    ),
    nextReviewAt: toIsoString(
      Object.prototype.hasOwnProperty.call(source, 'nextReviewAt')
        ? source.nextReviewAt
        : fallback.nextReviewAt || ''
    ),
    masteryLevel: normalizeMasteryLevel(
      Object.prototype.hasOwnProperty.call(source, 'masteryLevel')
        ? source.masteryLevel
        : fallback.masteryLevel || 0
    ),
    
    analysisStatus: normalizeAnalysisStatus(
      getFieldValue(source, fallback, 'analysisStatus', '')
    ),
    analysisWarnings: normalizeStringArray(
      getFieldValue(source, fallback, 'analysisWarnings', [])
    ),
    analysisErrors: normalizeStringArray(
      getFieldValue(source, fallback, 'analysisErrors', [])
    ),
    analysisSource: trimValue(
      getFieldValue(source, fallback, 'analysisSource', '')
    ),
    understandingSource: trimValue(
      getFieldValue(source, fallback, 'understandingSource', '')
    ),
    analyzeCacheKey: trimValue(
      getFieldValue(source, fallback, 'analyzeCacheKey', '')
    ),
    analyzedAt: toIsoString(
      getFieldValue(source, fallback, 'analyzedAt', '')
    ),
    translation: trimValue(
      getFieldValue(source, fallback, 'translation', '')
    )
  };
}

// ===== [CURRENT] 后端数据同步 =====
async function fetchBackendCardsSince(updatedSince = null) {
  const allCards = [];
  const limit = 100;
  let offset = 0;
  let syncCursor = null;
  let serverTime = null;

  while (true) {
    const params = { limit: limit, offset: offset };

    if (updatedSince) {
      params.updated_since = updatedSince;
      params.include_deleted = true;
    }

    const response = await listBackendCards(params);
    const items = Array.isArray(response && response.items) ? response.items : [];
    allCards.push(...items);

    if (response && response.sync_cursor) {
      syncCursor = response.sync_cursor;
    }
    if (response && response.server_time) {
      serverTime = response.server_time;
    }

    const total = Number(response && response.total || 0);
    offset += items.length;

    if (items.length < limit || offset >= total) {
      break;
    }
  }

  return { cards: allCards, syncCursor: syncCursor, serverTime: serverTime };
}

function readLastCardsSync(storageKey = getScopedStorageKey(CARDS_LAST_SYNC_KEY)) {
  try {
    return wx.getStorageSync(storageKey) || '';
  } catch (error) {
    return '';
  }
}

function saveLastCardsSync(cursor, storageKey = getScopedStorageKey(CARDS_LAST_SYNC_KEY)) {
  const value = trimValue(cursor);

  try {
    if (value) {
      wx.setStorageSync(storageKey, value);
    }
  } catch (error) {
    // ignore
  }
}

// 增量合并：只把「变更集合」叠加到现有本地缓存上。
// 复用 dedupeCards/choosePreferredCard：删除墓碑携带更新的 updatedAt，会覆盖旧本地卡，
// 随后在 filter(!deleted) 中被移除；本地 pending 编辑因 choosePreferredCard 优先级而保留。
function applyIncrementalBackendChanges(existingCards, changedBackendCards) {
  const changedLocalCards = (changedBackendCards || []).map((backendCard) => {
    const fallbackCard = getCardByIdFromCards(
      backendCard && backendCard.id,
      existingCards
    ) || {};
    return normalizeBackendCardToLocal(backendCard, fallbackCard);
  });

  const mergedCards = dedupeCards([].concat(changedLocalCards, existingCards));
  return mergedCards.filter((card) => !card.deleted);
}

async function refreshCardsCacheFromBackend() {
  const scope = getCardStorageScope();
  if (backgroundBackendRefresh && backgroundBackendRefresh.scope === scope) {
    return backgroundBackendRefresh.promise;
  }

  const cardsStorageKey = getScopedStorageKey(STORAGE_KEY, scope);
  const cursorStorageKey = getScopedStorageKey(CARDS_LAST_SYNC_KEY, scope);
  const refreshPromise = (async () => {
    const lastCardsSync = readLastCardsSync(cursorStorageKey);
    const cachedCards = getStoredCardsRaw(cardsStorageKey);

    // 只有「有游标 且 本地缓存非空」才走增量；缓存缺失/损坏时回退全量同步。
    const canIncremental = Boolean(lastCardsSync) && cachedCards.length > 0;

    const result = await fetchBackendCardsSince(canIncremental ? lastCardsSync : null);

    let nextCards;

    if (canIncremental) {
      nextCards = applyIncrementalBackendChanges(cachedCards, result.cards);
    } else {
      const backendCards = result.cards;

      nextCards = backendCards
        .map((backendCard) => {
          const fallbackCard = getCardByIdFromCards(
            backendCard && backendCard.id,
            cachedCards
          ) || {};
          return normalizeBackendCardToLocal(backendCard, fallbackCard);
        })
        .filter((card) => !card.deleted);

      // Preserve pending local cards that have no backend counterpart.
      // Pending cards are local drafts — they must not be silently overwritten
      // by a backend card with the same local_temp_id (see Phase 5-7C).
      const nextCardIdSet = new Set(
        nextCards.map((c) => trimValue(c && c.id)).filter(Boolean)
      );

      const pendingCards = cachedCards.filter((card) => {
        if (card.backend_sync_status !== BACKEND_SYNC_STATUS_PENDING) return false;
        // Pending-update cards (have backend_card_id) — always preserve; dedupeCards will
        // prefer the locally-edited version over stale backend data via updatedAt timestamp.
        if (card.backend_card_id) return true;
        // Pending-create cards (no backend_card_id) — exclude if already in nextCards by local id.
        if (card.id && nextCardIdSet.has(String(card.id))) return false;
        return true;
      });

      // If a pending local card shares local_temp_id with a backend card,
      // the pending card is the latest local draft — keep it and discard
      // the stale backend copy to prevent duplicate display and data loss.
      const pendingLocalTempIdSet = new Set(
        pendingCards.map((c) => trimValue(c && c.local_temp_id)).filter(Boolean)
      );
      const filteredNextCards = pendingLocalTempIdSet.size > 0
        ? nextCards.filter((card) => {
            if (card.local_temp_id && pendingLocalTempIdSet.has(String(card.local_temp_id))) {
              return false;
            }
            return true;
          })
        : nextCards;

      nextCards = dedupeCards([].concat(filteredNextCards, pendingCards));
    }

    if (scope !== getCardStorageScope()) {
      return getLocalCards();
    }

    saveLocalCards(nextCards, cardsStorageKey);

    // 只在成功后才推进游标。增量时后端已返回不回退的 sync_cursor；
    // 首次全量时从最新卡的 updated_at 推导游标（无卡则退回 server_time）。
    let nextCursor = result.syncCursor;
    if (!nextCursor && !canIncremental) {
      const newestUpdatedAt = result.cards.reduce((maxIso, backendCard) => {
        const iso = trimValue(backendCard && backendCard.updated_at);
        if (!iso) {
          return maxIso;
        }
        return (!maxIso || iso > maxIso) ? iso : maxIso;
      }, '');
      nextCursor = newestUpdatedAt || (result.serverTime || '');
    }
    if (nextCursor) {
      saveLastCardsSync(nextCursor, cursorStorageKey);
    }

    return nextCards.filter((card) => !card.deleted);
  })().finally(() => {
    if (backgroundBackendRefresh && backgroundBackendRefresh.promise === refreshPromise) {
      backgroundBackendRefresh = null;
    }
  });

  backgroundBackendRefresh = { scope: scope, promise: refreshPromise };
  return refreshPromise;
}

// ===== [CURRENT] 卡片 CRUD 主链路 =====

async function syncPendingCardsToBackend() {
  if (pendingSyncInProgress) {
    console.log('[phase6h-pending-sync] sync already in progress, skipping');
    return { synced: 0, failed: 0 };
  }

  pendingSyncInProgress = true;

  try {
    const cachedCards = getStoredCardsRaw();
    const pendingCards = cachedCards.filter(function (card) {
      if (!card) return false;
      if (card.backend_sync_status !== BACKEND_SYNC_STATUS_PENDING) return false;
      var content = trimValue(card.englishText || card.content || '');
      if (!content) return false;
      return true;
    });

    console.log('[phase6h-pending-sync] found pending cards count', pendingCards.length);

    if (pendingCards.length === 0) {
      return { synced: 0, failed: 0 };
    }

    var synced = 0;
    var failed = 0;

    for (var i = 0; i < pendingCards.length; i++) {
      var pendingCard = pendingCards[i];
      var content = trimValue(pendingCard.englishText || pendingCard.content || '');

      console.log('[phase6h-pending-sync] syncing card', pendingCard.backend_card_id ? 'update' : 'create', 'content', content.slice(0, 30));

      // Pending-update: card was already synced to backend but edit failed offline — PATCH directly
      if (pendingCard.backend_card_id) {
        try {
          var updatePayload = buildBackendCardPatchPayload(pendingCard, pendingCard);
          updatePayload.base_version = pendingCard.version;
          var updatedBackendCard = await updateBackendCard(pendingCard.backend_card_id, updatePayload);
          var updateFallbackFields = buildCardFields(pendingCard, {});
          var updatedLocalCard = normalizeBackendCardToLocal(updatedBackendCard, {
            ...pendingCard,
            ...updateFallbackFields
          });
          upsertCachedCard(updatedLocalCard);
          synced++;
          console.log('[phase6h-pending-sync] sync update success backend id', updatedBackendCard.id);
        } catch (updateError) {
          failed++;
          console.log('[phase6h-pending-sync] sync update failed', formatBackendSyncErrorText(updateError));
          var updateErrorCard = normalizeCard({
            ...pendingCard,
            backend_sync_error: formatBackendSyncErrorText(updateError),
            updatedAt: Date.now()
          });
          upsertCachedCard(updateErrorCard);
        }
        continue;
      }

      var localTempId = trimValue(pendingCard.local_temp_id || '') || createLocalTempId();

      try {
        var createPayload = buildBackendCardCreatePayload({
          category: pendingCard.category,
          examScene: pendingCard.examScene,
          examModule: pendingCard.examModule,
          englishText: pendingCard.englishText,
          myUnderstanding: pendingCard.myUnderstanding,
          notes: pendingCard.notes,
          whereEncountered: pendingCard.whereEncountered,
          translation: pendingCard.translation,
          analysisStatus: pendingCard.analysisStatus,
          analysisWarnings: pendingCard.analysisWarnings,
          analysisErrors: pendingCard.analysisErrors,
          understandingSource: pendingCard.understandingSource,
          local_temp_id: localTempId
        });

        var backendCard = await createBackendCard(createPayload);

        // If backend returned an existing card with stale content, PATCH with latest local data
        if (cardsNeedUpdate(backendCard, pendingCard, pendingCard)) {
          var patchPayload = buildBackendCardPatchPayload(pendingCard, pendingCard);

          try {
            patchPayload.base_version = backendCard.version;
            var patchedBackendCard = await updateBackendCard(backendCard.id, patchPayload);
            var localFallbackFields = {
              ...buildCardFields(pendingCard, {}),
              ...createInitialReviewFields(),
              ...createInitialSyncFields()
            };
            var localCard = normalizeBackendCardToLocal(patchedBackendCard, {
              ...pendingCard,
              ...localFallbackFields,
              local_temp_id: localTempId
            });
            upsertCachedCard(localCard);
            synced++;
            console.log('[phase6h-pending-sync] sync success (with patch) backend id', patchedBackendCard.id);
          } catch (patchError) {
            // POST succeeded but PATCH failed — keep pending, do NOT write backend_card_id
            failed++;
            console.log('[phase6h-pending-sync] sync failed (patch error)', formatBackendSyncErrorText(patchError));
            var patchErrorCard = normalizeCard({
              ...pendingCard,
              backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
              backend_card_id: '',
              backend_synced_at: '',
              backend_sync_error: formatBackendSyncErrorText(patchError),
              updatedAt: Date.now()
            });
            upsertCachedCard(patchErrorCard);
          }
        } else {
          // Backend card matches local — safe to mark synced
          var localFallbackFields = {
            ...buildCardFields(pendingCard, {}),
            ...createInitialReviewFields(),
            ...createInitialSyncFields()
          };
          var localCard = normalizeBackendCardToLocal(backendCard, {
            ...pendingCard,
            ...localFallbackFields,
            local_temp_id: localTempId
          });
          upsertCachedCard(localCard);
          synced++;
          console.log('[phase6h-pending-sync] sync success backend id', backendCard.id);
        }
      } catch (syncError) {
        failed++;
        console.log('[phase6h-pending-sync] sync failed', formatBackendSyncErrorText(syncError));

        // Update the pending card with the error but keep it pending
        var errorCard = normalizeCard({
          ...pendingCard,
          backend_sync_error: formatBackendSyncErrorText(syncError),
          updatedAt: Date.now()
        });
        upsertCachedCard(errorCard);
      }
    }

    console.log('[phase6h-pending-sync] sync complete synced', synced, 'failed', failed);
    return { synced: synced, failed: failed };
  } finally {
    pendingSyncInProgress = false;
  }
}

async function getCards() {
  const localCards = getLocalCards();
  saveLocalCards(getStoredCardsRaw());
  return localCards;
}

function getCardByIdFromCards(cardId, cards) {
  return (cards || []).find((card) => String(card.id) === String(cardId)) || null;
}

async function getCardById(cardId) {
  const localCard = getCardByIdFromCards(cardId, getLocalCards());

  if (localCard) {
    return localCard;
  }

  let cards = [];

  try {
    cards = await refreshCardsCacheFromBackend();
  } catch (error) {
    console.warn('[cards-cache] backend refresh failed while loading card detail', error);
    cards = await getCards();
  }

  return getCardByIdFromCards(cardId, cards);
}

async function addCard(form) {
  const payload = buildBackendCardCreatePayload(form);
  const localFallbackFields = {
    ...buildCardFields(form),
    ...createInitialReviewFields(),
    ...createInitialSyncFields(),
    ...createInitialBackendSyncFields(),
    local_temp_id: payload.local_temp_id
  };

  try {
    const backendCard = await createBackendCard(payload);
    const localCard = normalizeBackendCardToLocal(backendCard, localFallbackFields);
    return upsertCachedCard(localCard);
  } catch (backendError) {
    if (isBackendEnglishValidationError(backendError)) {
      throw backendError;
    }
    const localCard = normalizeCard({
      ...localFallbackFields,
      id: createCardId(),
      backend_card_id: '',
      backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
      backend_synced_at: '',
      backend_sync_error: formatBackendSyncErrorText(backendError),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    upsertCachedCard(localCard);
    return localCard;
  }
}

function backendEditFieldsMatchLocal(backendCard, localCard) {
  const latest = normalizeBackendCardToLocal(backendCard, localCard);
  const editableFields = [
    'englishText',
    'category',
    'myUnderstanding',
    'notes',
    'whereEncountered',
    'exampleSentence',
    'exampleTranslation',
    'participatesInReview',
    'addChannel',
    'publicMaterialItemId',
    'sourceWordbookId',
    'encounters',
    'translation'
  ];
  return editableFields.every((field) => JSON.stringify(latest[field]) === JSON.stringify(localCard[field]));
}

async function updateCard(cardId, form) {
  const currentCards = getStoredCardsRaw();
  const currentCard = getCardByIdFromCards(cardId, currentCards);

  if (!currentCard) {
    throw new Error('card_not_found');
  }

  // Pending local card with no backend id: two-phase sync (POST → compare → optionally PATCH)
  if (
    currentCard.backend_sync_status === BACKEND_SYNC_STATUS_PENDING &&
    !currentCard.backend_card_id
  ) {
    const createPayload = buildBackendCardCreatePayload({
      ...form,
      local_temp_id: currentCard.local_temp_id
    });
    const latestFormFields = buildCardFields(form, currentCard);

    try {
      const backendCard = await createBackendCard(createPayload);

      if (cardsNeedUpdate(backendCard, form, currentCard)) {
        // Backend returned an existing card with stale content — PATCH with latest form
        const patchPayload = buildBackendCardPatchPayload(form, currentCard);

        try {
          patchPayload.base_version = backendCard.version;
          const patchedBackendCard = await updateBackendCard(backendCard.id, patchPayload);
          const localCard = normalizeBackendCardToLocal(patchedBackendCard, {
            ...currentCard,
            ...latestFormFields
          });
          return upsertCachedCard(localCard);
        } catch (patchError) {
          // Atomicity: POST succeeded but PATCH failed — must NOT write backend_card_id
          const localCard = normalizeCard({
            ...currentCard,
            ...latestFormFields,
            backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
            backend_card_id: '',
            backend_synced_at: '',
            backend_sync_error: formatBackendSyncErrorText(patchError),
            updatedAt: Date.now()
          });
          upsertCachedCard(localCard);
          return localCard;
        }
      }

      // Backend card matches form — safe to mark synced
      const localCard = normalizeBackendCardToLocal(backendCard, {
        ...currentCard,
        ...latestFormFields
      });
      return upsertCachedCard(localCard);
    } catch (backendError) {
      if (isBackendEnglishValidationError(backendError)) {
        throw backendError;
      }
      // POST entirely failed — keep pending, preserve latest form
      const localCard = normalizeCard({
        ...currentCard,
        ...latestFormFields,
        backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
        backend_sync_error: formatBackendSyncErrorText(backendError),
        updatedAt: Date.now()
      });
      upsertCachedCard(localCard);
      return localCard;
    }
  }

  const payload = buildBackendCardPatchPayload(form, currentCard);
  try {
    payload.base_version = currentCard.version;
    const backendCard = await updateBackendCard(cardId, payload);
    const localCard = normalizeBackendCardToLocal(backendCard, currentCard);
    return upsertCachedCard(localCard);
  } catch (patchError) {
    const conflictDetail = patchError && patchError.data && patchError.data.detail;
    const serverCard = conflictDetail && conflictDetail.code === 'card_version_conflict'
      ? conflictDetail.server_card
      : null;
    let syncError = patchError;

    // A background analysis update can advance the backend version without
    // changing the fields the user edited. Refresh that safe version bump and
    // retry once; a real concurrent edit is surfaced instead of overwritten.
    if (
      Number(patchError && patchError.statusCode) === 409 &&
      serverCard &&
      backendEditFieldsMatchLocal(serverCard, currentCard)
    ) {
      const latestBackendCard = normalizeBackendCardToLocal(serverCard, currentCard);
      const retryPayload = buildBackendCardPatchPayload(form, latestBackendCard);
      retryPayload.base_version = latestBackendCard.version;
      try {
        const retriedBackendCard = await updateBackendCard(cardId, retryPayload);
        const latestFormFields = buildCardFields(form, currentCard);
        return upsertCachedCard(normalizeBackendCardToLocal(retriedBackendCard, {
          ...currentCard,
          ...latestFormFields
        }));
      } catch (retryError) {
        if (isBackendEnglishValidationError(retryError) || Number(retryError && retryError.statusCode) === 409) {
          throw retryError;
        }
        syncError = retryError;
      }
    } else if (Number(patchError && patchError.statusCode) === 409) {
      throw patchError;
    }

    if (isBackendEnglishValidationError(syncError)) {
      throw syncError;
    }
    // PATCH failed (offline) — preserve edits locally, mark pending so flush can retry
    const latestFormFields = buildCardFields(form, currentCard);
    const localCard = normalizeCard({
      ...currentCard,
      ...latestFormFields,
      backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
      backend_synced_at: '',
      backend_sync_error: formatBackendSyncErrorText(syncError),
      updatedAt: Date.now()
    });
    upsertCachedCard(localCard);
    return localCard;
  }
}

function updateBackendCardSyncState(cardId, updates = {}) {
  const normalizedCardId = normalizeCardId(cardId);

  if (!normalizedCardId) {
    return null;
  }

  const currentCards = getStoredCardsRaw();
  let updatedCard = null;
  const normalizedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'backend_card_id')) {
    normalizedUpdates.backend_card_id = trimValue(updates.backend_card_id || '');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'backend_sync_status')) {
    normalizedUpdates.backend_sync_status = normalizeBackendSyncStatus(updates.backend_sync_status);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'backend_synced_at')) {
    normalizedUpdates.backend_synced_at = toIsoString(updates.backend_synced_at);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'backend_sync_error')) {
    normalizedUpdates.backend_sync_error = trimValue(updates.backend_sync_error || '');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'version')) {
    normalizedUpdates.version = Math.max(Number(updates.version || 1), 1);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analysisStatus')) {
    normalizedUpdates.analysisStatus = normalizeAnalysisStatus(updates.analysisStatus);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analysisWarnings')) {
    normalizedUpdates.analysisWarnings = normalizeStringArray(updates.analysisWarnings);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analysisErrors')) {
    normalizedUpdates.analysisErrors = normalizeStringArray(updates.analysisErrors);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analysisSource')) {
    normalizedUpdates.analysisSource = trimValue(updates.analysisSource || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'understandingSource')) {
    normalizedUpdates.understandingSource = trimValue(updates.understandingSource || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analyzeCacheKey')) {
    normalizedUpdates.analyzeCacheKey = trimValue(updates.analyzeCacheKey || '');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'analyzedAt')) {
    normalizedUpdates.analyzedAt = toIsoString(updates.analyzedAt);
  }

  const nextCards = currentCards.map((card) => {
    if (String(card && card.id) !== normalizedCardId) {
      return card;
    }

    updatedCard = {
      ...normalizeCard(card),
      ...normalizedUpdates
    };

    return updatedCard;
  });

  if (!updatedCard) {
    return null;
  }

  saveLocalCards(nextCards);
  return updatedCard;
}

async function updateCardsMeta(cardIds, updates) {
  const idSet = new Set((cardIds || []).map((item) => String(item)));

  if (idSet.size === 0) {
    return;
  }

  const currentCards = getStoredCardsRaw();
  const timeInfo = createTimeInfo();
  const normalizedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'examScene')) {
    normalizedUpdates.examScene = trimValue(updates.examScene || DEFAULT_EXAM_SCENE);
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'examModule')) {
    normalizedUpdates.examModule = trimValue(updates.examModule || DEFAULT_EXAM_MODULE);
  }

  const backendPatch = {};

  if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'examScene')) {
    backendPatch.exam_scene = normalizedUpdates.examScene || null;
  }

  if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'examModule')) {
    backendPatch.exam_module = normalizedUpdates.examModule || null;
  }

  if (Object.keys(backendPatch).length > 0) {
    for (const cardId of idSet) {
      const currentCard = getCardByIdFromCards(cardId, currentCards);
      const backendCard = await updateBackendCard(cardId, backendPatch);
      upsertCachedCard(normalizeBackendCardToLocal(backendCard, currentCard || {}));
    }

    return;
  }

  const nextCards = currentCards.map((card) => {
    if (!idSet.has(String(card.id))) {
      return card;
    }

    return {
      ...card,
      ...normalizedUpdates,
      backend_sync_status: BACKEND_SYNC_STATUS_PENDING,
      syncError: '',
      deleted: false,
      date: timeInfo.date,
      time: timeInfo.time,
      dateTime: timeInfo.dateTime,
      updatedLabel: timeInfo.updatedLabel,
      updatedAt: timeInfo.timestamp
    };
  });

  saveLocalCards(nextCards);
}


/**
 * Clear session-related local caches so stale active sessions
 * referencing deleted cards are not reused.
 */
function invalidateSessionCachesAfterDelete() {
  var keysToRemove = [
    'reviewSessionProgressCache',
    'reviewOverviewCache'
  ];

  // Today's dated review caches
  var dateKey = getTodayDateKey(new Date());
  keysToRemove.push(TODAY_REVIEW_CACHE_PREFIX + '_' + dateKey);
  keysToRemove.push(TODAY_REVIEW_SUMMARY_PREFIX + '_' + dateKey);

  for (var i = 0; i < keysToRemove.length; i++) {
    try {
      wx.removeStorageSync(keysToRemove[i]);
    } catch (e) {
      // ignore
    }
  }
}

async function deleteCard(cardId) {
  const normalizedId = String(cardId || '').trim();

  if (!normalizedId) {
    return;
  }

  // Check local card to decide whether backend DELETE is needed
  var currentCards = getStoredCardsRaw();
  var card = getCardByIdFromCards(normalizedId, currentCards);

  // Pending local card with no backend_card_id: skip backend DELETE
  var isPendingLocal = card &&
    card.backend_sync_status === BACKEND_SYNC_STATUS_PENDING &&
    !card.backend_card_id;

  if (!isPendingLocal) {
    try {
      await deleteBackendCard(normalizedId, { baseVersion: card && card.version });
    } catch (error) {
      // 404: card already gone on backend — proceed with local removal
      if (!(error && error.statusCode === 404)) {
        throw error;
      }
    }
  }

  removeCachedCards([normalizedId]);
  invalidateSessionCachesAfterDelete();
}

async function deleteCards(cardIds) {
  const normalizedIds = Array.from(
    new Set((cardIds || []).map((item) => String(item)).filter(Boolean))
  );

  if (normalizedIds.length === 0) {
    return;
  }

  var currentCards = getStoredCardsRaw();
  var successIds = [];
  var failedIds = [];

  for (var i = 0; i < normalizedIds.length; i++) {
    var cardId = normalizedIds[i];
    try {
      var card = getCardByIdFromCards(cardId, currentCards);

      // Pending local card with no backend_card_id: skip backend DELETE
      var isPendingLocal = card &&
        card.backend_sync_status === BACKEND_SYNC_STATUS_PENDING &&
        !card.backend_card_id;

      if (!isPendingLocal) {
        try {
          await deleteBackendCard(cardId, { baseVersion: card && card.version });
        } catch (error) {
          // 404: card already gone on backend — proceed with local removal
          if (!(error && error.statusCode === 404)) {
            failedIds.push(cardId);
            continue;
          }
        }
      }

      successIds.push(cardId);
    } catch (e) {
      failedIds.push(cardId);
    }
  }

  // Remove successful ones from local cache
  if (successIds.length > 0) {
    removeCachedCards(successIds);
    invalidateSessionCachesAfterDelete();
  }

  return { successIds: successIds, failedIds: failedIds };
}

// ===== [LEGACY] 旧本地复习逻辑 — 已被 review.js 后端 submitReviewFeedback 替代，不再走通 =====
async function updateReviewResult(cardId, reviewState) {
  const currentCards = getStoredCardsRaw();
  const currentCard = getCardByIdFromCards(cardId, currentCards);

  if (!currentCard) {
    throw new Error('card_not_found');
  }

  const reviewedAt = new Date();
  const timeInfo = createTimeInfo(reviewedAt);
  const nextReviewCount = Math.max(Number(currentCard.reviewCount || 0), 0) + 1;
  const normalizedState = normalizeReviewState(reviewState);

  const currentMasteryLevel = normalizeMasteryLevel(currentCard.masteryLevel);
  const nextMasteryLevel = getNextMasteryLevel(currentMasteryLevel, normalizedState);

  const currentAgainCount = Math.max(Number(currentCard.againCount || 0), 0);
  const currentHardCount = Math.max(Number(currentCard.hardCount || 0), 0);
  const currentGoodCount = Math.max(Number(currentCard.goodCount || 0), 0);
  const currentEasyCount = Math.max(Number(currentCard.easyCount || 0), 0);
  const currentStreakGood = Math.max(Number(currentCard.streakGood || 0), 0);

  let nextStreakGood = currentStreakGood;

  if (normalizedState === '没记住' || normalizedState === '模糊') {
    nextStreakGood = 0;
  } else if (normalizedState === '记住了') {
    nextStreakGood = currentStreakGood + 1;
  } else if (normalizedState === '太简单') {
    nextStreakGood = currentStreakGood + 2;
  }

  const nextCard = {
    ...currentCard,
    reviewState: normalizedState,
    reviewCount: nextReviewCount,
    lastReviewedAt: reviewedAt.toISOString(),
    nextReviewAt: calcNextReviewAt(currentCard, normalizedState, reviewedAt),
    masteryLevel: nextMasteryLevel,
    againCount: currentAgainCount + (normalizedState === '没记住' ? 1 : 0),
    hardCount: currentHardCount + (normalizedState === '模糊' ? 1 : 0),
    goodCount: currentGoodCount + (normalizedState === '记住了' ? 1 : 0),
    easyCount: currentEasyCount + (normalizedState === '太简单' ? 1 : 0),
    streakGood: nextStreakGood,
    lastReviewResult: normalizedState === '未复习' ? '' : normalizedState,
    syncStatus: SYNC_STATUS_PENDING,
    syncError: '',
    deleted: false,
    date: timeInfo.date,
    time: timeInfo.time,
    dateTime: timeInfo.dateTime,
    updatedLabel: timeInfo.updatedLabel,
    updatedAt: timeInfo.timestamp
  };

  const locallySavedCards = currentCards.map((card) => (
    String(card.id) === String(cardId) ? nextCard : card
  ));
  saveLocalCards(locallySavedCards);
  appendReviewRecord(nextCard, normalizedState, reviewedAt);
  markCardReviewedToday(cardId, reviewedAt);
  markTodayReviewSummary(normalizedState, reviewedAt);

  return nextCard;
}

function isDueCard(card) {
  const nextReviewAt = trimValue(card && card.nextReviewAt);

  if (!nextReviewAt) {
    return true;
  }

  const time = new Date(nextReviewAt).getTime();
  if (Number.isNaN(time)) {
    return true;
  }

  return time <= Date.now();
}

function sortReviewCards(cards = []) {
  return (cards || []).slice().sort((left, right) => {
    const leftDue = isDueCard(left);
    const rightDue = isDueCard(right);

    if (leftDue !== rightDue) {
      return leftDue ? -1 : 1;
    }

    const leftNext = left.nextReviewAt ? new Date(left.nextReviewAt).getTime() : 0;
    const rightNext = right.nextReviewAt ? new Date(right.nextReviewAt).getTime() : 0;

    if (leftDue && rightDue && leftNext !== rightNext) {
      return leftNext - rightNext;
    }

    if (!leftDue && !rightDue && leftNext !== rightNext) {
      return leftNext - rightNext;
    }

    const leftTime = left.updatedAt || left.createdAt || 0;
    const rightTime = right.updatedAt || right.createdAt || 0;
    return rightTime - leftTime;
  });
}

function getDaysSinceLastReviewed(card) {
  const lastReviewedAt = trimValue(card && card.lastReviewedAt);

  if (!lastReviewedAt) {
    return 999;
  }

  const time = new Date(lastReviewedAt).getTime();
  if (Number.isNaN(time)) {
    return 999;
  }

  return Math.max((Date.now() - time) / (24 * 60 * 60 * 1000), 0);
}

function getExtraCardWeight(card, recentShownIdSet = new Set()) {
  const againCount = Math.max(Number(card && card.againCount || 0), 0);
  const hardCount = Math.max(Number(card && card.hardCount || 0), 0);
  const goodCount = Math.max(Number(card && card.goodCount || 0), 0);
  const reviewCount = Math.max(Number(card && card.reviewCount || 0), 0);
  const lastReviewResult = trimValue(card && card.lastReviewResult || '');
  const daysSinceLastReviewed = getDaysSinceLastReviewed(card);

  let score = 1;

  // 困难度：最核心
  score += againCount * 5;
  score += hardCount * 3;

  // 最近一次复习结果：近期不会的要更容易再出现
  if (lastReviewResult === '没记住') {
    score += 3;
  } else if (lastReviewResult === '模糊') {
    score += 1;
  }

  // 复习次数少的卡，略微加权
  if (reviewCount <= 2) {
    score += 2;
  } else if (reviewCount <= 5) {
    score += 1;
  }

  // 很久没看过的卡，略微加权
  if (daysSinceLastReviewed >= 14) {
    score += 2;
  } else if (daysSinceLastReviewed >= 5) {
    score += 1;
  }

  // 掌握得好的卡，略微降权
  score -= Math.min(goodCount, 3) * 0.5;
  score -= Math.min(Number(card && card.easyCount || 0), 3) * 0.8;

  // 刚出现过的卡，强烈降权，但不是彻底禁用
  if (recentShownIdSet.has(String(card.id))) {
    score = score * 0.15;
  }

  return Math.max(score, 0.1);
}

function pickWeightedCardsWithoutReplacement(cards = [], batchSize = REVIEW_BATCH_SIZE, recentShownIdSet = new Set()) {
  const pool = (cards || []).slice();
  const result = [];
  const maxCount = Math.min(batchSize, pool.length);

  while (result.length < maxCount && pool.length > 0) {
    const weights = pool.map((card) => getExtraCardWeight(card, recentShownIdSet));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let selectedIndex = 0;

    if (totalWeight <= 0) {
      selectedIndex = Math.floor(Math.random() * pool.length);
    } else {
      let randomValue = Math.random() * totalWeight;

      for (let i = 0; i < pool.length; i += 1) {
        randomValue -= weights[i];
        if (randomValue <= 0) {
          selectedIndex = i;
          break;
        }
      }
    }

    result.push(pool[selectedIndex]);
    pool.splice(selectedIndex, 1);
  }

  return result;
}

function buildTodayReviewTasksFromCards(cards = [], excludeCardIds = []) {
  const initialReviewState = '未复习';
  const excludeIdSet = new Set((excludeCardIds || []).map((id) => String(id)));

  // 1) 先取所有到期旧卡，按应复习优先顺序排
  const dueReviewedCards = sortReviewCards(
    (cards || [])
      .filter((card) => normalizeReviewState(card.reviewState) !== initialReviewState)
      .filter((card) => isDueCard(card))
  );

  // 2) 再取所有新卡，按创建时间从早到晚
  const unreviewedCards = (cards || [])
    .filter((card) => normalizeReviewState(card.reviewState) === initialReviewState)
    .sort((left, right) => {
      const leftTime = left.createdAt || left.updatedAt || 0;
      const rightTime = right.createdAt || right.updatedAt || 0;
      return leftTime - rightTime;
    });

  // 3) 今日任务候选池：到期旧卡优先，再补新卡
  const todayTasks = dueReviewedCards.concat(unreviewedCards);

  const dedupedTasks = [];
  const idSet = new Set();

  for (const card of todayTasks) {
    const id = String(card.id);
    if (idSet.has(id)) {
      continue;
    }
    idSet.add(id);
    dedupedTasks.push(card);
  }

  // 4) 排除已经发过的卡，再按每轮固定 5 张切片
  const remainingTasks = dedupedTasks.filter((card) => !excludeIdSet.has(String(card.id)));
  const finalTasks = remainingTasks.slice(0, REVIEW_BATCH_SIZE);

  return {
    totalCount: finalTasks.length,
    tasks: finalTasks,
    hasMore: remainingTasks.length > finalTasks.length
  };
}

function buildExtraReviewTasksFromCards(cards = [], excludeCardIds = [], recentShownIds = []) {
  const excludeIdSet = new Set((excludeCardIds || []).map((id) => String(id)));
  const recentShownIdSet = new Set((recentShownIds || []).map((id) => String(id)));
  const allCards = sortReviewCards(cards);

  // 当前 cycle 里还没出现过的卡
  const remainingTasks = allCards.filter((card) => !excludeIdSet.has(String(card.id)));

  let didResetCycle = false;
  let sourceTasks = remainingTasks;

  // 如果这一轮 cycle 用完了，就开启新 cycle
  if (sourceTasks.length === 0 && allCards.length > 0 && excludeIdSet.size > 0) {
    didResetCycle = true;

    // 新 cycle 开始时，优先避免刚刚那一批立刻重复
    const withoutRecentShown = allCards.filter((card) => !recentShownIdSet.has(String(card.id)));

    sourceTasks = withoutRecentShown.length > 0 ? withoutRecentShown : allCards;
  }

  const extraTasks = pickWeightedCardsWithoutReplacement(
    sourceTasks,
    REVIEW_BATCH_SIZE,
    recentShownIdSet
  );

  return {
    totalCount: extraTasks.length,
    tasks: extraTasks,
    hasMore: sourceTasks.length > extraTasks.length,
    didResetCycle
  };
}

async function getTodayReviewTasks(excludeCardIds = []) {
  const cards = await getCards();
  return buildTodayReviewTasksFromCards(cards, excludeCardIds);
}

async function getExtraReviewTasks(excludeCardIds = [], recentShownIds = []) {
  const cards = await getCards();
  return buildExtraReviewTasksFromCards(cards, excludeCardIds, recentShownIds);
}

async function getReviewCards() {
  const cards = await getCards();
  return sortReviewCards(cards);
}

// ===== module.exports — 任何函数实际移除前必须确认所有导入方已迁移 =====
module.exports = {
  STORAGE_KEY,
  DEFAULT_CATEGORY,
  DEFAULT_EXAM_SCENE,
  DEFAULT_EXAM_MODULE,
  REVIEW_STATES,
  REVIEW_RECORDS_STORAGE_KEY,
  createLocalTempId,
  createInitialReviewFields,
  createInitialSyncFields,
  getReviewStateLabel,
  calcNextReviewAt,
  isDueCard,
  getTodayDateKey,
  getTodayReviewedCardIds,
  saveTodayReviewedCardIds,
  markCardReviewedToday,
  getTodayReviewedCardsFromAll,
  getTodayReviewSummary,
  saveTodayReviewSummary,
  markTodayReviewSummary,
  getReviewRecords,
  saveReviewRecords,
  appendReviewRecord,
  getReviewRecordsByRange,
  getHistoryCardSummaries,
  filterHistoryCardSummariesByResult,
  getHistorySummaryStats,
  getCards,
  refreshCardsCacheFromBackend,
  saveCards: saveLocalCards,
  getCardById,
  syncPendingCardsToBackend,
  addCard,
  updateCard,
  updateBackendCardSyncState,
  updateCardsMeta,
  deleteCard,
  deleteCards,
  updateReviewResult,
  getTodayReviewTasks,
  getExtraReviewTasks,
  buildTodayReviewTasksFromCards,
  buildExtraReviewTasksFromCards,
  getReviewCards,
};
