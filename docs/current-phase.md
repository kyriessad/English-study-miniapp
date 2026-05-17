# Current Phase

## 当前阶段

Phase 6P-later-3 已完成：前端首页接入 goal_progress。

最近完成：Phase 6P-later-3：首页 GET /api/reviews/overview 接 goal_progress，优先展示后端目标进度（ddfdf05）。

## 最新提交

- ddfdf05 connect home daily goal progress
- 9407549 fix home settings entry tap
- 67f10d6 update current phase after daily goal MVP
- ab48574 document daily goal settings phase
- 465d7de show daily goal on today status

## Phase 6P-later 系列进度

- Phase 6P-later-1：后端 overview.goal_progress 已完成（后端字段支持）
- Phase 6P-later-2：后端 review session 接 daily_goal 已完成（daily_suggested 传 daily_goal，new_only/free_review 不传）
- Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）
  - 首页 GET /api/reviews/overview 已传 daily_goal
  - 首页优先使用 goal_progress 显示今日完成 M / N
  - daily_suggested 创建 session 时传 daily_goal
  - new_only / free_review 不传 daily_goal

## 当前首页统计语义

- 首页顶部展示"今日完成 M / N"
- 优先使用后端 goal_progress（M = completed，N = goal）
- fallback：M = 今日任务中已完成反馈的有效唯一卡片数，N = dailyGoal 本地设置
- 0 张卡时不显示进度卡片

## 每日目标设置

- 存储 key: `dailyGoal`（本地 wx.setStorageSync）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 今日复习情况页入口: 弱展示"每日目标 X 张 · 调整 ›"

## 下一步

- Phase 6P-later-4-readonly：今日复习情况页接入完整 goal_progress
- 或先做 Phase 6P-later-3 验收复查

## 注意

不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
