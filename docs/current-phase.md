# Current Phase

## 当前阶段

Phase 7G–7J 已完成：首页体验与来源输入体验优化。在 Phase 7F 完成 whereEncountered 展示闭环后，本阶段补齐 Add/Edit 来源输入体验、首页 meta 文案精简、筛选布局优化，以及离线编辑数据写入修复。

## 最新提交

前端（English-study-miniapp）：
- `e30d09b` fix offline card update fallback
- `7387781` add recent source suggestions on add page
- `337704a` flatten home card type filters
- `e9342e5` simplify home card review meta text
- `42300ad` fix where encountered input placeholder

## Phase 7G–7J 系列进度（已全部完成）

- **7G-1**（Add/Edit 来源 placeholder 修复）：`<input>` 原生组件无法通过 padding 撑高，新增 `.input-source` 类显式设置高度，placeholder 文案改为"例如 美剧、电影、抖音、B站等"。
- **7H-1**（首页复习 meta 文案精简）：未复习不显示、今天复习过显示"今天复习过"、之前复习过显示"上次：xxx"，不再展示复习次数。
- **7I-1**（首页筛选布局优化）：状态 Tab 改为单行横向可滚动；卡片类型筛选提升到搜索框上方，常驻显示，筛选逻辑不变。
- **7J-1**（Add/Edit 最近用过来源快捷标签）：来源输入框下方新增"最近用过"标签，从 cardsCache 推导，最多 5 个，去重，点击直接填入，不新增 storage key。
- **7J-2-hotfix**（离线编辑兜底与文案简化）：`updateCard` PATCH 失败新增 fallback 写本地 cache；`refreshCardsCacheFromBackend` 保留 pending-update 卡不被后端旧数据覆盖；`syncPendingCardsToBackend` 新增 backend_card_id 分支直接 PATCH；保存 toast 统一为"已保存"/"已更新"。

详细总结见 docs/phase7g-7j-home-and-source-input-polish-summary.md。

## Phase 7F 系列进度（已全部完成）

- **7F-1**（首页 source pill）：`decorateCards()` 提取 whereEncountered，卡片底部 meta 行右侧新增"来自：xxx"source pill，长文本单行省略。
- **7F-2**（历史列表 source pill）：`mapBackendHistoryItem()` 映射 whereEncountered，`searchHistoryCards()` 搜索纳入 whereEncountered，底部 meta 行右侧新增 source pill。
- **7F-3**（今日复习标签统一）：结果标签从底部移到右上角，左上保留类型 tag，source 补单行省略。
- **7F-4-hotfix**（摘要结构收紧）：首页和今日复习卡片默认不展示备注，今日复习 source 从中间行移到底部 meta 行右侧 pill。

详细总结见 docs/phase7f-where-encountered-list-display-summary.md。

## 当前产品语义

### Add/Edit 页

- 来源输入框 placeholder 完整可见，文案为"例如 美剧、电影、抖音、B站等"
- 输入框下方有"最近用过"快捷标签（最多 5 个，从 cardsCache 推导，不新增 storage key）
- 离线新增 / 离线编辑均可本地保存，用户侧 toast 为"已保存"/"已更新"，内部 pending 状态保留

### 首页卡片库

- 状态 Tab 单行横向可滚动（全部/待学习/复习中/待加强/已掌握）
- 卡片类型筛选常驻在搜索框上方（全部/单词/短语/句子）
- meta 行左侧：未复习不显示、今天复习过→"今天复习过"、之前复习过→"上次：xxx"
- meta 行右侧：source pill"来自：xxx"（有值才显示）
- 搜索覆盖英文、理解、备注、来源

### whereEncountered

- 字段可选，空值不展示。
- 展示文案统一"来自：xxx"，不使用"来源"。
- 列表页使用弱绿色 pill（22rpx、#5f9f79、浅绿底），长文本单行省略。
- 详情/复习场景使用弱色小字。
- 不做下拉分类，不替代补充备注，不与 exam_scene / exam_module 混淆。

### 历史语义（保持不变）

- 首页和今日复习情况页分母始终是 dailyGoal。
- 今日完成数按当天 distinct card 统计。
- goal_blocked = 目标未完成但无更多可贡献卡。
- 历史复习内容页是 ReviewLog 快照，只读。
- 今日复习内容页是今天复习过的当前卡片，可编辑，不可删除。

## 下一步建议

进入 **Phase 7K-readonly**：整体产品验收与技术债审查。

重点检查：
- 离线编辑后 pending-update 卡在联网后是否完整 PATCH 到后端
- `syncPendingCardsToBackend` 新增 backend_card_id 分支日志验证
- 首页 Tab 滚动在较小设备上的体验

暂不建议：
- 继续增加 whereEncountered 展示点
- 继续扩展来源管理系统

## 注意

- 后端字段名 where_encountered，前端字段名 whereEncountered，不要混用。
- exam_scene / exam_module 后端字段保留，不删除。
- 不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
- 列表页统一不展示备注，详情页（Add/Edit、复习、历史详情）仍可展示。
