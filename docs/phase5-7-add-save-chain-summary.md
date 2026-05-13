# Phase 5-7 新增卡片保存链路总结

## 阶段背景

Phase 5-7 分三个子阶段完善了新增页面的保存流程：

1. **Phase 5-7A-1**（提交 `bb38f8d`）：解耦保存与英文分析。此前 `submitCard()` 需等待云函数 `analyzeEnglish` 返回才完成，保存操作耦合了外部服务。改动后 `saveCard()` 先完成（后端 + 本地缓存），`runBackgroundEnglishCheck()` 随后以 fire-and-forget 方式执行。

2. **Phase 5-7A-3**（提交 `190d16e`）：新增后端不可用时的本地降级保存。此前后端连接失败会导致数据完全丢失——卡片从未写入 `cardsCache`。

3. **Phase 5-7C**（提交 `45c5faf`）：修复 pending 卡手动同步的假失败覆盖风险。当弱网下首次 POST 实际已成功但前端误判为失败时，本地会保存为 pending。用户后续编辑并保存后，后端因 `local_temp_id` 幂等返回旧卡——如果不加对比直接覆盖本地，会造成用户最新修改丢失。

## 涉及提交

| 提交 | 说明 |
|------|------|
| `bb38f8d` | 解耦新增保存与英文分析 |
| `190d16e` | 新增卡片创建的离线降级保存 |
| `45c5faf` | 修复 pending 卡同步假失败覆盖风险 |

## 当前保存链路语义

### 正常路径（后端可用）

```
submitCard()
  → saveCard()
    → addCard(form)                    [utils/recordStorage.js]
      → buildBackendCardCreatePayload(form)
      → createBackendCard(payload)     [utils/apiClient.js → POST /api/cards]
      → normalizeBackendCardToLocal(backendCard, fallback)
      → upsertCachedCard(localCard)    [三重去重：id、backend_card_id、local_temp_id]
      → 返回卡片（backend_sync_status: 'synced'）
    → runBackgroundEnglishCheck(card)  [fire-and-forget]
```

### 降级路径（后端不可用）

```
submitCard()
  → saveCard()
    → addCard(form)
      → buildBackendCardCreatePayload(form)
      → createBackendCard(payload) → 抛出异常（网络/连接错误）
      → catch：构建本地卡片，backend_sync_status: 'pending'
      → upsertCachedCard(localCard)
      → 返回卡片（backend_sync_status: 'pending'）
    → runBackgroundEnglishCheck(card)  [待同步卡片仍会触发英文分析]
```

### 编辑路径——正常（已同步卡片）

```
submitCard()
  → saveCard()
    → updateCard(cardId, form)
      → currentCard.backend_sync_status !== 'pending' → 走正常路径
      → buildBackendCardPatchPayload(form, currentCard)
      → updateBackendCard(cardId, payload)  [PATCH /api/cards/:id]
      → normalizeBackendCardToLocal(backendCard, currentCard)
      → upsertCachedCard(localCard)
```

### 编辑路径——待同步卡片（两段式手动同步）

pending 卡编辑保存不是简单 POST，而是 create-if-not-exists-then-update-to-latest：

```
submitCard()
  → saveCard()
    → updateCard(cardId, form)
      → currentCard.backend_sync_status === 'pending' && !currentCard.backend_card_id
      →
      → [第一阶段：确保后端存在]
      → buildBackendCardCreatePayload({...form, local_temp_id: currentCard.local_temp_id})
      → createBackendCard(payload)  [POST /api/cards，复用原始 local_temp_id]
      →
      → [第二阶段：比对并补齐差异]
      → cardsNeedUpdate(backendCard, form, currentCard)?
      │
      ├── 一致 → normalizeBackendCardToLocal → synced ✓
      │
      └── 不一致（后端因幂等返回旧卡）
            → buildBackendCardPatchPayload(form, currentCard)
            → updateBackendCard(backendCard.id, patchPayload)
            │  [PATCH /api/cards/:id，写入最新 form]
            │
            ├── PATCH 成功 → normalizeBackendCardToLocal → synced ✓
            │
            └── PATCH 失败 → 保持 pending（原子性保护）
                  - backend_sync_status 仍为 'pending'
                  - backend_card_id 仍为空（不写入 POST 返回的真实 id）
                  - 保留 local_temp_id
                  - 用户最新 form 写入本地，不丢失
                  - 下次保存重新执行完整 POST → compare → PATCH 流程
```

### 字段比对（cardsNeedUpdate）

比对后端返回卡与当前 form 时使用安全归一化（null / undefined → ''），重点字段包括：

- content ↔ englishText
- understanding ↔ myUnderstanding
- note ↔ notes
- translation
- card_type（经 category 映射后比较）
- exam_scene ↔ examScene
- exam_module ↔ examModule

不比对 `analysis_status` / `analysis_level` / `analysis_messages`，保护 Phase 5-7A-1 的分析解耦。

原则：宁可偶尔多发一次 PATCH，绝不允许漏 PATCH 导致用户最新修改未写入后端。

## 待同步卡片规则

1. **标识**：`backend_sync_status === 'pending'` 的卡片仅存在于本地存储，尚未在后端创建。
2. **首页展示**：显示"待同步"徽章（琥珀色：`#b47a25` 文字，`#fff8ea` 背景）。
3. **复习隔离**：待同步卡片天然被复习排除——复习页从 `GET /api/reviews/today`（后端）拉取卡片，待同步卡片从未到达后端。
4. **编辑即创建并同步**：编辑待同步卡片时走两段式流程（POST → compare → 按需 PATCH）。原始 `local_temp_id` 被保留以确保幂等性。
5. **缓存刷新优先保留 pending**：`refreshCardsCacheFromBackend()` 合并后端与本地卡片时，若本地 pending 卡与后端卡 `local_temp_id` 相同，本地 pending 卡作为最新草稿优先保留，后端的旧版本被移出列表。这确保首页刷新不会静默丢失用户本地修改。

## 复习隔离

复习完全由后端驱动：
- `pages/review/review.js` 调用 `createReviewSession()` → `getTodayReview()`。
- 两个函数都查询后端（`POST /api/review-sessions`、`GET /api/reviews/today`）。
- 待同步卡片在后端没有对应数据，因此不可能出现在复习会话中。
- 客户端无需额外的过滤或守卫逻辑。

## 未实现项

以下项目按阶段约束明确排除在范围之外：

| 项目 | 原因 |
|------|------|
| 待同步卡片自动同步 | 约束：不做后台自动同步 |
| 卡片 CRUD 接入 actionQueue | 约束：actionQueue 仅用于 review_feedback |
| 待同步卡片进入复习 | 约束：不修改复习/历史表结构 |
| 待同步卡片进入历史 | 约束：历史仍由后端驱动 |
| 批量同步按钮 | 不在需求范围内 |

## 已知技术债

### P2：业务错误码被当作网络失败处理

当 `createBackendCard()` 收到 400、422 或其他业务层错误时，降级路径会像处理网络错误一样触发。卡片以 `backend_sync_status: 'pending'` 和 `backend_sync_error` 记录错误详情保存到本地。

**风险评估**：低。
- 401 错误在到达降级逻辑前，已由 `request()` 中的 token 刷新机制处理。
- `buildBackendCardCreatePayload()` 构建的合法载荷在正常操作中不太可能触发 400/422。
- 卡片不会丢失——始终保持"待同步"状态，可通过编辑重试。

### 已确认：后端 `local_temp_id` 幂等性

Phase 5-7B 审查确认后端已完整支持 `user_id + local_temp_id` 幂等创建：
- 数据库层有 `UNIQUE(user_id, local_temp_id)` 约束（初始 migration `a4f380f8e618`）。
- 应用层双重保护：插入前 SELECT 查询 + `IntegrityError` 捕获后再次查询并返回已有卡。
- `PATCH /api/cards/{id}` 的 `CardUpdate` schema 不包含 `local_temp_id`，不会误修改。
- 测试覆盖：`test_create_card_with_same_local_temp_id_returns_existing_card`。
- 结论：无需 hotfix，后端前端的 `local_temp_id` 幂等链路已闭环。

## 阶段结论

Add 保存链路当前具备以下能力：

- **正常保存**：后端可用时卡片正常创建/更新，写入 `cardsCache`。
- **分析解耦**：保存不阻塞于 `analyzeEnglish`，分析在后台 fire-and-forget 执行。
- **离线新增防丢**：后端不可用时新增卡片 fallback 到本地，标记 pending。
- **本地 pending 可见**：首页显示"待同步"琥珀色标签。
- **手动同步**：编辑 pending 卡保存时，先 POST 创建，再 compare，不一致则 PATCH。
- **后端幂等**：后端 `user_id + local_temp_id` 唯一约束确保重复 POST 不产生重复卡。
- **假失败覆盖保护**：后端因幂等返回旧卡时，前端自动检测差异并 PATCH 最新内容；PATCH 失败时保持 pending 原子性，不写入后端 id，不丢失用户最新 form。
- **缓存刷新保护**：`refreshCardsCacheFromBackend` 不会用后端旧卡覆盖同 `local_temp_id` 的本地 pending 新草稿。
- **复习隔离**：待同步卡片不进入复习和历史。

最终审查中未发现 P0 或 P1 级别问题。
