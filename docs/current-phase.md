# Current Phase

## Current Phase

Phase 8M-review-batch-size-change-takes-effect-next-view — 修改”每次看几张”后，下次点击”查看卡片 / 继续查看”即按新数量重新创建一轮；删除设置页”下次新开始时生效”文案。

**类型：** frontend — 改前端 JS/WXML/WXSS + 测试脚本 + 文档；后端不改。

### 本阶段产品语义

- 修改”每次看几张”后，前端写入 `batchSizeChangedNeedsRestart` storage 标记。
- 下次点击”查看卡片 / 继续查看”时，检测到标记即忽略当前未完成 session，强制 `restart: true` 按新数量重开新 session。
- 成功创建 session 后清除标记；若创建失败，标记保留，用户下次重试仍按新数量创建。
- 已提交的反馈记录（ReviewLog）保留，不回滚。
- 未修改设置时，有未完成 session 仍继续原 session，行为不变。
- 设置页不新增说明文案；修改后只显示”已更新”toast。
- 删除设置页”下次新开始时生效”文案 + 对应 `.settings-item-hint` 样式。
- Phase 8L 的”库存足够时尽量凑满”后端逻辑不变。
- 回炉算法不变，反馈按钮仍是：没想起 / 有点模糊 / 记得 / 很熟。

### 修改文件

| 文件 | 改动 |
|---|---|
| `pages/settings/index.js` | `onDailyGoalChange`：新值与旧值不同时写入 `batchSizeChangedNeedsRestart` storage |
| `pages/settings/index.wxml` | 删除 `<view class=”settings-item-hint”>下次新开始时生效</view>` |
| `pages/settings/index.wxss` | 删除 `.settings-item-hint` 样式块 |
| `pages/index/index.js` | `onShow` 读取标记并初始化 `_batchSizeChangedNeedsRestart`；`applyReviewOverview` 强制按钮为”查看卡片”；`goToReview` 检查标记并 forceRestart；新增 `_clearBatchSizeRestartFlag` helper；三处 session 创建成功路径调用 clear |
| `scripts/test-review-batch-size.js` | 新增 E1–E26 共 26 个用例，总计 79 个用例 |
| `docs/current-phase.md` | 本文档 |
| `docs/product-features.md` | 更新设置页描述和”每次看几张”生效规则章节 |
| `docs/release-checklist.md` | 更新十二节设置页验收项 |

### 未改内容

- 后端不改（接口 schema / 数据库 schema / 复习规则 / 调度链不变）
- `review_state` 枚举（new/reviewing/strengthening/mastered）不变
- 4 档反馈枚举（forgot/shaky/got_it/fluent）不变
- 回炉算法（forgot 2次/shaky 1次）不变
- `ReviewSession` / `daily_suggested` / `new_only` / `free_review` 调度链不变
- `dailyGoal` storage key / 变量名 / 可选值 3/5/10/15 不变
- Phase 8L 后端 fill_target / 补位策略不变
- Add 页输入逻辑不变
- 反馈按钮文案 / 回炉逻辑不变

### 人工验收清单

**A. 设置 3 改 5，下次查看立即生效**
1. 设置”每次看几张”为 3 → 进入查看卡片，确认是 3 张 → 不看完，返回
2. 设置页改为 5 → 只显示”已更新”，不显示额外说明文案
3. 回首页点击查看卡片 → 进入新一轮 5 张，不继续旧 3 张

**B. 设置不变仍继续原 session**
1. 设置为 5 → 开始一轮 → 中途退出 → 不修改设置
2. 点击继续查看 → 应继续原 session，不重开

**C. 创建失败不清除标记**
1. 设置从 3 改为 5 → 断网 → 点击查看卡片失败
2. 恢复网络后再次点击 → 仍应按 5 张创建

**D. 设置页文案回归**
1. 设置页不显示”下次新开始时生效”
2. 修改后只看到 toast：”已更新”

**E. 回归**
1. 每次看几张仍可选 3 / 5 / 10 / 15
2. 反馈按钮仍是：没想起 / 有点模糊 / 记得 / 很熟
3. Add 页不受影响

## Recently Completed

| Phase | Type | Backend commit | Frontend commit |
|---|---|---|---|
| Phase 8M-review-batch-size-change-takes-effect-next-view | Frontend: 修改”每次看几张”后下次查看即按新数量重开 session；删除设置页”下次新开始时生效”文案；新增 26 个测试用例（总 79 个） | — | pending |
| Phase 8L-backend-fill-session-to-target-size | Docs sync for backend方案 A：每次看几张为新建 session 目标数量；daily_suggested 可用卡足够时尽量凑满；未完成 session 继续原 session 不扩容；ReviewLog/去重统计/回炉算法语义同步 | pending | pending |
| Phase 8K-remove-today-review-status-page | Frontend cleanup: 删除 pages/today_review_status/（4 文件 915 行）；app.json 移除注册；review.js / wxml `navigateToTodayReviewStatus` → `navigateToTodayReviewed`；CLAUDE.md / docs 同步解除"不删除 today_review_status"边界 | — | `34c6660`（代码）+ pending（文档） |
| Phase 8J-action-queue-duplicate-feedback-fix | Frontend hotfix: foreground 反馈失败立即 removeActionFromQueue；submitReview enqueue 前用 removeQueuedFeedbackActionsBySessionItemId 兜底去重；新增 34 个测试用例 | — | `00064cf` |
| Phase 8I-ux-copy-polish-followup | Frontend hotfix: Add 页空输入不展示校验提示；删除"不会修改英文内容"；review 回炉提示改用 seenCardIds 客户端兜底；review 失败页"复习任务加载失败"→"卡片加载失败"＋网络感知文案＋标题弱化 | — | `e73dbc4` |
| Phase 8I-ux-copy-polish | Frontend hotfix: 状态图标 ○◐◎● 体系；离线内容展示时静默不 banner；失败提示统一为"网络不可用，请检查当前网络"；Add 页"全部填入"→"填入理解和例句"＋"不会修改英文内容"；初始校验文案清空；review 空状态去调度术语；today_review_status 旧文案清理；settings 页新增"下次新开始时生效"；回炉卡 is_repeat 条件显示"再看一次" | — | `646280a` |
| Phase 8H-hotfix-input-analysis-typing-control | Frontend hotfix: 输入中不回写 form.englishText；输入末尾空白跳过自动分析；blur 后低风险规范化回写；恢复新增卡片时自动类别识别（不被 hasUserChangedCategory 阻止） | — | pending |
| Release-Control-Docs-Completeness | Docs only: 完善 roadmap / release-checklist / ai-working-rules；补充发布合规、安全、备份、登录、多用户隔离、AI 降级、灰度、回滚；修正 pending commit 状态；修正 session 创建接口路径为 /api/review-sessions；补充审核材料准备、SQLite fallback 人工确认、systemd/Nginx 细节、发布前仓库清洁检查、接口路径全量核实、禁止主动重命名核心文档规则；恢复原始 docs 文件路径 | — | pending |
| Release-Planning-Docs | Docs only: 新增 docs/roadmap.md、docs/release-checklist.md、docs/ai-working-rules.md；更新 docs/current-phase.md | — | `63bff0c` |
| extend-batch-size-options | Extend: 每次看几张选项扩展为 3 / 5 / 10 / 15；更新 5 个前端文件 + 后端 VALID_DAILY_GOALS；测试脚本扩展至 53 个用例 | pending | pending |
| fix-review-batch-size | Fix: `limit:5` hardcoded in all session creation paths → `dailyGoalToLimit(readDailyGoal())`；新增 37 个测试用例 | — | pending |
| Phase about-polish | About page: update desc copy, add 怎么使用 4-step block, add 联系开发者 modal with email copy | — | pending |
| Release-P1-copy-alignment | Copy P1: align result labels (没想起/有点模糊/记得/很熟) in today_reviewed & history_reviewed; review page title → "查看卡片" | — | pending |
| Phase 8J-backend-hotfix | Backend: cap repeat item from restoring mastered in same review round | `edc945b` | — |
| Phase 8I-small-hotfix-copy-P1P2-b | Copy hotfix: home review button "看一看"→"查看卡片"（普通状态）；"继续查看"不变 | — | pending |
| Phase 8I-small-hotfix-copy-P1P2 | Copy hotfix: home "添加卡片继续"→"添加卡片"，"继续看"→"继续查看"；复习页反馈按钮轻量化 | — | `81ac8f7` |
| Phase 8H-hotfix-real-validation | Fix runInputAnalysis normalize trigger condition | — | `6adccf1` |
| Phase 8H-hotfix | Local normalize before analysis + auto-category restore | — | `0d5ff0c` |
| Phase 8H-small-hotfix | English content normalization stabilization | — | `434a669` |
| Phase 8G-hotfix-copy-inventory | Copy inventory, long-content copy unification, add-page-copy-inventory.md | — | `f86d3e1` |
| Phase 8G-add-input-validation-ux-polish | Rewrite local validation rules, downgrade backend errors, spell hint demotion, network copy unification | — | `6eab0c2` |
| Phase 8F-hotfix-and-add-input-validation-audit | Scene pill readability hotfix + add input validation audit doc | — | `8132411`, `15950ff` |
| Phase 8F-scene-memory-copy-polish | Strengthen scene memory copy in add/review pages | — | `8132411` |
| Phase 8E-cleanup-dead-home-and-history-code | Clean up dead reviewActions, status-overview-card CSS, history-stats-card CSS | — | `e607bc3` |
| Phase 8D-hotfix-feedback-result-colors | Fix feedback result pill colors on today_reviewed / history_reviewed | — | `1742603` |
| Phase 8D-home-lightweight | Remove home new-card prompt, lighten subtitle copy | — | pending |
| hotfix-bulk-action-position | Move bulk action toolbar below filters, above card list | — | pending |
| Phase 8C-status-icons-and-session-size-copy | Status pill icons, tab labels, session size copy | — | `8d8a2af` |
| Phase 8B-review-copy-and-record-pages-lightweight | Lighten review copy and record pages | — | `c2efcd7` |
| Phase 8A-home-review-navigation-lightweight | Lighten home review entry, remove goal card | — | `9143346` |
| Phase 8L-3-hotfix | Simplify not_started state in today_review_status | — | `f2ba18b` |
| Phase 8L-2-hotfix | Home goal card dual routing + today reviewed history link | — | `9d88c8b` |
| Phase 8L-hotfix | Home goal card routing to today reviewed | — | `4e41639` |
| Phase 8K | Polish: review progress, home labels, today reviewed filters | — | `af338dc` |
| Phase 8I-2 | Validation substring review (readonly) | — | — |
| Phase 8I | Classification + morphology fix | `54db753` | — |
| Phase 8H | Stale cache read-side eviction + hyphen fix | `ef4f946` | `8d10689` |
| Phase 8E | Diagnostic logging (no behavior change) | `d185306` | — |
| Phase 8F | validate_english readonly review | — | — |
| Phase 8D-hotfix | Cache write gate + translation gate | `211d57e` | `365fe20` |
| Phase 8C | Review UI polish | — | `731ca47` |
| Phase 8C-first-mini | Home button priority | — | `51f7d21` |

---

---

## Phase 8K-remove-today-review-status-page — 删除 today_review_status 孤岛页面

**提交：** frontend `34c6660` drop today review status page（业务代码） + pending（文档同步）
**类型：** frontend cleanup
**前置：** Phase 8J 真机验收 + 上一轮 readonly 审查已确认 today_review_status 无任何外部用户入口；CLAUDE.md / ai-working-rules.md 此前"不删除 today_review_status"边界本次解除。

### 根因

Phase 8D-home-lightweight 起首页主入口下线 today_review_status，但出于保守策略保留了页面代码。多轮审查（Phase 8I-followup / 8J）证实：
- 全项目 grep 无任何 `navigateTo` / `redirectTo` / `reLaunch` / `switchTab` 指向 today_review_status
- review.js 完成态实际跳转 `today_reviewed?from=review_complete`
- review.js 中的 `navigateToTodayReviewStatus()` 方法名为历史残留，实际跳转目标也是 `today_reviewed?from=review_done_fallback`
- 该页 4 个文件共 915 行属孤岛死代码，仅 app.json 注册位置浪费体积

### 修改内容

| 文件 | 改动 |
|---|---|
| `pages/review/review.js` | `navigateToTodayReviewStatus()` → `navigateToTodayReviewed()`（仅函数名，逻辑和跳转目标不变） |
| `pages/review/review.wxml` | 完成态"查看今天看过的"按钮 `bindtap` 同步重命名 |
| `app.json` | 删除 `pages/today_review_status/today_review_status` 页面注册 |
| `pages/today_review_status/today_review_status.js` | 整文件删除（400 行） |
| `pages/today_review_status/today_review_status.json` | 整文件删除（2 行） |
| `pages/today_review_status/today_review_status.wxml` | 整文件删除（216 行） |
| `pages/today_review_status/today_review_status.wxss` | 整文件删除（297 行） |
| `CLAUDE.md`（根） | 第三节"首页约定"更新；第十一节强边界第 7 项"删除 today_review_status"改为"重新引入或恢复 today_review_status"（已删除，不要恢复） |
| `docs/ai-working-rules.md` | 第八节禁止操作表"删除 today_review_status 页面代码"改为"重新引入或恢复 today_review_status 页面" |
| `docs/product-features.md` | 删除"4. 今日复习情况页"整节；后续 5-9 节顺位调整为 4-8；第 123 行入口描述更新；离线 UI 文案小节移除 today_review_status banner；第九节"明确不做的事"表更新；第十节 Phase 8L / 8K 验收清单标注为历史阶段 |
| `docs/add-input-validation-product-rules.md` | "未改内容"列表移除"today_review_status 页面不变" |
| `docs/release-checklist.md` | 复习反馈完成跳转项从 today_review_status 改为 today_reviewed |
| `docs/roadmap.md` | P2 "today_review_status 页面重构" 条目删除 |
| `docs/current-phase.md` | 新增本阶段记录 + Recently Completed 表更新 |

### 未改内容

- 后端、数据库 schema、接口 schema 均不变
- `review_state` 枚举不变
- 4 档反馈枚举（forgot/shaky/got_it/fluent）不变
- 回炉算法不变
- `ReviewSession` / `daily_suggested` / `new_only` / `free_review` 调度链不变
- `dailyGoal` 存储 / 变量名 / 可选值 3/5/10/15 不变
- 网络 action queue 不变（Phase 8J 已修）
- review 加载失败页文案 / 视觉不变（Phase 8I-followup 已处理）
- 状态图标 ○ / ◐ / ◎ / ● 不变
- 反馈按钮 没想起 / 有点模糊 / 记得 / 很熟 不变
- Add 页空输入提示不变
- Node.js / React.js 分词问题未处理
- 跨会话回炉 is_repeat 未处理
- 历史 phase summary 文档（phase6m / 6n / 6p 等）未改，保留历史事实

### 人工验收清单

**A. 编译**
1. 微信开发者工具重新编译通过
2. 不出现"今日复习情况页找不到"类报错

**B. 查看卡片完成路径**
1. 正常进入"看一看"
2. 完成所有反馈
3. 自动跳转到"今天看过"（today_reviewed），**不**跳到 today_review_status

**C. done fallback 按钮**
1. 触发 review 完成 fallback 面板（极少情况）
2. 点击"查看今天看过的"
3. 进入 today_reviewed，不报错

**D. 首页常用入口**
1. 添加卡片正常
2. 查看卡片 / 继续查看正常
3. 今天看过入口正常
4. 设置入口正常

**E. 弱网回归**
1. 断网进入查看卡片 → 失败页"卡片加载失败"
2. 恢复网络后重新加载正常

**F. 回归**
1. Add 页空输入不显示校验文案
2. 状态图标仍是 ○ / ◐ / ◎ / ●
3. 反馈按钮仍是 没想起 / 有点模糊 / 记得 / 很熟
4. 回炉"再看一次"不受影响

### 下一步建议

- 本次仅清理代码 + 文档同步，未涉及业务变更
- 若后续需要"今日复盘"类轻量页面，应作为新页面命名（如 `daily_recap`）独立设计，**不要**复用已删除的 today_review_status 路径
- 可以考虑下一阶段处理已知遗留：Node.js / React.js 分词问题（P2）、跨会话回炉 is_repeat（需后端补 `ReviewItemResponse.is_repeat` 字段）

---

## Phase 8J-action-queue-duplicate-feedback-fix — 修复反馈双入队 / 双提交风险

**提交：** frontend `00064cf` fix duplicate review feedback queueing（验收语义澄清在 `203b752` clarify failed review feedback retry semantics 中补强）
**类型：** frontend hotfix
**测试：** `scripts/test-review-action-queue-dedup.js`，34 个用例全部通过

### 根因

`pages/review/review.js` 的 `submitReview` 每次点击都调用 `enqueueAction('review_feedback', { client_action_id, session_id, session_item_id, card_id, result })`。
- 成功路径：`_handleForegroundSuccess` → `_removeProcessedAction(clientActionId)` 将 action 从队列移除。
- 失败路径：`_handleForegroundFailure` 仅 `setData({ submittingFeedback: false, pageState: 'active', currentClientActionId: '' })` 并 toast "网络不可用，请检查当前网络"，**不出队**。

后果：
- 用户失败后再点同一卡片任意反馈 → `generateClientActionId()` 生成新 UUID → 入队 → 队列里现在有两条 `review_feedback` 都指向同一 `session_item_id`，但 `client_action_id` 不同。
- 后端 `/api/reviews/feedback` 幂等仅按 `client_action_id`（见 `app/routers/reviews.py:1192-1232` `get_existing_client_action`），不同 client_action_id 视为不同请求。
- 后续 `flushActionQueue` 按 `created_at ASC` 串行发送两条：
  - 第一条（旧失败 action）先到 → 后端 Step 4 检查 `item.status == 'pending'` 通过 → 正常应用反馈、写 review_log、写 item.first_result = 旧 result。
  - 第二条（用户真实意图）到 → 后端 Step 4 检查 `item.status != 'pending'` → 返回 `status: 'ignored'`, `ignored_reason: 'session_item_not_pending'`。
- **用户可见后果**：用户最终看到的是"第一次失败那次的 result"被记录，不是用户最后真正想点的结果。回炉算法、review_state 转移、ReviewLog 内容都按错误 result 推进。

后端虽然有 `session_item_id` "pending" 兜底，但**只能保证不重复处理同一 item，不能保证以最后一次用户意图为准**。前端必须自己保证队列里同一 session_item 只剩最新一条 action。

### 只读链路核实

| 检查项 | 位置 | 结论 |
|---|---|---|
| `clientActionId` 生成时机 | `review.js:381` `generateClientActionId()` | 每次 `submitReview` 调用都生成新 UUID |
| 每次点击都 enqueue | `review.js:405-412` | 是，无去重 |
| Action 字段 | `actionQueue.js:54-72` | `client_action_id` / `action_type` / `payload.{session_id, session_item_id, card_id, result}` / `status` / `created_at` / `local_sequence` / `retry_count` / `next_retry_at` |
| Success 出队位置 | `review.js:_handleForegroundSuccess` → `_removeProcessedAction(clientActionId)` → `markActionSynced + removeActionFromQueue` | 正确出队 |
| Failure 出队 | `review.js:_handleForegroundFailure`（修前） | **不出队**（确认 bug） |
| 失败后再点击产生新 action | `submitReview` → 新 UUID → enqueueAction | 是，两条都进队 |
| Flush 串行发送 | `actionQueue.js:flushActionQueue` 按 `sortByCreatedAtAndLocalSequence` | 是，按时间顺序两条都发 |
| 后端 client_action_id 幂等 | `app/routers/reviews.py:1192` `get_existing_client_action` | 是，按 client_action_id 查 ProcessedClientAction |
| 后端 session_item_id 二次检查 | `app/routers/reviews.py:1289` `item.status != 'pending'` → 返回 ignored | 有兜底，但只能去重不能纠正用户意图 |

### 修改内容

| 文件 | 改动 |
|---|---|
| `utils/actionQueue.js` | 新增 `removeQueuedFeedbackActionsBySessionItemId(sessionItemId)`：只匹配 `action_type === 'review_feedback'` 且 `payload.session_item_id === sessionItemId` 的项，返回被移除的 `client_action_id` 列表；空 / null / undefined 输入为 no-op；不影响其他 action_type；不按 card_id 去重 |
| `pages/review/review.js` | import 新增 `removeActionFromQueue` 和 `removeQueuedFeedbackActionsBySessionItemId`；`submitReview` 在 `enqueueAction` 前调用 `removeQueuedFeedbackActionsBySessionItemId(currentItem.session_item_id)` 防御性去重；`_handleForegroundFailure` 调用 `removeActionFromQueue(clientActionId)` 立即出队失败 action，并刷新 `pendingActionCount` |
| `scripts/test-review-action-queue-dedup.js` | 新增 34 用例测试脚本：T1 系列覆盖 `removeActionFromQueue` 基础行为；T2 系列覆盖 dedup helper 的 session_item 匹配、空输入、非 review_feedback 类型保护；T3 系列模拟端到端用户流（失败→重试同 result / 失败→换 result / 旧版本没清理 + dedup 兜底 / 多卡片独立） |
| `docs/current-phase.md` | 新增本阶段记录 |

### 新行为

1. **前台反馈失败立即出队：** 用户看到失败 toast 时，对应 client_action_id 已从队列移除，不会随后台 flush 偷偷提交。
2. **入队前去重防御：** `submitReview` 在 enqueue 前先 `removeQueuedFeedbackActionsBySessionItemId(currentItem.session_item_id)`。即使失败清理因任何原因未执行（旧版本残留、storage 异常、并发等），也能保证同一 session_item 在队列里只剩本次新点击的 action。
3. **同 card_id 不同 session_item_id 不去重：** 回炉卡（同 card 不同 session_item 行）独立处理，不会被一并清掉。
4. **跨 session 不去重：** 不同 session_id 但同 session_item_id 理论上不会发生（item_id 是 UUID），但即使发生也只匹配相同 item_id，不按 card_id 误删。
5. **flushActionQueue / 队列存储格式 / 入队字段保持不变。**

### 未改内容

- 后端不变（依赖现有 `client_action_id` 幂等 + `session_item_id` "pending" 兜底）
- 数据库 schema 不变
- 接口 schema 不变（`ReviewFeedbackRequest` / `ReviewFeedbackResponse` 字段不变）
- `review_state` 枚举（new/reviewing/strengthening/mastered）不变
- 4 档反馈枚举（forgot/shaky/got_it/fluent）不变
- 回炉算法（forgot 2次/shaky 1次）不变
- `ReviewSession` / `daily_suggested` / `new_only` / `free_review` 调度链不变
- `dailyGoal` 存储 / 变量名 / 可选值 3/5/10/15 不变
- `today_review_status` 未删除
- Node.js / React.js 分词问题未修
- 跨会话回炉提示 `is_repeat` 未处理（后端 `ReviewItemResponse` 仍不暴露该字段）
- 失败 toast 文案不变（"网络不可用，请检查当前网络"）
- 反馈按钮文案 / 颜色不变
- review 空状态 / 加载失败页文案不变（Phase 8I-followup 已处理）

### 测试用例（34）

| 编号 | 覆盖点 |
|---|---|
| T1.1 | `removeActionFromQueue` 按 client_action_id 单条移除 |
| T1.2 | 未知 client_action_id 为 no-op |
| T1.3 | 移除指定 id 不影响其他 action |
| T2.1 | 同 session_item_id 单条 stale 去重 + 新 action 入队 |
| T2.2 | 同 session_item_id 多条 stale 一次性全部去重 |
| T2.3 | dedup 只影响目标 session_item_id |
| T2.4 | 同 card_id 不同 session_item_id 不会被合并去重（回炉场景） |
| T2.5 | 空 / null / undefined sessionItemId 输入为 no-op |
| T2.6 | dedup 不影响非 review_feedback 类型的 action |
| T3.1 | 失败→重试同 result 只剩一条 action |
| T3.2 | 失败→改点不同 result，队列只保留用户最后意图 |
| T3.3 | 即使旧版本失败清理未执行，dedup 仍能兜底 |
| T3.4 | 不同卡片各自独立，互不干扰 |

### 人工验收清单

> **产品语义提醒：** 复习反馈一旦提示失败，就视为"这次提交没有成功"，**失败 action 不留在队列里等恢复网络后偷偷补交**。用户必须在恢复网络后再次点击反馈，才算真正提交成功。本清单按此语义验证。

**A. 正常反馈成功**
1. 网络正常进入"看一看"
2. 点击"记得" → 正常进入下一张 / 完成页
3. 无错误 toast
4. 今天看过 / 历史记录正常出现该卡

**B. 断网点击反馈失败 → 不应产生记录**
1. 进入"看一看"，确保有卡片
2. 断网
3. 当前卡点"记得"
4. 应弹 toast "网络不可用，请检查当前网络"
5. 应停留在当前卡，**不进入下一张**
6. **不**进入"今天看过"
7. **不**产生 ReviewLog / 历史记录
8. 本地队列 `actionQueue` 中**不**保留该 session_item 的 feedback action
9. 恢复网络但不再次点击反馈时，**不会**自动补交刚才的失败反馈
10. 即使切到首页、重启小程序后恢复网络，仍**不会**自动补交

**C. 恢复网络后重新点击反馈 → 这一次才真正提交**
1. 接场景 B（失败已发生，未再点击）
2. 恢复网络
3. **再次点击"记得"**
4. 这次才应正常进入下一张 / 完成页
5. 后端只产生 **1 条** ReviewLog
6. 卡片 review_state 只推进 **1 次**
7. 该卡在"今天看过"中只出现 1 次

**D. 断网失败后改点另一个反馈**
1. 进入"看一看"，确保有卡片
2. 断网
3. 点"记得"失败 → 仍在断网状态下改点"没想起"
4. "没想起"这次点击在断网下**也会失败**，不产生记录
5. 本地队列不应同时存在"记得"和"没想起"的 action（失败 action 立即出队 + dedup 兜底）
6. 恢复网络
7. **再次点击"没想起"**
8. 这次才产生 **1 条** ReviewLog
9. 最终记录是 **"没想起"**，不是之前失败的"记得"
10. 若触发回炉，按 forgot 规则（"再看一次"后续应出现）

**E. 不同卡片不互相影响**
1. 准备 ≥ 2 张卡
2. 第一张：断网点击失败 → 恢复网络后再次点击成功
3. 进入第二张：正常反馈
4. 第二张的 action 不应被第一张的 dedup 逻辑误删
5. "今天看过"中两张都出现，反馈各自正确

**F. 回归检查**
1. 反馈按钮仍是：没想起 / 有点模糊 / 记得 / 很熟
2. 回炉逻辑不变（forgot 回炉 2 次、shaky 回炉 1 次）
3. "再看一次"提示（Phase 8I-followup 的 seenCardIds）不受影响
4. review 空状态文案不变
5. Add 页不受影响
6. 首页状态图标 ○ / ◐ / ◎ / ● 不受影响

---

## Phase 8I-ux-copy-polish-followup — Phase 8I 真机验收 hotfix

**提交：** frontend pending（commit hash 由提交后汇报，不预写进文档）
**类型：** frontend hotfix
**前置：** Phase 8I-ux-copy-polish (`646280a`) 真机验收发现 4 个问题，本阶段定点修复。

### 根因

1. **Add 页空输入仍显示"正在检查当前内容..."：** `getBasePageState` / `resetFormForContinuousAdd` 的初始 `englishValidationMessage` 仍写入"正在检查当前内容..."；`runInputAnalysis` / `onEnglishInput` 在 normalize 后为空时仍写入"英文内容为空" error。WXML `wx:if` 已检查非空，但 JS 始终塞入非空字符串导致提示一直显示。
2. **"不会修改英文内容"多余：** 该弱提示视觉冗余，已删除文案与对应样式。
3. **回炉卡不显示"再看一次"：** 后端 `ReviewItemResponse`（`schemas/reviews.py:71`）只暴露 `session_item_id / card_id / content / understanding / note / where_encountered / card_type / review_state / mastery_score / recovery_stage / due_reason` — **未暴露 `is_repeat`**（虽然 DB 模型 `ReviewSessionItem.is_repeat` 存在且 `ReviewSessionItemResponse` 有该字段，但该 schema 未被 `/api/reviews/today` 路径使用）。前端依赖 `currentCard.is_repeat` 永远为 undefined。本阶段在前端用 `seenCardIds` 客户端兜底：用户对当前 card 提交过反馈后将 card_id 加入集合，后续同一 card_id 再出现即视为回炉。
4. **断网失败页"复习任务加载失败"+ 重复说明文案：** `loadBackendReviewSession` catch 用 `getErrorMessage(error, '复习任务加载失败，请稍后重试。')`，标题和说明都包含"复习任务"任务化表达；说明文案与标题语义重复。

### 修改内容

| 文件 | 改动 |
|---|---|
| `pages/add/add.js` | `getBasePageState` 初始 `englishValidationMessage` `'正在检查当前内容...'` → `''`；`resetFormForContinuousAdd` 同步；`runInputAnalysis` / `onEnglishInput` 空 normalize 分支不再写入"英文内容为空" error |
| `pages/add/add.wxml` | 删除 `<view wx:if="{{!referenceApplied}}" class="reference-fill-hint">不会修改英文内容</view>` |
| `pages/add/add.wxss` | 删除 `.reference-fill-hint` 样式 |
| `pages/review/review.js` | data 新增 `seenCardIds: []`；新增 `decorateRepeat(card, seenCardIds)` helper（基于 cardId 命中判断）；`loadBackendReviewSession` 成功分支重置 `seenCardIds: []`；`submitReview` 在 enqueueAction 后将 `currentItem.card_id` 加入集合；`_handleForegroundSuccess` / `_moveToNextItem` / `_recoverSession` 用 `decorateRepeat` 装饰 next card；catch 分支区分网络错误（`!statusCode && !data` 或 `request:fail`）→ "网络不可用，请检查当前网络"，其他 → "暂时无法加载卡片，请稍后重试" |
| `pages/review/review.wxml` | 错误态标题"复习任务加载失败" → "卡片加载失败"；标题增加 `review-error-title` 修饰类 |
| `pages/review/review.wxss` | 新增 `.review-error-title` 弱化样式（font-size 36rpx / font-weight 700 / color #4a7461） |
| `docs/current-phase.md` | 新增本阶段记录 |

### 新行为

1. **Add 页空输入：** 英文框为空时 `englishValidationMessage = ''` → WXML `wx:if` 隐藏校验提示区。用户输入非空内容后才出现"正在检查英文内容..."。中文 / 纯数字 / 单词多词等非空 error 不受影响。
2. **"不会修改英文内容"删除：** 参考区按钮区域只保留"填入理解和例句" / "已填入"。
3. **回炉卡"再看一次"：** 同一 session 内用户对 cardA 提交过反馈后，cardA 再次出现（无论来自 batchItems 内部前进、`next_item` 返回、还是 `_recoverSession` 重新拉取）都会显示弱提示"再看一次"。session 重新加载（restart / 不同 session）会清空 seenCardIds。
4. **review 失败页：** 标题"卡片加载失败"；说明区按错误类型显示"网络不可用，请检查当前网络"（无 statusCode/data 或 errMsg 含 request:fail）或"暂时无法加载卡片，请稍后重试"；按钮"重新加载"不变。

### 未改内容

- 后端接口、数据库 schema、`ReviewItemResponse` / `ReviewSessionItemResponse` 字段均不变
- `review_state` 枚举（new/reviewing/strengthening/mastered）不变
- 4 档反馈（forgot/shaky/got_it/fluent）不变
- 回炉算法（forgot 2次/shaky 1次）不变
- `ReviewSession` / `daily_suggested` / `new_only` / `free_review` 调度链不变
- `today_review_status` 页面未删除
- 网络 action 双入队问题仍只读核实，未修（需专项处理）
- `dailyGoal` 存储 key / 变量名 / 可选值 3/5/10/15 不变
- Node.js / React.js 等中间点分词问题未修
- Phase 8I 状态图标体系 / 离线 banner 静默化 / 设置页"下次新开始时生效"提示不变
- `normalizeReviewItem` 既有字段映射不变，仅扩展 `is_repeat` 由 `decorateRepeat` 在调用方注入

### 已知遗留

| 项 | 说明 |
|---|---|
| 网络 action 双入队 | `_handleForegroundFailure` 不出队，重试产生新 client_action_id 造成同 session_item 双 action（需 backend 幂等性验证后专项修） |
| Node.js / React.js 分词 | `getNormalizedWordList` 切分时点号会把"Node.js"拆为 ["Node", "js"]，类别为"单词"时被本地校验拦截 |
| 跨会话回炉提示 | 关闭小程序重新进入同 session 后 `seenCardIds` 会清空，已在新流程中产生反馈的 card 若再次出现不会标记（后端仍能正确调度，但无视觉提示）。后端补 `is_repeat` 字段是更彻底的方案，需专项推动 |

---

## Phase 8I-ux-copy-polish — 轻量化 UX 文案 & 离线提示 hotfix

**提交：** frontend pending（commit hash 由提交后汇报，不预写进文档）
**类型：** frontend hotfix

### 修改内容

| 文件 | 改动 |
|---|---|
| `pages/index/index.js` | STATE_ICONS + LIBRARY_TABS：reviewing ◑→◐、strengthening !→◎、mastered ✓→● ；session 创建/网络失败提示统一为"网络不可用，请检查当前网络" |
| `pages/index/index.wxml` | 删除死代码 `showLibraryPreparationTip` 块（含"准备好后会进入学习任务"文案，computeLibraryPreparationTip 始终返回 false） |
| `pages/add/add.js` | 初始 `englishValidationMessage` 从"正在检查当前内容..."改为空字符串 |
| `pages/add/add.wxml` | 校验区 `wx:if` 增加 `englishValidationMessage` 非空检查；"全部填入"→"填入理解和例句"；新增"不会修改英文内容"弱提示 |
| `pages/add/add.wxss` | 新增 `.reference-fill-hint` 样式；`.reference-fill-row` 增加 `align-items: center` |
| `pages/review/review.js` | `_handleForegroundFailure` toast："网络连接异常，请检查网络后再试"→"网络不可用，请检查当前网络" |
| `pages/review/review.wxml` | 空状态："等到下一批内容到期"→"可以先添加几张，或者过几天再来看看"；新增回炉卡 `is_repeat` 条件弱提示"再看一次" |
| `pages/review/review.wxss` | 新增 `.task-repeat-hint` 样式 |
| `pages/today_reviewed/today_reviewed.wxml` | 删除有缓存时的"显示最近保存的内容"离线 banner；无缓存失败态改为"网络不可用，请检查当前网络" |
| `pages/history_reviewed/history_index.wxml` | offlineEmpty 态："当前无网络连接，暂时无法查看"→"网络不可用，请检查当前网络" |
| `pages/today_review_status/today_review_status.wxml` | "今日复习情况"→"今天的情况"；"历史复习内容"→"历史记录"；"今日已复习内容"→"今天看过"；"查看今日复习内容"→"今天看过"；"今日复习结果"→"今天的复习"；离线 banner 文案更新 |
| `pages/today_review_status/today_review_status.js` | `todayReviewedLabel`："今日已复习内容"→"今天看过"；所有离线/网络失败提示统一为"网络不可用，请检查当前网络" |
| `pages/settings/index.wxml` | "每次看几张"下方新增"下次新开始时生效"说明 |
| `pages/settings/index.wxss` | 新增 `.settings-item-hint` 样式 |

### 未改内容

- 后端接口、数据库 schema 不变
- `review_state` 枚举（new/reviewing/strengthening/mastered）不变
- 4 档反馈（forgot/shaky/got_it/fluent）不变
- 回炉算法（forgot 2次/shaky 1次）不变
- `ReviewSession` / `daily_suggested` / `new_only` / `free_review` 调度链不变
- `today_review_status` 页面未删除（无 JS 入口，仅清理旧文案）
- 网络 action 双入队问题只读核实，未修（需专项处理）
- `dailyGoal` 存储 key / 变量名 / 可选值 3/5/10/15 不变
- 首页"网络恢复后会更新学习记录"（review action pending）保留

### 审查发现的未修问题

| 问题 | 严重度 | 原因 |
|---|---|---|
| 网络 action 双入队：feedback 失败后 action 留队，重试产生两个不同 clientActionId，flush 时可能双处理同一 session_item_id | P2 | 需 backend 侧验证幂等性后专项修 |
| `Node.js` / `React.js` 等带中间点的技术词被分词判断为短语，若手动选单词类别则被本地校验拦截 | P2 | 需改 getNormalizedWordList 分词逻辑，属于中风险改动，本次不做 |
| `is_repeat` 字段是否由后端在 session item 中发送尚需真机验证 | 待验 | "再看一次"条件提示已按 `currentCard.is_repeat` 实现；若后端不发送则静默不显示 |

---

## Phase 8H-hotfix-input-analysis-typing-control — Add 页输入体验 hotfix

**提交：** frontend pending（commit hash 由提交后汇报，不预写进文档）
**类型：** frontend hotfix

### 根因

1. `runInputAnalysis` 在输入过程中回写 `form.englishText = normalizeEnglishText(englishText)`，导致末尾空格消失、光标跳动、输入被改写（如"figure " 变成 "figure"，打断继续输入"figure out"）。
2. `onEnglishInput` 的 `shouldAutoUpdateCategory` 加了 `!hasUserChangedCategory` 条件，用户手动选过类别后，英文继续变化时不再自动识别类别，导致类别与内容不匹配引发误拦截（如输入"figure out"但类别还是"单词"，弹出"单词类别请只填一个词"error）。

### 修改内容

| 文件 | 改动 |
|---|---|
| `pages/add/add.js` | 新增 `endsWithWhitespace` helper；`runInputAnalysis` 删除 `form.englishText` 回写块；`onEnglishInput` 移除 `!hasUserChangedCategory` 条件，新增末尾空白检测；`onEnglishBlur` 新增规范化回写后再触发分析 |
| `scripts/test-add-input-validation-cases.js` | 替换旧 T1-T23 触发条件测试，新增 R/BL/W/AC 四组测试（共 26 个用例），总用例数 219 |
| `docs/add-input-validation-product-rules.md` | 更新"分析前规范化"章节为"输入中不回写 + blur 后规范化"；更新"自动类别识别"移除 hasUserChangedCategory 阻断说明 |
| `docs/product-features.md` | 更新英文内容规范化、自动类别识别、英文分析触发时机三段描述 |
| `docs/current-phase.md` | 新增本阶段记录 |

### 新行为

1. **输入中不回写：** `runInputAnalysis` 只更新 `latestEnglishForSuggest` / loading 状态，不修改 `form.englishText`。
2. **末尾空白跳过分析：** 输入以空白字符结尾时，清除 `suggestionTimer`，不设 `isValidatingEnglish: true`，不发起后端分析。
3. **blur 后规范化回写：** `onEnglishBlur` 计算 `normalizeEnglishText(rawText)`，若与原值不同则回写，然后触发 `runInputAnalysis(normalizedText, category)`。
4. **自动类别恢复：** 新增卡片时，`shouldAutoUpdateCategory` 不再检查 `hasUserChangedCategory`，英文每次变化都重新按内容识别类别。

### 未改内容

- 后端接口、数据库 schema 不变
- 保存前 `normalizeEnglishText` 规则不变（`submitCard` 路径不变）
- 后端 `normalizedText` 仍不回写英文输入框
- 复习规则、4 档反馈、回炉逻辑、`ReviewSession`、`review_state` 不变
- `today_review_status` 页面不变
- 编辑卡片时的 `isEdit = true` 类别保护逻辑不变

---

## Release-Control-Docs-Completeness — 完善发布控制文档

**提交：** frontend completed（commit hash 由提交后汇报，不预写进文档）
**类型：** docs only — 本阶段只改文档，未改业务代码，不代表实际完成部署

### 修改文件

| 文件 | 主要改动 |
|---|---|
| `docs/roadmap.md` | 新增 P0-6 ~ P0-13（发布合规、安全、备份、登录隔离、AI 降级、灰度、回滚）；修正 P1-5/P1-6 pending commit（git log 核实均已提交）；新增 P1-7 ~ P1-11（日志、监控、告警、限流、反馈入口）；扩充 P2；**新增** P0-14 审核材料准备（从 P1-11 提升）；**新增** P0-15 发布前仓库清洁检查；**扩充** P0-1 systemd/Nginx 细节（EnvironmentFile、restart 策略、proxy headers、proxy_read_timeout）；**明确** P0-9 SQLite fallback 为人工确认项，P1-1 代码断言计划后续加入但本次未实现 |
| `docs/release-checklist.md` | 修正 session 创建接口路径为 `/api/review-sessions`；**全量核实** 9 个生产接口路径（通过 grep `app/routers/` 和 `app/main.py`）；**新增** 接口 `/api/reviews/today-reviewed`、`/api/reviews/history`、`/api/reviews/history/summary`；**新增** 零节：发布前仓库清洁检查；**具体化** 离线验收预期（去除"或"歧义，以代码中实际文案为准）；**新增** 二十四节：审核提交前检查；**补充** 一节 systemd/Nginx 验证项 |
| `docs/ai-working-rules.md` | 新增 Audit-Then-Hotfix 模式；收紧 Readonly Audit Bash 白名单；明确"允许提交"与"要求提交"的区别；新增"关键事实以代码为准"和"发布/部署任务特殊规则"两节；移除 commit message 模板中的硬编码模型版本；**新增** 十一节：禁止主动重命名核心文档；**新增** 十二节：路径兼容规则；**新增** 十三节：current-phase 状态规则 |
| `docs/current-phase.md` | 修正本节文件路径（从数字前缀恢复为原始路径）；记录本次补充重点；明确 pending 状态 |

### 重点修正（以代码/git log 核实）

| 修正项 | 核实方式 | 结果 |
|---|---|---|
| session 创建接口路径 | grep `review_sessions_router` + main.py `include_router` | 真实路径为 `POST /api/review-sessions`（`reviews.py:58+1153`） |
| `/api/reviews/today-reviewed` | grep `@router.get` in `reviews.py` | 真实路径存在（`reviews.py:1447`） |
| `/api/reviews/history` | grep `@router.get` in `reviews.py` | 真实路径存在（`reviews.py:838`） |
| `/api/reviews/history/summary` | grep `@router.get` in `reviews.py` | 真实路径存在（`reviews.py:962`） |
| `POST /api/analyze-english` | grep `app/main.py` | 真实路径存在（`main.py:30`） |
| 前端 pending commits | `git log --oneline` 核实 | 7 个 pending phase 全部已提交（e3009f9 / 1008751 / 537bc56 / e99aaab / 4d2caa4 / b753bf1 / 9143346） |
| 后端 pending commit | `git log --oneline` 核实 | extend-batch-size-options 已提交 121b565 |
| 离线 toast 文案 | grep `pages/add/add.js`、`pages/index/index.wxml` | 首页离线提示实际文案为"网络恢复后会更新学习记录"；保存 toast 为"已保存"/"已更新" |

### 本次补充重点（2026-05-27 第二轮）

1. **恢复原始 docs 文件路径**：将数字前缀文件（01roadmap.md 等）迁回原始路径（roadmap.md 等），删除数字前缀文件
2. **补充审核材料准备**：从 P1-11 提升为 P0-14，包含名称/图标/简介/类目/版本说明/隐私指引/审核说明/截图
3. **明确 SQLite fallback 人工确认**：P0-9 明确为人工确认步骤，P1-1 明确代码断言计划后续加入但本次未实现
4. **补充 systemd / Nginx 细节**：P0-1 和 release-checklist 一节新增 EnvironmentFile、Restart 策略、proxy headers、proxy_read_timeout
5. **补充发布前仓库清洁检查**：P0-15 + release-checklist 零节
6. **接口路径全量核实**：通过 grep router 代码核实 9 个接口路径，release-checklist 十五节补充 today-reviewed、history、history/summary
7. **禁止主动重命名核心文档**：ai-working-rules 十一/十二/十三节

### 未改内容

- 业务代码（JS/WXML/WXSS/Python）不变
- 数据库 schema 不变，无新增 migration
- 复习规则、4 档反馈、回炉逻辑不变
- `today_review_status` 页面不变
- `docs/product-features.md` 不变（从 git HEAD 原始恢复，无内容改动）
- 本次文档描述的发布步骤均为"待执行"，不代表已部署或已配置

---

## Release-Planning-Docs — 发布前项目控制文档

**提交：** frontend pending
**类型：** docs only — 不涉及任何业务代码改动

### 新增文档

| 文档 | 说明 |
|---|---|
| `docs/roadmap.md` | P0/P1/P2 发布路线图；P0 最大阻断项为生产 HTTPS 后端、微信合法域名、前端 BACKEND_BASE_URL |
| `docs/release-checklist.md` | 人工验收清单（15 大类，覆盖部署、域名、添加卡片、首页、复习、四档反馈、回炉、今日看过、历史、设置、离线、真机、接口验证） |
| `docs/ai-working-rules.md` | Claude Code 工作规则（必读顺序、任务模式、验证命令、强禁区、提交规则、文档更新时机） |

### 本次 docs 覆盖的背景

基于 2026-05-27 对 `English-analyzer-backend` 的只读审查，主要发现：
- `app/database.py` 有 SQLite 静默 fallback（P0 风险）
- `alembic.ini` 硬编码 SQLite URL（被 `env.py` 运行时覆盖，P1 级别）
- `app/main.py` 无 CORS middleware（小程序不需要，P2 级别）
- 无 systemd 服务文件、无 Nginx 配置（P0 运维项）
- `utils/apiClient.js` BACKEND_BASE_URL 仍为 `http://127.0.0.1:8001`（P0 发布阻断）

### 未改内容

- 业务代码（JS/WXML/WXSS/Python）不变
- 数据库 schema 不变，无新增 migration
- 复习规则、4 档反馈、回炉逻辑不变
- `today_review_status` 页面不变
- apiClient.js 后端地址不变（发布前由 P0-4 专项处理）

---

## extend-batch-size-options — 每次看几张扩展为 3 / 5 / 10 / 15 张

**提交：** frontend pending / backend pending
**测试：** `scripts/test-review-batch-size.js`，53 个用例全部通过

### 根因 / 原限制

"每次看几张"选项列表在以下位置硬编码为 `[3, 5, 10]`：
- `pages/settings/index.js` — `DAILY_GOAL_OPTIONS` / `DAILY_GOAL_LABELS`
- `pages/settings/index.wxml` — picker `range` 内联字符串
- `pages/index/index.js` — `DAILY_GOAL_OPTIONS` + `dailyGoalToLimit`（仅映射到 10）
- `pages/today_review_status/today_review_status.js` — `DAILY_GOAL_OPTIONS`（15 会 fallback 到 5）
- `scripts/test-review-batch-size.js` — 测试常量
- 后端 `app/services/review_rules.py` — `VALID_DAILY_GOALS = {3, 5, 10}`（15 被 fallback 到 5）

### 修改

| 文件 | 改动 |
|---|---|
| `pages/settings/index.js` | `DAILY_GOAL_OPTIONS` / `DAILY_GOAL_LABELS` 增加 15；`data` 新增 `dailyGoalLabels` |
| `pages/settings/index.wxml` | `range` 从内联字符串改为 `{{dailyGoalLabels}}` 数据绑定 |
| `pages/index/index.js` | `DAILY_GOAL_OPTIONS` 增加 15；`dailyGoalToLimit` 增加 `15 → 15` 分支 |
| `pages/today_review_status/today_review_status.js` | `DAILY_GOAL_OPTIONS` 增加 15 |
| `scripts/test-review-batch-size.js` | 测试从 37 个扩展到 53 个（含 dailyGoal=15 全覆盖） |
| `app/services/review_rules.py` | `VALID_DAILY_GOALS = {3, 5, 10, 15}` |

### 产品规则

| 选项 | 前端保存值 | 后端 limit | 说明 |
|---|---|---|---|
| 3 张 | 3 | 5 | 后端最小合法 limit 为 5；`daily_suggested` 通过 `daily_goal=3` 控制实际数量 |
| 5 张 | 5 | 5 | 直接映射 |
| 10 张 | 10 | 10 | 直接映射 |
| 15 张 | 15 | 15 | 直接映射；`VALID_LIMITS = {5, 10, 15}` 已包含 15 |

### 默认值、非法值、未完成 session

- 默认值：5（不变）
- 非法值（0 / 1 / 7 / 20 / abc / undefined）：fallback 到 5（不变）
- 有未完成 session 时点击"继续查看"直接跳转原 session，不受新设置影响（不变）
- 当前卡片不足时实际 session 返回更少卡片，不算 bug（不变）

### 不做的内容

- 不做自由输入、不做"自定义"选项、不做 20 张选项
- 不做根据卡片数量动态显示或隐藏选项
- 不改数据库 schema，不新增 migration

### 未改内容

- 4 档反馈、回炉逻辑、`review_state` 枚举、`ReviewSession`、调度链不变
- Phase 8J repeat item cap 不变
- `apiClient.js` 后端地址不变

---

## fix-review-batch-size — 每次看几张设置对所有 session 生效

**提交：** frontend pending
**测试：** `scripts/test-review-batch-size.js`，37 个用例全部通过

### 根因

`pages/index/index.js` 中 `handleStartReview`、`doCreateNewOnlySession`、`_tryCreateSession` 三处创建 session 时 `limit` 硬编码为 `5`。导致：

- `daily_suggested`：不受影响，因为 `daily_goal` 字段才是后端决定 batch size 的依据，`daily_goal: readDailyGoal()` 已正确传入；但 daily goal 已达成后的"加量"session 会错用 limit=5。
- `new_only` / `free_review`：完全忽略用户设置，始终创建 5 张 session。用户选 10 张时只能得到 5 张。

### 修复

新增辅助函数 `dailyGoalToLimit(goal)`，将用户设置映射到后端合法值（`VALID_LIMITS = {5, 10, 15}`）：

| dailyGoal | limit 传参 | 说明 |
|---|---|---|
| 3 | 5 | 后端不支持 limit=3，5 是最小合法值 |
| 5 | 5 | 直接映射 |
| 10 | 10 | 直接映射 |

三处 `limit: 5` 统一改为 `limit: dailyGoalToLimit(readDailyGoal())`。

### 验收

- 设置 3：`daily_suggested` 得 3 张（由 `daily_goal=3` 控制）；`new_only`/`free_review` 得 5 张（后端最小值）
- 设置 5：所有类型得 5 张 ✓
- 设置 10：所有类型得 10 张 ✓
- 有未完成 session 时点击"继续查看"直接跳转原 session，不重建 ✓

### 修改文件

- `pages/index/index.js` — 新增 `dailyGoalToLimit`；3 处 `limit: 5` → `limit: dailyGoalToLimit(readDailyGoal())`
- `scripts/test-review-batch-size.js` — 37 个测试（dailyGoal 解析 + picker 映射 + session payload 构造）

### 未改内容

- 设置页（`pages/settings/index.js`、`index.wxml`）链路本来就正确，未改
- 后端 review_rules.py / reviews.py 不变（`VALID_DAILY_GOALS = {3,5,10}` 已支持所有合法值）
- 4 档反馈、回炉逻辑、`review_state` 枚举、`ReviewSession`、调度链不变
- `apiClient.js` 后端地址不变

---

## Phase 8G-add-input-validation-ux-polish — 添加页英文输入校验 UX 精细化

**提交：** frontend `6eab0c2`（validation UX）+ `f86d3e1`（copy inventory）
**文档：** `docs/add-input-validation-product-rules.md`（Phase 8G 更新版）、`docs/add-page-copy-inventory.md`（文案盘点）
**测试：** `scripts/test-add-input-validation-cases.js`，109 用例全部通过

### 一、前端本地校验规则重写（全部 6 条，均为 error，均阻止保存）

| 规则 | 触发条件 | 文案 | 阻止保存 |
|---|---|---|---|
| 空内容 | trim 后为空 | `英文内容为空` | 是 |
| 包含中文 | 含任何 CJK 表意文字 | `英文内容请只填写英文` | 是 |
| 完全无英文 | 无拉丁字母（纯数字/纯符号） | `请输入英文内容` | 是 |
| 超长 | > 500 字符 | `内容较长，建议拆分后再保存` | 是 |
| 单词类别多词 | category=单词 且词数 ≠ 1 | `单词类别请只填一个词` | 是 |
| 短语类别单词 | category=短语 且词数 < 2 | `短语类别至少需要两个词` | 是 |

**中文检测优先于"无英文"判断：** 纯中文 → "英文内容请只填写英文"；纯数字/纯符号 → "请输入英文内容"。

阈值常量：`MAX_ENGLISH_CHARS = 500`。不再有 `CHINESE_WARN_MAX_CHARS`（已删除）。

### 二、后端异步分析展示规则

后端分析 fire-and-forget，不阻止保存：
- **后端 error：不展示。** 不透传原文，不降级为 warning。
- 后端 warning：正常展示为 warning。
- 网络失败：hint "网络暂时不稳，可以先保存"。
- **红色 error = 只有前端本地 error 才显示。**

### 三、拼写提示降级

| 后端拼写提示类型 | 处理结果 | 展示内容 |
|---|---|---|
| 有 correction（`你是不是想写 "X"`） | → hint | `也可能是：X。确认原词没问题的话，可以继续保存` |
| 无 correction（人名/品牌/专有名词提示） | → 隐藏 | 无提示 |

拼写 hint **不隐藏**参考理解区（`shouldSkipMachineSuggestionForUnknownSingleWord` 仅由"词典未收录"类警告触发）。

### 四、网络失败文案统一

| 旧文案 | 新文案 |
|---|---|
| `网络不可用，暂未完成增强分析。` | `网络暂时不稳，可以先保存` |
| `请检查网络，可先保存。` | `网络暂时不稳，可以先保存` |
| `暂未发现明显问题，请检查您的网络，可先保存。` | `网络暂时不稳，可以先保存` |

保存成功 toast：新增 → `已保存`；编辑 → `已更新`（Phase 8G 验证仍正确，未改）。

### 五、analysisWarnings 决策

`getAnalysisProblems`（读取 `analysisWarnings` 的函数）从未被调用（Phase 6G 决策）。
Phase 8G 决策：**停止写入用户可见文案**到 `analysisWarnings`：
- 后台分析失败时：`analysisWarnings: []`（不再写入 `'分析暂时失败，可稍后重试'` 等文案）

### 六、100 个测试用例

**文件：** `scripts/test-add-input-validation-cases.js`
**总数：** 109（100 主用例 + 4 拼写 hint 转换 + 5 边界）

| 类别 | 编号 | 说明 |
|---|---|---|
| A. 空/无效输入 | 1-10 | 空字符串、纯空格、纯中文、纯数字、纯符号 |
| B. 正常英文单词 | 11-20 | hello/clutch/go/be/in 等 |
| C. 短语 | 21-30 | break a leg/pick up 等 |
| D. 句子/段落 | 31-40 | 带标点、100-500 字符、超长 |
| E. 连字符词 | 41-50 | well-known/state-of-the-art 等 |
| F. 字母数字词 | 51-60 | COVID-19/GPT-4/5G/B2B 等 |
| G. 缩写 | 61-70 | U.S./e.g./Dr./vs. 等 |
| H. 中英混合 | 71-80 | 含中文 → error "英文内容请只填写英文" |
| I. 中英混合（较多中文） | 81-90 | 含中文 → error "英文内容请只填写英文" |
| J. 标点/emoji/边界 | 91-100 | 全角标点不计汉字 |

### 七、未改内容

- 后端 `validator.py` / `analyzer.py` 不变
- 后端数据库 schema 不变
- `review_state` / `ReviewSession` / 4 档反馈逻辑不变
- `Hunyuan → TMT → None` 例句生成链路不变
- `today_review_status` 页面不变
- `detectEnglishCategory` 自动分类逻辑不变

### 八、Phase 8G-hotfix-copy-inventory（`f86d3e1`）

- 超长文案统一为：`内容较长，建议拆分后再保存`
- 新增 `docs/add-page-copy-inventory.md`，文案盘点共 54 条
- 后端 error 不展示（Phase 8G 规则确认）
- 文案盘点后仅保留"保存失败 / 更新失败 / 删除失败"等标准失败 toast
- 保存成功 toast：新增 → `已保存`；编辑 → `已更新`（保留不改）

---

## Phase 8B — Initial AI Example Sentence Chain

### 概述

在 Add/Edit 页实时分析英文输入时，后端返回 `exampleSentence` / `exampleTranslation`，
前端映射到 `aiExampleSentence` / `aiExampleTranslation` 并在 suggestion-box 中展示。
例句仅实时展示，不持久化到 card，不改数据库 schema。用户可点击"采用到备注"将例句追加到 note。

### 阶段链

**8B 初版**（`5137767` frontend / `88062e1` backend）
- 后端接入 Free Dictionary API (`api.dictionaryapi.dev`) 获取真实英文例句，TMT 翻译为中文。
- 前端新增 `aiExampleSentence` / `aiExampleTranslation` state，在 suggestion-box 中展示。
- 前端 `adoptNoteExample()` 将例句追加到备注。
- `5137767` 同时包含复习页来源上移（Phase 8A）。

**8B-hotfix**（`60b2d3d` frontend）
- 初版错误地将 `form.englishText`（用户输入本身）当作 AI 例句。
- 修复：使用后端返回的真实 `exampleSentence` / `exampleTranslation`。

**8B-hotfix-2 — TMT 兜底**（`88062e1` backend，与 Free Dictionary 同 commit）
- Free Dictionary 不可用时，用中文翻译构造模板句 → TMT zh→en → 验证 → 采纳。
- 常用动词/形容词效果好；基础词（go/be/have）因 TMT 同义词替换可能验证不通过，静默返回 None。

**8B-hotfix-3 — Hunyuan**（`29f9779` backend）
- 新增 `app/services/hunyuan_example.py`，用 Tencent Hunyuan ChatCompletions 生成例句。
- Prompt 要求返回 `{"exampleSentence": "...", "exampleTranslation": "..."}`。
- 校验：两字段非空、例句不等于原词、例句含原词 substring、≥3 词。
- 链路：Hunyuan → TMT fallback → None。

**8B-hotfix-4 — TokenHub 迁移**（`8eac605` backend）
- 从旧腾讯云 SDK 迁移到 TokenHub OpenAI-compatible API (`POST {base_url}/chat/completions`)。
- 新增环境变量：`HUNYUAN_API_KEY`、`HUNYUAN_BASE_URL`、`HUNYUAN_MODEL`。
- 当前服务 ID：`hunyuan-role-latest`。

**8B-hotfix-5 — 直连后端**（`187799b` backend / `51dab96` frontend）
- 问题：云函数 `analyzeEnglish` 默认 3s 超时，TokenHub 返回无法到达前端。
- 后端 `AnalyzeResponse` 补上 `exampleSentence` / `exampleTranslation` 字段。
- 前端 `apiClient.js` 新增 `analyzeEnglishDirect()` 直连 FastAPI（15s timeout）。
- 链路优先级：直连后端 → 云函数兜底 → 离线返回。

**8B-hotfix-5c — TokenHub 诊断日志**（`637fad2` backend）
- TokenHub API key 被 `api.hunyuan.cloud.tencent.com` 返回 HTTP 401。
- 新增诊断日志：API key 配置状态、base_url/model、HTTP status、choices/content/JSON 解析状态。

**8B-hotfix-5d — Validation 失败重试**（`b1c96d8` backend）
- 问题：模型有时生成 inflection（craving 而非 crave），validation 丢弃有效例句。
- 修复：首次调用允许 inflection → 若 `text not in sentence`，用严格 prompt 重试一次（禁止变形/同义词）。
- 最多重试一次，其他失败原因不重试，直接走 TMT fallback。

**8B-hotfix-6 — 参考区 UI 合并 + strict prompt 加强**（`018fc36` backend / `b7d3f56` frontend）
- "参考理解"和"AI 例句"两个区域合并为一个"参考"区。
- "采纳建议"和"采用到备注"合并为"全部填入"，一键写入理解和备注。
- 备注格式简化为：例句英文 + 换行 + 中文翻译。
- retry prompt 明确禁止 -ing/-ed/-s 等变形。

**8B-hotfix-7 — 例句字体 + crave 词形兜底**（`2d7ef6f` backend / `3f4d303` frontend）
- AI 例句英文取消斜体。
- crave 优先原词匹配，允许常见词形变化（+s/+es/+d/+ed/+ing 等）兜底。
- strict 模式仍只要 exact substring match。

---

## Phase 8C — Review UI Polish

**提交：** frontend `731ca47` polish review reveal and overachieved status UI
**文档：** frontend `c1aaf2c` document review UI hotfix phase 8C

### A. 查看理解按钮降级
- `pages/review/review.wxss`：`.reveal-btn` 从绿色实心主按钮降为白底 + 绿色描边次级按钮。
- 新增 `.reveal-btn:active` 浅绿背景反馈。

### B. 卡片展开去内部滚动条
- `pages/review/review.wxml`：展开区 3 个 `scroll-view` 替换为普通 `view`。
- `pages/review/review.wxss`：`.task-card-open` 改为 `height: auto; overflow: visible`。
- 卡片展开后自然撑高，页面整体滚动。

### C. 超额完成状态层级调整
- `pages/today_review_status/today_review_status.js`：`overachieved` 分支真实完成数作为主信息，目标 5/5 作为副信息。
- `all_done` 分支（恰好达标）不变。

### 未改
review session / feedback / dailyGoal 业务逻辑、接口、数据结构、历史页。

### Phase 8C-first-mini — 首页按钮主次调整
**提交：** frontend `51f7d21` make add card primary home action

- 添加卡片升级为绿色渐变主按钮（flex:2，≈66% 宽）。
- 复习入口降为白色次按钮（flex:1，≈34% 宽）。

---

## hotfix-bulk-action-position — 批量管理操作区位置调整

**提交：** frontend pending

### 变更内容

#### 批量管理操作区从页面顶部移动到筛选区下方、卡片列表上方

**根因：** `.manage-toolbar-fixed` 使用 `position: fixed; top: 0rpx`，导致长按进入批量管理后工具栏固定在屏幕顶部。

**修复（仅 WXSS）：**
- 移除 `position: fixed`、`left`、`right`、`top`、`z-index` 属性。
- 改为 `margin-top: 16rpx` 内联布局，自然流入在筛选 tabs 下方、卡片列表上方。
- `.manage-toolbar-spacer` 从 `height: 252rpx` 改为 `height: 0`（不再需要为 fixed 占位）。

**WXML 不变：** 工具栏的 DOM 位置原本已在类型筛选后、卡片列表前，无需移动。

### 未改

- 批量选择逻辑（`onCardLongPress`、`selectAllCards`、`isManageMode`）不变。
- 批量删除逻辑（`handleBatchDelete`）不变。
- 退出管理逻辑（`exitManageMode`）不变。
- 卡片点击、筛选、搜索逻辑不变。
- 后端、数据库、复习规则不变。

---

## Phase 8C-status-icons-and-session-size-copy — 状态图标与"每次看几张"文案

**提交：** frontend `8d8a2af` adjust status icons and session size copy

### 修改文件

- `pages/index/index.js`
- `pages/index/index.wxml`
- `pages/index/index.wxss`
- `pages/settings/index.wxml`
- `pages/today_review_status/today_review_status.wxml`
- `pages/today_review_status/today_review_status.js`
- `docs/current-phase.md`

### A. 卡片右上角状态 pill 改为图标

- 卡片右上角状态 pill 不再显示文字，改为"颜色 + 小图标"弱提示：
  - `new` / 待学习：灰色 + `○`
  - `reviewing` / 复习中：蓝色 + `◑`
  - `strengthening` / 待加强：琥珀色 + `!`
  - `mastered` / 已掌握：绿色 + `✓`
- 这只是用户可见展示调整，未改 `review_state` 枚举和筛选逻辑。

### B. 首页状态筛选保留文字 + 图标 + 颜色

- 首页状态筛选 pill 保留轻量文字，不做纯颜色块：
  - 全部
  - ○ 新卡
  - ◑ 熟悉中
  - ! 有点忘
  - ✓ 记得

### C. "每日目标"用户可见文案改为"每次看几张"

- 设置页 picker 文案从"每日目标"改为"每次看几张"。
- `today_review_status` 遗留文案调整：
  - "今日目标" → "本次"
  - "每日目标 X 张" → "每次看 X 张"
  - `offline_cached` 标题"今日目标：X 张" → "共 X 张"
  - `all_done` 子标题"今日目标已完成" → "今天的复习完成了"
- 底层 `dailyGoal` key、变量名、存储逻辑未改，避免大重构。

### 未改

- 后端、数据库 schema 不变。
- `review_state` 枚举和筛选逻辑不变。
- review session / feedback / dailyGoal 业务逻辑不变。
- 复习调度规则（daily_suggested / new_only / free_review）不变。

---

## Phase 8D-hotfix — Example Generation Cache & Translation Gate

**提交：**
- backend `211d57e` fix example generation cache and translation gate
- frontend `365fe20` fix example generation cache and translation gate
- frontend `c331c81` document Phase 8D-hotfix example generation fixes

### 问题 1（前端缓存写入）
`setAnalyzeCacheItem` 把 `exampleSentence` 为空的 word/phrase 分析结果写入 30 天缓存。Hunyuan 暂时故障时，用户的某个词会被封印"无例句"状态长达 30 天。

**修复：** word/phrase 且 `exampleSentence` 为空时，跳过缓存写入。sentence/paragraph 缓存行为不变。

### 问题 2（后端 translation gate）
`analyzer.py` 中 `if category in ("word", "phrase") and translation:` —— translation 为空时跳过 Hunyuan，但 Hunyuan 的 `chinese_meaning` 参数为可选，不依赖 translation。

**修复：** 改为 `if category in ("word", "phrase")`。TMT fallback 仍用 `elif translation` 保护（TMT 需要中文翻译构建模板句）。

### 测试
9 个单元测试覆盖 translation 有无时 Hunyuan/TMT 调用行为。192 passed。

---

## Phase 8E-diagnostic — Example Generation Failure Diagnostic Logging

**提交：**
- backend `d185306` add diagnostic logs for example generation failures
- backend `06b297f` docs: record Phase 8E-diagnostic — diagnostic logging only

### 目的
在不改变任何业务逻辑的前提下，添加结构化诊断日志，定位例句生成失败的具体原因。

### fail_reason 代码

| Code | Trigger |
|---|---|
| `model_api_error` | Non-200 HTTP、无 API key、异常 |
| `model_timeout` | `requests.exceptions.Timeout`（15s） |
| `empty_response` | 无 choices 或 content 为空 |
| `json_parse_failed` | 无 `{}` 或 `JSONDecodeError` |
| `missing_example_sentence` | `exampleSentence` / `exampleTranslation` 为空 |
| `exact_match_failed` | strict 模式：原词不在句子中 |
| `too_few_words` | 句子 < 3 token |
| `loose_match_failed` | loose 模式：词形不在句子中 |
| `tmt_fallback_failed` | 所有 TMT 模板翻译均失败 |

### 日志格式
```
[hunyuan][diag] start | text='clutch' | mode=strict | has_translation=True
[hunyuan][diag] pass | text='clutch' | mode=strict | sentence='She clutched her bag tightly.'
[tmt][diag] fail_reason=tmt_fallback_failed | text='commit guilty' | all templates failed
```

- 所有 [hunyuan][diag] / [tmt][diag] 行使用 `key=value` 格式，便于 grep。
- API keys / tokens / headers 不输出。
- Raw response 截断至 300 字符。
- sentence/paragraph 仍不进入例句生成，缓存行为不变。

---

## Phase 8H — Full-Coverage Diagnosis & Stale Cache / Hyphen Fix

**提交：**
- backend `ef4f946` fix example generation coverage for common word patterns
- backend `533eca9` document Phase 8H diagnostic and fix results
- frontend `8d10689` fix stale cache eviction for word/phrase with empty example sentence
- frontend `1018f65` document Phase 8H diagnostic and fix results

### 诊断结论
建立样本矩阵，真实诊断 clutch、crave、break a leg、well-known、full-time、follow-up 等词的完整链路：

- **clutch / crave / break a leg**：模型链路正常（Hunyuan strict 直接通过），根因是 **stale cache**。Phase 8D-hotfix 只修了写入侧（新空结果不写入），但旧缓存中已存在的无例句条目读取时仍被返回。
- **well-known / full-time / follow-up / e-mail / co-worker 等连字符词**：validator.py Rule 3 分类 bug —— 含连字符被硬判 `unknown`，不进入 Hunyuan。

### 后端修复（`ef4f946`）
- `validator.py` Rule 3：允许纯字母+连字符（无数字）的合法复合词进入正常分类，不再硬判 `unknown`。
- `2024` / `100-200` / `-50` 仍为 `unknown`（含数字或无字母）。
- 新增 35 单元测试（分类 + 例句链路），218/218 passed。

### 前端修复（`8d10689`）
- `getAnalyzeCacheItem` 读取侧修复：word/phrase 且 `exampleSentence` 为空的旧缓存条目 → 丢弃，触发新请求。
- 清除 Phase 8D 前写入的旧 stale 缓存。

### 未改
Hunyuan prompt、model、温度、TMT fallback 模板、例句持久化、数据库 schema。

---

## Phase 8I — Alphanumeric Classification, Abbreviation Detection & Example Morphology Matching

**提交：**
- backend `54db753` fix alphanumeric classification and example morphology matching
- backend `c721ff5` docs: record Phase 8I fixes in current-phase.md

### 一、分类修复

**`_classify_text` no-space 分支重写**（`app/services/validator.py`）

旧 Rule 3 只允许纯字母连字符词，含数字一律 `unknown`。新规则：

```
无空格输入 → 检查是否全由 [A-Za-z0-9.\-'']+ 组成
  → 不是（含 # / @ ! 等）→ unknown
  → 是，但无英文字母 → unknown
  → 是，有英文字母，末尾有 . 且满足 _is_abbreviation_like → word（绕过 SENTENCE_END_RE）
  → 其他 → word
```

**新函数 `_is_abbreviation_like(text)`**：判断缩写句点模式——末尾有 `.`，所有点分段均为 1-4 个字母。

### 二、分类对照

| input | old | new | 例句 |
|---|---|---|---|
| COVID-19 | unknown | **word** | Y |
| 5G | unknown | **word** | Y |
| B2B | unknown | **word** | Y |
| GPT-4 | unknown | **word** | Y |
| U.S. | sentence | **word** | Y |
| e.g. | sentence | **word** | Y |
| Dr. | sentence | **word** | Y |
| well-known | word | word | Y（Phase 8H 已修复） |
| #N/A | phrase | **unknown** | N |
| 2024 | unknown | unknown | N |

### 三、测试
- 新增 51 个测试（AlphanumericClassificationTest、AlphanumericExampleChainTest、ExampleValidationTest）。
- 更新 2 个旧测试（`test_covid19_is_unknown` → `test_covid19_is_word` 等）。
- 全量：86/86 unit + 269/269 全量通过。

---

## Phase 8H-small-hotfix — English Content Normalization Stabilization

**提交：** frontend `434a669`

### 一、增强前端 normalizeEnglishText

`pages/add/add.js` 中的 `normalizeEnglishText` 从原来 4 步增强为 10 步。详见 `docs/add-input-validation-product-rules.md`。

### 二、停止后端 normalizedText 自动回写

- `applyAnalysisToPage` 中删除了 `shouldApplyBackendNormalizedText` 逻辑
- 后端 `normalizedText` 不再写回 `form.englishText`

### 三、测试

**原有测试：** 109（Phase 8G）
**新增测试：** 50（45 个规范化纯函数 + 5 个 error 规则验证）
**总测试数：** 159

---

## Phase 8H-hotfix — Local Normalize Before Analysis & Auto-Category Restore

**提交：** frontend `0d5ff0c`

### 问题 1：输入框不显示规范化后的英文

`runInputAnalysis` 虽然用 `normalizedText` 做分析，但从不更新 `form.englishText`。

**修复：** `runInputAnalysis` 入口处计算 `normalizedText`，若与当前 `form.englishText` 的规范化结果不同，则通过 `setData` 更新 `form.englishText`。

### 问题 2：缩写句点误判为句子

**修复：** 末尾 `.` `!` `?` 检查增加一步：去掉末尾标点后若无空格 → 视为单词/缩写，返回 `单词`；有空格 → 返回 `句子`。

**总测试数：** 193

---

## Phase 8H-hotfix-real-validation — Fix runInputAnalysis Normalize Trigger Condition

**提交：** frontend `6adccf1`

### 根因

`runInputAnalysis` 写回条件 bug：两边都 normalize，始终相等，写回从未触发。

**修复：** 改为比较原始 `form.englishText` 与 `normalizedText`。

**总测试数：** 211

---

## Important Commits

### Backend（English-analyzer-backend）

| Commit | Phase | Description |
|---|---|---|
| `edc945b` | 8J | cap repeat review item from restoring mastered |
| `54db753` | 8I | fix alphanumeric classification and example morphology matching |
| `c721ff5` | 8I | docs: record Phase 8I fixes in current-phase.md |
| `ef4f946` | 8H | fix example generation coverage for common word patterns |
| `533eca9` | 8H | document Phase 8H diagnostic and fix results |
| `d185306` | 8E | add diagnostic logs for example generation failures |
| `06b297f` | 8E | docs: record Phase 8E-diagnostic — diagnostic logging only |
| `211d57e` | 8D | fix example generation cache and translation gate |
| `2d7ef6f` | 8B-7 | relax crave validation — exact word first, inflection fallback |
| `018fc36` | 8B-6 | tighten Hunyuan strict retry prompt |
| `b1c96d8` | 8B-5d | retry Hunyuan example generation on validation failure |
| `637fad2` | 8B-5c | fix TokenHub example generation diagnostics |
| `187799b` | 8B-5 | add exampleSentence/Translation to AnalyzeResponse |
| `8eac605` | 8B-4 | migrate Hunyuan example generation to TokenHub |
| `29f9779` | 8B-3 | add Hunyuan example sentence generation |
| `88062e1` | 8B-2 | fix AI generated example sentences (Free Dictionary + TMT) |

### Frontend（English-study-miniapp）

| Commit | Phase | Description |
|---|---|---|
| `6adccf1` | 8H-hotfix-real-validation | fix runInputAnalysis normalize writeback trigger condition |
| `0d5ff0c` | 8H-hotfix | local normalize before analysis + auto-category detection fix |
| `434a669` | 8H-small-hotfix | English content normalization (10-step) + stop backend normalizedText writeback |
| `f86d3e1` | 8G-hotfix-copy-inventory | copy inventory, long-content copy unification |
| `6eab0c2` | 8G | rewrite add input validation UX rules |
| `e607bc3` | 8E-cleanup | clean up dead home and history code |
| `8d10689` | 8H | fix stale cache eviction for word/phrase with empty example sentence |
| `1018f65` | 8H | document Phase 8H diagnostic and fix results |
| `365fe20` | 8D | fix example generation cache and translation gate |
| `c331c81` | 8D | document Phase 8D-hotfix example generation fixes |
| `731ca47` | 8C | polish review reveal and overachieved status UI |
| `c1aaf2c` | 8C | document review UI hotfix phase 8C |
| `51f7d21` | 8C-mini | make add card primary home action |
| `3f4d303` | 8B-7 | polish AI example font and relax crave validation |
| `b7d3f56` | 8B-6 | refine AI reference fill behavior |
| `51dab96` | 8B-5 | prefer backend analyze over cloud function |
| `60b2d3d` | 8B-hotfix | fix AI example generation for note adoption |
| `5137767` | 8B | implement review source prominence and AI example note adoption |
