/**
 * Phase 3 Session Progress Cache — 只缓存来自后端的 session 状态。
 *
 * Storage Key: reviewSessionProgressCache
 *
 * 允许更新 cache 的来源：
 * - foreground feedback 成功响应
 * - background flush 成功响应
 * - GET /api/reviews/today 返回的 session 状态
 * - summary API 返回结果
 *
 * 禁止更新 cache 的来源：
 * - 页面 currentIndex++
 * - 本地 batch 长度判断完成
 * - 前端自己生成 summary
 */
const STORAGE_KEY = 'reviewSessionProgressCache';

function _readCache() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return raw && typeof raw === 'object' ? raw : null;
  } catch (error) {
    console.warn('[sessionProgressCache] Failed to read storage', error);
    return null;
  }
}

function _writeCache(cache) {
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
  } catch (error) {
    console.warn('[sessionProgressCache] Failed to write storage', error);
  }
}

/**
 * 获取整个 cache 对象。
 * @returns {object|null}
 */
function getCache() {
  return _readCache();
}

/**
 * 获取 session_id 对应的 cache，或当前 active cache。
 * @param {string} [sessionId]
 * @returns {object|null}
 */
function getSessionCache(sessionId) {
  const cache = _readCache();
  if (!cache) return null;
  if (sessionId && cache.session_id !== sessionId) return null;
  return cache;
}

/**
 * 更新 cache。
 * @param {object} data — { session_id, status, reviewed_count, total_count, last_synced_at, summary, needs_recovery }
 */
function updateCache(data) {
  const existing = _readCache() || {};
  const now = new Date().toISOString();

  const updated = {
    session_id: data.session_id || existing.session_id || '',
    status: data.status || existing.status || 'active',
    reviewed_count: data.reviewed_count !== undefined ? data.reviewed_count : (existing.reviewed_count || 0),
    total_count: data.total_count !== undefined ? data.total_count : (existing.total_count || 0),
    pending_action_count: data.pending_action_count !== undefined ? data.pending_action_count : (existing.pending_action_count || 0),
    last_synced_at: now,
    needs_recovery: data.needs_recovery !== undefined ? data.needs_recovery : (existing.needs_recovery || false),
    summary: data.summary || existing.summary || null,
  };

  _writeCache(updated);
  return updated;
}

/**
 * 更新 cache 中的 pending_action_count。
 * @param {number} count
 */
function updatePendingActionCount(count) {
  const existing = _readCache();
  if (existing) {
    existing.pending_action_count = count;
    existing.last_synced_at = new Date().toISOString();
    _writeCache(existing);
  }
}

/**
 * 标记 needs_recovery。
 */
function markNeedsRecovery() {
  const existing = _readCache();
  if (existing) {
    existing.needs_recovery = true;
    existing.last_synced_at = new Date().toISOString();
    _writeCache(existing);
  }
}

/**
 * 根据后端 today 响应更新 cache。
 * @param {object} todayResponse — from GET /api/reviews/today
 */
function updateFromTodayResponse(todayResponse) {
  if (!todayResponse || !todayResponse.session_id) return null;

  return updateCache({
    session_id: todayResponse.session_id,
    status: 'active',
    reviewed_count: (todayResponse.progress && todayResponse.progress.reviewed) || 0,
    total_count: (todayResponse.progress && todayResponse.progress.total) || 0,
    pending_action_count: 0,
    needs_recovery: false,
    summary: null,
  });
}

/**
 * 根据 feedback 响应更新 cache。
 * @param {object} feedbackResponse — from POST /api/reviews/feedback
 */
function updateFromFeedbackResponse(feedbackResponse) {
  if (!feedbackResponse) return null;

  return updateCache({
    reviewed_count: (feedbackResponse.progress && feedbackResponse.progress.reviewed) || 0,
    total_count: (feedbackResponse.progress && feedbackResponse.progress.total) || 0,
    status: feedbackResponse.done === true ? 'completed' : 'active',
    summary: feedbackResponse.summary || null,
  });
}

/**
 * 根据 summary API 响应更新 cache。
 * @param {object} summaryResponse — from GET /api/reviews/sessions/{session_id}/summary
 */
function updateFromSummaryResponse(summaryResponse) {
  if (!summaryResponse) return null;

  return updateCache({
    session_id: summaryResponse.session_id,
    status: summaryResponse.status || 'completed',
    reviewed_count: (summaryResponse.progress && summaryResponse.progress.reviewed) || 0,
    total_count: (summaryResponse.progress && summaryResponse.progress.total) || 0,
    summary: summaryResponse.summary || null,
    pending_action_count: 0,
    needs_recovery: false,
  });
}

/**
 * 清空 cache。
 */
function clearCache() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    console.warn('[sessionProgressCache] Failed to clear storage', error);
  }
}

module.exports = {
  STORAGE_KEY,
  clearCache,
  getCache,
  getSessionCache,
  markNeedsRecovery,
  updateCache,
  updateFromFeedbackResponse,
  updateFromSummaryResponse,
  updateFromTodayResponse,
  updatePendingActionCount,
};
