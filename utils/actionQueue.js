/**
 * Phase 3 Action Queue — 保证 feedback 动作可靠送达。
 *
 * Storage Key: actionQueue
 *
 * 原则：
 * - 严格串行发送（禁止 Promise.all）
 * - 前一个 network / temporary_server 失败时停止 flush
 * - 前一个 business_terminal 失败时 drop 后继续
 * - 同一时间只允许一个 flush
 */
const STORAGE_KEY = 'actionQueue';

let localSequence = 0;
let isFlushing = false;

// ========== 内部工具 ==========

function _readQueue() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    console.warn('[actionQueue] Failed to read storage', error);
    return [];
  }
}

function _writeQueue(queue) {
  try {
    wx.setStorageSync(STORAGE_KEY, queue);
  } catch (error) {
    console.warn('[actionQueue] Failed to write storage', error);
  }
}

function _nowISO() {
  return new Date().toISOString();
}

// ========== 公共函数 ==========

/**
 * 将新 action 入队。
 * @param {'review_feedback'} actionType
 * @param {object} payload  — { session_id, session_item_id, card_id, result }
 * @param {object} options  — { maxRetryCount }
 * @returns {object} 创建的 action 对象
 */
function enqueueAction(actionType, payload, options = {}) {
  const queue = _readQueue();
  localSequence += 1;

  const action = {
    client_action_id: payload.client_action_id || '',
    action_type: actionType,
    status: 'pending',
    payload: {
      session_id: payload.session_id || '',
      session_item_id: payload.session_item_id || '',
      card_id: payload.card_id || '',
      result: payload.result || '',
    },
    created_at: payload.created_at || _nowISO(),
    updated_at: _nowISO(),
    local_sequence: localSequence,
    retry_count: 0,
    max_retry_count: options.maxRetryCount || 3,
    last_error: '',
    last_error_type: '',
    next_retry_at: null,
  };

  queue.push(action);
  _writeQueue(queue);
  return action;
}

/**
 * 取所有 pending 状态的 action。
 */
function getPendingActions() {
  return _readQueue().filter((a) => a.status === 'pending');
}

/**
 * 取当前可发送的 action（pending 且达到重试时间）。
 */
function getRunnableActions() {
  const now = _nowISO();
  return _readQueue().filter((a) => {
    if (a.status !== 'pending') return false;
    if (a.next_retry_at && a.next_retry_at > now) return false;
    return true;
  });
}

/**
 * markActionSyncing
 */
function markActionSyncing(clientActionId) {
  const queue = _readQueue();
  const target = queue.find((a) => a.client_action_id === clientActionId);
  if (target) {
    target.status = 'syncing';
    target.updated_at = _nowISO();
    _writeQueue(queue);
  }
}

/**
 * markActionSynced — 标记成功后直接返回（由调用方决定是否 remove）
 */
function markActionSynced(clientActionId) {
  const queue = _readQueue();
  const target = queue.find((a) => a.client_action_id === clientActionId);
  if (target) {
    target.status = 'synced';
    target.updated_at = _nowISO();
    target.retry_count = 0;
    target.last_error = '';
    target.last_error_type = '';
    _writeQueue(queue);
  }
}

/**
 * markActionFailed — 标记临时错误，设置下次重试时间
 */
function markActionFailed(clientActionId, error) {
  const queue = _readQueue();
  const target = queue.find((a) => a.client_action_id === clientActionId);
  if (target) {
    target.status = 'pending';
    target.retry_count = (target.retry_count || 0) + 1;
    target.last_error = (error && error.errMsg) || error ? String(error) : '';
    target.last_error_type = classifyActionError(error);
    // Exponential backoff: 2s, 4s, 8s...
    const backoffSeconds = Math.pow(2, target.retry_count) * 1000;
    target.next_retry_at = new Date(Date.now() + backoffSeconds).toISOString();
    target.updated_at = _nowISO();
    _writeQueue(queue);
  }
}

/**
 * markActionDropped — 业务终态，标记为 dropped
 */
function markActionDropped(clientActionId, error) {
  const queue = _readQueue();
  const target = queue.find((a) => a.client_action_id === clientActionId);
  if (target) {
    target.status = 'dropped';
    target.updated_at = _nowISO();
    target.last_error = (error && error.errMsg) || error ? String(error) : '';
    target.last_error_type = classifyActionError(error);
    _writeQueue(queue);
  }
}

/**
 * 从队列中移除 action（synced / dropped 后调用）
 */
function removeActionFromQueue(clientActionId) {
  const queue = _readQueue().filter((a) => a.client_action_id !== clientActionId);
  _writeQueue(queue);
}

/**
 * 错误分级。
 * @param {object} error — { statusCode, data, errMsg }
 * @returns {'network' | 'temporary_server' | 'auth' | 'business_terminal' | 'server_bug'}
 */
function classifyActionError(error) {
  if (!error) return 'network';

  const statusCode = error.statusCode || 0;

  // network / timeout
  if (statusCode === 0 || statusCode === -1) {
    return 'network';
  }

  // auth
  if (statusCode === 401) {
    return 'auth';
  }

  // business terminal (includes ignored responses with 200)
  if (statusCode === 400 || statusCode === 403 || statusCode === 409) {
    return 'business_terminal';
  }

  // temporary server errors
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return 'temporary_server';
  }

  // server bug
  if (statusCode >= 500) {
    return 'server_bug';
  }

  // 200 with ignored status
  if (statusCode === 200 && error.data && error.data.status === 'ignored') {
    return 'business_terminal';
  }

  return 'network';
}

/**
 * 排序函数：created_at ASC, local_sequence ASC
 */
function sortByCreatedAtAndLocalSequence(a, b) {
  const aTime = a.created_at || '';
  const bTime = b.created_at || '';
  if (aTime < bTime) return -1;
  if (aTime > bTime) return 1;
  return (a.local_sequence || 0) - (b.local_sequence || 0);
}

/**
 * 串行 flush action queue。
 * @param {object} options — { mode: 'foreground'|'background', sendAction, onSynced, onDropped, onFlushStop }
 */
async function flushActionQueue(options = {}) {
  if (isFlushing) return;

  isFlushing = true;

  try {
    const actions = getRunnableActions().sort(sortByCreatedAtAndLocalSequence);

    for (const action of actions) {
      try {
        markActionSyncing(action.client_action_id);

        const response = await options.sendAction(action);

        markActionSynced(action.client_action_id);
        removeActionFromQueue(action.client_action_id);

        if (typeof options.onSynced === 'function') {
          options.onSynced(action, response);
        }

        if (options.mode === 'foreground') {
          // foreground 回调由调用方决定是否应用 response
          if (typeof options.onForegroundResponse === 'function') {
            options.onForegroundResponse(action, response);
          }
        }
      } catch (err) {
        const errorType = classifyActionError(err);

        // network / temporary_server — 保留 action，停止 flush
        if (errorType === 'network' || errorType === 'temporary_server') {
          markActionFailed(action.client_action_id, err);
          if (typeof options.onFlushStop === 'function') {
            options.onFlushStop(action, err, errorType);
          }
          break;
        }

        // auth — 尝试 refresh，失败则停止
        if (errorType === 'auth') {
          markActionFailed(action.client_action_id, err);
          if (typeof options.onAuthError === 'function') {
            const refreshed = await options.onAuthError(action, err);
            if (!refreshed) {
              if (typeof options.onFlushStop === 'function') {
                options.onFlushStop(action, err, errorType);
              }
              break;
            }
          } else {
            break;
          }
        }

        // business_terminal — drop 当前 action，继续下一个
        if (errorType === 'business_terminal') {
          markActionDropped(action.client_action_id, err);
          removeActionFromQueue(action.client_action_id);
          if (typeof options.onDropped === 'function') {
            options.onDropped(action, err);
          }
          continue;
        }

        // server_bug — 少量重试
        if (errorType === 'server_bug') {
          if (action.retry_count < action.max_retry_count) {
            markActionFailed(action.client_action_id, err);
            if (typeof options.onFlushStop === 'function') {
              options.onFlushStop(action, err, errorType);
            }
            break;
          }

          markActionDropped(action.client_action_id, err);
          removeActionFromQueue(action.client_action_id);
          if (typeof options.onDropped === 'function') {
            options.onDropped(action, err);
          }
          continue;
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * 获取队列中所有 action 数量。
 */
function getActionCount() {
  return _readQueue().length;
}

/**
 * 获取 pending + syncing action 数量。
 */
function getPendingActionCount() {
  return _readQueue().filter((a) => a.status === 'pending' || a.status === 'syncing').length;
}

module.exports = {
  STORAGE_KEY,
  classifyActionError,
  enqueueAction,
  flushActionQueue,
  getActionCount,
  getPendingActionCount,
  getPendingActions,
  getRunnableActions,
  markActionDropped,
  markActionFailed,
  markActionSynced,
  markActionSyncing,
  removeActionFromQueue,
  sortByCreatedAtAndLocalSequence,
};
