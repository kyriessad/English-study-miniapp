# Phase 5-8 总结：review_feedback 后台同步与 review session 修复

## 1. 阶段目标

本阶段不是新增功能，而是修复三个相互关联的问题：

1. **review_feedback 离线容灾**：首页后台同步 pending feedback，dropped 记录不静默丢失，zombie syncing 恢复。
2. **Add 新卡无法进入复习候选**：`analysis_status != "pending"` 过滤器错误阻塞了新卡。
3. **review session 409 blocker**：active session 字段读取出错 + session_type 丢失 + 首页多个复习入口语义不一致。

## 2. 后端提交

**仓库**: `English-analyzer-backend`  
**Commit**: `36a7691`  
**Message**: `allow pending analysis cards in review candidates`

**修改文件**:

| 文件 | 改动 |
|------|------|
| `app/routers/reviews.py` | `_review_ready_card_filters` 移除 `Card.analysis_status != "pending"` |
| `app/services/review_rules.py` | `select_review_cards` 候选查询移除 `Card.analysis_status != "pending"` |
| `tests/test_reviews_phase2_api.py` | 更新期望集合，加入 `"pending card"` |

**核心改动**:

`analysis_status` 不再参与 review 候选资格判定。`is_review_ready` 和 `needs_manual_fix` 两个字段已经完整表达了卡片是否可复习：

- 无内容 → `is_review_ready = False` → 排除
- 无 understanding 且无 translation → `is_review_ready = False` → 排除
- analysis failed 且无 user content → `needs_manual_fix = True` → 排除
- 有内容 + 有理解，analysis pending → 应允许复习（修复后生效）

**验收**:
- `python -m pytest -q` → 102 passed
- `git diff --check` → 仅 LF/CRLF warning

## 3. 前端提交

**仓库**: `English-study-miniapp`  
**Commit**: `3504f5f`  
**Message**: `add safe feedback sync and fix review session resume`

**修改文件**:

| 文件 | 改动 |
|------|------|
| `utils/actionQueue.js` | dropped 保留不物理删除；zombie syncing→pending 恢复；新增 `getDroppedActionCount` / `clearDroppedActions` |
| `pages/index/index.js` | 后台 flush + GET 并发锁 + 同步状态栏 + dropped 提示 + session 复用统一 + URL 带 session_type |
| `pages/index/index.wxml` | 新增 sync-status-bar（pending / syncing / dropped 三行） |
| `pages/index/index.wxss` | sync-status-bar 样式 |
| `pages/review/review.js` | `currentSessionType` 存储；所有 `getTodayReview` 路径带 session_type |

**核心改动 — actionQueue**:

- **dropped 保留**: `business_terminal` / `server_bug` max-retry 路径不再 `removeActionFromQueue`，只 `markActionDropped`（status='dropped' 保留在 storage）。
- **zombie syncing 恢复**: `getRunnableActions()` 中将所有 `status='syncing'` 恢复为 `'pending'`，防止 crash 残留导致队列死锁。
- **用户可清除**: `clearDroppedActions()` 只清除 `status='dropped'` 记录，`wx.showModal` 二次确认，文案诚实说明丢失后果。

**核心改动 — 首页同步**:

- **非阻塞后台 flush**: `_maybeStartBackgroundFlush()` 在 `onShow` 中无 `await` 调用。首页先用本地缓存渲染，flush 在后台串行发送。
- **GET 并发锁**: `_loadingHomeData` boolean lock，避免快速 onShow 触发多个 `loadAllBackendData`。
- **Promise 时序修复**: `flushActionQueue().then().catch().finally()`（Promise.prototype.finally），`syncingAction` 只在 Promise settled 后恢复 false。
- **Toast 诚实**: 只有 `pendingAfterFlush === 0` 时才提示"后台同步完成"，部分成功不误报。

**核心改动 — session 409 修复**:

- **字段匹配**: `activeSessionId = activeSession.id || activeSession.session_id || ''`
- **session_type 传递**: 首页 URL 带 `&session_type=`；review 页所有 `getTodayReview` 路径带 `currentSessionType`
- **入口统一**:
  - 同类型 active session → 直接 navigateTo 复用（无 POST）
  - 不同类型 active session → POST with `restart: true`
  - 无 active session → 正常创建
- **dashboard 三个按钮 + library "学习几张新卡" 共用同一套语义**

**验收**:
- `node --check pages/index/index.js` / `pages/review/review.js` / `utils/actionQueue.js` → OK
- `git diff --check` → 仅 LF/CRLF warning
- 微信开发者工具人工验收通过：顶部/底部入口行为一致；继续复习不复 POST；切换模式带 restart；新卡可进入 new_only

## 4. 最终数据语义

### 4.1 AI 分析状态 ≠ 复习资格

- `analysis_status`（pending / done / failed）**仅影响 UI 展示**（"AI分析中"/"分析完成"/"分析失败" badge）。
- **复习资格由以下字段决定**（后端 `_review_ready_card_filters`）：
  - `status = 'active'` 且 `deleted_at IS NULL`
  - `review_state IN ('new', 'reviewing', 'strengthening', 'mastered')`
  - `is_review_ready = True`（有 content 且有 understanding 或 translation）
  - `needs_manual_fix = False`（analysis failed 且无用户内容时才会为 True）

### 4.2 actionQueue 状态语义

| 状态 | 含义 |
|------|------|
| `pending` | 等待发送。如设置了 `next_retry_at` 则在 backoff 中 |
| `syncing` | 正在发送中。crash 残留会被 `getRunnableActions` 恢复为 `pending` |
| `synced` | 已成功送达后端。物理保留在 storage 直至调用方 `removeActionFromQueue` |
| `dropped` | 业务终态失败（400/403/409），不再自动重试。**物理保留**，用户可手动清除 |

- `getPendingActionCount()` = pending + syncing
- `getDroppedActionCount()` = dropped
- `clearDroppedActions()` 只清除 dropped，不影响 pending/syncing

### 4.3 active session 复用规则

| 场景 | 行为 |
|------|------|
| 点击入口类型 = 当前 activeSessionType | 直接 navigateTo 复用，零 POST |
| 点击入口类型 ≠ 当前 activeSessionType | POST with `restart: true`，旧 session 被 abandon |
| 无 active session | 正常 POST 创建，无 restart |

所有复习入口（dashboard / library）遵循同一规则。

## 5. 已解决的问题

| # | 问题 | 修复 |
|---|------|------|
| 1 | analyzeEnglish timeout 导致新卡无法进入复习 | 后端移除 `analysis_status != "pending"` 过滤器 |
| 2 | review_feedback pending 无首页后台同步 | `_maybeStartBackgroundFlush()` 非阻塞串行 flush |
| 3 | dropped action 静默蒸发 | 保留在 storage，用户二次确认清除 |
| 4 | zombie syncing 导致队列永久死锁 | `getRunnableActions` 恢复 syncing→pending |
| 5 | syncingAction Promise 时序错误 | `.finally()` 挂在 Promise chain 上 |
| 6 | Toast 部分成功误报完成 | 仅在 pendingAfterFlush===0 时提示 |
| 7 | activeSessionId 字段不匹配 | 兼容 `id \|\| session_id` |
| 8 | new_only / daily_suggested session_type 冲突 409 | session_type 全程传递；同类型复用，不同类型 restart |
| 9 | 首页多个复习入口逻辑不一致 | dashboard + library 统一到同一套 restart/复用规则 |
| 10 | GET 并发请求重复触发 | `_loadingHomeData` boolean lock |

## 6. 暂不处理 / 技术债

| 事项 | 说明 |
|------|------|
| Add 分析链路仍依赖旧云函数 | `analyzeEnglish` 云函数可能 timeout，后续应迁移到 Python 后端统一分析 |
| actionQueue Auth / 409 分类 | 当前分类为 Phase 5-8C 或 Phase 6 审查范围，401→refresh→replay 已在 apiClient 处理 |
| 切换复习模式二次确认 | 当前直接 abandon 旧 session 创建新 session，未弹窗确认 |
| Add pending card 与 review_feedback 离线语义未统一 | 两端离线策略独立设计，Phase 6A 应做整体审计 |
| 历史页数据断档 | reviewRecords 仅旧本地逻辑写入，新复习链走后端，历史页兼容层未同步 |

## 7. 下一步建议

进入 **Phase 6A：架构收口只读审计**。重点审计：

- Card 状态机（review_state / analysis_status / is_review_ready / needs_manual_fix 的转换规则）
- ReviewSession 状态机（active / completed / abandoned 的生命周期）
- ReviewSessionItem 状态机（pending / reviewed / done / skipped）
- actionQueue 状态机（pending / syncing / synced / dropped + zombie recovery）
- 首页入口与 session_type / restart 语义（入口矩阵）
- Add 分析链路与复习候选语义（分析降级、离线保存、同步时机）
