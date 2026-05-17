# Current Phase

## 当前阶段

Phase 6P 已收口：每日目标设置 MVP 完成。

最近完成：Phase 6P-5：每日目标设置收口审查 + 阶段总结文档（ab48574）。

## 最新提交

- ab48574 document daily goal settings phase
- 465d7de show daily goal on today status
- 519361c add daily goal settings page
- 224e702 refine home progress copy

## 当前首页统计语义

- 首页顶部展示"今日完成 M / N"
- M = 今日任务中已完成反馈的有效唯一卡片数（completedToday）
- N = 今日建议任务的有效唯一卡片数（totalToday）
- 0 张卡时不显示进度卡片

## 每日目标设置

- 存储 key: `dailyGoal`（本地 wx.setStorageSync）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 今日复习情况页入口: 弱展示"每日目标 X 张 · 调整 ›"
- 不改变首页进度或复习逻辑

## 已完成关键能力

- 设置页骨架 + 每日目标本地设置（Phase 6P-3）
- 今日复习情况页弱接入每日目标（Phase 6P-4）
- 每日目标设置阶段总结文档（Phase 6P-5）

## 下一步

- Phase 6Q-readonly：设置页后续能力审查
- 或 Phase 6P-later-readonly：dailyGoal 后端持久化 / 跨设备同步审查
- 或 Phase 6T-readonly：小程序主流程全量回归审查

## 注意

不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
