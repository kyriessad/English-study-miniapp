# Current Phase

## 当前阶段

Phase 7C 已完成：首页搜索纳入 whereEncountered，前端考试分类入口已全部清理，exam_scene / exam_module 仅作为老卡搜索兜底保留。

## 最新提交

前端（English-study-miniapp）：
- 79d14f4 remove exam filters from home page
- ee85106 remove exam pickers from add page
- c980ddd include where encountered in home search
- 8d47ead show where encountered in review answer
- 614631b connect add page where encountered field

后端（English-analyzer-backend）：
- 55829f1 include where encountered in review items
- e43eaab add where encountered field to cards

## Phase 7C 系列进度（已全部完成）

- **7C-1**（首页搜索）：getSearchableText 纳入 whereEncountered，搜索 placeholder 更新，examScene / examModule 保留为搜索兜底。
- **7C-2**（Add 页）：删除考试场景 / 考试模块 picker 和只读 pill，CREATE / PATCH payload 不再写入 exam_scene / exam_module。
- **7C-3**（首页）：删除高级筛选"考试场景""考试模块" filter-item，删除管理模式"批量设场景""批量设模块"按钮，清理 JS 状态和 handler。

详细总结见 docs/phase7c-home-and-exam-cleanup-summary.md。

## Phase 7B 系列进度（已全部完成，已封板）

- **7B-1**（后端）：Card 表新增 where_encountered，/api/cards 全接口支持，alembic migration，测试覆盖
- **7B-2**（前端 Add/Edit）：Add 页新增"在哪里遇到（可选）"输入框，pending fallback 同步不丢字段，示例卡填入 whereEncountered
- **7B-3A**（后端 review 透传）：ReviewItemResponse 新增 where_encountered，_item_response 取 card.where_encountered，测试覆盖
- **7B-3B**（前端复习页）：normalizeReviewItem 映射字段，_refreshCurrentCardFromStorage 刷新，答案区弱展示"来自：XXX"

## 当前产品语义

### whereEncountered

- 字段可选，空值不展示，不制造"卡片不完整"压力
- Add 页位置：英文内容 → 在哪里遇到（可选）→ 我的理解 → 补充备注
- 复习页展示：只在点击"查看理解"后显示，文案"来自：XXX"，弱色小字
- 不做下拉分类，不替代补充备注，不与 exam_scene / exam_module 混淆

### 历史语义（来自 Phase 6P-later，保持不变）

- 首页和今日复习情况页分母始终是 dailyGoal
- 今日完成数按当天 distinct card 统计
- goal_blocked = 目标未完成但无更多可贡献卡
- 历史复习内容页是 ReviewLog 快照，只读
- 今日复习内容页是今天复习过的当前卡片，可编辑，不可删除

## 下一步建议

先做 **Phase 7D-readonly**，只读审查以下候选方向，明确优先级后再实现：

- 今日复习内容页是否展示 whereEncountered
- 历史详情页是否展示 whereEncountered
- 首页卡片列表弱展示"来自 XXX"（whereEncountered 预览）
- 产品下一阶段整体评估

不再建议继续删除 exam_scene / exam_module 后端字段或旧数据。

## 注意

- 后端字段名 where_encountered，前端字段名 whereEncountered，不要混用。
- exam_scene / exam_module 后端字段保留，不删除。
- 不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
