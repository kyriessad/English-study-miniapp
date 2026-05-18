# Phase 6P-later 阶段总结：dailyGoal 深度接入（已封板）

## 背景

Phase 6P 完成了 dailyGoal 本地设置（3 / 5 / 10 张可选，默认 5）。
Phase 6P-later 的目标是让 dailyGoal 真正影响首页目标进度显示和后端任务生成，
从"本地设置"升级为"端到端目标追踪"。

本阶段含主链路（Phase 6P-later-1 到 4）以及两个收尾 hotfix（onShow 刷新、fallback 链修复），现已封板。

---

## 最终产品语义

| 规则 | 说明 |
|------|------|
| 分母始终是 dailyGoal | 首页和今日复习情况页分母均为 dailyGoal 值，不改为可复习卡数 |
| 分子 = 今日唯一已完成数 | 同一张卡当天重复复习不重复计数 |
| 超额完成 | 分子显示 N / N（N = dailyGoal），文案另行说明真实完成 Y 张 |
| 目标未满但无更多可学 | 显示 Y / X（goal_blocked）并提示添加卡片继续 |
| dailyGoal 当天立即生效 | 分母实时读取，无需重启 |
| 目标完成后仍允许继续复习 | all_done / overachieved 状态下主按钮"继续复习"不禁用 |

---

## 各子阶段完成情况

### Phase 6P-later-1：后端 overview.goal_progress 已完成

后端 GET /api/reviews/overview 新增 `goal_progress` 字段，包含：

| 字段 | 含义 |
|------|------|
| `display_numerator` | 今日完成数（distinct card，当天重复复习不重复计数）|
| `display_denominator` | dailyGoal 值（分母始终是目标，不是可复习卡数）|
| `completed_unique_today` | 当天唯一已完成卡数（超额时与分子可能不同）|
| `is_goal_met` | 目标是否已达成 |
| `is_overachieved` | 是否超额完成 |
| `is_goal_blocked` | 目标未完成，但没有更多今天未复习过、能增加完成数的卡 |
| `has_any_reviewable_cards` | 是否还有任何可复习卡（供前端参考）|

**后端 daily_suggested 行为（goal_mode）：**
- 按 `remaining_to_goal`（= dailyGoal - 今日已完成 distinct 数）决定需补数量
- 今天已复习过的卡不用于补 dailyGoal，保持"unique card count"语义
- mastered / fluent-like 评级的已学卡可作为低优先级补位

### Phase 6P-later-2：后端 review session 接 daily_goal 已完成

后端 POST /api/review-sessions 接受 `daily_goal` 参数：

| session_type | 前端是否传 daily_goal | 后端行为 |
|---|---|---|
| `daily_suggested` | 是 | 按 remaining_to_goal 安排可贡献卡 |
| `new_only` | 否 | 只学新卡，不受 dailyGoal 控制 |
| `free_review` | 否 | 自由复习已有卡，不受 dailyGoal 控制 |

### Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）

- 首页 GET /api/reviews/overview 请求时携带 `daily_goal`
- 优先使用 `goal_progress` 展示今日完成 M / N（M = display_numerator，N = display_denominator）
- `daily_suggested` 创建 session 时传 `daily_goal`
- `new_only` / `free_review` 不传 `daily_goal`
- 无 `goal_progress` 时 fallback 到原有本地计算逻辑

### Phase 6P-later-3-hotfix：首页 empty / goal_blocked 状态按钮语义修正（ef05157）

**1. 0 张卡时不显示 blocked 文案**
当本地卡片数为 0 时，即使后端返回 `is_goal_blocked=true`，
也不显示"当前可学内容已完成，可以添加卡片继续"，改为显示"新的一天，开始学习吧"。

**2. goal_blocked 状态首页按钮主次修正**
`is_goal_blocked=true` 且目标未完成且卡片数 > 0 时：
- 左侧 25% 次按钮：文案"继续复习"，点击进入复习（原为主按钮）
- 右侧 75% 主按钮：文案"添加卡片继续"，点击跳转 Add 页（原为次按钮）
- 不完全删除"继续复习"，用户仍可继续看已有卡

### Phase 6P-later-4：今日复习情况页接入完整 goal_progress（960a8a9）

**JS 变更：**
- `_fetch()` 改为 `getReviewOverview({ daily_goal: readDailyGoal() })`
- `_applyOverview()` 优先读 `goal_progress`，无则 fallback 到 `suggested / completed_suggested`
- 新增 `goal_blocked` 状态（添加卡片为主按钮）
- 新增 `overachieved` 状态（独立于 all_done）
- `_startReview()` 的 `daily_suggested` 调用增加 `daily_goal: readDailyGoal()`
- `onShow()` 检测 dailyGoal 变更时自动重新 `_fetch()`
- 新增 `onSecondaryReviewTap()` handler（goal_blocked 状态次按钮"继续复习已有卡片"）

**WXML 变更：**
- `in_progress` 进度条和数字改用 `displayCompleted / displayTotal`，统计列改用 `displayTotal`
- 新增 `goal_blocked` block（位于 `in_progress` 和 `all_done` 之间）
- `all_done` 合并 `overachieved`（`wx:elif="{{state === 'all_done' || state === 'overachieved'}}"`）
- 标题改用 `{{stateLabel}}`，增加 `{{stateSub}}` 副标题行
- `offline_cached` 进度条改用 `displayCompleted / displayTotal`

### Phase 6P-later-4-hotfix：今日复习情况页返回后自动刷新（1783325）

**问题：**
`onShow()` 原本只在 dailyGoal 变化时调用 `_fetch()`。
用户从今日复习情况页进入复习、完成后返回，页面 M/N 不更新，与首页不一致。

**修复：**
`onShow()` 改为每次进入页面都调用 `_fetch()`（在未 loading 时），不再依赖 dailyGoal 是否变化。
dailyGoal 变化更新 `this.data.dailyGoal` 的逻辑保留，合并进统一刷新路径。

```js
onShow() {
  const newGoal = readDailyGoal();
  this.setData({ dailyGoal: newGoal });
  if (!this.data.loading) {
    this._fetch();
  }
},
```

### Phase 6P-later-P2-3-hotfix：today_review_status startReview fallback 链修复

**问题：**
原 `_startReview()` 的 `catch` 直接在 for 循环内部 `return`，虽然行为上与首页一致，
但没有结构化地区分"空响应"（继续 fallback）和"网络错误"（停止 fallback），
且网络错误文案与首页不一致。

**修复：**
- 新增 `_reviewStarting` 实例标志，防止用户快速多次点击并发发起多个 session
- 循环内用 `stepReason: 'empty' | 'network_error'` 明确区分两种失败原因
- `network_error` 时 `break`，`empty` 时继续下一 session 类型
- 网络错误文案对齐首页："当前网络不可用，请稍后再试"
- 全空文案改为带引导性："暂无可复习内容，可以添加卡片继续"

**离线态说明：**
后端完全不可达时，`_applyOverview()` 走缓存路径进入 `offline_cached` 状态，
主按钮 `mainButtonDisabled=true`，在 WXML 层即禁用按钮。
因此 `_startReview()` 的 network_error 分支仅在**联网但后端出错（如 500）**时触发，
纯离线场景由上层状态机拦截，不下穿到 fallback 链。

---

## 后端数据契约：goal_progress

```
GET /api/reviews/overview?daily_goal=N

Response (partial):
{
  "goal_progress": {
    "display_numerator": <今日已完成 distinct card 数>,
    "display_denominator": <dailyGoal（即 N）>,
    "completed_unique_today": <今日唯一已完成卡数>,
    "is_goal_met": <bool>,
    "is_overachieved": <bool>,
    "is_goal_blocked": <bool>,
    "has_any_reviewable_cards": <bool>
  }
}
```

goal_progress 缺失时，前端两个页面均 fallback 到 `suggested / completed_suggested` 路径，不崩溃。

---

## 首页展示与按钮规则

| 状态 | 左按钮（25%）| 右按钮（75%）|
|------|------------|------------|
| 0 张卡 | — | "添加第一张卡片"（单按钮）|
| goal_blocked | "继续复习"（次，白底绿字）| "添加卡片继续"（主，绿底）|
| 正常可复习 / 目标未完成 | "添加卡片"（次）| "继续/开始复习"（主）|
| 目标完成 / 超额完成 | "添加卡片"（次）| "继续复习"（主，不禁用）|

## 今日复习情况页展示规则

| state | stateLabel | stateSub | 主按钮 |
|-------|-----------|---------|--------|
| `not_started` | 今日完成 0 / N | 还没开始，今天先复习一点 | 开始复习 |
| `in_progress` | 今日完成 Y / N | 正在学习中，继续加油 | 继续复习 |
| `goal_blocked` | 今日完成 Y / N | 当前可学内容已完成，可以添加卡片继续 | 添加卡片 |
| `all_done` | 今日完成 N / N | 今日目标已完成 | 继续复习 |
| `overachieved` | 今日完成 N / N | 今天已完成 Y 张，超额完成 | 继续复习 |
| `offline_cached` | 今日目标：N 张 | 根据进度三分支 | 继续/开始复习（disabled）|
| `empty` | 今天还没有复习任务 | 可以返回首页添加卡片… | 返回首页 |

---

## 人工验收结果

| 验收项 | 结果 |
|--------|------|
| 首页和今日复习情况页显示同一 M/N | 通过 |
| dailyGoal=10 时分母是 10 | 通过 |
| 未开始显示"今日完成 0/N" | 通过 |
| 进行中显示"今日完成 Y/N" + 进度条 | 通过 |
| goal_blocked 主按钮"添加卡片" | 通过 |
| 目标完成"继续复习"仍可点 | 通过 |
| 超额完成显示实际张数 | 通过 |
| 后端关闭时 fallback 不崩 | 通过 |
| 旧缓存无 goal_progress 时不崩 | 通过 |
| dailyGoal 改变后今日复习情况页自动刷新 | 通过 |
| 复习完成返回今日复习情况页进度自动更新 | 通过（1783325 修复）|
| goal_blocked 点次按钮"继续复习"能进 free_review | 通过 |
| 离线状态主按钮禁用，不触发 session 创建 | 通过（offline_cached 上层拦截）|

---

## 不做项

- 不做离线复习（offline_cached 状态主按钮 disabled，不支持离线 session 创建）
- 不做 dailyGoal 云端持久化（当前仍为本地 wx.setStorageSync，不跨设备同步）
- 不做提醒 / 订阅消息
- 不做每日新卡上限
- 不改今日复习内容页（today_reviewed）
- 不改历史页（history_reviewed / history_detail）

---

## 下一步建议

Phase 6P-later 已封板。

下一阶段建议先做产品方向只读审查，而不是直接开发，
明确后续优先级后再进入：
- Phase 6Q：设置页后续能力（通知提醒、学习偏好等）
- Phase 6T：小程序主流程全量回归审查
- dailyGoal 后端持久化（跨设备同步）
