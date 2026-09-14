const STORAGE_KEY = 'englishCard.discoveryPrefill.v1';
const MAX_AGE_MS = 30 * 60 * 1000;

const CATEGORY_MAP = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
};

function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function saveDiscoveryPrefill(item, sourceLabel) {
  const source = item || {};
  const payload = {
    englishText: clean(source.content),
    myUnderstanding: clean(source.translation || source.chinese),
    category: CATEGORY_MAP[clean(source.cardType || source.card_type).toLowerCase()] || '句子',
    whereEncountered: clean(sourceLabel || source.sourceLabel || source.source_label),
    materialItemId: clean(source.id),
    createdAt: Date.now()
  };
  if (!payload.englishText) throw new Error('discovery_prefill_missing_english');
  wx.setStorageSync(STORAGE_KEY, payload);
  return payload;
}

function consumeDiscoveryPrefill() {
  let payload = null;
  try {
    payload = wx.getStorageSync(STORAGE_KEY) || null;
    wx.removeStorageSync(STORAGE_KEY);
  } catch (_) {
    return null;
  }
  if (!payload || !payload.createdAt || Date.now() - Number(payload.createdAt) > MAX_AGE_MS) return null;
  if (!clean(payload.englishText)) return null;
  return {
    englishText: clean(payload.englishText),
    myUnderstanding: clean(payload.myUnderstanding),
    category: CATEGORY_MAP[clean(payload.category).toLowerCase()] || clean(payload.category) || '句子',
    whereEncountered: clean(payload.whereEncountered),
    materialItemId: clean(payload.materialItemId)
  };
}

module.exports = { STORAGE_KEY, saveDiscoveryPrefill, consumeDiscoveryPrefill };
