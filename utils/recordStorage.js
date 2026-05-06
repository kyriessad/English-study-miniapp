const STORAGE_KEY = 'englishKnowledgeCards';
const COLLECTION_NAME = 'englishKnowledgeCards';
const FETCH_LIMIT = 20;
const REVIEW_BATCH_SIZE = 5;

const SYNC_STATUS_SYNCED = 'synced';
const SYNC_STATUS_PENDING = 'pending';
const SYNC_STATUS_FAILED = 'failed';
const SYNC_STATUS_PENDING_DELETE = 'pending_delete';

const cloudSyncTasksByCardId = new Map();
let backgroundCloudRefreshPromise = null;
let backgroundFlushPromise = null;
let backgroundRetryTimer = null;

const BACKGROUND_RETRY_DELAY = 8000;

const DEFAULT_CATEGORY = '单词';
const DEFAULT_EXAM_SCENE = '未分类';
const DEFAULT_EXAM_MODULE = '未分类';

const REVIEW_STATES = ['未复习', '没记住', '模糊', '记住了', '太简单'];
const TODAY_REVIEW_CACHE_PREFIX = 'todayReviewedCardIds';
const TODAY_REVIEW_SUMMARY_PREFIX = 'todayReviewSummary';
const REVIEW_RECORDS_STORAGE_KEY = 'reviewRecords';

const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30, 60];
const MAX_MASTERY_LEVEL = REVIEW_INTERVAL_DAYS.length - 1;

async function cleanupDuplicateCardsInCloud() {
  const db = wx.cloud.database();
  const collection = db.collection(COLLECTION_NAME);
  const all = [];
  let skip = 0;
  const limit = 20;

  // 1. 拉全量
  while (true) {
    const res = await collection
      .skip(skip)
      .limit(limit)
      .get();

    const list = Array.isArray(res.data) ? res.data : [];
    all.push(...list);

    if (list.length < limit) {
      break;
    }

    skip += limit;
  }

  // 2. 按业务 id 分组
  const groupMap = {};
  all.forEach((item) => {
    const businessId = String((item && item.id) || '').trim();

    if (!businessId) {
      return;
    }

    if (!groupMap[businessId]) {
      groupMap[businessId] = [];
    }

    groupMap[businessId].push(item);
  });

  // 3. 找出重复组
  const duplicateGroups = [];
  for (const businessId in groupMap) {
    const group = groupMap[businessId];
    if (group && group.length > 1) {
      duplicateGroups.push({
        id: businessId,
        records: group
      });
    }
  }

  console.log('总记录数:', all.length);
  console.log('重复组数:', duplicateGroups.length);

  if (duplicateGroups.length === 0) {
    console.log('没有重复 id，无需清洗');
    return {
      total: all.length,
      duplicateGroupCount: 0,
      deletedCount: 0
    };
  }

  // 4. 每组保留最新一条，其余删除
  const deleteIds = [];

  duplicateGroups.forEach((groupItem) => {
    const records = groupItem.records.slice();

    records.sort((a, b) => {
      const aUpdated = Number(a.updatedAt || 0);
      const bUpdated = Number(b.updatedAt || 0);

      if (bUpdated !== aUpdated) {
        return bUpdated - aUpdated;
      }

      const aCreated = Number(a.createdAt || 0);
      const bCreated = Number(b.createdAt || 0);

      if (bCreated !== aCreated) {
        return bCreated - aCreated;
      }

      const aId = String(a._id || '');
      const bId = String(b._id || '');
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

    const keepRecord = records[0];
    const removeRecords = records.slice(1);

    console.log('保留记录:', {
      id: groupItem.id,
      keepId: keepRecord && keepRecord._id,
      removeCount: removeRecords.length
    });

    removeRecords.forEach((item) => {
      if (item && item._id) {
        deleteIds.push(item._id);
      }
    });
  });

  // 5. 真正删除
  let deletedCount = 0;

  for (const docId of deleteIds) {
    await collection.doc(docId).remove();
    deletedCount += 1;
  }

  console.log('清洗完成，删除重复记录数:', deletedCount);

  return {
    total: all.length,
    duplicateGroupCount: duplicateGroups.length,
    deletedCount
  };
}

async function checkDuplicateIds() {
  const db = wx.cloud.database();
  const all = [];
  let skip = 0;
  const limit = 20;

  while (true) {
    const res = await db.collection('englishKnowledgeCards')
      .skip(skip)
      .limit(limit)
      .get();

    const list = res.data || [];
    all.push(...list);

    if (list.length < limit) {
      break;
    }

    skip += limit;
  }

  const countMap = {};
  all.forEach((item) => {
    const id = String(item.id || '');
    countMap[id] = (countMap[id] || 0) + 1;
  });

  const duplicates = [];
  for (const id in countMap) {
    if (id && countMap[id] > 1) {
      duplicates.push({
        id,
        count: countMap[id]
      });
    }
  }

  console.log('总记录数:', all.length);
  console.log('重复 id:', duplicates);
}



function padNumber(value) {
  return String(value).padStart(2, '0');
}

function trimValue(value) {
  return String(value || '').trim();
}

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

    analysisStatus: normalizeAnalysisStatus(source.analysisStatus),
    analysisWarnings: normalizeStringArray(source.analysisWarnings),
    analysisErrors: normalizeStringArray(source.analysisErrors),
    analysisSource: trimValue(source.analysisSource || ''),
    understandingSource: trimValue(source.understandingSource || ''),
    analyzeCacheKey: trimValue(source.analyzeCacheKey || ''),
    analyzedAt: toIsoString(source.analyzedAt)
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

function getStoredCardsRaw() {
  const cards = wx.getStorageSync(STORAGE_KEY);

  if (!Array.isArray(cards)) {
    return [];
  }

  return dedupeCards(cards);
}

function getLocalCards(options = {}) {
  const { includeDeleted = false } = options;
  const cards = getStoredCardsRaw();

  if (includeDeleted) {
    return cards;
  }

  return cards.filter((card) => !card.deleted);
}

function mergeCards(localCards, cloudCards) {
  const localList = Array.isArray(localCards) ? localCards : [];
  const cloudList = Array.isArray(cloudCards) ? cloudCards : [];

  // 云端删除墓碑：另一台设备删除过的卡
  const cloudDeletedIdSet = new Set(
    cloudList
      .filter((card) => card && card.deleted)
      .map((card) => String(card.id))
      .filter(Boolean)
  );

  // 本机删除墓碑：本机刚删除但可能还没同步完成的卡
  const localDeletedIdSet = new Set(
    localList
      .filter((card) => card && card.deleted)
      .map((card) => String(card.id))
      .filter(Boolean)
  );

  // 云端仍然有效的卡：排除云端 deleted，也排除本机 deleted
  const activeCloudCards = cloudList.filter((card) => {
    const cardId = String(card && card.id || '');

    if (!cardId) {
      return false;
    }

    if (card.deleted) {
      return false;
    }

    if (localDeletedIdSet.has(cardId)) {
      return false;
    }

    return true;
  });

  const activeCloudIdSet = new Set(
    activeCloudCards
      .map((card) => String(card && card.id))
      .filter(Boolean)
  );

  const keptLocalCards = localList.filter((card) => {
    const cardId = String(card && card.id || '');

    if (!cardId) {
      return false;
    }

    // 关键：云端明确说这张卡已删除，则本地必须删除。
    // 即使本地是 pending / failed，也不能再保留，否则会跨设备复活。
    if (cloudDeletedIdSet.has(cardId)) {
      return false;
    }

    // 本机删除墓碑要保留，用来继续压住云端旧数据
    if (card.deleted) {
      return true;
    }

    // 本地未同步的新建/编辑，且云端没有删除墓碑，暂时保留
    if (isUnsyncedStatus(card.syncStatus)) {
      return true;
    }

    // 普通 synced 卡：云端还存在才保留
    return activeCloudIdSet.has(cardId);
  });

  return dedupeCards([].concat(activeCloudCards, keptLocalCards));
}


function saveLocalCards(cards) {
  wx.setStorageSync(STORAGE_KEY, dedupeCards(cards));
}





function canUseCloudDatabase() {
  return Boolean(wx.cloud && typeof wx.cloud.database === 'function');
}

function getCollection() {
  if (!canUseCloudDatabase()) {
    return null;
  }

  return wx.cloud.database().collection(COLLECTION_NAME);
}



async function fetchAllCloudCards() {
  const collection = getCollection();

  if (!collection) {
    throw new Error('cloud_database_unavailable');
  }

  const cards = [];
  let skip = 0;

  while (true) {
    const response = await collection
      .orderBy('updatedAt', 'desc')
      .skip(skip)
      .limit(FETCH_LIMIT)
      .get();

    const batch = Array.isArray(response.data) ? response.data : [];
    cards.push(...batch.map(normalizeCard));

    if (batch.length < FETCH_LIMIT) {
      break;
    }

    skip += FETCH_LIMIT;
  }

  return dedupeCards(cards);
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
    )
  };
}

function toCloudCardData(card) {
  const normalizedCard = normalizeCard(card);
  const cloudCard = { ...normalizedCard };

  delete cloudCard._id;
  delete cloudCard._openid;

  return cloudCard;
}

async function findCloudCardById(cardId) {
  const collection = getCollection();

  if (!collection) {
    return null;
  }

  const cards = [];
  let skip = 0;

  while (true) {
    const response = await collection.where({ id: String(cardId) }).skip(skip).limit(FETCH_LIMIT).get();
    const batch = Array.isArray(response.data) ? response.data : [];
    cards.push(...batch.map(normalizeCard));

    if (batch.length < FETCH_LIMIT) {
      break;
    }

    skip += FETCH_LIMIT;
  }

  return cards.reduce((bestCard, currentCard) => {
    return choosePreferredCard(bestCard, currentCard);
  }, null);
}

async function createCloudCard(card) {
  const collection = getCollection();

  if (!collection) {
    throw new Error('cloud_database_unavailable');
  }

  const response = await collection.add({
    data: toCloudCardData(card)
  });

  return {
    ...card,
    _id: response._id
  };
}

async function updateCloudCard(cardId, nextCard) {
  const collection = getCollection();

  if (!collection) {
    throw new Error('cloud_database_unavailable');
  }

  const existingCards = [];
  let skip = 0;

  while (true) {
    const response = await collection.where({ id: String(cardId) }).skip(skip).limit(FETCH_LIMIT).get();
    const batch = Array.isArray(response.data) ? response.data : [];
    existingCards.push(...batch.map(normalizeCard));

    if (batch.length < FETCH_LIMIT) {
      break;
    }

    skip += FETCH_LIMIT;
  }

  const existingCard = (nextCard && nextCard._id)
    ? existingCards.find((card) => card._id === nextCard._id)
    : existingCards.reduce((bestCard, currentCard) => choosePreferredCard(bestCard, currentCard), null);

  if (!existingCard || !existingCard._id) {
    throw new Error('cloud_card_not_found');
  }

  await collection.doc(existingCard._id).update({
    data: toCloudCardData(nextCard)
  });

  return {
    ...nextCard,
    _id: existingCard._id
  };
}

async function removeCloudCard(cardId) {
  const collection = getCollection();

  if (!collection) {
    throw new Error('cloud_database_unavailable');
  }

  const existingCards = [];
  let skip = 0;
  const deletedAt = Date.now();

  while (true) {
    const response = await collection
      .where({ id: String(cardId) })
      .skip(skip)
      .limit(FETCH_LIMIT)
      .get();

    const batch = Array.isArray(response.data) ? response.data : [];
    existingCards.push(...batch.map(normalizeCard));

    if (batch.length < FETCH_LIMIT) {
      break;
    }

    skip += FETCH_LIMIT;
  }

  if (existingCards.length === 0) {
    return;
  }

  for (const card of existingCards) {
    if (!card._id) {
      continue;
    }

    await collection.doc(card._id).update({
      data: {
        deleted: true,
        syncStatus: SYNC_STATUS_SYNCED,
        syncError: '',
        deletedAt,
        updatedAt: deletedAt
      }
    });
  }
}

async function performSyncCardToCloud(card) {
  const normalizedCard = normalizeCard(card);

  if (!canUseCloudDatabase()) {
    return {
      ...normalizedCard,
      syncStatus: normalizedCard.deleted ? SYNC_STATUS_PENDING_DELETE : SYNC_STATUS_FAILED,
      syncError: 'cloud_database_unavailable'
    };
  }

  try {
    if (normalizedCard.deleted) {
      await removeCloudCard(normalizedCard.id);
      return {
        ...normalizedCard,
        syncStatus: SYNC_STATUS_SYNCED,
        syncError: ''
      };
    }

    const existingCard = await findCloudCardById(normalizedCard.id);

    // 关键：如果云端已经有删除墓碑，本地旧卡不能重新上传复活
    if (existingCard && existingCard.deleted) {
      return {
        ...normalizedCard,
        deleted: true,
        syncStatus: SYNC_STATUS_SYNCED,
        syncError: ''
      };
    }

    let syncedCard = normalizedCard;

    if (existingCard && existingCard._id) {
      syncedCard = await updateCloudCard(normalizedCard.id, {
        ...normalizedCard,
        _id: existingCard._id
      });
    } else {
      syncedCard = await createCloudCard(normalizedCard);
    }

    return {
      ...syncedCard,
      syncStatus: SYNC_STATUS_SYNCED,
      syncError: ''
    };
  } catch (error) {
    return {
      ...normalizedCard,
      syncStatus: normalizedCard.deleted ? SYNC_STATUS_PENDING_DELETE : SYNC_STATUS_FAILED,
      syncError: String((error && error.message) || error || 'sync_failed')
    };
  }
}

function syncCardToCloud(card) {
  const cardId = String(card && card.id || '');

  if (!cardId) {
    return Promise.resolve(normalizeCard(card));
  }

  if (cloudSyncTasksByCardId.has(cardId)) {
    return cloudSyncTasksByCardId.get(cardId);
  }

  const syncPromise = performSyncCardToCloud(card)
    .finally(() => {
      cloudSyncTasksByCardId.delete(cardId);
    });

  cloudSyncTasksByCardId.set(cardId, syncPromise);
  return syncPromise;
}

function hasPendingCloudChanges(cards = []) {
  return (cards || []).some((card) => (
    card.syncStatus === SYNC_STATUS_PENDING ||
    card.syncStatus === SYNC_STATUS_FAILED ||
    card.syncStatus === SYNC_STATUS_PENDING_DELETE
  ));
}

function clearBackgroundRetryTimer() {
  if (backgroundRetryTimer) {
    clearTimeout(backgroundRetryTimer);
    backgroundRetryTimer = null;
  }
}

function scheduleBackgroundRetry(delay = BACKGROUND_RETRY_DELAY) {
  if (backgroundRetryTimer) {
    return;
  }

  backgroundRetryTimer = setTimeout(async () => {
    backgroundRetryTimer = null;

    try {
      const cards = await flushPendingCardsToCloud();

      if (hasPendingCloudChanges(cards)) {
        scheduleBackgroundRetry();
      }
    } catch (error) {
      scheduleBackgroundRetry();
    }
  }, delay);
}

async function flushPendingCardsToCloud() {
  if (!canUseCloudDatabase()) {
    return getStoredCardsRaw();
  }

  if (backgroundFlushPromise) {
    return backgroundFlushPromise;
  }

  backgroundFlushPromise = (async () => {
    const rawCards = getStoredCardsRaw();
    const pendingCards = rawCards.filter((card) => (
      card.syncStatus === SYNC_STATUS_PENDING ||
      card.syncStatus === SYNC_STATUS_FAILED ||
      card.syncStatus === SYNC_STATUS_PENDING_DELETE
    ));

    if (pendingCards.length === 0) {
      return rawCards;
    }

    const syncedResults = [];

    for (const card of pendingCards) {
      const syncedCard = await syncCardToCloud(card);
      syncedResults.push(syncedCard);
    }

    const syncedMap = new Map(syncedResults.map((card) => [String(card.id), card]));
const latestRawCards = getStoredCardsRaw();

const mergedRawCards = latestRawCards
  .map((card) => {
    const syncedCard = syncedMap.get(String(card.id));

    if (!syncedCard) {
      return card;
    }

    // 如果本地已经标记删除，但这次返回的是旧的非删除同步结果，不能覆盖本地删除状态
    if (
      card.syncStatus === SYNC_STATUS_PENDING_DELETE &&
      !syncedCard.deleted
    ) {
      return card;
    }

    const localUpdatedAt = Number(card.updatedAt || 0);
    const syncedUpdatedAt = Number(syncedCard.updatedAt || 0);

    const localReviewCount = Number(card.reviewCount || 0);
    const syncedReviewCount = Number(syncedCard.reviewCount || 0);

    const localLastReviewedAt = new Date(card.lastReviewedAt || 0).getTime() || 0;
    const syncedLastReviewedAt = new Date(syncedCard.lastReviewedAt || 0).getTime() || 0;

    const localHasNewerReview =
      localReviewCount > syncedReviewCount ||
      localLastReviewedAt > syncedLastReviewedAt;

    const localHasNewerEdit =
      localUpdatedAt > syncedUpdatedAt;

    // 关键修复：
    // 如果本地在同步过程中又发生了新的复习/编辑，不能用旧同步结果覆盖本地新数据
    if (
      isUnsyncedStatus(card.syncStatus) &&
      (localHasNewerEdit || localHasNewerReview)
    ) {
      return card;
    }

    return syncedCard;
  })
  .filter((card) => !(card.deleted && card.syncStatus === SYNC_STATUS_SYNCED));

saveLocalCards(mergedRawCards);

if (!hasPendingCloudChanges(mergedRawCards)) {
  clearBackgroundRetryTimer();
}

return mergedRawCards;
    })().finally(() => {
      backgroundFlushPromise = null;
    });

  return backgroundFlushPromise;
}

function scheduleBackgroundSync() {
  clearBackgroundRetryTimer();

  flushPendingCardsToCloud()
    .then((cards) => {
      if (hasPendingCloudChanges(cards)) {
        scheduleBackgroundRetry();
      }
    })
    .catch(() => {
      scheduleBackgroundRetry();
    });
}



async function syncLocalCacheWithCloud() {
  if (!canUseCloudDatabase()) {
    const localCards = getLocalCards();
    saveLocalCards(getStoredCardsRaw());
    return localCards;
  }

  if (backgroundCloudRefreshPromise) {
    return backgroundCloudRefreshPromise;
  }

  backgroundCloudRefreshPromise = (async () => {
    try {
      // 这里只拉云端，不要提前固定本地快照。
      // 因为拉云端期间，用户可能正在复习、删除或编辑卡片。
      const cloudCards = await fetchAllCloudCards();

      // 关键修复：云端拉完之后，重新读取“最新本地数据”。
      // 这样复习页刚写入的 reviewState / reviewCount / lastReviewResult 不会被旧快照覆盖。
      const latestLocalRawCards = getStoredCardsRaw();

      // deleted / pending_delete 是“删除墓碑”，必须参与合并，否则云端旧卡会被重新拉回来。
      // pending / failed 的本地改动也必须压住云端旧数据。
      const mergedCards = mergeCards(latestLocalRawCards, cloudCards);

      saveLocalCards(mergedCards);
      return mergedCards.filter((card) => !card.deleted);
    } catch (error) {
      console.error('syncLocalCacheWithCloud failed:', error);
      const localCards = getLocalCards();
      saveLocalCards(getStoredCardsRaw());
      return localCards;
    } finally {
      backgroundCloudRefreshPromise = null;
    }
  })();

  return backgroundCloudRefreshPromise;
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

  const cards = canUseCloudDatabase()
    ? await syncLocalCacheWithCloud()
    : await getCards();

  return getCardByIdFromCards(cardId, cards);
}

async function addCard(form) {
  const timeInfo = createTimeInfo();
  const fields = buildCardFields(form);
  const localTempId = trimValue(
    (form && form.local_temp_id) || (form && form.localTempId) || ''
  ) || createLocalTempId();

  const newCard = {
    id: createCardId(),
    local_temp_id: localTempId,
    ...fields,
    ...createInitialReviewFields(),
    ...createInitialSyncFields(),
    syncStatus: SYNC_STATUS_PENDING,
    syncError: '',
    deleted: false,
    date: timeInfo.date,
    time: timeInfo.time,
    dateTime: timeInfo.dateTime,
    updatedLabel: timeInfo.updatedLabel,
    createdAt: timeInfo.timestamp,
    updatedAt: timeInfo.timestamp
  };

  const nextCards = [newCard].concat(getStoredCardsRaw());
  saveLocalCards(nextCards);

  scheduleBackgroundSync();

  return newCard;
}

async function updateCard(cardId, form) {
  const currentCards = getStoredCardsRaw();
  const currentCard = getCardByIdFromCards(cardId, currentCards);

  if (!currentCard) {
    throw new Error('card_not_found');
  }

  const timeInfo = createTimeInfo();
  const nextCard = {
    ...currentCard,
    ...buildCardFields(form, currentCard),
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

  scheduleBackgroundSync();

  return nextCard;
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

  const nextCards = currentCards.map((card) => {
    if (!idSet.has(String(card.id))) {
      return card;
    }

    return {
      ...card,
      ...normalizedUpdates,
      syncStatus: SYNC_STATUS_PENDING,
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
  scheduleBackgroundSync();
}


async function syncDeleteCardsNow(cardIds = []) {
  const idSet = new Set((cardIds || []).map((item) => String(item)).filter(Boolean));

  if (idSet.size === 0) {
    return;
  }

  if (!canUseCloudDatabase()) {
    throw new Error('cloud_database_unavailable');
  }

  for (const cardId of idSet) {
    await removeCloudCard(cardId);
  }

  const latestCards = getStoredCardsRaw();

  const nextCards = latestCards.filter((card) => {
    return !idSet.has(String(card.id));
  });

  saveLocalCards(nextCards);

  return getLocalCards();
}


async function deleteCard(cardId) {
  const normalizedId = String(cardId || '').trim();

  if (!normalizedId) {
    return;
  }

  const currentCards = getStoredCardsRaw();

  const nextCards = currentCards.map((card) => {
    if (String(card.id) !== normalizedId) {
      return card;
    }

    return {
      ...card,
      deleted: true,
      syncStatus: SYNC_STATUS_PENDING_DELETE,
      syncError: ''
    };
  });

  saveLocalCards(nextCards);

  try {
    await syncDeleteCardsNow([normalizedId]);
  } catch (error) {
    scheduleBackgroundSync();
  }
}

async function deleteCards(cardIds) {
  const normalizedIds = Array.from(
    new Set((cardIds || []).map((item) => String(item)).filter(Boolean))
  );

  if (normalizedIds.length === 0) {
    return;
  }

  const idSet = new Set(normalizedIds);
  const currentCards = getStoredCardsRaw();

  const nextCards = currentCards.map((card) => {
    if (!idSet.has(String(card.id))) {
      return card;
    }

    return {
      ...card,
      deleted: true,
      syncStatus: SYNC_STATUS_PENDING_DELETE,
      syncError: ''
    };
  });

  saveLocalCards(nextCards);

  try {
    await syncDeleteCardsNow(normalizedIds);
  } catch (error) {
    scheduleBackgroundSync();
  }
}

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

  scheduleBackgroundSync();

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

module.exports = {
  STORAGE_KEY,
  COLLECTION_NAME,
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
  syncLocalCacheWithCloud,
  saveCards: saveLocalCards,
  getCardById,
  addCard,
  updateCard,
  updateCardsMeta,
  deleteCard,
  deleteCards,
  updateReviewResult,
  getTodayReviewTasks,
  getExtraReviewTasks,
  buildTodayReviewTasksFromCards,
  buildExtraReviewTasksFromCards,
  getReviewCards,
  checkDuplicateIds,
  cleanupDuplicateCardsInCloud,
};
