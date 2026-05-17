# Current Phase

## 当前阶段

Phase 6P-1：首页顶部统计语义改为"今日完成 M / N"。

最近完成：Phase 6R-4：视觉 polish 收口审查 + 阶段总结文档（e9698cb）。

## 最新提交

- 27ac935 fix home completed count display
- fad11ec polish home visual hierarchy
- 292a9b3 unify today pages visual style
- e9698cb document phase 6r visual polish summary

## 当前首页统计语义（Phase 6P-1 后）

- 首页顶部展示"今日完成 M / N"
- M = 今日任务中已完成反馈的有效唯一卡片数（completedToday）
- N = 今日建议任务的有效唯一卡片数（totalToday）
- 不统计已删除卡片
- 不受回炉 steps 影响
- 不被 is_all_done 覆盖为 0
- 0 张卡时不显示进度卡片

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

## 下一步

Phase 6M：独立"今日复习内容"页。

要求：

- 独立页面，不复用历史页
- 语义是今天复习过的当前卡片
- 可编辑
- 不可删除
- 编辑后返回刷新
- 复习完成页后续增加"查看今日复习内容"按钮
- 历史页仍基于 ReviewLog 快照，只读

## 注意

不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
