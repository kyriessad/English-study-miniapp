# Current Phase

## 当前阶段

Phase 6P-3：新建设置页骨架 + 每日目标本地设置。

最近完成：Phase 6P-1：首页顶部统计语义改为"今日完成 M / N"（224e702）。

## 最新提交

- 224e702 refine home progress copy
- fad11ec polish home visual hierarchy
- 292a9b3 unify today pages visual style
- e9698cb document phase 6r visual polish summary

## 当前首页统计语义

- 首页顶部展示"今日完成 M / N"
- M = 今日任务中已完成反馈的有效唯一卡片数（completedToday）
- N = 今日建议任务的有效唯一卡片数（totalToday）
- 0 张卡时不显示进度卡片

## 每日目标设置（Phase 6P-3）

- 存储 key: `dailyGoal`（本地 wx.setStorageSync）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 本阶段只保存值，不改变首页进度或复习逻辑

## 已完成关键能力

- 无理解卡可以进入复习
- pending 卡可在后端恢复后自动同步
- 复习完成页已恢复历史入口
- 首页主按钮已有 daily_suggested → new_only → free_review 降级链
- free_review 兜底可用
- 回炉卡动态进度可用
- 首页今日任务 / 今日已完成统计语义已修正
- 首页视觉层级 polish（Phase 6R-2）
- 今日复习情况页 / 今日复习内容页视觉统一（Phase 6R-3）
- 首页顶部统计从双列改为单一进度表达（Phase 6P-1）
- 设置页骨架 + 每日目标本地设置（Phase 6P-3）

## 下一步

Phase 6P-4：首页 / 今日复习情况页集成每日目标展示。或 Phase 6M：独立"今日复习内容"页。
