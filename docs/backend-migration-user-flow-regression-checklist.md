# 后端化迁移用户功能回归清单 v0.1

> **说明**：这是一份 v0.1 基线，基于旧版功能基线、当前代码和已有 docs 编写，不保证覆盖旧版所有功能。后续发现遗漏功能时可继续补充。
>
> **审查方式**：只读审查，不改代码，不提交。
>
> **审查日期**：2026-05-15

---

## 优先级定义

| 级别 | 含义 |
|---|---|
| **P0** | 影响主学习闭环：添加 → 保存 → 进入复习 → 完成复习 → 查看今日/历史记录 |
| **P1** | 影响重要体验但不阻断主流程：筛选、搜索、编辑后局部刷新、入口可达性 |
| **P2** | 体验优化或后续增强：文案、视觉、调试日志、自动化脚本 |

---

## 功能回归清单

### 一、首页卡片库

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 1.1 | 在首页查看全部卡片 | 首页卡片列表展示所有卡片 | `pages/index/index.js` 通过 `refreshBackendCards()` 加载后端卡片，`applyFilters()` 过滤展示 | **PASS** | index.js:871-883, index.wxml:204-245 | — | — |
| 1.2 | 按学习状态筛选卡片（全部/待学习/学习中/待加强/已掌握） | 按状态 tab 筛选 | `LIBRARY_TABS` 5 个 tab，`applyFilters()` 按 `reviewStateV2` 过滤 | **PASS** | index.js:39-45, index.wxml:74-84 | — | — |
| 1.3 | 搜索卡片 | 按英文/理解/备注搜索 | 搜索框在 > 10 张卡片时显示，`onSearchInput` + `applyFilters` | **PASS** | index.wxml:110-129 | — | — |
| 1.4 | 按卡片类型/考试场景/考试模块筛选 | 高级筛选 | `showMoreFilters` 面板，picker 选择 category/examScene/examModule | **PASS** | index.wxml:134-195 | — | — |
| 1.5 | 查看卡片学习状态 | 卡片上显示学习状态标签 | `getCardDisplayStatus()` 返回 `reviewStateV2` 标签（待学习/学习中/待加强/已掌握） | **PASS** | index.js:82-86 | — | Phase 6G 已移除技术状态标签 |
| 1.6 | 添加卡片入口 | 首页有添加按钮 | "添加卡片" 按钮，`goToAddPage()` | **PASS** | index.wxml:23, index.js:1325-1328 | — | — |
| 1.7 | 编辑卡片 | 点击卡片进入编辑 | `openCard(id)` → `/pages/add/add?id=xxx` | **PASS** | index.wxml:215, index.js:1309 | — | — |
| 1.8 | 删除单张卡片 | 长按卡片出删除选项 | `onCardLongPress()` 进入管理模式，选择后 `handleBatchDelete` | **PASS** | index.js:1484-1543 | — | — |
| 1.9 | 批量删除卡片 | 管理模式多选后批量删除 | 管理模式 + `handleBatchDelete()` 调用 `deleteCards()` | **PASS** | index.wxml:197, index.js:1528-1543 | — | — |
| 1.10 | 0 张卡片时的空态/引导 | 无卡片时有合理空态和引导 | `totalCardCount === 0` 时显示引导文案、示例卡片和"添加第一张卡片" | **PASS** | index.wxml:32-64 | — | — |

### 二、添加 / 编辑卡片

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 2.1 | 输入英文内容 | 英文 textarea | `englishText` textarea，`onEnglishInput` 自动检测类别（单词/短语/句子） | **PASS** | add.wxml, add.js `onEnglishInput` | — | — |
| 2.2 | 填写"我的理解" | 理解 textarea | `myUnderstanding` textarea，支持 AI 参考理解采纳 | **PASS** | add.wxml, add.js | — | — |
| 2.3 | 填写补充备注 | 备注 textarea | `notes` textarea，延迟渲染 | **PASS** | add.wxml, add.js `onReady` → `deferNonCriticalReady` | — | — |
| 2.4 | 保存卡片 | 点保存后持久化 | `submitCard()` → `saveCard()` → `addCard()` / `updateCard()` | **PASS** | add.js:1532-1654, recordStorage.js:2121-2149 | — | — |
| 2.5 | 编辑已有卡片 | 打开已有卡片修改 | `onLoad` 检测 `options.id`，加载已有卡片数据，预填表单 | **PASS** | add.js `onLoad` | — | — |
| 2.6 | 修改后返回来源页看到新内容 | 返回后刷新 | 从 review 返回时 `applyEditedCardFromReview(cardId)`，`onShow` 触发 `_refreshCurrentCardFromStorage()` | **PASS** | add.js:1509, review.js:203-208, 797-830 | — | Phase 6G 已修复 |
| 2.7 | 保存失败时不丢失输入内容 | 失败留页 | `saveCard` 失败 toast 提示，`isSaving` 重置，用户留在表单页 | **PASS** | add.js:1473-1479 | — | — |
| 2.8 | 英文内容基础校验 | 空/非英文拦截 | `getLocalValidationResult()` 检查空内容、拉丁字母要求、类别单词数规则 | **PASS** | add.js:338-372 | — | — |
| 2.9 | AI 分析/翻译/理解建议不卡死保存 | 异步分析，保存不依赖分析结果 | `submitCard` 先保存再 `runBackgroundEnglishCheck`（fire-and-forget），分析失败卡片仍可用 | **PASS** | add.js:1633, 1656-1775 | — | — |

### 三、进入复习页

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 3.1 | 有今日待复习 → 进入今日复习 | daily_suggested 按钮 | "进入复习页" 主按钮 → `goToReview()` → `handleStartReview('daily_suggested')` | **PASS** | index.wxml:24, index.js:1330-1353 | — | — |
| 3.2 | 没有今日待复习，但有新卡 → 进入新卡学习 | new_only 入口 | "未学习" tab 内的"学习新卡"按钮 → `handleStartNewOnlySession()` | **PASS** | index.wxml:93-107, index.js:1224-1322 | — | 仅在该 tab 内可见 |
| 3.3 | 没有新卡，但卡片库有卡 → 进入自由复习/全部卡片复习 | free_review 入口 | **`free_review`/strengthening 路径无 UI 入口。** `handleReviewActionTap` 函数存在但 WXML 无绑定。`buildReviewActions` 构建了 strengthening action 但模板不渲染。 | **FAIL** | index.js:1110 `handleReviewActionTap`（死代码），index.wxml 无相关绑定 | **P0** | 需在首页增加 strengthening/free_review 按钮，或让"进入复习页"按钮在 daily 为空时自动降级到 free_review |
| 3.4 | 完全没有卡 → 添加卡片引导 | 引导到 Add 页 | 0 卡状态显示示例卡片和"添加第一张卡片"按钮 | **PASS** | index.wxml:33-64 | — | — |
| 3.5 | 后端返回空 session 时的兜底 | 应有合理降级 | 后端无 session → toast "暂无可学习的卡片"，**无降级路径**（不会自动尝试 new_only 或 free_review） | **PARTIAL** | index.js:1177-1185 | **P0** | 应增加降级链：daily 为空 → 尝试 new_only → new_only 为空 → 提示并引导自由复习 |

### 四、复习过程

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 4.1 | 看到当前复习卡片 | 卡片展示 | `currentCard` 显示英文内容、类别标签、进度 | **PASS** | review.wxml:68-194 | — | — |
| 4.2 | 查看英文内容 | 英文展示 | 英文内容区域，句子用 scroll-view | **PASS** | review.wxml 英文展示区域 | — | — |
| 4.3 | 查看"我的理解" | 点击"查看理解"揭示 | `revealAnswer()` → 设置 `answerVisible: true`，显示理解内容和反馈按钮 | **PASS** | review.js:348, review.wxml | — | — |
| 4.4 | 没有"我的理解"时可在复习中补充 | 点击提示进入编辑 | 无理解时显示"还没有写下你的理解，可以现在补充" → `editCurrentCard()` → Add 页 | **PASS** | review.wxml, review.js:781 | — | Phase 6G 已实现 |
| 4.5 | 复习中编辑卡片 | 点击编辑进入 Add 页 | `editCurrentCard()` → Add 页 `from=review`，返回后 `_refreshCurrentCardFromStorage()` | **PASS** | review.js:781-795, 797-830 | — | Phase 6G 已修复刷新 |
| 4.6 | 编辑后返回复习页看到最新内容 | 当前卡片显示最新数据 | `onShow` 检测 `_returningFromEdit` → `_refreshCurrentCardFromStorage()` | **PASS** | review.js:203-208, 797-830 | — | Phase 6G 已修复 |
| 4.7 | 提交掌握反馈 | forgot/shaky/got_it/fluent | `submitReview()` → enqueue local + POST backend | **PASS** | review.js:362-509 | — | — |
| 4.8 | 一轮复习完成进入总结 | 完成面板 | `allDone: true` → `pageState: 'completed'`，显示总结面板 | **PASS** | review.js:463, review.wxml:195-246 | — | 但总结面板按钮不完整，见 5.x |

### 五、复习完成页 / 今日总结

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 5.1 | 本轮复习总结 | 显示统计 | 完成面板显示 total_review_count、unique_card_count、forgot/shaky/got_it/fluent 四维度 | **PASS** | review.wxml:195-227 | — | — |
| 5.2 | 今日复习概览 | 首页 header 显示 | 首页 header "今天已学习 X 张，还有 Y 张待学习" | **PASS** | index.wxml:4-5 | — | — |
| 5.3 | "查看今日复习内容"按钮 | 复习完成后可查看今日复习过的卡片 | **按钮不存在。** 完成面板只有"继续复习"和"返回首页"。且**没有独立的"今日复习内容"页面**（`app.json` 仅有 5 个页面，无 `pages/today_reviewed` 页）。 | **FAIL** | review.wxml:231-245，app.json 无今日复习页 | **P0** | 需要在完成面板增加"查看今日复习内容"按钮 + 考虑新建或复用已有页面展示今日已复习卡片 |
| 5.4 | "查看历史复习内容"按钮 | 复习完成后可进入历史 | **按钮不存在。** `viewHistoryReviewedContent()` 函数在 review.js:865 定义但未绑定到 WXML。历史页没有任何入口可达。 | **FAIL** | review.js:865-869（死代码），review.wxml 无绑定 | **P0** | 需要在完成面板增加"查看历史复习内容"按钮，绑定 `viewHistoryReviewedContent` |
| 5.5 | 返回首页入口 | 完成面板可返回 | "返回首页"按钮 → `goToHomePage()` | **PASS** | review.wxml:239-244 | — | — |
| 5.6 | 继续复习入口 | 可继续下一轮 | "继续复习"按钮 → `continueReview()` | **PASS** | review.wxml:232-237 | — | — |

### 六、今日复习内容页

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 6.1 | 查看今天已经复习过的卡片 | 独立页面展示今日复习卡片 | **页面不存在。** `app.json` 中没有 `pages/today_reviewed` 页面。首页 header 只显示计数不可点击。 | **FAIL** | app.json 页面列表，index.wxml header 无跳转 | **P0** | 需要新建今日复习内容页，或复用历史页并加"今天"快速筛选 |
| 6.2 | 显示今日复习结果 | 每张卡显示复习结果 | **同上，页面不存在。** | **FAIL** | — | **P0** | 与 6.1 一起处理 |
| 6.3 | 进入卡片查看/编辑 | 从今日复习内容页点卡片进入编辑 | **同上，页面不存在。** | **FAIL** | — | **P0** | — |
| 6.4 | 不可从今日复习页删除 | 删除只能从首页做 | 即使页面不存在，由首页管理删除权限的设计原则仍需遵守 | **UNKNOWN** | — | P1 | 实现时注意不从此页暴露删除入口 |

### 七、历史复习内容页

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 7.1 | 查看历史复习记录 | 独立页面按时间查看 | **页面存在**（`pages/history_reviewed/history_index`），数据加载逻辑完整（`getReviewHistory` + `getReviewHistorySummary`），时间筛选（近7天/30天/全部）、结果筛选（forgot/shaky/got_it/fluent）、搜索功能完备。**但无任何入口可达。** | **PARTIAL** | history_index.js 逻辑完整，但无 WXML/其他页面导航到它 | **P0** | 需要至少一个入口：复习完成面板的"查看历史复习内容"按钮 |
| 7.2 | 看到复习时的卡片内容快照 | 历史详情显示快照 | 历史详情页 `history_detail` 加载 `getReviewHistoryDetail`，区分快照内容和当前内容 | **PASS** | history_detail.js, history_detail.wxml | — | 页面功能完整，仅缺入口 |
| 7.3 | 历史详情只读，不能编辑/删除 | 不可编辑不可删 | `history_detail` 无删除按钮，无编辑入口 | **PASS** | history_detail.js, history_detail.wxml | — | — |
| 7.4 | 历史内容不受当前卡片后续编辑影响 | 快照独立于实时卡片 | `snapshot` vs `live` 区分显示，标注"复习时卡片内容"或"卡片当前内容" | **PASS** | history_detail.js 快照逻辑 | — | — |
| 7.5 | 从历史页查看卡片详情（只读） | openCard 以 `from=history` 进入 Add 只读模式 | `openCard()` 函数在 history_index.js:845 定义但**未绑定到 WXML**，是死代码 | **PARTIAL** | history_index.js:845-855（死代码），history_index.wxml 无绑定 | **P1** | 需要在历史列表项增加点击"查看卡片详情"的入口 |

### 八、数据同步

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 8.1 | 后端关闭时不丢卡 | 本地保存 pending 卡 | `addCard()` 后端 POST 失败时保存 `backend_sync_status: 'pending'` 到本地 | **PASS** | recordStorage.js:2135-2148 | — | — |
| 8.2 | 后端恢复后自动同步 | 自动推送 pending 卡 | `syncPendingCardsToBackend()` 在 `loadAllBackendData` 和 `onPullDownRefresh` 中自动调用 | **PASS** | recordStorage.js:2094-2214, index.js:695-704, 583-592 | — | Phase 6H 已实现 |
| 8.3 | 同步前 pending 卡不进复习 | hard boundary | `isNewCardReadyForNewOnly` 检查 `backend_sync_status === 'pending'`，返回 false | **PASS** | index.js:95-98 | — | — |
| 8.4 | 同步后进入正常复习 | 状态变为 synced | `normalizeBackendCardToLocal` 自动设置 `backend_sync_status: 'synced'` | **PASS** | recordStorage.js:783, index.js:95-98 | — | — |
| 8.5 | 不重复创建 | local_temp_id 幂等 | `POST /api/cards` 携带 `local_temp_id`，后端幂等；`upsertCachedCard` 按 local_temp_id 去重 | **PASS** | recordStorage.js:2129-2142, 907-918 | — | — |

### 九、英文校验 / 翻译 / AI 分析

| # | 用户场景 | 旧版基线 | 当前代码状态 | 状态 | 证据 | 优先级 | 建议下一步 |
|---|---|---|---|---|---|---|---|
| 9.1 | 英文内容合法性校验 | 本地校验 + 云函数校验 | 本地：空/拉丁字母/类别单词数。云函数：词典查询 + 语法检查（仅句子） | **PASS** | add.js:338-372, cloudfunctions/analyzeEnglish | — | — |
| 9.2 | 翻译/理解建议 | 云函数调用 TMT API | `callAnalyzeEnglish()` → 云函数 → Tencent TMT API 或本地参考表 | **PASS** | add.js, cloudfunctions/analyzeEnglish/index.old.js | — | 后续可迁到后端 |
| 9.3 | AI 分析不阻塞保存 | fire-and-forget | `submitCard` 先保存，后 `runBackgroundEnglishCheck` 异步分析，分析失败卡片仍然可用 | **PASS** | add.js:1633, 1656-1775 | — | — |

---

## 汇总

### 状态统计

| 状态 | 数量 |
|---|---|
| **PASS** | 30 |
| **PARTIAL** | 3 |
| **FAIL** | 4 |
| **UNKNOWN** | 1 |

### P0 缺口（阻塞主链路）

| # | 缺口 | 影响 |
|---|---|---|
| P0-1 | **复习完成面板缺少"查看今日复习内容"和"查看历史复习内容"按钮** | 用户完成一轮复习后无法查看当天复习成果，无法进入历史回顾 |
| P0-2 | **没有独立的"今日复习内容"页面** | `app.json` 中无此页面，用户无法集中浏览今天复习过的卡片 |
| P0-3 | **历史复习页无任何导航入口** | 历史页代码完整但完全不可达（`viewHistoryReviewedContent` 死代码） |
| P0-4 | **strengthening/free_review 无 UI 入口** | `handleReviewActionTap` 死代码，用户无法启动自由复习/加强复习 |
| P0-5 | **后端 session 为空时无降级路径** | daily 为空 → toast 提示但不会自动尝试 new_only 或 free_review |

### P1 缺口

| # | 缺口 | 影响 |
|---|---|---|
| P1-1 | `openCard` in history_index 死代码 | 从历史列表无法点进卡片详情 |
| P1-2 | 首页 header 数字不可点（无 drill-down） | 看不到"已学习"卡片的具体列表 |
| P1-3 | 复习 empty state 无"返回首页"按钮 | 用户需用系统返回键 |

### P2 建议

| # | 建议 |
|---|---|
| P2-1 | 清理 Phase 6G/6H 调试日志（`[phase6h-pending-sync]` 等） |
| P2-2 | 编写 pending 同步的端到端自动化测试 |

---

## 推荐修复顺序

```
第一阶段（P0 — 恢复主链路入口）：
  1. 复习完成面板增加"查看历史复习内容"按钮 → 绑定已有的 viewHistoryReviewedContent
  2. 首页增加 strengthening/free_review 入口按钮
  3. handleStartReview 增加降级链：daily 空 → new_only → free_review → 引导

第二阶段（P0 — 补齐缺失页面）：
  4. 新建或复用"今日复习内容"页面，展示今天复习过的卡片
  5. 复习完成面板增加"查看今日复习内容"按钮 → 导航到新页面

第三阶段（P1 — 体验完善）：
  6. 历史列表项增加"查看卡片详情"入口 → 绑定已有的 openCard
  7. 复习 empty state 增加"返回首页"按钮
  8. 首页 header 数字可点 → drill-down 到今日复习列表

第四阶段（P2 — 清理）：
  9. 清理调试日志
  10. 编写自动化测试
```
