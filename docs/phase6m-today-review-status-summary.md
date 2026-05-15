# Phase 6M: 今日复习内容与今日复习情况页阶段总结

## 概述

Phase 6M 在现有复习体系（首页 overview / review session / ReviewLog 快照 / 历史回顾）之上，新增两层"今日"视角：

1. **今日复习情况页**（`today_review_status`）— 今日学习总览，回答"今天我还要复习多少"
2. **今日复习内容页**（`today_reviewed`）— 今天复习过的当前卡片列表，可编辑，不可删除

两层页面与历史复习页（ReviewLog 快照、只读）形成清晰的三种语义：

| 页面 | 数据源 | 可编辑 | 可删除 | 离线 |
|---|---|---|---|---|
| 今日复习情况页 | `/api/reviews/overview` (在线) / `reviewOverviewCache` (离线) | — | — | 可查看缓存，不可开始/继续复习 |
| 今日复习内容页 | `/api/reviews/today-reviewed` (在线) / `todayReviewedCache` (离线) | 可点击进入编辑 | 不提供删除入口 | 可查看缓存，不可重试 |
| 历史复习内容页 | ReviewLog.card_snapshot | 不可编辑 | 不可删除 | — |

---

## 1. 后端：今日复习内容接口

**提交**: [e12b188](https://github.com) `add today reviewed cards endpoint`

**新增接口**: `GET /api/reviews/today-reviewed`

**核心语义**:
- 返回今天在当前用户时区内复习过的、当前仍存活的卡片
- 同一卡片多次复习只返回一条，带回 `today_review_count`（今天该卡复习次数）
- 返回 `last_result`、`last_result_label`、`last_reviewed_at`（当天最新一次结果）
- 返回当前 Card 表字段（content、understanding、note、card_type 等），**不使用 ReviewLog.card_snapshot**
- 通过 `_active_card_filters(user_id)` 过滤已删除和非活跃卡片
- 通过 `_local_review_date` 和 `_history_date_bounds` 使用用户时区计算"今天"边界

**CTE 查询结构**:
```
today_logs (group by card_id, count today reviews)
  + latest_log (row_number=1 for latest result per card)
  + Card (inner join, with _active_card_filters)
```

**测试**: `TodayReviewedApiTest` (10 个测试方法)
- 鉴权检查、今日复习返回、去重、review_count、最新结果、当前 Card 内容、排除删除卡、排除非今日、排除其他用户、空结果

**后续 hotfix**: [6d2d1a1](https://github.com) `fix today reviewed tests time dependency`
- 根因：测试 `_now()` 使用硬编码 May 15，端点 `utc_now()` 使用真实时钟，跨天后测试数据被排除
- 修复：monkeypatch `app.routers.reviews.utc_now` 固定为 `2026-05-15T12:00:00Z`，`_now()` 同步返回该时间
- 后端全量测试：**131 passed**

---

## 2. 前端：今日复习内容页

**提交**: [9a71e69](https://github.com) `add today reviewed content page`

**新增页面**: `pages/today_reviewed/`

**功能**:
- `_fetch()` 调用 `getTodayReviewed()` 获取数据
- 成功：setData + 写入 `todayReviewedCache`
- 失败：读取缓存；有缓存则显示缓存 + offline banner，无缓存则显示空状态 + retry 按钮
- 缓存只在成功时写入，失败不覆盖
- `onCardTap` 导航到 `/pages/add/add?id=${cardId}&from=today_reviewed` 进行编辑
- 不提供删除入口（与历史页只读语义一致）
- 卡片类型映射：`word → 单词`、`phrase → 短语`、`sentence → 句子`
- 复习结果映射：`forgot → 想不起来`、`shaky → 不太稳`、`got_it → 基本掌握`、`fluent → 很熟了`

---

## 3. 前端：今日复习情况页

**提交**: [6e0c129](https://github.com) `add today review status page`

**新增页面**: `pages/today_review_status/`

**入口**: 首页"今日任务 / 今日已完成"统计卡片，增加箭头指示器，点击跳转

**数据源**:
- 在线：`GET /api/reviews/overview`（权威数据源）
- 离线：复用首页的 `reviewOverviewCache`，不新增缓存 key

**状态矩阵**:

| 状态 | 条件 | 图标 | 标题 | 副标题 | 主按钮 |
|---|---|---|---|---|---|
| 未开始 | completedToday == 0 | ● | 今日任务 N 张卡片 | 还未开始复习 | 开始复习（每日推荐） |
| 进行中 | completedToday > 0 && remaining > 0 | ● | 今日任务 N 张卡片 | 今日已完成 M 张，还有 R 张 | 继续复习（剩余 R 张） |
| 已完成 | completedToday >= totalToday && totalToday > 0 | ✦ | 今日任务 N 张卡片 | 今日复习了 N 张卡片 | 查看今日复习内容 |
| 离线缓存 | offline == true | ● | 今日任务 N 张卡片 | 按进度显式不同文案 | 按进度显式不同 label（离线时 disabled） |
| 加载失败 | loadFailed == true | — | — | 暂无内容 | 重试按钮 |

**降级链** (`_startReview`):
```
daily_suggested → new_only → free_review
```
- 任一成功 → 停止降级并导航到复习页
- 任一网络错误 → toast "当前无网络" 并停止（不继续降级）
- 全部返回空 → toast "暂无复习任务"

**离线约束**: 离线时不允许开始或继续复习（按钮 disabled），但可查看今日复习内容和历史复习内容

---

## 4. 复习完成态迁移

**提交**: [bfc3684](https://github.com) `redirect review completion to today status`

**变更**: `pages/review/review.js` `_handleForegroundSuccess` done:true 分支

**行为**:
- 复习完成（`response.done === true`）后 `wx.redirectTo` 到今日复习情况页
- 若 `redirectTo` 失败（极端情况），回退到原有 done-panel 展示
- `homeNeedsRefresh` 标记在每轮 feedback 成功时已设置（review.js L420），不重复设置
- review.wxml done-panel 保留不删除，仅作为兜底
- Feedback 提交、ReviewLog 生成、session completion、card_snapshot 逻辑均未修改

---

## 5. 今日复习内容页编辑返回精准刷新

**提交**: [826119e](https://github.com) `refresh today reviewed after edit`

**变更**: `pages/add/add.js` + `pages/today_reviewed/today_reviewed.js`

**刷新机制**:
1. `add.js` `saveCard`: 当 `isFromTodayReviewedPage(pageOptions)` 时，保存成功后设置 `wx.setStorageSync('todayReviewedNeedsRefresh', true)`，然后 `navigateBack`
2. `today_reviewed.js` `onShow`: 仅在非首次加载（`_initialLoadDone` 已设置）时，检查 `todayReviewedNeedsRefresh` flag；存在则删除 flag 并调用 `_fetch()` 刷新
3. `onLoad` 首次加载不做条件判断，直接 fetch
4. 缓存更新规则不变：请求成功才写缓存，失败不覆盖

**边界遵循**:
- 不改 `today_review_status`
- 不改 `review`
- 不改首页
- 不改后端
- 不处理 `applyEditedCardFromReview` 死代码（P2 tech debt）

---

## 6. 最终产品语义

### 三种页面的语义边界

**今日复习情况页** (`today_review_status`)
- 今日学习总览：今日任务数、已完成数、剩余数
- 入口：首页统计卡片点击
- 在线数据源：`/api/reviews/overview`
- 离线缓存：`reviewOverviewCache`（首页写入）
- 离线可查看缓存状态，不可开始或继续复习

**今日复习内容页** (`today_reviewed`)
- 今天复习过的当前卡片列表
- 数据源：`/api/reviews/today-reviewed`（返回当前 Card，非 snapshot）
- 可点击进入编辑页编辑当前卡片
- 不可删除
- 离线可查看缓存

**历史复习内容页** (`history_reviewed` / `history_detail`)
- 基于 ReviewLog.card_snapshot 的历史记录
- 只读，不可编辑，不可删除
- 不受今日页影响

### ReviewLog.card_snapshot 语义

- `card_snapshot` 在 `submit_review_feedback` Step 6 写入：读取 Card 当前状态 → 立即快照 → 然后才执行 feedback 规则变更 Card
- 快照代表**提交复习反馈那一刻**的卡片内容
- 复习中编辑卡片后再提交反馈 → 新反馈携带编辑后的快照
- 复习完成后在今日复习内容页编辑 → 只更新 Card 表，**不回写**已生成的 ReviewLog.card_snapshot

### 数据层次

```
Card (当前状态，可编辑)
  ├── GET /api/reviews/today-reviewed → 今日复习内容页（当前 Card）
  └── 不用于历史回顾

ReviewLog.card_snapshot (提交反馈时的快照，不可变)
  └── GET /api/reviews/history → 历史复习内容页（快照，只读）
```

---

## 7. 技术债（已记录，未处理）

| ID | 描述 | 位置 | 优先级 |
|---|---|---|---|
| TD-1 | done-panel 是否删除 | review.wxml | P3 — 保留为兜底，暂无计划删除 |
| TD-2 | `applyEditedCardFromReview` 旧设计死代码 | add.js L1508-1509 | P2 — 方法未定义，当前通过 `_returningFromEdit` flag 完成刷新 |
| TD-3 | `today_review_status._startReview` 与首页 `startReviewWithFallback` 降级链各自实现 | today_review_status.js / index.js | P3 — 后续可抽公共函数统一 |
| TD-4 | 离线编辑已存在卡片自动同步 | 全局 | P4 — 当前不做 |
| TD-5 | 历史页继续保持 ReviewLog 快照语义，不与今日页混用 | — | 永久边界 |

---

## 8. 验收结果

### 前端
- `git status --short`: clean
- `git diff --check`: clean
- JS syntax check: 5/5 文件通过
- `project.private.config.json` 未提交

### 后端
- `git status --short`: clean
- `git diff --check`: clean
- `python -m pytest tests/ -q`: **131 passed**
- `TodayReviewedApiTest`: 10/10 passed

### 边界合规
- 历史页（`pages/history_reviewed/*`、`pages/history_detail/*`）未修改
- `ReviewLog.card_snapshot` 逻辑未修改
- `/api/reviews/history` 未修改
- `/api/reviews/overview` 未修改
- `add.js` 仅新增 6M-3D 分支（`isFromTodayReviewedPage`），未改动其他逻辑
- `review.js` 仅新增 done:true redirect 分支，done-panel 兜底保留

### 提交记录

| 序号 | 提交 | 描述 | 仓库 |
|---|---|---|---|
| 1 | `e12b188` | add today reviewed cards endpoint | backend |
| 2 | `9a71e69` | add today reviewed content page | frontend |
| 3 | `6e0c129` | add today review status page | frontend |
| 4 | `bfc3684` | redirect review completion to today status | frontend |
| 5 | `826119e` | refresh today reviewed after edit | frontend |
| 6 | `6d2d1a1` | fix today reviewed tests time dependency | backend |

---

## 9. 下一步建议

Phase 6M 主线已闭环。建议下一阶段不再继续扩 Phase 6M，可进入：

- **Phase 6N-A**: 技术债小清理 — 只读审查 TD-1~TD-5，确定优先级和处理方案
- **Phase 6N-B**: 降级链统一 — 将首页 `startReviewWithFallback` 和状态页 `_startReview` 的降级逻辑抽为公共函数
- **Phase 6N-C**: done-panel 清理审查 — 评估是否可安全删除 done-panel，确认无回归

建议优先 Phase 6N-A（只读审查），确认技术债处理方案后再进入代码改动。
