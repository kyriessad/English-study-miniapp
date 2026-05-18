# Current Phase

## 当前阶段

Phase 6P-later 已完成：dailyGoal 真接入全系列收口（Phase 6P-later-4）。

最近完成：Phase 6P-later-4：今日复习情况页接入完整 goal_progress，
首页与今日复习情况页现在使用同一套 dailyGoal / goal_progress 语义（960a8a9）。

## 最新提交

- 960a8a9 connect today status goal progress
- ef05157 fix home blocked goal actions
- ddfdf05 connect home daily goal progress
- 9407549 fix home settings entry tap
- 67f10d6 update current phase after daily goal MVP

## Phase 6P-later 系列进度（已全部完成）

- Phase 6P-later-1：后端 overview.goal_progress 已完成（后端字段支持）
- Phase 6P-later-2：后端 review session 接 daily_goal 已完成
  - daily_suggested 按 remaining_to_goal 安排可贡献卡，传 daily_goal
  - new_only / free_review 不传 daily_goal
- Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）
  - 首页 GET /api/reviews/overview 传 daily_goal
  - 首页优先使用 goal_progress 显示今日完成 M / N
  - daily_suggested 创建 session 时传 daily_goal
- Phase 6P-later-3-hotfix：首页 empty / goal_blocked 状态文案和按钮语义修正（ef05157）
  - 0 张卡时不显示"当前可学内容已完成"，只显示首次引导文案
  - goal_blocked 时：左侧 25% "继续复习"（次），右侧 75% "添加卡片继续"（主）
- Phase 6P-later-4：今日复习情况页接入完整 goal_progress（960a8a9）
  - getReviewOverview 传 daily_goal，优先读 goal_progress
  - 新增 goal_blocked / overachieved 状态
  - _startReview 的 daily_suggested 传 daily_goal
  - onShow 检测 dailyGoal 变更时自动刷新

## 当前产品语义

- 首页和今日复习情况页分母始终是 dailyGoal，不改成可复习卡数量
- 今日完成数按当天 distinct card 统计，同一张卡当天重复复习不重复计数
- goal_blocked = 目标未完成，但没有更多今天未复习过、能增加今日完成数的卡
- 0 张卡时不显示"当前可学内容已完成"，只引导添加第一张卡或使用示例
- 目标完成 / 超额完成后，仍允许继续复习
- 历史复习内容页仍是 ReviewLog 快照，只读
- 今日复习内容页仍是今天复习过的当前卡片，可编辑，不可删除

## 每日目标设置

- 存储 key: `dailyGoal`（本地 wx.setStorageSync）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 今日复习情况页底部: 弱展示"每日目标 X 张 · 调整 ›"

## 下一步

- 先做 Phase 6P-later 回归走查 / 产品验收总结
- 或由产品经理 Claude Project 评估后续优先级后再进入下一阶段

## 注意

不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
