# Current Phase

## 当前阶段

Phase 7F 已完成：whereEncountered 列表展示与卡片摘要结构统一。三页（首页、历史复习列表、今日复习内容页）底部 meta 行右侧均以弱绿色 source pill 展示"来自：xxx"，标签位置统一，卡片摘要不默认展示备注。

## 最新提交

前端（English-study-miniapp）：
- `d4194bd` simplify card summaries in list pages
- `1600c85` align today reviewed card tags
- `f39545a` show where encountered in history list
- `c6531fb` show where encountered on home cards
- `d9d60c8` show where encountered in history detail
- `67ecd82` show where encountered in today reviewed

后端（English-analyzer-backend）：
- `55829f1` include where encountered in review items
- `e43eaab` add where encountered field to cards

## Phase 7F 系列进度（已全部完成）

- **7F-1**（首页 source pill）：`decorateCards()` 提取 whereEncountered，卡片底部 meta 行右侧新增"来自：xxx"source pill，长文本单行省略。
- **7F-2**（历史列表 source pill）：`mapBackendHistoryItem()` 映射 whereEncountered，`searchHistoryCards()` 搜索纳入 whereEncountered，底部 meta 行右侧新增 source pill。
- **7F-3**（今日复习标签统一）：结果标签从底部移到右上角，左上保留类型 tag，source 补单行省略。
- **7F-4-hotfix**（摘要结构收紧）：首页和今日复习卡片默认不展示备注，今日复习 source 从中间行移到底部 meta 行右侧 pill。

详细总结见 docs/phase7f-where-encountered-list-display-summary.md。

## Phase 7E 系列进度（已全部完成）

- **7E-1**（后端 snapshot + history API）：`_build_card_snapshot()` 写入 where_encountered，history list/detail 返回 where_encountered，list search 支持 where_encountered。
- **7E-2**（前端历史详情）：`normalizeHistoryDetail()` 映射 whereEncountered，历史详情页在"我的理解"与"补充备注"之间展示"来自：xxx"。

## Phase 7D 系列进度（已全部完成）

- **7D-1**（今日复习内容页）：后端 TodayReviewedItem 返回 where_encountered，前端展示"来自：xxx"。

## Phase 7C 系列进度（已全部完成）

- **7C-1**（首页搜索）：getSearchableText 纳入 whereEncountered。
- **7C-2**（Add 页）：删除考试场景 / 考试模块 picker，CREATE / PATCH payload 不含 exam_scene / exam_module。
- **7C-3**（首页）：删除高级筛选和批量设置考试分类入口。

详细总结见 docs/phase7c-home-and-exam-cleanup-summary.md。

## Phase 7B 系列进度（已全部完成，已封板）

- **7B-1**（后端）：Card 表新增 where_encountered。
- **7B-2**（前端 Add/Edit）：Add 页新增输入框，pending fallback 不丢字段。
- **7B-3A**（后端 review 透传）：ReviewItemResponse 新增 where_encountered。
- **7B-3B**（前端复习页）：答案区弱展示"来自：XXX"。

## 当前产品语义

### 列表卡片统一结构

- 顶部行：类型 tag（左）+ 状态/结果 tag（右）
- 中间：英文内容 + 我的理解
- 底部 meta：复习次数（左）+ 来自：xxx source pill（右，有值才显示）
- 默认不展示备注 note

### whereEncountered

- 字段可选，空值不展示，不制造"卡片不完整"压力。
- 展示文案统一"来自：xxx"，不使用"来源"。
- 列表页使用弱绿色 pill（22rpx、#5f9f79、浅绿底），长文本单行省略。
- 详情/复习场景使用弱色小字，不抢英文内容和理解的视觉重心。
- 不做下拉分类，不替代补充备注，不与 exam_scene / exam_module 混淆。

### 历史语义（保持不变）

- 首页和今日复习情况页分母始终是 dailyGoal。
- 今日完成数按当天 distinct card 统计。
- goal_blocked = 目标未完成但无更多可贡献卡。
- 历史复习内容页是 ReviewLog 快照，只读。
- 今日复习内容页是今天复习过的当前卡片，可编辑，不可删除。

## 下一步建议

先做 **Phase 7G-readonly**，只读审查以下候选方向，明确优先级后再实现：

- 是否需要 whereEncountered 输入辅助（最近用过 / 常见来源快捷标签）
- 产品下一阶段整体评估

不再建议继续增加列表展示点。
不再建议删除后端 exam_scene / exam_module 字段或旧数据。

## 注意

- 后端字段名 where_encountered，前端字段名 whereEncountered，不要混用。
- exam_scene / exam_module 后端字段保留，不删除。
- 不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
- 列表页统一不展示备注，详情页（Add/Edit、复习、历史详情）仍可展示。
