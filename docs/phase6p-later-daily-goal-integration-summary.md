# Phase 6P-later 阶段总结：dailyGoal 深度接入（已收口）

## 背景

Phase 6P 完成了 dailyGoal 本地设置（3 / 5 / 10 张可选，默认 5）。
Phase 6P-later 的目标是让 dailyGoal 真正影响首页目标进度显示和后端任务生成，
从"本地设置"升级为"端到端目标追踪"。

Phase 6P-later-4 完成后，首页与今日复习情况页已统一使用同一套 goal_progress 语义。

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

### Phase 6P-later-2：后端 review session 接 daily_goal 已完成

后端 POST /api/review-sessions 接受 `daily_goal` 参数：

- `daily_suggested` 类型：传 `daily_goal`，按 `remaining_to_goal` 安排可贡献卡
- `new_only` 类型：不传 `daily_goal`
- `free_review` 类型：不传 `daily_goal`

### Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）

- 首页 GET /api/reviews/overview 请求时携带 `daily_goal`
- 优先使用 `goal_progress` 展示今日完成 M / N（M = display_numerator，N = display_denominator）
- `daily_suggested` 创建 session 时传 `daily_goal`
- `new_only` / `free_review` 不传 `daily_goal`
- 无 `goal_progress` 时 fallback 到原有本地计算逻辑

### Phase 6P-later-3-hotfix：首页 empty / goal_blocked 状态按钮语义修正（ef05157）

修正两个 UX 问题：

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

## review session daily_goal 行为

| session_type | 前端是否传 daily_goal | 后端行为 |
|---|---|---|
| `daily_suggested` | 是 | 按 remaining_to_goal 安排卡，能增加今日完成数 |
| `new_only` | 否 | 只学新卡，不受 dailyGoal 控制 |
| `free_review` | 否 | 自由复习已有卡，不受 dailyGoal 控制 |

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

## empty / goal_blocked 特殊状态

### empty（0 张卡或无今日任务）
- 首页：不显示进度卡片和 main-actions，只显示 quick-start-section
- 标题副标题不出现"当前可学内容已完成"
- 今日复习情况页：state = 'empty'，主按钮"返回首页"

### goal_blocked（有卡但无更多可贡献卡，目标未满）
- 首页：右侧大按钮"添加卡片继续"（主），左侧小按钮"继续复习"（次）
- 今日复习情况页：主按钮"添加卡片"跳转 Add 页，次入口"继续复习已有卡片"调 `_startReview()`
- 不完全禁用继续复习，用户仍可看已有卡

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

## 不做项

- 不做后端持久化 dailyGoal（当前仍为本地 wx.setStorageSync）
- 不改今日复习内容页（today_reviewed）
- 不改历史页（history_reviewed / history_detail）
- 不做每日新卡上限、学习提醒、缓存自动清除
- 不做跨设备 dailyGoal 同步

## 后续建议

- 先做 Phase 6P-later 回归走查 / 产品验收总结
- 或由产品经理 Claude Project 评估后续优先级，再决定进入：
  - Phase 6Q：设置页后续能力（通知提醒、学习偏好等）
  - Phase 6T：小程序主流程全量回归审查
  - dailyGoal 后端持久化（跨设备同步）
