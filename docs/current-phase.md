# Current Phase

## 当前阶段

Phase 6P-4：今日复习情况页弱接入每日目标。

最近完成：Phase 6P-3：新建设置页骨架 + 每日目标本地设置（519361c）。

## 最新提交

- 519361c add daily goal settings page
- 224e702 refine home progress copy
- fad11ec polish home visual hierarchy
- 292a9b3 unify today pages visual style

## 当前首页统计语义

- 首页顶部展示"今日完成 M / N"
- 0 张卡时不显示进度卡片

## 每日目标设置

- 存储 key: `dailyGoal`（本地 wx.setStorageSync）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 今日复习情况页入口: 弱展示"每日目标 X 张 · 调整 ›"，点击跳转设置页
- 不改变首页进度或复习逻辑

## 已完成关键能力

- 设置页骨架 + 每日目标本地设置（Phase 6P-3）
- 今日复习情况页弱接入每日目标（Phase 6P-4）

## 下一步

Phase 6P-5：首页集成每日目标展示。或 Phase 6M：独立"今日复习内容"页。
