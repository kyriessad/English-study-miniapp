# Current Phase

## 当前阶段

Phase 8B-hotfix-3 已完成：Hunyuan 例句生成模块化，TMT 兜底保留。

## 最新提交

前端（English-study-miniapp）：
- `60b2d3d` fix AI example generation for note adoption
- `5137767` implement review source prominence and AI example note adoption

后端（English-analyzer-backend）：
- `29f9779` add Hunyuan example sentence generation
- `88062e1` fix AI generated example sentences
- `f6db7d5` fix AI example generation for note adoption

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
