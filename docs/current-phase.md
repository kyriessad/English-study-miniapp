# Current Phase

## 当前阶段

Phase 7K-hotfix 已完成：Phase 7K-readonly 三个 P2 问题最小修复。

在 Phase 7K-readonly 完成整体产品验收与技术债审查后（P0=0，P1=0，P2=4），本阶段完成其中三个 P2 的最小修复。

## 最新提交

前端（English-study-miniapp）：
- `ee01f3c` fix phase 7k polish issues

## Phase 7K-hotfix 修复内容（已完成）

- **P2-1**（离线编辑 pending update 显式保护）：`choosePreferredCard` 在旧 `syncStatus` 判断之前新增 `backend_sync_status === 'pending'` 显式优先判断。pending 本地卡优先于非 pending 的后端卡，降低离线编辑内容被后端旧数据覆盖的理论风险。改动仅 `utils/recordStorage.js`，不影响 pending-create / synced 卡的正常逻辑。
- **P2-2**（来源 pill 超长文本省略号保护）：`pages/add/add.wxss` 将 `.source-pill` 从 `display: inline-flex` 改为 `display: inline-block; vertical-align: middle`，保留 `max-width: 200rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`。WeChat 渲染引擎中 `inline-block` 是 block 格式化上下文，省略号能可靠显示。
- **P2-3**（首页状态 Tab 横向滚动可发现性）：`pages/index/index.wxml` 将 `scroll-view` 包入 `.library-tabs-wrap` 容器，右侧新增 `.library-tabs-fade` 渐变蒙版。`pages/index/index.wxss` 新增对应样式（`position: relative` 容器 + `position: absolute; pointer-events: none` 右侧渐变）。不影响点击逻辑，不改筛选 JS 逻辑。

## 本次未改变

- 后端
- 数据库
- Card schema
- review session
- whereEncountered 字段语义
- Add/Edit 保存主流程
- 首页筛选逻辑
- 历史页 / 今日复习内容页
- exam_scene / exam_module

## Phase 7K-readonly 审查结论（已验收）

Phase 7K-readonly 对整体产品做只读审查，结论：P0=0，P1=0，P2=4。

Phase 7K-hotfix 完成 P2 中三个。另外一个 P2（`add.js` 直接 import `apiClient.updateBackendCard` 绕过 facade）归类为架构技术债，暂不处理。

## 下一步建议

进入 **Phase 7L-readonly**：最终人工验收与是否暂停 Phase 7 功能扩展评估。

重点验收路径：
- 离线编辑一张已同步卡，确认 `backend_sync_status='pending'` 保留，联网后 PATCH 成功变为 `synced`
- Add/Edit 页输入超长来源，确认"最近用过"标签显示省略号、不撑破布局，点击填入完整内容
- 小屏进入首页，状态 Tab 右侧可见渐变提示，全部/待学习/复习中/待加强/已掌握 点击均正常

暂时不建议：
- 继续增加 whereEncountered 展示点
- 扩展来源管理系统
- 修复第 4 个 P2（add.js 直接 import apiClient，影响范围有限）

## Phase 7G–7J 系列进度（已全部完成）

- **7G-1**（Add/Edit 来源 placeholder 修复）：`<input>` 原生组件无法通过 padding 撑高，新增 `.input-source` 类显式设置高度，placeholder 文案改为"例如 美剧、电影、抖音、B站等"。
- **7H-1**（首页复习 meta 文案精简）：未复习不显示、今天复习过显示"今天复习过"、之前复习过显示"上次：xxx"，不再展示复习次数。
- **7I-1**（首页筛选布局优化）：状态 Tab 改为单行横向可滚动；卡片类型筛选提升到搜索框上方，常驻显示，筛选逻辑不变。
- **7J-1**（Add/Edit 最近用过来源快捷标签）：来源输入框下方新增"最近用过"标签，从 cardsCache 推导，最多 5 个，去重，点击直接填入，不新增 storage key。
- **7J-2-hotfix**（离线编辑兜底与文案简化）：`updateCard` PATCH 失败新增 fallback 写本地 cache；`refreshCardsCacheFromBackend` 保留 pending-update 卡不被后端旧数据覆盖；`syncPendingCardsToBackend` 新增 backend_card_id 分支直接 PATCH；保存 toast 统一为"已保存"/"已更新"。

详细总结见 docs/phase7g-7j-home-and-source-input-polish-summary.md。

## 当前产品语义

### Add/Edit 页

- 来源输入框 placeholder 完整可见，文案为"例如 美剧、电影、抖音、B站等"
- 输入框下方有"最近用过"快捷标签（最多 5 个，从 cardsCache 推导，不新增 storage key）
- 超长来源文本在 pill 中省略显示，不撑破布局
- 离线新增 / 离线编辑均可本地保存，用户侧 toast 为"已保存"/"已更新"，内部 pending 状态保留

### 首页卡片库

- 状态 Tab 单行横向可滚动，右侧有渐变提示（可发现性）
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

## 注意

- 后端字段名 where_encountered，前端字段名 whereEncountered，不要混用。
- exam_scene / exam_module 后端字段保留，不删除。
- 不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
- 列表页统一不展示备注，详情页（Add/Edit、复习、历史详情）仍可展示。
