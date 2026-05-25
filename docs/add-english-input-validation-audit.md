# Add 页英文输入校验规则完整审查

> 审查阶段：Phase 8F-hotfix-and-add-input-validation-audit（只读审查，未改任何校验逻辑）
> 审查时间：2026-05-25
> 前端仓库：English-study-miniapp / pages/add/add.js + add.wxml + utils/apiClient.js
> 后端仓库：English-analyzer-backend / app/services/validator.py + analyzer.py + schemas/__init__.py

---

## 一、入口和触发时机

### 1.1 事件触发链

| 事件 | 处理函数 | 延迟 | 行为 |
|---|---|---|---|
| `input`（英文框输入） | `onEnglishInput` | 500ms debounce | `scheduleSuggestionUpdate` → `runInputAnalysis` |
| `blur`（英文框失焦） | `onEnglishBlur` | 立即（取消待发 timer） | `runInputAnalysis` |
| 类别选择变更 | `onCategoryChange` | 200ms debounce | `scheduleSuggestionUpdate` → `runInputAnalysis` |
| 页面加载（编辑已有卡片） | `onLoad` → `loadCard` | setTimeout(0) | `runInputAnalysis`（readonly 模式跳过） |
| 点击保存按钮 | `submitCard` | 立即 | 仅本地校验；保存后 fire-and-forget `runBackgroundEnglishCheck` |

**注意：** 保存流程（`submitCard`）只做前端本地校验来决定是否允许保存；不在保存时 await 后端分析。后端分析是 fire-and-forget 后台任务。

### 1.2 前端本地校验 vs 后端校验

| 类型 | 在哪做 | 触发时机 |
|---|---|---|
| 前端本地校验 | `getLocalValidationResult` | 每次 `runInputAnalysis` + 保存时 |
| 后端云端分析 | `callAnalyzeEnglish` → `analyzeEnglishDirect` → 云函数 | 每次 `runInputAnalysis`（本地无 error 时才发） |
| 保存时校验 | 仅重做本地校验 | `submitCard` 点击 |

### 1.3 API 调用顺序（`callAnalyzeEnglish`）

```
1. 查本地缓存 englishAnalyzeCache_v2
   ├─ 命中且不是 word/phrase 空例句 → 直接返回缓存结果（fromCache: true）
   └─ 未命中 / 已丢弃 → 继续

2. 判断 wx.cloud 是否可用
   ├─ wx.cloud 不可用（Web环境）→
   │     analyzeEnglishDirect(text, category) 直连 FastAPI
   │     失败 → 返回离线 warning（"网络不可用，暂未完成增强分析。"）
   └─ wx.cloud 可用（小程序环境）→
         先 analyzeEnglishDirect（15s timeout）
         失败 → wx.cloud.callFunction('analyzeEnglish'，3s timeout）
         失败 → 返回离线 warning（"请检查网络，可先保存。"）
```

**直连后端** (`/api/analyze-english`)：POST，`skipAuthHeader: true`，15s 超时。请求体包含 `{ text, cardType, targetLang: 'zh' }`。

### 1.4 缓存命中 / 跳过 / 写入 / 丢弃规则

| 场景 | 行为 |
|---|---|
| 读取：条目存在且未过期（30天内） | 命中，返回缓存 |
| 读取：word/phrase 且 `exampleSentence` 为空 | 丢弃条目，触发新请求（Phase 8H 修复） |
| 读取：条目已过期（>30天） | 删除条目，触发新请求 |
| 写入：`result.ok === false` | 不写入 |
| 写入：word/phrase 且 `exampleSentence` 为空 | 不写入（Phase 8D 修复） |
| 写入：sentence/paragraph / 有例句的 word/phrase | 正常写入，TTL 30天 |
| 容量：超过 200 条 | 淘汰最旧的条目 |

---

## 二、输入分类规则

### 2.1 前端分类（`detectEnglishCategory`，仅用于 UI 自动切换类别选项）

前端分类只影响 UI 的类别 picker 自动切换，不影响后端真实分类。

| 规则 | 分类 |
|---|---|
| 以 `.!?` 结尾 | 句子 |
| 词数 ≥ 6 | 句子 |
| 词数 ≤ 1 | 单词 |
| 词数 2-5 | 短语 |

### 2.2 后端分类（`_classify_text`，validator.py，权威分类）

后端分类逻辑：

```
len > 180            → paragraph
含中文 + 含英文       → unknown
无空格：
  含非法字符（#@!等）  → unknown
  无英文字母          → unknown
  末尾'.'且像缩写      → word（绕过 SENTENCE_END_RE）
  其他               → word
有空格：
  末尾 .!?            → sentence
  词数 ≥ 6            → sentence
  词数 2-5            → phrase
  词数 1              → word
  其他               → unknown
```

### 2.3 分类对照表

| 输入示例 | 后端分类 | 触发规则 | 进入 AI 例句生成 | 备注 |
|---|---|---|---|---|
| `clutch` | word | 无空格，纯字母，有英文 | Y | 普通单词 |
| `crave` | word | 同上 | Y | |
| `break a leg` | phrase | 有空格，3词 | Y | |
| `pick up` | phrase | 有空格，2词 | Y | |
| `well-known` | word | 无空格，含连字符，有英文 | Y | Phase 8H 修复 |
| `full-time` | word | 同上 | Y | |
| `follow-up` | word | 同上 | Y | |
| `e-mail` | word | 同上 | Y | |
| `co-worker` | word | 同上 | Y | |
| `COVID-19` | word | 无空格，含字母数字，有英文 | Y | Phase 8I 修复 |
| `5G` | word | 无空格，含字母数字，有英文 | Y | Phase 8I 修复 |
| `B2B` | word | 同上 | Y | |
| `GPT-4` | word | 同上 | Y | |
| `U.S.` | word | 无空格，末尾'.'，像缩写（所有段均1-4字母） | Y | Phase 8I 修复 |
| `e.g.` | word | 同上 | Y | |
| `Dr.` | word | 同上 | Y | |
| `I love English.` | sentence | 有空格，末尾'.' | N | |
| 一整段英文（>180字符） | paragraph | 长度 >180 | N | |
| `2024` | unknown | 无空格，无英文字母 | N | 后端 error：需包含英文 |
| `100-200` | unknown | 无空格，无英文字母 | N | 后端 error：数值型 |
| `#N/A` | unknown | 无空格，含非法字符（`#`） | N | |
| 空输入 | unknown | empty check 先命中 | N | 前端和后端都返回 error |
| 纯中文 | unknown | 无英文 | N | 后端 error：需包含英文 |
| 中英混合 | unknown（或 phrase） | 含中文+英文 | N | 后端 warning：内容包含中文 |

---

## 三、warning / error / hint / success 完整整理

### 3.1 前端本地校验（`getLocalValidationResult`）

| 输入情况 | 级别 | 用户看到的提示文案 | 来源 | 阻止保存 | 备注 |
|---|---|---|---|---|---|
| 英文为空 | error | 英文内容为空 | 前端 | **是** | 阻止后端分析 |
| 无拉丁字母（如纯数字、纯中文） | error | 英文内容里至少要包含英文字母。 | 前端 | **是** | |
| 类别=单词 但词数≠1 | error | 卡片类别是"单词"时，英文内容只能填写一个英文单词。 | 前端 | **是** | |
| 类别=短语 但词数<2 | error | 卡片类别是"短语"时，至少需要两个英文单词。 | 前端 | **是** | |

### 3.2 后端校验（`validate_english`）返回 error

| 输入情况 | 级别 | 用户看到的提示文案 | 来源 | 阻止保存 | 备注 |
|---|---|---|---|---|---|
| 内容 > 500 字符 | error | 英文内容超过 500 字符，请拆分后再保存。 | 后端 | **是**（显示 error，但前端不会在保存时再验证此条） | 前端保存时不再 await 后端，实际上不阻止 |
| 只有中文（无英文） | error | 内容需要包含英文，不能只有中文。 | 后端 | 只阻止实时 UI 保存按钮隐性阻止 | 前端本地 hasLatinLetter 会先拦截 |
| 纯数值（如 2024、100-200） | error | 内容需要包含英文，不能只填写数字或数值。 | 后端 | 同上 | 前端本地 hasLatinLetter 先拦截大部分 |
| 纯符号（如 !!!、###） | error | 内容不能只有符号。 | 后端 | 同上 | |

### 3.3 后端校验返回 warning

| 输入情况 | 级别 | 用户看到的提示文案 | 来源 | 阻止保存 | 备注 |
|---|---|---|---|---|---|
| 中英混合 | warning | 内容包含中文，建议确认卡片英文内容是否需要拆分。 | 后端 | **否** | |
| 180-500 字符 | warning | 内容较长，已按段落处理，建议复习时拆成更短的卡片。 | 后端 | **否** | |
| 连续/混合标点（如 ???、!?） | warning | 内容中有连续或混合标点，建议确认是否为有意输入。 | 后端 | **否** | |
| 拼写疑似有误（单个纯小写英文词，词典无收录） | warning | 拼写疑似有误：xxx。你是不是想写"yyy"？ | 后端（pyspellchecker） | **否** | 仅 category=word 且单词是纯小写字母 |
| 拼写疑似有误（无建议时） | warning | 拼写疑似有误：xxx。如果这是人名、地名、品牌名或专有名词，可以继续保存。 | 后端 | **否** | |

### 3.4 前端分析状态文案

| 状态 | englishValidationType | englishValidationMessage | 触发条件 |
|---|---|---|---|
| loading | hint | 正在检查英文内容... | `runInputAnalysis` 进行中 |
| success | success | 检查通过 | 后端返回无 error/warning |
| warning | warning | （第一条 cloudWarning 文案） | 后端返回 warnings |
| error | error | （第一条 localError 或 cloudError 文案） | 有任意 error |
| offline | hint | 暂未发现明显问题，请检查您的网络，可先保存。 | `ok === false` 且无 localError |
| empty | error | 英文内容为空 | 输入清空 |

### 3.5 回答产品核心问题

1. **什么输入会给 error？**
   前端本地：空、无拉丁字母、类别与词数不符。后端：>500字符、纯中文、纯数值、纯符号。

2. **什么输入会给 warning？**
   中英混合、内容较长（180-500字符）、标点异常、单词拼写可疑。

3. **什么输入只是 hint，不阻止？**
   离线时（"暂未发现明显问题，请检查您的网络，可先保存。"）；分析进行中（"正在检查英文内容..."）。

4. **什么情况显示 success？**
   后端返回 `ok: true` 且没有 error/warning 时，显示"检查通过"。

5. **什么情况分析状态是 pending？**
   新增卡片或编辑时英文/分类内容变更，保存后后台触发 `runBackgroundEnglishCheck`，卡片保存时 `analysisStatus = 'pending'`。

6. **什么情况分析状态是 failed？**
   后台分析 `safeAnalyzeEnglish` 返回 `ok: false`，写入 `analysisStatus: 'failed'`。

7. **什么情况不会触发分析？**
   `isReadonlyDetailMode`（从历史页进入的只读模式）；英文为空时；保存按钮点击时（保存不 await 分析）。

8. **什么情况保存会被阻止？**
   前端本地校验有 error（空、无拉丁字母、类别-词数不符）。后端 error 不直接阻止保存（保存不等待后端）。

9. **什么情况可以保存但不生成 AI 例句？**
   sentence/paragraph 类别；word/phrase 但 Hunyuan 和 TMT 均失败；word/phrase 但缓存命中有例句之前的空例句（会被丢弃触发新请求）。

10. **什么情况可以保存但有 warning？**
    中英混合、内容较长、标点异常、拼写可疑——这些 warning 都不阻止保存。

---

## 四、保存行为

| 场景 | 行为 |
|---|---|
| 英文内容为空 | 前端 error，滚动到英文区，阻止保存 |
| 英文不合法（无拉丁字母、类别-词数不符） | 前端 error，阻止保存 |
| 只有英文、没有"我的理解" | **允许保存**，myUnderstanding 为空时正常写入 |
| 没有 whereEncountered | **允许保存**，字段可选 |
| 没有 notes | **允许保存**，字段可选 |
| 后端不可用（pending fallback） | 卡片保存到本地，`backend_sync_status: 'pending'`，后续自动同步 |
| 保存后 analysisStatus = pending | 新卡或英文/类别变更时；由 `submitCard` 设置 `analysisStatus: 'pending'` 后写入 |
| 保存后触发后台重新分析 | `shouldBackgroundAnalyze = true` → fire-and-forget `runBackgroundEnglishCheck` |
| 编辑已有卡片但英文未变更 | `isSameAnalyzedContent = true`，保留原 `analysisStatus`，不触发后台分析 |
| 编辑已有卡片且英文变更 | `isSameAnalyzedContent = false`，设 `analysisStatus: 'pending'`，触发后台分析 |

---

## 五、AI 分析结果展示

### 5.1 参考区展示条件

```wxml
wx:if="{{deferNonCriticalReady && !isReadonlyDetailMode && !translating && (suggestionText || aiExampleSentence)}}"
```

即：页面 ready（`onReady` 触发后）+ 非只读 + 分析完成（不在 translating 中）+ 有内容。

### 5.2 各字段展示逻辑

| 字段 | 展示位置 | 展示条件 | 填入目标 |
|---|---|---|---|
| `suggestionText`（来自 `understanding.candidate` 或 `translation`） | 参考区 > 理解 | `wx:if="{{suggestionText}}"` | 全部填入 → 写入"我的理解" |
| `aiExampleSentence` | 参考区 > 例句 | `wx:if="{{aiExampleSentence}}"` | 全部填入 → 追加到"补充备注" |
| `aiExampleTranslation` | 参考区 > 翻译 | `wx:if="{{aiExampleTranslation}}"` | 全部填入 → 与例句一起追加到备注 |

### 5.3 "全部填入" / "已填入" 按钮逻辑

- 按钮文案：`referenceApplied ? '已填入' : '全部填入'`
- `referenceApplied` 计算：`computeReferenceApplied()` → 理解字段已匹配 AND 备注已包含例句英文 → 显示"已填入"
- 点击 `adoptAllReference()`：
  - 如果理解未填或不一致 → 写入 `form.myUnderstanding`
  - 如果备注不包含例句 → 追加 `{例句英文}\n{例句翻译}` 到备注末尾

### 5.4 不同类别展示区别

| 类别 | 理解建议 | AI 例句 | 备注 |
|---|---|---|---|
| word | ✓（机器翻译或 Hunyuan 分析） | ✓（Hunyuan → TMT → None） | 词典未收录时隐藏理解建议 |
| phrase | ✓ | ✓ | 词典未收录 warning 在有建议时过滤 |
| sentence | ✓（机器翻译） | ✗ | 后端不生成例句 |
| paragraph | ✓（机器翻译） | ✗ | 同上 |
| unknown | ✗ | ✗ | 后端返回 error，不展示参考区 |

### 5.5 例句为空时的 UI 处理

- `aiExampleSentence` 为空 → 参考区"例句"行和"翻译"行不显示
- 若 `suggestionText` 也为空 → 整个参考区不显示
- 不显示"例句加载失败"等 UI，静默处理

### 5.6 后端失败、超时、离线时的 UI 处理

| 场景 | 显示状态 | 用户可见文案 |
|---|---|---|
| 直连后端超时（>15s） | hint | 暂未发现明显问题，请检查您的网络，可先保存。 |
| 云函数失败 | hint | 请检查网络，可先保存。 |
| wx.cloud 不存在且直连失败 | hint | 网络不可用，暂未完成增强分析。 |
| 所有链路失败 | hint | （以上任一） |
| 分析进行中 | loading | 正在检查英文内容... + 参考区显示"正在分析..." |

---

## 六、AI 例句生成边界

### 6.1 进入 Hunyuan 的条件

- 后端 category ∈ `{"word", "phrase"}`
- 后端 validate_english 不返回 error

### 6.2 不进入 Hunyuan 的条件

- category = `sentence` / `paragraph` / `unknown`
- validate_english 返回 error 级别

### 6.3 Hunyuan → TMT → None 顺序

```
generate_example_with_hunyuan(text, translation)
    ├─ 成功 → 返回 exampleSentence + exampleTranslation
    └─ 失败 →
         translation 有值 → _generate_example_with_tmt(text, translation, category)
              ├─ 成功 → 返回 exampleSentence + exampleTranslation（中文模板句作翻译）
              └─ 失败 → example_sentence = None, example_translation = None
         translation 无值 → 跳过 TMT，直接 None
```

### 6.4 缓存丢弃场景

读取时：word/phrase 条目且 `exampleSentence` 为空 → 丢弃，触发新请求（Phase 8H 修复旧 stale 缓存）。

### 6.5 word/phrase 且 exampleSentence 为空时是否写入缓存

**不写入**（Phase 8D 修复）：避免临时故障期间"封印"30天空例句。

### 6.6 分类成功但例句失败的典型场景

| 输入 | 分类 | 例句结果 | 原因 |
|---|---|---|---|
| `commit guilty` | phrase | 失败 | 词组不自然，校验要求词形连续出现 |
| `break a leg` | phrase | 可能失败 | 固定搭配，字面义很难自然出现在例句中 |
| 任意 word | word | 可能失败 | Hunyuan API 超时或 401 |
| 不规则名词复数 | word | 可能失败 | 如 analysis→analyses（实际因 substring 可过） |

### 6.7 例句失败是否阻止保存

**不阻止**。例句生成完全异步，失败静默处理，卡片已先行保存。

---

## 七、当前规则是否符合产品定位

### 7.1 当前校验是否过严？

**前端本地校验**：基本合理。"类别=单词时词数只能为1"这条规则是刚性约束，但实际场景中用户可能输入 `well-known`（单词但含连字符，前端词数计算可能不一致）会被本地误判。需要确认 `getNormalizedWordList('well-known')` 是否返回 1 个词。

→ **潜在问题**：前端 `getNormalizedWordList` 用 `/[\s,.!?;:]+/` 分割，再去掉非拉丁字母前后缀。`well-known` 经过分割后是 `["well", "known"]`（连字符不在分隔符列表中，但 word 的 trim 逻辑会去掉非拉丁字母前后缀）——实际分割结果需要确认，若返回 2 个词，则"类别=单词时词数只能为1"会产生 error，导致 `well-known` 在类别选"单词"时无法保存。

**后端校验**：合理，无明显过严问题。

### 7.2 是否存在用户输入合理内容却被 warning/error 干扰的情况？

1. **拼写警告误伤**：`clutch`、`crave` 等低频词可能被 pyspellchecker 标记为"拼写疑似有误"，即便是有效英语词汇。对产品用户（记录生活中遇到的真实英语词汇）而言，这个提示可能频繁干扰。
2. **单词类别限制**：如 7.1 所述，`well-known` 在前端选"单词"时可能触发"只能填写一个英文单词"error（需代码验证）。
3. **中英混合 warning**：用户记录专有名词（如 "iPhone 怎么用"）会产生 warning，但对于纯记录场景是合理的。

### 7.3 是否存在非法输入可以保存的问题？

- **后端 error 不阻止保存**：后端的分析是异步的，保存时只做前端本地校验。如果用户输入内容绕过了前端本地校验（如 `#N/A` → 前端判定为有拉丁字母？不，`#N/A` 无拉丁字母，会被前端 error），实际上很难绕过。
- **>500字符内容**：前端不校验长度，后端长度校验是异步的，所以用户可以保存超长内容。这是一个**轻微风险**，但对于记录用途影响不大。

### 7.4 是否有提示文案过于技术化？

- "内容包含中文，建议确认卡片英文内容是否需要拆分。" — 偏引导，不算技术化。
- "英文内容超过 500 字符，请拆分后再保存。" — 合理。
- "拼写疑似有误：xxx。如果这是人名、地名、品牌名或专有名词，可以继续保存。" — **文案较好**，明确告知用户可以忽略。
- "网络不可用，暂未完成增强分析。" — 产品方向上可以改成"已保存，联网后补充分析"更符合场景。

### 7.5 是否有 warning/error 文案与"轻量、低压力、场景记忆"产品方向冲突？

- **拼写警告**：与低压力方向有一定冲突。用户记录生活中遇到的词，不一定都是"正确英语"，提示"拼写疑似有误"可能让用户质疑自己，降低添加意愿。
- **"类别=单词时只能1个词"**：产品中的"单词/短语/句子"分类主要是后台调度参考，对用户来说是认知负担，且自动检测类别通常能覆盖大多数情况。
- **"分析进行中..."**：等待感明显，但对用户来说可以接受。

### 7.6 建议后续 Phase 修复的问题

| 编号 | 问题 | 优先级 | 建议 |
|---|---|---|---|
| A | 前端 `well-known` 分类=单词 时是否误触发 error | 高 | 确认 `getNormalizedWordList('well-known')` 返回值；若为 2，则需调整前端词数计算以识别连字符词 |
| B | >500字符内容在保存时前端不拦截 | 低 | 加前端长度上限校验（可选） |
| C | 拼写警告频率过高 | 中 | 仅对用户主动选择类别=单词 且词汇极不常见时才提示；或将提示从 warning 降级为 hint |
| D | 离线提示文案 | 低 | "暂未发现明显问题，请检查您的网络" → "已记录，联网后会补充分析" |

### 7.7 建议保留不改的边界

- 前端本地校验的 4 条规则（空、无字母、类别-词数不符）：清晰合理，保留。
- 后端 error 校验（>500字符、纯中文、纯数值、纯符号）：准确，保留。
- 缓存策略（空例句不写入、读取侧丢弃旧 stale）：已在 8D/8H 修复，保留。
- Hunyuan → TMT → None 三级链路：稳定，保留。
- 保存不 await 分析、fire-and-forget 后台分析：保留（保存体验流畅）。

---

## 八、禁止事项（本次审查已遵守）

本次 B 部分只读审查，以下内容**未修改**：

1. 前端校验逻辑
2. 后端 validator
3. 后端 analyzer
4. API response schema
5. 数据库
6. AI prompt
7. 测试文件
8. 任何业务逻辑

---

## 附录：关键函数位置速查

| 函数 | 文件 | 作用 |
|---|---|---|
| `getLocalValidationResult` | add.js:357 | 前端本地校验 |
| `detectEnglishCategory` | add.js:216 | 前端分类（UI 自动切换） |
| `runInputAnalysis` | add.js:1269 | 分析主入口（debounce 后触发） |
| `analyzeEnglishInput` | add.js:1076 | 整合本地 + 后端分析结果 |
| `callAnalyzeEnglish` | add.js:480 | 缓存 + API 调用链 |
| `callBackendAnalyzeDirect` | add.js:440 | 直连 FastAPI |
| `buildDisplayState` | add.js:1028 | 决定展示哪种级别的提示 |
| `applyAnalysisToPage` | add.js:1207 | 将分析结果写入 setData |
| `submitCard` | add.js:1697 | 保存按钮入口 |
| `runBackgroundEnglishCheck` | add.js:1821 | 保存后 fire-and-forget 分析 |
| `getAnalyzeCacheItem` | add.js:641 | 读取缓存（含 stale 检测） |
| `setAnalyzeCacheItem` | add.js:679 | 写入缓存（含空例句门控） |
| `validate_english` | validator.py:275 | 后端校验主函数 |
| `_classify_text` | validator.py:231 | 后端分类规则 |
| `analyze_text` | analyzer.py:124 | 后端分析主流程 |
| `analyzeEnglishDirect` | apiClient.js:411 | 前端直连后端 |
