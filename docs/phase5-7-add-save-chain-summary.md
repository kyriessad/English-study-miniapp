# Phase 5-7 新增卡片保存链路总结

## 阶段背景

Phase 5-7 分两个子阶段完善了新增页面的保存流程：

1. **Phase 5-7A-1**（提交 `bb38f8d`）：解耦保存与英文分析。此前 `submitCard()` 需等待云函数 `analyzeEnglish` 返回才完成，保存操作耦合了外部服务。改动后 `saveCard()` 先完成（后端 + 本地缓存），`runBackgroundEnglishCheck()` 随后以 fire-and-forget 方式执行。

2. **Phase 5-7A-3**（提交 `190d16e`）：新增后端不可用时的本地降级保存。此前后端连接失败会导致数据完全丢失——卡片从未写入 `cardsCache`。

## 涉及提交

| 提交 | 说明 |
|------|------|
| `bb38f8d` | 解耦新增保存与英文分析 |
| `190d16e` | 新增卡片创建的离线降级保存 |

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

### 编辑路径——待同步卡片（手动同步）

```
submitCard()
  → saveCard()
    → updateCard(cardId, form)
      → currentCard.backend_sync_status === 'pending' && !currentCard.backend_card_id
      → buildBackendCardCreatePayload({...form, local_temp_id: currentCard.local_temp_id})
      → createBackendCard(payload)  [POST /api/cards，复用原始 local_temp_id 保证幂等]
      → normalizeBackendCardToLocal(backendCard, currentCard)
      → upsertCachedCard(localCard)
      → 返回卡片（backend_sync_status: 'synced'）
```

## 待同步卡片规则

1. **标识**：`backend_sync_status === 'pending'` 的卡片仅存在于本地存储，尚未在后端创建。
2. **首页展示**：显示"待同步"徽章（琥珀色：`#b47a25` 文字，`#fff8ea` 背景）。
3. **复习隔离**：待同步卡片天然被复习排除——复习页从 `GET /api/reviews/today`（后端）拉取卡片，待同步卡片从未到达后端。
4. **编辑即创建**：编辑待同步卡片时走 `POST /api/cards`（创建），而非 `PATCH /api/cards/:id`（更新）。原始 `local_temp_id` 被保留以确保幂等性。
5. **缓存刷新保留待同步**：`refreshCardsCacheFromBackend()` 将后端卡片与本地待同步卡片合并。仅当待同步卡片能通过 `id`、`backend_card_id` 或 `local_temp_id` 匹配到后端卡片时才会被移除。

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
- `local_temp_id` 字段为后端幂等性提供了基础，但后端对该字段的去重保证尚未确认。

### P2：后端 `local_temp_id` 幂等性未确认

客户端每次创建请求都携带 `local_temp_id`，并在重试时复用，但后端是否对该字段实施唯一性约束尚未验证。如果未实施，重试时可能创建重复卡片。

## 阶段结论

当前保存链路已覆盖在线和离线两种场景，不会丢失数据。待同步卡片对用户可见，在缓存刷新时被保留，可通过编辑手动同步。复习和历史正确隔离了待同步卡片。最终审查中未发现 P0 或 P1 级别问题。
