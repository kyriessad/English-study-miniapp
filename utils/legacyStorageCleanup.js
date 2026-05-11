/**
 * Phase 4B-S Step 3B: 低风险旧 Storage Key 清理。
 *
 * 只清理以下已经静态盘点确认无读取/已废弃的 key：
 *   - todayReviewSummary_*     (前缀，动态日期后缀，纯死写无读取)
 *   - reviewPageSession_*      (前缀，代码中已不存在)
 *   - cardsFirstPageCache      (精确 key，生产代码无读写)
 *   - cardStatsCache           (精确 key，生产代码无读取)
 *   - englishCardInputContext_expired (精确 key，代码中已不存在)
 *
 * 通过 storageCleanupVersion 控制只执行一次。
 * 在 app.js onLaunch 中调用。
 */

const CLEANUP_VERSION_KEY = 'storageCleanupVersion';
const CURRENT_CLEANUP_VERSION = 1;

/** 精确匹配的 key 列表 */
const EXACT_KEYS_TO_REMOVE = [
  'cardsFirstPageCache',
  'cardStatsCache',
  'englishCardInputContext_expired',
];

/** 前缀匹配列表 */
const PREFIXES_TO_REMOVE = [
  'todayReviewSummary_',
  'reviewPageSession_',
];

/**
 * 执行一次旧 Storage key 清理。
 * 已被 storageCleanupVersion 标记过的版本不会重复执行。
 *
 * @returns {{ skipped: boolean, removed?: string[], notFound?: string[], reason?: string, error?: string }}
 */
function runLegacyStorageCleanup() {
  try {
    // 检查版本号，已清理过则跳过
    const version = wx.getStorageSync(CLEANUP_VERSION_KEY);
    if (version === CURRENT_CLEANUP_VERSION) {
      return { skipped: true, reason: 'already_cleaned' };
    }

    // 获取全部 Storage key 列表
    const info = wx.getStorageInfoSync();
    const allKeys = Array.isArray(info && info.keys) ? info.keys : [];

    const removed = [];
    const notFound = [];

    // 精确 key 匹配
    for (const exactKey of EXACT_KEYS_TO_REMOVE) {
      if (allKeys.includes(exactKey)) {
        wx.removeStorageSync(exactKey);
        removed.push(exactKey);
      } else {
        notFound.push(exactKey);
      }
    }

    // 前缀匹配
    for (const prefix of PREFIXES_TO_REMOVE) {
      const matchingKeys = allKeys.filter(function (k) { return k.startsWith(prefix); });

      if (matchingKeys.length === 0) {
        notFound.push(prefix + '*');
      } else {
        for (const key of matchingKeys) {
          wx.removeStorageSync(key);
          removed.push(key);
        }
      }
    }

    // 标记清理版本
    wx.setStorageSync(CLEANUP_VERSION_KEY, CURRENT_CLEANUP_VERSION);

    console.log('[legacyStorageCleanup] removed keys:', removed);
    if (notFound.length > 0) {
      console.log('[legacyStorageCleanup] keys not found (skipped):', notFound);
    }

    return { skipped: false, removed: removed, notFound: notFound };
  } catch (error) {
    console.warn('[legacyStorageCleanup] cleanup failed:', error);
    return { skipped: false, error: String(error) };
  }
}

module.exports = { runLegacyStorageCleanup };
