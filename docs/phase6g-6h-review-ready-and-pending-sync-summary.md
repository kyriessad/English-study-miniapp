# Phase 6G + 6H 阶段总结：无理解卡复习准入与 pending 卡自动同步

# Phase 6G + 6H Summary: Review Eligibility Without Understanding and Pending Card Auto Sync

---

## 中文部分

### 1. 阶段背景

**Phase 6G** 解决"没有填写'我的理解'的卡片不能进入复习"的问题。此前，后端 `is_review_ready` 要求卡片同时具备英文内容和理解/翻译才能进入复习 session，导致大量仅有英文内容的新卡被排除在复习之外。

**Phase 6H** 解决"后端恢复后 pending/local-only 本地卡不会自动同步"的问题。当用户在关闭后端时新增卡片，卡片会被标记为 `backend_sync_status: 'pending'` 保存在本地，但后端恢复后没有任何机制自动将这些 pending 卡推送到后端，导致它们永远无法进入复习。

### 2. Phase 6G 完成内容

- 无"我的理解"的卡片，只要英文内容非空，就允许进入复习
- 后端 `review-ready` 口径从 `content + understanding/translation` 改为 `content-only`
- 后端 session 选卡不再被旧 `is_review_ready=false` 字段污染
- 复习页无理解卡显示统一文案：**还没有写下你的理解，可以现在补充**
- 从复习页进入 Add 页补充"我的理解"后，返回复习页当前卡片会刷新
- 首页卡片也显示同一条温和空态文案
- 不再显示"待重试 / 需补充 / 分析失败 / 需处理"等技术状态

### 3. Phase 6G 后端改动

涉及后端仓库 `English-analyzer-backend`：

| 文件 | 改动说明 |
|---|---|
| `app/services/card_service.py` | `recompute_card_readiness` 改为 content-only；不再检查 understanding/translation |
| `app/routers/reviews.py` | review session 选卡直接以 content 非空为准 |
| `app/services/review_rules.py` | 移除对旧 `is_review_ready=false` 的依赖 |
| `tests/test_cards_api.py` | 适配新的 review-ready 口径 |
| `tests/test_reviews_phase2_api.py` | 新增 content-only 选卡测试用例 |

后端测试结果：**117 passed**。

后端提交：

```
c55050c allow content-only cards in review sessions
```

### 4. Phase 6G 前端改动

涉及前端仓库 `English-study-miniapp`：

| 文件 | 改动说明 |
|---|---|
| `pages/index/index.js` | `isNewCardReadyForNewOnly` 改为 content-only；pending/local-only 仍硬拦截；清理技术状态标签 |
| `pages/index/index.wxml` | 无理解卡显示温和空态文案 |
| `pages/index/index.wxss` | 新增空态文案样式 |
| `pages/review/review.js` | 无理解卡显示"还没有写下你的理解，可以现在补充"；修复从 Add 编辑返回后当前卡片不刷新 |
| `pages/review/review.wxml` | 适配无理解提示文案 |

前端提交：

```
4ac0dbe allow cards without understanding in review flow
```

### 5. Phase 6H 完成内容

涉及前端仓库 `English-study-miniapp`：

| 文件 | 改动说明 |
|---|---|
| `utils/recordStorage.js` | 新增 `syncPendingCardsToBackend()` 函数；模块级锁 `pendingSyncInProgress` |
| `utils/cardStorageFacade.js` | 导入并导出 `syncPendingCardsToBackend` |
| `pages/index/index.js` | `loadAllBackendData()` 和 `onPullDownRefresh()` 中触发 pending sync |

关键逻辑：

- 新增 `syncPendingCardsToBackend()` 函数
- 后端恢复后，首页加载 / 下拉刷新会自动尝试同步 pending 本地卡
- 同步时 `POST /api/cards` 携带 `local_temp_id` 实现幂等
- 如果后端返回已有卡但内容过期，追加 `PATCH /api/cards/:id` 更新
- PATCH 成功 → `backend_sync_status: 'synced'`，替换为后端真实 id
- PATCH 失败 → 保持 pending，不写 `backend_card_id`，下次重试
- 同步成功 → `backend_sync_status: 'synced'`，替换为后端真实 id
- 同步失败 → 保持 pending，不丢卡，更新 error 信息
- 同步全程使用模块级锁防并发
- pending/local-only 未同步前仍不能进入复习
- synced 后可以进入复习

前端提交：

```
b080906 auto sync pending cards when backend recovers
```

### 6. 最终产品口径

- **"我的理解"是学习辅助内容，不是复习准入门槛。** 用户可以先记单词、短语或句子，稍后再补充理解。
- **AI 分析 / 理解生成失败不应阻止保存和复习。** 卡片保存和复习入口不应依赖异步 AI 分析结果。
- **前端基础校验仍然负责拦截明显非法英文内容。** 空内容、纯空白等仍然被 `add.js` 的表单校验拦截。
- **pending/local-only 本地卡可以在首页显示，但同步成功前不能进入复习。** 这是安全边界：未同步的卡片不具备后端复习 session 所需的后端 id。
- **后端恢复后 pending 卡会自动同步，成功后进入正常复习体系。** 无需用户手动编辑触发同步。

### 7. 人工验收结果

已验收以下场景：

| 场景 | 结果 |
|---|---|
| 无理解卡 testC 可以进入复习页 | 通过 |
| `POST /api/review-sessions` 返回 `items_count > 0` | 通过 |
| 首页数字与后端 overview 一致 | 通过 |
| 复习页点击提示进入 Add，补充"我的理解"后返回会刷新 | 通过 |
| 关闭后端新增 local-card，pending 状态下不能进入复习 | 通过 |
| 后端恢复后 local-card 自动同步 | 通过 |
| 同步成功后可以进入复习 | 通过 |
| 多次刷新不重复创建 | 通过（`local_temp_id` 幂等） |
| 同步失败时本地卡不丢失 | 通过 |

### 8. 当前边界和后续建议

本阶段明确不改的内容：

- 不修改数据库 schema
- 不迁移历史数据
- 不修改 `actionQueue`（review feedback 同步队列）
- 不修改前端基础校验逻辑和文案
- 不修改复习反馈提交主流程
- 不修改首页视觉布局

后续建议：

- 清理 Phase 6G/6H 的临时调试日志（如 `console.log('[phase6h-pending-sync] ...')`），可在稳定运行一段时间后移除或降级为 debug 级别
- 可编写 Phase 6G/6H 专用自动化测试脚本（如模拟后端断连→恢复的端到端测试），但不是当前阶段的必须项
- 如果后续引入离线优先架构，pending sync 机制可直接复用

---

## English Part

### 1. Background

**Phase 6G** addressed the issue where cards without a user-written "My Understanding" field were blocked from entering review sessions. Previously, the backend's `is_review_ready` flag required both English content AND an understanding/translation, which excluded many content-only new cards from review.

**Phase 6H** addressed the issue where pending/local-only cards created while the backend was offline would never auto-sync after the backend recovered. These cards were saved locally with `backend_sync_status: 'pending'`, but no mechanism existed to push them to the backend once it became available again.

### 2. Phase 6G — What Was Done

- Cards with non-empty English content are now eligible for review, even without a "My Understanding" field
- Backend `review-ready` criteria changed from `content + understanding/translation` to `content-only`
- Backend session card selection no longer blocked by stale `is_review_ready=false` flags
- Review page shows a unified hint for cards without understanding: **You haven't written your understanding yet — you can add it now**
- Navigating from review to the Add page to fill in understanding, then returning, now refreshes the current card
- Home page library cards show the same gentle empty-state message
- Technical status labels (retry needed / manual fix required / analysis failed) no longer appear

### 3. Phase 6G — Backend Changes

Repository: `English-analyzer-backend`

| File | Change |
|---|---|
| `app/services/card_service.py` | `recompute_card_readiness` now uses content-only check |
| `app/routers/reviews.py` | Session card selection uses content non-empty only |
| `app/services/review_rules.py` | Removed dependency on legacy `is_review_ready=false` |
| `tests/test_cards_api.py` | Updated for new review-ready criteria |
| `tests/test_reviews_phase2_api.py` | Added content-only selection test cases |

All 117 tests passed.

Commit:

```
c55050c allow content-only cards in review sessions
```

### 4. Phase 6G — Frontend Changes

Repository: `English-study-miniapp`

| File | Change |
|---|---|
| `pages/index/index.js` | `isNewCardReadyForNewOnly` uses content-only check; pending/local-only still hard-blocked; removed technical status labels |
| `pages/index/index.wxml` | Gentle empty-state message for cards without understanding |
| `pages/index/index.wxss` | Styling for the empty-state text |
| `pages/review/review.js` | Shows "You haven't written your understanding yet — you can add it now"; fixed card refresh after returning from Add page edit |
| `pages/review/review.wxml` | Adapted hint text |

Commit:

```
4ac0dbe allow cards without understanding in review flow
```

### 5. Phase 6H — What Was Done

Repository: `English-study-miniapp`

| File | Change |
|---|---|
| `utils/recordStorage.js` | Added `syncPendingCardsToBackend()` with module-level concurrency lock |
| `utils/cardStorageFacade.js` | Re-exports the new sync function |
| `pages/index/index.js` | Triggers pending sync in `loadAllBackendData()` and `onPullDownRefresh()` |

Key behaviors:

- `syncPendingCardsToBackend()` finds all cards with `backend_sync_status === 'pending'` and non-empty content
- Each pending card is `POST`ed to `/api/cards` with its `local_temp_id` for idempotency
- If the backend returns an existing card with stale content, a `PATCH` is issued to update it
- PATCH success → `backend_sync_status: 'synced'`, local id replaced with backend id
- PATCH failure → stays pending, `backend_card_id` is NOT written (so next sync retries POST)
- POST failure → stays pending, error logged, card preserved
- Module-level lock (`pendingSyncInProgress`) prevents concurrent sync runs
- Pending cards remain blocked from review until synced
- Once synced, cards are fully eligible for review

Commit:

```
b080906 auto sync pending cards when backend recovers
```

### 6. Product Principles

- **"My Understanding" is a learning aid, not a review gate.** Users can memorize words, phrases, or sentences first and add understanding later.
- **AI analysis or understanding generation failures must not block saving or review.** Card lifecycle should not depend on async AI results.
- **Frontend validation still guards against obviously invalid English content.** Empty or whitespace-only content is still rejected at the Add page form level.
- **Pending/local-only cards are visible on the home page but cannot enter review until synced.** This is a safety boundary: unsynchronized cards lack the backend IDs required for review sessions.
- **Pending cards auto-sync when the backend recovers, then enter the normal review pipeline.** No manual user action (like editing the card) is needed.

### 7. Manual Verification

| Scenario | Result |
|---|---|
| Card without understanding (testC) enters review | Passed |
| `POST /api/review-sessions` returns `items_count > 0` | Passed |
| Home page counts match backend overview | Passed |
| Tapping hint in review navigates to Add; returning refreshes the card | Passed |
| Card created with backend offline stays pending and blocked from review | Passed |
| Pending card auto-syncs after backend recovery | Passed |
| Synced card becomes eligible for review | Passed |
| Repeated refreshes do not create duplicates | Passed (via `local_temp_id` idempotency) |
| Failed sync preserves local card data | Passed |

### 8. Boundaries and Future Work

Out of scope for this phase:

- No database schema changes
- No historical data migration
- No changes to `actionQueue` (review feedback sync)
- No changes to frontend validation logic or copy
- No changes to review feedback submission flow
- No changes to home page visual layout

Suggested follow-ups:

- Remove Phase 6G/6H debug logs (e.g., `console.log('[phase6h-pending-sync] ...')`) after a stable period, or downgrade to a debug level
- Write dedicated automated tests for the offline→recovery pending sync flow (end-to-end), though not required for the current phase
- The pending sync mechanism can be directly reused if an offline-first architecture is introduced later
