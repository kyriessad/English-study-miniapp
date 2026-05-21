# Current Phase

## 当前阶段

Phase 8H 已完成：例句生成全链路覆盖诊断与最小修复。

## 最新提交

前端（English-study-miniapp）：
- `8d10689` fix stale cache eviction for word/phrase with empty example sentence
- `365fe20` fix example generation cache and translation gate
- `731ca47` polish review reveal and overachieved status UI
- `51f7d21` make add card primary home action
- `3f4d303` polish AI example font and relax crave validation
- `b7d3f56` refine AI reference fill behavior
- `51dab96` prefer backend analyze over cloud function
- `eb58175` document TokenHub Hunyuan migration
- `60b2d3d` fix AI example generation for note adoption

后端（English-analyzer-backend）：
- `211d57e` fix example generation cache and translation gate
- `2d7ef6f` relax crave validation — exact word first, inflection fallback
- `018fc36` tighten Hunyuan strict retry prompt
- `b1c96d8` retry Hunyuan example generation on validation failure
- `637fad2` fix TokenHub example generation diagnostics
- `187799b` add exampleSentence/Translation to AnalyzeResponse
- `8eac605` migrate Hunyuan example generation to TokenHub
- `29f9779` add Hunyuan example sentence generation

## Phase 8H：例句生成全链路诊断与最小修复（本次）

### 诊断结论
- clutch / crave / break a leg：模型链路正常（Hunyuan strict 直接通过），根因是 Phase 8D 前写入的旧 stale cache，读取时静默返回空例句。
- 连字符词（well-known / full-time / follow-up 等）：validator.py Rule 3 bug，被错误分类为 unknown，不进入 Hunyuan。

### 前端修复（本次）
- `getAnalyzeCacheItem`：读取时检测 word/phrase 且 exampleSentence 为空的条目 → 丢弃，触发新请求。清除 Phase 8D 前的旧 stale 缓存，避免用户设备继续看不到例句。

### 后端修复（本次，commit `ef4f946`）
- `validator.py` Rule 3：允许纯字母+连字符（无数字）的合法复合词（well-known / full-time / e-mail / follow-up / check-in 等）进入正常分类，不再硬判 unknown。
- 新增 35 个单元测试（分类 + 例句链路），全部通过。

### 剩余边界（Phase 8I）
- 缩写句点 U.S. / e.g. / Dr. → 被 SENTENCE_END_RE 判 sentence，不生成例句（规则复杂，延至 8I）
- COVID-19 → 含数字，仍 unknown（延至 8I）
- commit guilty → phrase 类，会进入 Hunyuan 生成例句（非预期，未阻断）
- #N/A → 被归为 phrase（N、A 两个 token），产品行为待确认

### 人工验收
重新编译后输入：
- clutch / crave / break a leg → 应有例句（旧 stale cache 已被丢弃，触发新请求）
- well-known / full-time / follow-up → 应有例句（Rule 3 修复，首次进入 Hunyuan）
- commit guilty → 可能有例句（phrase 类，不阻断）
- 2024 / 100-200 / -50 → 无例句（仍 unknown，符合预期）

---

## Phase 8D-hotfix：例句生成缓存与 translation 门槛修复（本次）

- **问题 1（前端）**：`setAnalyzeCacheItem` 会把 `exampleSentence` 为空的 word/phrase 分析结果写入 30 天缓存。Hunyuan 暂时故障时，用户的某个词会被封印"无例句"状态长达 30 天，服务恢复后也看不到例句。
- **问题 2（后端）**：`analyzer.py` 中 `if category in ("word", "phrase") and translation:` 这个门槛在 translation 失败时会跳过 Hunyuan 调用，而 Hunyuan 的 `chinese_meaning` 参数本为可选，不依赖 translation 也能工作。
- **前端修复**（`pages/add/add.js`）：`setAnalyzeCacheItem` 在写入前检查：若 category 为 word/phrase 且 `exampleSentence` 为空，直接 return，不写入本地缓存。sentence/paragraph 类型缓存行为不变。
- **后端修复**（`app/services/analyzer.py`）：将条件改为 `if category in ("word", "phrase")`，允许 Hunyuan 在 translation=None 时尝试生成例句。TMT fallback 仍用 `elif translation` 保护（TMT 需要中文翻译构建模板句）。
- **新增测试**（`tests/test_analyzer_unit.py`）：9 个单元测试，覆盖 translation 有无时 Hunyuan/TMT 调用行为、sentence 排除、Hunyuan 结果透传。
- **验证**：`python -m pytest -q` → 192 passed；`node --check pages/add/add.js` → OK；`git diff --check` → OK。
- **未改**：数据库、卡片 schema、例句持久化、UI 大结构、sentence/paragraph 不生成例句的产品语义、TMT fallback 模板。

## Phase 8B-hotfix-4：Hunyuan 迁移到 TokenHub（本次）

- **目标**：将 Hunyuan 例句生成从旧腾讯云 SDK 迁移到 TokenHub OpenAI-compatible API
- **原因**：腾讯云旧「大模型 API」平台将于 2026-09-30 停服，TokenHub 已创建 API Key 和服务
- **修改文件**：`app/core/config.py`（新增环境变量）、`app/services/hunyuan_example.py`（重写为 HTTP POST）
- **新增环境变量**：
  - `HUNYUAN_API_KEY` — TokenHub API Key（未配置时 Hunyuan 直接返回 None, None）
  - `HUNYUAN_BASE_URL` — 默认 `https://api.hunyuan.cloud.tencent.com/v1`
  - `HUNYUAN_MODEL` — 默认 `hunyuan-role-latest`
- **当前 TokenHub 服务 ID**：`hunyuan-role-latest`（免费体验，后付费未开启）
- **调用方式**：`POST {base_url}/chat/completions`，Bearer token，OpenAI-compatible 格式
- **Prompt**：system + user 英文 prompt，temperature 0.2，response_format json_object
- **TMT fallback 保留**：Hunyuan 失败 → TMT → None 链路不变
- **不改前端、云函数、数据库**
- **例句仍只展示在添加页**，并通过"采用到备注"追加到 note
- **测试**：183 passed

## Phase 8C-ui-hotfix：复习页 UI 降噪（本次）

- **A. 查看理解按钮降级**（`pages/review/review.wxss`）
  - `.reveal-btn`：白底 + 绿色描边 + 绿色文字，去掉绿色渐变实心背景和大阴影
  - 保持宽度 86%、高度 92rpx、圆角 999rpx 不变
  - 新增 `.reveal-btn:active` 浅绿背景反馈
- **B. 卡片展开去内部滚动条**（`pages/review/review.wxml` + `review.wxss`）
  - WXML：将展开区 3 个 `scroll-view` 替换为普通 `view`（task-answer-scroll / task-answer-limited / task-notes-limited）
  - WXSS：`.task-card-open` 由 `height: 690rpx` 改为 `height: auto; overflow: visible`；`.task-answer-slot` 改为 `flex: none`（展开态）；`.task-answer-scroll` 去掉 `height: 100%`
  - 卡片展开后自然撑高，由页面整体滚动；不再产生内部灰色滚动条
- **C. 超额完成状态文案层级**（`pages/today_review_status/today_review_status.js`）
  - `overachieved` 分支：`stateLabel` 改为 `"今天完成了 N 张"`（突出真实完成数）
  - `stateSub` 改为 `"目标 5 / 5 · 已超额完成"`（目标进度降为副信息）
  - 🎉 emoji 由 WXML 模板固定，不变
  - `all_done` 分支（恰好达标）保持不变
- **未改**：review session / feedback / dailyGoal 逻辑、接口、数据结构、历史页

**验收步骤：**
1. 复习页未展开：查看理解为白底绿描边次级按钮，非绿色实心
2. 点击查看理解：理解和备注正常展开，右侧无灰色滚动条，页面可整体滚动
3. 反馈按钮（想不起来/不太稳/基本掌握/很熟了）样式逻辑不变
4. 超额完成时（如完成 8 张，目标 5 张）：主标题"今天完成了 8 张"，副信息"目标 5 / 5 · 已超额完成"
5. 恰好完成（5/5）：主标题"今日完成 5 / 5"不受影响
6. in_progress / not_started 状态展示不受影响

## Phase 8C-first-mini：首页按钮主次调整（本次）

- **首页仅调整添加/复习按钮主次**：
  - `pages/index/index.wxml`：goal_blocked 块交换两按钮 class（fix 历史反用）；更新注释
  - `pages/index/index.wxss`：`.add-main-btn` 改为 flex:2 + 绿色主按钮样式；`.review-main-btn` 改为 flex:1 + 白色次按钮样式
  - 按钮比例：添加 ≈66%，复习 ≈34%
- **添加卡片成为主按钮**（绑定 `goToAddPage`，绿色渐变，视觉权重高）
- **复习入口降为次按钮**（绑定 `goToReview`，白色，视觉权重低）；disabled 态保持原有 `!important` 样式
- **未改**：dailyGoal、状态卡、今日完成统计、review session 逻辑、后端、数据库

**人工验收：**
1. 首页打开：添加卡片为绿色宽按钮（约 2/3 宽）
2. 开始复习/继续复习为白色窄按钮（约 1/3 宽）
3. 点击添加卡片正常进入添加页
4. 点击复习正常进入复习流程
5. 今日完成卡片、进度条、搜索、筛选、卡片列表不受影响
6. Console 无 JS 报错

## Phase 8B-hotfix-7：AI 例句字体与 crave 词形变化兜底（本次）

- **AI 例句英文取消斜体**：
  - 删除 `pages/add/add.wxss` 中 `.reference-example { font-style: italic; }` 块
  - 例句字体恢复为正常，保持现有字号、颜色、间距不变
- **crave 优先原词 + 词形变化兜底**：
  - 交换 prompt 顺序：第一次优先要求 exact word（strict prompt）→ 第二次允许 inflection
  - 新增 `_text_in_sentence()` 校验函数：非 strict 模式下接受常见规则变形（+s/+es/+d/+ed/+ing/去e+ing/去e+ed 等）
  - strict 模式仍只要 exact substring match
  - 保持 max 1 retry + TMT fallback
- **不改**：数据库、云函数、保存逻辑、前端按钮/填入逻辑
- **测试**：182 passed（1 pre-existing failure unrelated）

**人工验收：**
1. 重启后端
2. 微信开发者工具重新编译
3. 输入 penetrate / pertinence / eager → 确认英文例句不再斜体（正常字体）
4. 输入 crave → 优先看是否生成含 "crave" 的句子
5. 若未用原词，允许出现 craving / craved / craves
6. 不接受不相关同义词句子
7. "全部填入 / 已填入"逻辑不受影响
8. 保存并返回、保存并继续新增正常

## Phase 8B-hotfix-6：参考区 UI 与备注格式优化（本次）

- **参考区统一**：
  - 原来"参考理解"和"AI 例句"两个独立区域合并为一个"参考"区
  - 展示结构：理解 / 例句 / 翻译 / [全部填入]
  - 参考框在填入后保留，不消失
- **按钮合并**：
  - 原来"采纳建议"和"采用到备注"两个按钮合并为一个"全部填入"
  - 点击后一次性写入"我的理解"和"补充备注"
  - 写入后按钮变为"已填入"，样式弱化（灰色）
  - 再次点击不重复写入（重复检测）
  - 用户手动修改理解或删除备注例句后，按钮自动恢复为"全部填入"
- **备注格式**：
  - 去掉"AI例句："和"参考理解："标签
  - 新格式仅写：例句英文 + 换行 + 中文翻译
  - 如已有备注内容，追加时空行分隔
- **strict prompt 加强**：
  - retry prompt 明确禁止 -ing/-ed/-s 等变形
  - crave 10/10 次测试全部通过
- **不改**：数据库、云函数、保存逻辑
- **测试**：183 passed
- **当前 TokenHub base URL**：`https://tokenhub.tencentmaas.cn/v1`

## Phase 8B-hotfix-5d：validation 失败重试（本次）

- **问题**：模型有时生成包含 inflection（如 craving）而非原词（crave）的例句，validation 因 `text not in sentence` 丢弃了有效例句
- **修复**：
  - 将 Hunyuan 调用和 validation 抽为 `_call_and_validate()` 内部函数
  - 首次调用使用允许 inflection 的 prompt
  - 若 validation 失败且原因为 `text not in sentence`（`retry_eligible=True`），自动用更严格的 prompt 重试一次
  - 严格 prompt：`You MUST use the exact word/phrase "{text}" — do NOT use synonyms, do NOT use different forms, do NOT use inflections`
  - 最多重试一次（不无限重试）
  - 其他失败原因（空内容、JSON 解析失败等）不重试，直接走 TMT fallback
- **不改**：前端、云函数、数据库
- **测试**：183 passed
- **当前 TokenHub base URL**：`https://tokenhub.tencentmaas.cn/v1`

**人工验收：**
1. 重启后端
2. 输入 `crave` → 应显示完整英文例句
3. 输入 `eager`、`shot` → 仍正常
4. 若两次都失败 → 不显示空例句区块，走 TMT fallback

## Phase 8B-hotfix-5c：TokenHub 例句生成诊断日志（本次）

- **问题**：direct backend 已生效，但 `exampleSentence received: false`。根因：TokenHub API key 被 `api.hunyuan.cloud.tencent.com` 返回 HTTP 401（Incorrect API key）
- **诊断日志新增**：
  - `hunyuan_example.py`：API key 是否配置、base_url / model、HTTP status 和错误信息、choices 是否存在、content 是否为空、JSON 解析是否成功、validation 失败的具体原因
  - `analyzer.py`：Hunyuan 成功/失败、TMT fallback 触发/成功/失败
  - 所有日志均不打印 API Key
- **当前状态**：日志已就绪，等待用户确认正确的 TokenHub OpenAI-compatible base URL
- **不改**：前端、云函数、数据库
- **测试**：183 passed
- **下一步**：用户从 TokenHub 控制台确认正确的 base URL，更新 `.env` 中 `HUNYUAN_BASE_URL`

## Phase 8B-hotfix-5：添加页 AI 分析优先直连后端（本次）

- **问题**：添加页 AI 分析链路经过 `cloud.callFunction('analyzeEnglish')`，云函数默认 3 秒超时，导致 TokenHub 返回结果无法到达前端，AI 例句区块不显示
- **修复**：
  1. 后端 `AnalyzeResponse` 补上 `exampleSentence` / `exampleTranslation` 字段（之前被 Pydantic response_model 过滤）
  2. 前端 `apiClient.js` 新增 `analyzeEnglishDirect()` 直连 FastAPI
  3. 前端 `add.js` 新增 `callBackendAnalyzeDirect()` 方法，优先直连后端 → 云函数兜底
- **链路优先级**：直连后端（15s timeout）→ `cloud.callFunction('analyzeEnglish')`（兜底）→ 离线返回
- **不改**：云函数（保留不删）、数据库、保存流程、卡片 schema
- **TokenHub 例句字段**仍通过 `exampleSentence` / `exampleTranslation` 返回
- **测试**：183 passed

## Phase 8B-hotfix-3：Hunyuan 例句生成（已完成）

- **目标**：直接用 Hunyuan ChatCompletions 生成 `exampleSentence` / `exampleTranslation`
- **新增文件**：`app/services/hunyuan_example.py`
  - 函数：`generate_example_with_hunyuan(text, chinese_meaning=None) → (str|None, str|None)`
  - Prompt 要求 Hunyuan 仅返回 `{"exampleSentence": "...", "exampleTranslation": "..."}`
  - 校验：两字段非空；例句不等于输入词本身；例句必须包含原始输入（substring）；句子不少于 3 词
  - 任何异常（未开通、超时、格式错）一律返回 `None, None`，不影响主流程
- **修改文件**：`app/services/analyzer.py`（删除内联 Hunyuan 函数，import 新模块）
- **链路顺序**：`generate_example_with_hunyuan()` → `_generate_example_with_tmt()` → `None`
- **环境变量**：使用现有 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`，与 TMT 共用，无需新增
- **前端**：不改。`aiExampleSentence`/`aiExampleTranslation` 消费链路已就绪
- **云函数**：不改。`exampleSentence`/`exampleTranslation` 已透传
- **数据库**：不改。例句临时结果，不持久化
- **测试**：183 passed

**人工验收步骤：**
1. 在腾讯云控制台开通混元大模型（hunyuan-lite 免费额度）
2. 确认 `.env` 中 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 已配置（与 TMT 同一账号密钥即可）
3. 重启后端：`uvicorn app.main:app --reload`
4. 输入 `crave`，应在建议框看到完整英文例句（含 crave）+ 中文翻译
5. 点击"采用到备注"，备注应追加 `AI例句：...`
6. 输入 `clutch`，验证例句包含 clutch
7. 若 Hunyuan 不可用，应 fallback 到 TMT；TMT 失败则不显示例句区块，不影响"参考理解"显示

## Phase 8B-hotfix-2：AI 例句 TMT 兜底（已完成）

- **问题**：Tencent Hunyuan 未开通（ServiceNotActivated），例句始终为空
- **修复**：在 Hunyuan 失败后，追加一条 TMT 双向翻译兜底路径
- **原理**：用中文翻译构造中文模板句，调用 TMT（zh→en），验证英文结果包含原词后采纳
- **改动文件**：`tencent_translator.py`（新增 `translate_to_en`）、`analyzer.py`（新增 `_generate_example_with_tmt`，接在 Hunyuan 之后调用）
- **覆盖范围**：对常用动词/形容词等中英对应较明确的词效果好；基础词（go/be/have）因 TMT 同义词替换可能验证不通过，静默返回 None（不展示按钮）
- **Hunyuan 保留**：一旦在腾讯云控制台开通混元服务，高质量 AI 例句将自动启用（无需再改代码）
- **未改变**：前端 add.js / add.wxml / add.wxss、云函数 analyzeEnglish、数据库 schema、保存流程

## Phase 8A：复习页来源上移（已完成）

- **改动**：`review.wxml` 在 `.task-main`（英文区）与 `.task-answer-slot` 之间插入来源行
- **条件**：`wx:if="{{currentCard.whereEncountered && !answerVisible}}"` — 仅在卡片未翻面时展示，翻面后由原来的 answer panel 展示
- **格式**：`来自：xxx`，居中，24rpx，弱灰色（#9ba8a0）
- **保留**：原来 answer panel 内的来源展示不动
- **未改变**：feedback 四个按钮、review session 创建/完成/跳转逻辑、状态机、进度条

## Phase 8B-hotfix：AI 例句真实生成（已完成）

- **问题**：Phase 8B 把 `form.englishText`（用户输入本身）当成 AI 例句，输入 crave 备注变成 `AI例句：crave`，不是真实例句
- **修复**：后端调用 Free Dictionary API 获取真实英文例句（无需 API key），再用现有 Tencent TMT 翻译例句到中文
- **例句来源**：`api.dictionaryapi.dev`（免费词典，仅对 word/phrase 类型生效）
- **改动文件**：`analyzer.py`（后端）、`analyzeEnglish/index.js`（云函数）、`add.js`、`add.wxml`、`add.wxss`（前端）
- **前端 state**：新增 `aiExampleSentence` / `aiExampleTranslation`；`adoptNoteExample()` 只使用这两个字段
- **展示**：suggestion-box 内新增 `ai-example-block`，仅在 `aiExampleSentence` 非空时显示；`采用到备注` 按钮也在此块内
- **采纳格式**：`AI例句：[real example sentence]\n参考理解：[translated example]`
- **保护**：重复检测；`translating` 时禁用；`isReadonlyDetailMode` 时禁用；词典查询失败静默降级（按钮不出现）
- **未改变**：现有"采纳建议"按钮（→ 我的理解）、保存流程、离线保存、pending sync、编辑旧卡、数据库 schema

## Phase 8B：添加页 AI 例句（初版，已被 hotfix 取代）

- 初版错误地把 `form.englishText` 作为例句，已由 8B-hotfix 修正

## 本次未改变

- 后端（English-analyzer-backend）
- 数据库 / Card schema
- 云函数 analyzeEnglish
- review session / feedback / 状态机
- 复习进度逻辑
- whereEncountered 字段语义
- 历史页 / 今日复习内容页
- 首页筛选逻辑

## Phase 8A/8B 选型说明

- **不新增数据库字段**：AI 例句内容是分析时的临时结果（translation/understanding），不需要持久化
- **不做 migration**：无 schema 变更
- **不改 cards API 主结构**：仅前端展示层变化
- **最小方案**：复用 suggestionText，追加到 note，不新增必填项，不破坏任何现有保存链路

## Phase 7K-hotfix 修复内容（已完成，上一阶段）

- **P2-1**（离线编辑 pending update 显式保护）：`choosePreferredCard` 在旧 `syncStatus` 判断之前新增 `backend_sync_status === 'pending'` 显式优先判断。
- **P2-2**（来源 pill 超长文本省略号保护）：`pages/add/add.wxss` 将 `.source-pill` 改为 `inline-block`。
- **P2-3**（首页状态 Tab 横向滚动可发现性）：`pages/index/index.wxml` 右侧新增渐变蒙版。

## 当前产品语义

### 复习页

- 卡片正面（未翻面）：英文内容 + **来自：xxx**（有来源才显示）
- 卡片背面（翻面后）：我的理解 + 补充备注 + 来自：xxx（原展示位置保留）
- feedback 四个按钮不变

### Add/Edit 页

- 输入英文后 AI 分析，显示"参考理解"建议框
- 建议框内：`采纳建议`（→ 我的理解）+ `采用到备注`（→ 补充备注，格式：AI例句+参考理解）
- 如果 AI 未返回建议（translating 或无内容），"采用到备注"不显示
- 重复点击不会重复追加同一条例句
- 来源输入框 placeholder"例如 美剧、电影、抖音、B站等"，下方"最近用过"快捷标签

### 首页卡片库

- 状态 Tab 单行横向可滚动，右侧渐变提示
- 卡片类型筛选常驻在搜索框上方
- meta 行来源 pill"来自：xxx"（有值才显示）

### whereEncountered

- 字段可选，空值不展示
- 复习卡正面：弱灰小字（24rpx，#9ba8a0），仅未翻面时显示
- 复习卡背面：弱色小字（原展示）
- 首页列表：弱绿色 pill

## 注意

- 后端字段名 where_encountered，前端字段名 whereEncountered，不要混用。
- 不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
- 列表页统一不展示备注，详情页（Add/Edit、复习、历史详情）仍可展示。
