# Current Phase

## Current Phase

Fix review batch size setting — 每次看几张设置现已对所有 session 类型生效。

**整体方向：** 本阶段不删除底层复习系统，而是弱化前端的"每日目标 / 打卡 / 任务完成 / 成绩报表"心智。保留 daily_suggested → new_only → free_review 调度、4 档反馈、回炉逻辑、review_state、ReviewSession。用户界面统一往"添加卡片 / 查看卡片 / 继续查看 / 今天看过 X 张 / 今天看过页面 / 历史记录 / 每次看几张"语义调整。

## Recently Completed

| Phase | Type | Backend commit | Frontend commit |
|---|---|---|---|
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

## Phase 8F-readonly — validate_english Classification Review

**类型：** read-only audit，无代码提交。

### 核心发现
- `clutch` / `crave` 等普通词分类为 `word`，正确进入 Hunyuan。
- `commit guilty` 实际分类为 `phrase`，问题不是分类，而是不自然短语 + 校验不通过。
- `well-known` / `full-time` / `follow-up` / `e-mail` 等连字符词被 Rule 3 判 `unknown`，不进入 Hunyuan → 延至 Phase 8H 修复。
- `U.S.` / `e.g.` / `Dr.` 等缩写句点被 SENTENCE_END_RE 判 `sentence` → 延至 Phase 8I 修复。
- 没有 `[hunyuan][diag]` 日志时，优先怀疑分类、缓存、API key、接口路径，而非直接怀疑模型。

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

### 三、Example Validation 重写

**`_text_in_sentence`（`app/services/hunyuan_example.py`）**

| 输入类型 | 校验行为 |
|---|---|
| 单词 | 精确子串检查 + 词形集合 token 匹配 |
| 短语 | 精确子串检查 + **仅第一词**词形变化，其余词**连续出现** |

**新增 `_IRREGULAR_FORMS` 表**（36 个常见不规则动词）和 **`_generate_word_forms(base)`**：
- 不规则形式（break→broke/broken、give→gave/given、come→came 等）
- 规则 +s / +ed / +ing
- e 结尾去 e（crave→craving/craved）
- y→ies/ied（study→studied）
- 同化结尾 +es（watch→watches）

### 四、词形校验对照

| input | example sentence | old | new | reason |
|---|---|---|---|---|
| crave | She craves chocolate. | pass | pass | "crave" 是 "craves" 子串 |
| crave | He was craving attention. | pass | pass | e-stem: craving |
| avoid | She avoided the question. | pass | pass | "avoid" 是 "avoided" 子串 |
| break out | A fire broke out last night. | **fail** | **pass** | 短语词形：broke out |
| give up | She gave up smoking. | **fail** | **pass** | 短语词形：gave up |
| pick up | He picked up the phone. | **fail** | **pass** | 短语词形：picked up |
| crave | She really wanted chocolate. | fail | fail | 纯同义替换 |
| break a leg | Good luck with your interview. | fail | fail | 无 break a leg 形式 |
| commit guilty | He was found guilty of committing a crime. | fail | fail | committing + guilty 不连续 |

### 五、硬编码白名单声明
- 分类规则基于字符集结构（`[A-Za-z0-9.\-'']+` + `_has_english`），非样例列表。
- 缩写检测基于段长通用规则（每段 1-4 字母）。
- 词形基于通用生成规则（+s/ed/ing/e-stem/y-stem）+ 不规则动词补充表。
- COVID-20 / GPT-5 / part-time / co-founder / avoided / admiring / picked up 等同类词无需新增白名单即可适配。

### 六、测试
- 新增 51 个测试（AlphanumericClassificationTest、AlphanumericExampleChainTest、ExampleValidationTest）。
- 更新 2 个旧测试（`test_covid19_is_unknown` → `test_covid19_is_word` 等）。
- 全量：86/86 unit + 269/269 全量通过。

---

## Phase 8I-2-readonly — Substring False Positive Review

**Status:** Completed (2026-05-21) — readonly，无代码提交。

### 复核结论

复核 `_text_in_sentence` 对单词使用的 `text in sentence.lower()` 裸 substring 检查，针对以下短词风险样本逐项审查：

| input | 风险 | 复核结果 |
|---|---|---|
| he | "he" in "the"/"she"/"here" | Hunyuan 自然生成的含 "he" 例句均为独立 token，未触发 false positive |
| art | "art" in "party"/"started" | 同上 |
| in | "in" in "interesting"/"going" | 同上 |
| go | "go" in "logo"/"undergo" | 同上 |
| be | "be" in "because"/"better" | 同上 |

**结论：未发现裸 substring false positive。** Hunyuan prompt 要求生成自然完整英语句子，短词实际出现时均为词边界内的独立 token。

### 保留项
- 词形变化规则（`_generate_word_forms` + `_IRREGULAR_FORMS` + 短语第一词变化）暂时保留，不因本次复核通过而简化。
- 不加词边界 `\b` 检查 — 当前逻辑在实际模型中已验证安全，不引入提前优化。

---

## Phase 8A-home-review-navigation-lightweight — Lighten Home Review Entry

**提交：** frontend pending

### 变更内容

#### 删除首页今日目标大卡片

- 移除 `status-overview-card`（展示"今日目标 X/Y"、进度条的卡片）
- 移除 `onStatusOverviewTap` 在 WXML 中的引用（函数保留，不删除）

#### 新增轻量今日复习入口

- 有今日复习记录（`actualCompletedToday > 0`）：显示"今天看过 X 张 · 查看 ›"，点击进入 `today_reviewed`
- 无今日复习记录：显示"今天还没复习"（静态，不可点击）
- 入口位于 header 区域，subtitle 下方

#### 复习按钮文案改为"复习一下"

- goal_blocked 状态的"继续复习"改为"复习一下"
- 普通状态的 `{{reviewButtonLabel}}` 改为"复习一下"
- `goToReview` 业务逻辑（fallback chain）不变

#### 简化 dailyStatusMessage（去掉目标导向文案）

- 超额完成："今天已完成 N 张，超额完成" → "今天复习了不少，继续加油"
- 恰好完成："今日目标已完成" → "今天的复习完成了"
- 其他状态文案不变

#### 复习完成后跳转改为 today_reviewed

- `review.js` 中 `response.done` 时的 `wx.redirectTo` 改为 `/pages/today_reviewed/today_reviewed?from=review_complete`
- `navigateToTodayReviewStatus()` 函数未被调用，保留但不修改

### 未改

- 后端、数据库 schema 不变
- review session / feedback / 4档反馈逻辑不变
- daily_suggested / new_only / free_review 复习调度规则不变
- today_review_status 页面代码保留，未删除
- 历史页内部逻辑不变
- 不新增底部导航栏

---

## Phase 8L-3-hotfix — Simplify Not-Started State in Today Review Status

**提交：** frontend `f2ba18b` simplify empty today review status page

### 变更内容

#### today_review_status `not_started` 状态精简

`not_started` 状态：今天有复习任务（`displayTotal > 0`）但 `actualCompletedToday == 0`，即今天还没有开始复习。

**页面标题区**：
- 将 `<view class="status-page-title">` 外包 flex header 行
- `not_started` 时右侧显示弱链接"历史复习内容 ›"（点击走 `onHistoryTap` → `history_index`）
- 其他状态标题行不变（历史链接不显示）

**not_started 主体**：
- 保留：hero 图标 `●`、标题"今日完成 0 / N"、副文案"还没开始，今天先复习一点"
- 保留：绿色主按钮"开始复习"（`onMainButtonTap` → `_startReview`）
- 保留：底部"每日目标 N 张 调整 ›"（所有状态共用，未改）
- **移除**：disabled 入口"暂无复习内容"（卡片式按钮）
- **移除**：secondary 区域内的"查看历史复习内容"大按钮（移至标题行弱链接）

### 判断字段

- `state === 'not_started'`：`displayCompleted === 0 && displayTotal > 0`
- `actualCompletedToday`：来自 `goalProgress.completed_unique_today`（无 goal_progress 时用 `completedToday`）

### 未改

- 其他状态（in_progress、goal_blocked、all_done、overachieved、offline_cached）的展示逻辑完全不变
- `_startReview` 业务逻辑不变
- 复习完成 redirect 链路（review.js）不变
- 历史页内部逻辑不变
- 离线状态（`offline_cached`、`loadFailed`）不变

---

## Phase 8L-2-hotfix — Home Goal Card Dual Routing + Today Reviewed History Link

**提交：** frontend `9d88c8b` adjust home goal card routing and today reviewed history link

### 变更内容

#### 首页今日目标板块

- `actualCompletedToday > 0`（今日已复习卡片数 > 0）：跳转到 `today_reviewed`（今日复习内容页）
- `actualCompletedToday == 0`：跳转到 `today_review_status`（今日复习情况页），用户看到 `not_started` 引导态（页面精简版见 Phase 8L-3-hotfix）
- 右侧箭头 `›` 在所有状态下均显示（0/5、2/5、5/5、超额均显示）
- hover-class 在所有状态下均生效
- 判断依据：`actualCompletedToday`（= `goal_progress.completed_unique_today`，当天 distinct card_id 计数），与 dailyGoal 是否完成无关

**最终状态行为（含 Phase 8L-3-hotfix 后）：**

| 首页状态 | 箭头 | 点击跳转 |
|---|---|---|
| 0/5 — 今日未复习任何卡片 | 显示 | today_review_status（not_started 引导态） |
| 2/5 — 已复习部分 | 显示 | today_reviewed（今日复习内容页） |
| 5/5 — 恰好完成 | 显示 | today_reviewed |
| 超额完成 | 显示 | today_reviewed |

#### 今日复习内容页右上角入口

- 原"共 X 张卡片"（`.today-hero__sub`）替换为弱链接"历史复习内容 ›"（`.today-hero__history-link`）
- 点击跳转 `/pages/history_reviewed/history_index`
- 字号 24rpx、颜色 `#8a9a8e`（muted）、无加粗，视觉权重明显弱于主标题

### 状态行为

| 首页状态 | 箭头 | 点击跳转 |
|---|---|---|
| 0/5 — 未复习任何卡片 | 显示 | today_review_status（not_started 态） |
| 2/5 — 已复习部分 | 显示 | today_reviewed（今日复习内容页） |
| 5/5 — 恰好完成 | 显示 | today_reviewed |
| 超额完成 | 显示 | today_reviewed |

### 未改

- 后端、数据库 schema、review session / feedback 核心逻辑不变
- dailyGoal / goal_progress 计算不变
- today_review_status 页面保留；not_started 内部 UI 由 Phase 8L-3-hotfix 进一步精简
- 复习完成后 redirect 到 today_review_status 链路（review.js）保留
- 历史页内部逻辑未改

---

## Phase 8L-hotfix — Home Goal Card Routing to Today Reviewed

**提交：** frontend `4e41639` route home goal card to today reviewed content

### 变更内容

- 首页"今日目标"板块点击行为改为：
  - `actualCompletedToday > 0`（今日已复习卡片数 > 0）：跳转到 `today_reviewed`（今日复习内容页）
  - `actualCompletedToday == 0`：不跳转，无 toast
- 右侧绿色小箭头：仅在 `actualCompletedToday > 0` 时显示（`wx:if`），0 时隐藏
- hover 效果：仅在 `actualCompletedToday > 0` 时有 hover 态
- 首页"今日目标"板块不再跳转 `today_review_status`

### 判断字段

- `actualCompletedToday`（= `gp.completed_unique_today` from backend `goal_progress`）
- 该字段基于当天 distinct card_id 计数，是今日真实已复习卡片数

### 状态行为

| 状态 | 箭头 | 点击行为 |
|---|---|---|
| 0/5（未复习任何卡片） | 隐藏 | 无跳转 |
| 2/5（已复习 2 张） | 显示 | 跳转今日复习内容页 |
| 5/5（恰好完成） | 显示 | 跳转今日复习内容页 |
| 超额完成 | 显示 | 跳转今日复习内容页 |

### 未改

- 后端、数据库 schema 不变
- review session / feedback 核心逻辑不变
- dailyGoal / goal_progress 计算不变
- today_review_status 页面保留，未删除
- 复习完成后 redirect 到 today_review_status 链路（review.js line 462、754-759）保留
- 历史页未改

---

## Phase 8K — Review Progress Display, Home Label Semantics & Today Reviewed Filters

**提交：** frontend `af338dc` polish review progress and today reviewed filters

### 一、复习页进度展示修复

- 顶部进度文案从"今日进度 X / Y"改为"当前进度 X / Y"。
- 删除了复习卡片右上角重复的"X / Y"进度数字（`task-progress`），仅保留顶部进度条。
- 卡片左上角的类型标签（单词/短语/句子）不受影响。
- 进度条不受影响。

### 二、首页筛选丸子数字可读性

- 卡片库 Tab 数字（library-tab-count）的 opacity 从 0.45 提升到 1，颜色从 `#9aaa9e` 改为 `#4a7358`。
- 统一使用中等深度的主题绿色，不破坏绿色主题。
- 筛选 pill 整体风格保持轻量。

### 三、首页进度卡片标签修正

- 首页顶部进度卡片内的 label 从"今日完成"改为"今日目标"。
- `displayCompleted / displayTotal` 数值不变。
- 顶部鼓励文案（"今天已完成 N 张，超额完成"）不受影响。
- 修复了超额完成时"今日完成 5/5"与"今天已完成 8 张"语义冲突的问题。
- 进度条仍最多 100%，不溢出。

### 四、今日复习情况页产品审查（未改代码）

**审查结论：**

- 该页面仍有存在价值，不建议删除。
- 核心独特价值：**结果分解**（掌握较好 N 张 / 还需巩固 N 张）——这是首页没有的复盘信息。
- 该页面是复习完成后的自然落地页。

**后续重构建议：**

- **首页（index）**：轻量进度 + 快速入口（添加卡片 / 开始复习）。当前形态基本正确。
- **今日复习情况页（today_review_status）**：建议从"进度重复页"重构为"今日复盘页"。
  - 核心内容：今日真实完成数 → 掌握较好 / 还需巩固分解 → 今日复习内容 → 历史复习内容。
  - 弱化"继续复习"按钮，强化"查看今日复习内容""查看历史复习内容"入口。
  - 结果分解（masteredCount / consolidateCount）可以不仅在 all_done/overachieved 状态展示，也可以在 in_progress 状态展示"当前已掌握"等中间态数据。

**本次不做大改**，仅记录方案。

### 五、今日复习内容页增加结果筛选

- 新增 3 个筛选丸子：`全部 / 待加强 / 已掌握`。
- **待加强**：包含 forgot（想不起来）和 shaky（不太稳）的卡片。
- **已掌握**：包含 got_it（基本掌握）和 fluent（很熟了）的卡片。
- 筛选仅影响本地展示，不改后端接口。
- 每个丸子显示对应数量（基于当前列表实时计算）。
- 筛选后为空时显示"今天还没有这类复习内容"。
- 卡片上的来源 pill、反馈结果标签、编辑入口不受影响。
- 不影响离线缓存展示。

### 未改
- 后端无改动。
- 数据库 schema 不变。
- review session / feedback 核心逻辑不变。
- dailyGoal 计算逻辑不变。
- 缓存结构不变。
- today_review_status 页面未删除、未重构。

---

## Phase 8H-small-hotfix — English Content Normalization Stabilization

**提交：** frontend `434a669`
**文档：** `docs/add-input-validation-product-rules.md`（Phase 8H 更新版）
**测试：** `scripts/test-add-input-validation-cases.js`，159 用例全部通过（原 109 + 新增 50）

### 问题背景

后端 `analyzeEnglish` 返回 `normalizedText` 后，前端 `applyAnalysisToPage` 会把 `normalizedText` 回写到 `form.englishText`。这导致同一个输入的保存结果依赖后端返回时机：

- 后端返回前保存：可能保存原始输入（如 `he 's`）
- 后端返回后保存：可能保存后端规范化结果（如 `he's`）

### 一、增强前端 normalizeEnglishText

`pages/add/add.js` 中的 `normalizeEnglishText` 从原来 4 步增强为 10 步：

| # | 规则 | 示例 |
|---|---|---|
| 1 | 去除前后空格 | ` hello ` → `hello` |
| 2 | 弯引号 → 直引号 | `I'm happy` → `I'm happy` |
| 3 | 各种 dash → 英文连字符 | `long—term` → `long-term` |
| 4 | 中文标点 → 英文标点 | `hello，world` → `hello,world` |
| 5 | 特殊空白 → 普通空格 | NBSP、全角空格、tab、换行、CRLF |
| 6 | 合并连续空白 | `good   morning` → `good morning` |
| 7 | 修复分裂缩写中间空格 | `he ' s` → `he 's`（撇号与后缀间空格） |
| 8 | 修复分裂缩写 / 所有格 | `he 's` → `he's`（撇号前空格） |
| 9 | 删除标点前多余空格 | `hello , world` → `hello, world` |
| 10 | 清理括号内侧空格 | `( hello )` → `(hello)` |

### 二、停止后端 normalizedText 自动回写

- `applyAnalysisToPage` 中删除了 `shouldApplyBackendNormalizedText` 逻辑
- 后端 `normalizedText` 不再写回 `form.englishText`
- 后端 `normalizedText` 可继续保存在分析结果中，供内部参考
- 后端 spelling correction / warnings / hint 逻辑保持不变
- AI 参考理解、例句、翻译逻辑保持不变
- "全部填入"仍然只填入我的理解 / 备注，不改英文内容

### 三、保存结果一致性

以下场景保存的 content 完全一致（仅经前端 `normalizeEnglishText` 处理）：
- 后端返回前保存 / 后端返回后保存 / 网络失败时保存
- 新增保存 / 编辑保存
- 从 review 页进入编辑再保存
- 从 today_reviewed 页进入编辑再保存

### 四、不自动改写的内容

- 大小写（`HELLO` 仍是 `HELLO`）
- 拼写（`cluch` 仍是 `cluch`）
- emoji（`good job 👍` 不变）
- 多余标点（`hello!!!` 不变）
- e-mail / email 互转
- 标点后补空格
- Unicode NFKC
- 语法 / 表达

### 五、测试

**原有测试：** 109（Phase 8G）
**新增测试：** 50（45 个规范化纯函数 + 5 个 error 规则验证）
**总测试数：** 159
**结果：** 全部通过

### 六、修改文件

- `pages/add/add.js` — 增强 `normalizeEnglishText`；删除 `applyAnalysisToPage` 中的 backend normalizedText 回写
- `scripts/test-add-input-validation-cases.js` — 增强 `normalizeEnglishText` 副本；新增 50 个测试用例
- `docs/add-input-validation-product-rules.md` — 新增"英文内容规范化规则"章节
- `docs/current-phase.md` — 记录 Phase 8H

### 七、未改内容

- 后端 `validator.py` / `analyzer.py` 不变
- 后端数据库 schema 不变
- `review_state` / `ReviewSession` / 4 档反馈逻辑不变
- Phase 8G 的 6 条 error 规则不变
- 保存成功 toast `已保存` / `已更新` 不变
- UI / WXML / WXSS 不变

---

## Phase 8H-hotfix — Local Normalize Before Analysis & Auto-Category Restore

**提交：** frontend `0d5ff0c`
**文档：** `docs/add-input-validation-product-rules.md`（Phase 8H-hotfix 更新版）
**测试：** `scripts/test-add-input-validation-cases.js`，193 用例全部通过（原 159 + 新增 34）

### 问题 1：输入框不显示规范化后的英文

`runInputAnalysis` 虽然用 `normalizedText` 做分析，但从不更新 `form.englishText`。导致输入 `he 's` 后，生成参考时英文框仍显示 `he 's` 而非 `he's`。

**修复：** `runInputAnalysis` 入口处计算 `normalizedText`，若与当前 `form.englishText` 的规范化结果不同，则通过 `setData` 更新 `form.englishText`。这样分析触发前英文框即显示规范化后的内容。

### 问题 2：缩写句点误判为句子

`detectEnglishCategory` 中 `/[.!?]$/.test(normalizedText)` 直接返回 `句子`，导致 `U.S.` / `e.g.` / `Dr.` 等缩写被误判。

**修复：** 末尾 `.` `!` `?` 检查增加一步：去掉末尾标点后若无空格 → 视为单词/缩写，返回 `单词`；有空格 → 返回 `句子`。

### 修改文件

- `pages/add/add.js` — `runInputAnalysis` 增加分析前 normalize；`detectEnglishCategory` 修复缩写句点误判
- `scripts/test-add-input-validation-cases.js` — 新增 34 个测试（24 自动类别 + 7 分析前 normalize + 3 后端不回写）
- `docs/add-input-validation-product-rules.md` — 新增"分析前规范化"和"自动类别识别"章节
- `docs/current-phase.md` — 记录 Phase 8H-hotfix

### 测试

**原有测试：** 159（Phase 8G 109 + Phase 8H 50）
**新增测试：** 34
**总测试数：** 193
**结果：** 全部通过

| 类别 | 数量 | 说明 |
|---|---|---|
| 自动类别识别 | 24 | C1-C24：单词/短语/句子/normalize 后识别 |
| 分析前 normalize | 7 | P1-P7：normalizeEnglishText 纯函数验证 |
| 后端不回写 | 3 | B1-B3：applyAnalysisToPage 不修改 form.englishText |

### 人工验收项

1. Add 页输入 `he 's`，等待生成参考前，英文框应变为 `he's`
2. Add 页输入 `good   morning`，英文框应变为 `good morning`
3. Add 页输入 `hello\nworld`，英文框应变为 `hello world`
4. Add 页输入 `hello world`，未手动选类别时应自动变成"短语"
5. Add 页输入 `I am happy.`，未手动选类别时应自动变成"句子"
6. 手动选"单词"后输入 `hello world`，应保持"单词"并提示"单词类别请只填一个词"
7. 输入 `cluch`，不应自动变 `clutch`，只能 hint
8. 输入 `HELLO`，不应自动变小写
9. 输入 `good job 👍`，emoji 保留
10. 后端返回 `normalizedText` 时，不应再覆盖英文框

### 未改内容

- 后端 `validator.py` / `analyzer.py` 不变
- 后端数据库 schema 不变
- `review_state` / `ReviewSession` / 4 档反馈逻辑不变
- Phase 8G 的 6 条 error 规则不变
- Phase 8H 已定的 normalize 规则边界不变
- 保存 toast `已保存` / `已更新` 不变
- 后端 `normalizedText` 不回写英文输入框（Phase 8H 规则保持）
- UI / WXML / WXSS 不变

---

## Phase 8H-hotfix-real-validation — Fix runInputAnalysis Normalize Trigger Condition

**提交：** frontend `6adccf1`
**文档：** `docs/add-input-validation-product-rules.md`（Phase 8H-hotfix-real-validation 更新版）
**测试：** `scripts/test-add-input-validation-cases.js`，211 用例全部通过（原 193 + 新增 18）

### 问题复现

Phase 8H-hotfix 声称已在 `runInputAnalysis` 入口做分析前 normalize 并回写英文输入框，但以下 3 个样例实际验收失败：

1. 输入 `he 's` → 英文框仍显示 `he 's`（应为 `he's`）
2. 输入 `good   morning` → 英文框仍显示 `good   morning`（应为 `good morning`）
3. 输入 `hello\nworld` → 英文框仍显示 `hello\nworld`（应为 `hello world`）

### 根因

`runInputAnalysis` (add.js:1360) 中的写回条件：

```javascript
// Bug: 两边都 normalize，始终相等
if (normalizeEnglishText(this.data.form.englishText) !== normalizedText) {
    patch['form.englishText'] = normalizedText
}
```

`normalizeEnglishText(this.data.form.englishText)` 和 `normalizedText`（来自 `normalizeEnglishText(englishText)`）都基于同一个原始输入值 `nextValue`，因此 normalize 后结果始终相同，条件永远为 `false`，写回从未触发。

**修复：** 改为比较原始 `form.englishText` 与 `normalizedText`：

```javascript
// Fix: 比较 raw text 与 normalized text
if (this.data.form.englishText !== normalizedText) {
    patch['form.englishText'] = normalizedText
}
```

### 修改文件

- `pages/add/add.js` — 修复 `runInputAnalysis` 第 1360 行写回条件（1 行）
- `scripts/test-add-input-validation-cases.js` — 新增 18 个触发条件测试（T1-T18）
- `docs/add-input-validation-product-rules.md` — 更新"分析前规范化"章节（触发时机 + 验收样例）
- `docs/current-phase.md` — 记录 Phase 8H-hotfix-real-validation

### 测试

**原有测试：** 193（Phase 8G 109 + Phase 8H 50 + Phase 8H-hotfix 34）
**新增测试：** 18（触发条件验证 T1-T18）
**总测试数：** 211
**结果：** 全部通过

| 类别 | 数量 | 说明 |
|---|---|---|
| 应触发回写 | 6 | T1-T6：he 's / good   morning / hello\nworld / hello，world / he ' s / don 't |
| 不应触发回写 | 10 | T7-T16：已规范 / 大小写 / 拼写 / emoji / 连字符 / 多余标点 |
| 边界 | 2 | T17-T18：正常 debounce 调度 |

### 人工验收步骤

在微信开发者工具中打开 Add 页，分别输入以下内容**等待 500ms debounce 后**：

1. 输入 `he 's` → 等待分析触发 → 英文输入框应显示 `he's`
   - 检查点：console 无报错；suggestionSourceText 为 `he's`；后端请求参数 content 为 `he's`
2. 输入 `good   morning` → 等待分析触发 → 英文输入框应显示 `good morning`
   - 检查点：多余空格已合并；suggestionSourceText 为 `good morning`
3. 输入 `hello\nworld`（textarea 中按回车） → 等待分析触发 → 英文输入框应显示 `hello world`
   - 检查点：换行已替换为空格；suggestionSourceText 为 `hello world`

额外验证：
4. 输入 `cluch` → 不自动变 `clutch`，仅显示 hint
5. 输入 `HELLO` → 保持大写
6. 输入 `good job 👍` → emoji 保留
7. 手动选"单词"后输入 `hello world` → 类别保持"单词"并提示"单词类别请只填一个词"
8. 新增卡片输入 `hello world`（未手动选类别） → 自动变成"短语"
9. 新增卡片输入 `I am happy.`（未手动选类别） → 自动变成"句子"

### 未改内容

- 后端 `validator.py` / `analyzer.py` 不变
- 后端数据库 schema 不变
- `review_state` / `ReviewSession` / 4 档反馈逻辑不变
- Phase 8G 的 6 条 error 规则不变
- Phase 8H 已定的 normalize 规则边界不变
- 保存 toast `已保存` / `已更新` 不变
- 后端 `normalizedText` 不回写英文输入框（Phase 8H 规则保持）
- UI / WXML / WXSS 不变

---

## Key Product Semantics

### 例句生成
- 例句仅在 Add/Edit 页实时展示，不持久化到 card 或数据库。
- 只有 word/phrase 分类才进入 Hunyuan 例句生成。sentence/paragraph 不生成例句。
- Hunyuan → TMT fallback → None 三级链路。
- 例句可通过"全部填入"按钮写入备注（格式：例句英文 + 换行 + 中文翻译）。

### 复习页
- 卡片正面：场景：xxx（有来源才显示，英文上方）+ 英文内容（未翻面时展示）。
- 卡片背面：我的理解 + 补充备注 + 场景：xxx。
- 查看理解按钮：白底绿色描边次级按钮。
- 卡片展开后页面整体滚动，无内部滚动条。
- 顶部进度：当前进度 X / Y。卡片内不重复显示进度数字。

### 超额完成
- 真实完成数作为主信息（"今天完成了 N 张"）。
- 目标 5/5 作为副信息。

### 首页
- 添加卡片为主按钮（绿色渐变，≈66% 宽），复习为次按钮（白色，≈34% 宽）。
- 复习次按钮文案：普通状态"查看卡片"，有进行中 session 时"继续查看"。
- 今日任务/今日已完成采用 unique card count，不统计已删除卡片。

### whereEncountered
- 字段可选，空值不展示。
- 后端字段名 `where_encountered`，前端字段名 `whereEncountered`。

### Add 页英文输入校验
- 英文内容只允许英文，含中文汉字阻止保存。
- 前端本地 6 条 error 规则：空内容、含中文、无英文、超长（>500 字符）、单词类别多词、短语类别单词。
- 红色 error = 只有前端本地 error 才显示；后端 error 不展示。
- 后端 warning 正常展示；网络失败统一提示"网络暂时不稳，可以先保存"。
- 拼写 correction 降级为 hint（"也可能是：X。确认原词没问题的话，可以继续保存"），无 correction 的拼写 warning 隐藏。

### Add 页英文内容规范化
- 前端在分析前和保存前执行同一套低风险 normalize（10 步，见 Phase 8H-small-hotfix）。
- 规范化不依赖后端，弱网/后端关闭时也生效。
- 规范化只做格式清理（空格、标点、缩写），不做大小写、拼写、语法、表达改写。
- 后端 normalizedText 不回写英文输入框。
- 最终英文内容由前端本地 normalize + 用户输入决定。

### Add 页自动类别识别
- 新增卡片时，用户未手动选择类别则自动识别：单词 / 短语 / 句子。
- 用户手动选择过类别后不再自动覆盖（`hasUserChangedCategory` guard）。
- 编辑已有卡片时不自动乱改类别。
- `U.S.`、`e.g.`、`Dr.` 等缩写不会因末尾句点误判为句子。

---

## What Is Fixed

| 问题 | 根因 | 修复阶段 |
|---|---|---|
| word/phrase 30 天无例句 | 缓存写入空例句 | 8D（写入侧）+ 8H（读取侧） |
| translation 为空不调 Hunyuan | translation gate | 8D |
| well-known 等连字符词无例句 | Rule 3 将连字符词判 unknown | 8H |
| COVID-19 / 5G / GPT-4 无例句 | 含数字硬判 unknown | 8I |
| U.S. / e.g. / Dr. 无例句 | SENTENCE_END_RE 判 sentence | 8I |
| broke out / gave up 校验失败 | 短语不检查第一词词形变化 | 8I |
| craving / avoided 可能丢例句 | 单词不检查常见词形变化 | 8I |

---

## Known Remaining Boundaries

| 场景 | 状态 |
|---|---|
| 完整句子（I love English.）不生成例句 | 产品语义保留，不变 |
| `commit guilty` 分类为 phrase，进入 Hunyuan | 不阻断（产品无害），词形校验正确拒绝非连续匹配 |
| substring false positive 风险（he in "the", art in "party"） | Phase 8I-2 已复核，未发现裸 false positive |
| 不规则名词复数（analysis→analyses） | 未处理，但 analysis 是 analyses 子串，实际可过 |
| 不做例句持久化 | 产品语义保留 |
| 不换模型 | 不变 |
| 数据库 schema 不变 | 始终不变 |

---

## Recommended Next Step

**Phase 8I/8J — Product review and acceptance**

1. **人工验收 Phase 8H normalization 效果**：
   - 在 Add 页分别输入 `he 's`、`good   morning`、`hello\nworld`、`hello，world`、`HELLO`、`cluch`、`good job 👍`、`hello 你好`、`2024`
   - 验证规范化行为、error 提示、hint 展示是否符合预期

2. **若验收通过，评估是否进入下一轮 UI 文案轻量化**：
   - 复习页"今日复习"标题 → "看一看"
   - 今天看过页标题确认
   - 历史记录页标题确认
   - 今天看过页筛选从"待加强 / 已掌握" → "有点忘了 / 记得"
   - 历史页筛选从"全部 / 想不起来 / 不太稳 / 已掌握" → "全部 / 有点忘了 / 记得"

3. **暂不继续扩展以下能力**：
   - 自动纠错 / 自动拼写替换
   - 规范写法建议按钮
   - 大小写自动修正
   - 语法或表达改写
   - 历史数据 normalize 迁移

底层复习调度规则和 session 逻辑不变。

---

## Phase about-polish — 关于页说明优化与联系开发者入口

**提交：** frontend pending

### 修改文件

- `pages/about/index.js`
- `pages/about/index.wxml`
- `pages/about/index.wxss`
- `docs/current-phase.md`
- `docs/product-features.md`

### 变更内容

#### A. 介绍文案更新

- 保留产品标题"英语知识卡片本"和副标题"随手记下你遇到的英文，轻松回顾。"
- 更新 `about-desc` 文案：说明小程序用途（记录 + 回顾），去掉"低压力"表述，改为更具体的场景描述；结尾说明"查看卡片"入口。
- 保留 `v1.0.0` 版本号。

#### B. 新增"怎么使用"区块

- 标题：怎么使用
- 4 条使用步骤：添加卡片 / 查看卡片 / 反馈记忆 / 回看记录
- 每条含步骤编号圆形 pill（浅绿底、绿色字）+ 步骤标题 + 简短说明

#### C. 新增"联系开发者"区块

- 标题：联系开发者
- 说明文案：如有使用问题或功能建议可通过邮箱反馈
- 次级按钮（白底 + 绿色描边 + 绿色文字）：联系开发者
- 点击后 `wx.showModal` 弹出开发者邮箱 + 反馈说明
- confirmText"复制邮箱"→ `wx.setClipboardData` → toast"邮箱已复制"
- 邮箱常量：`DEVELOPER_EMAIL = '1790624614@qq.com'`
- 页面不常驻展示完整邮箱

### 未改内容

- 首页、添加页、复习页、今天看过页、历史页不变
- 后端、apiClient.js、复习规则、4 档反馈、数据库不变
- app.json 路由不变（about 入口已存在）
- 设置页入口逻辑不变

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
