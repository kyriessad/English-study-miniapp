# 英语学习小程序当前功能总览

> 维护说明：本文档记录产品当前能力全貌。每完成一个较大产品阶段后更新。
> 当前阶段信息见 [current-phase.md](current-phase.md)，单一阶段细节见各 phase 总结文档。

---

## 一、产品定位

这是一款**场景记忆 + 自己理解 + 轻量复习**型英语学习微信小程序，核心思路区别于传统背单词 App：

- 用户**自己记录**在生活、工作、学习中遇到的英语词、短语或句子；
- 可以补充"我的理解""补充备注""在哪里遇到"等上下文信息；
- 系统辅助生成中文翻译、理解建议和 AI 例句；
- 用户通过**低压力卡片式复习**进行巩固，每次反馈如实记录；
- 不追求刷词量，不设强制记忆曲线，重点是**记住语境和当初为什么记这个词**。

---

## 二、核心数据对象

### 卡片 Card

| 字段 | 说明 |
|---|---|
| `id` | 后端 UUID 主键 |
| `local_temp_id` | 离线创建时的本地临时 ID，同步后幂等去重 |
| `content` | 原始英文内容（用户输入） |
| `content_normalized` | Unicode NFKC 标准化后的英文内容 |
| `card_type` | 分类：`word` / `phrase` / `sentence` |
| `understanding` | 我的理解（用户或 AI 生成） |
| `note` | 补充备注 |
| `where_encountered` | 在哪里遇到（可选） |
| `translation` | 中文翻译（AI 生成） |
| `analysis_status` | 分析状态：`pending` / `done` / `failed` |
| `review_state` | 复习状态：`new` / `reviewing` / `strengthening` / `mastered` |
| `mastery_score` | 掌握程度 0-5 |
| `recovery_stage` | 回炉深度 0-2 |
| `review_count` | 累计复习次数 |
| `last_review_result` | 最近一次复习反馈结果 |
| `next_review_at` | 计划下次复习时间 |
| `status` | 生命周期：`active` / `archived` / `deleted` |
| `exam_scene` | 考试场景标签（历史字段，保留但前端已不展示） |
| `exam_module` | 考试模块标签（历史字段，保留但前端已不展示） |

### 复习日志 ReviewLog

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键 |
| `card_id` | 关联卡片 |
| `result` | 反馈结果：`forgot` / `shaky` / `got_it` / `fluent` |
| `session_type` | 会话类型：`daily_suggested` / `new_only` / `free_review` |
| `reviewed_at` | 复习时间 |
| `card_snapshot` | 复习时的卡片快照（JSON） |
| `review_state_before` / `review_state_after` | 复习前后状态 |
| `mastery_score_before` / `mastery_score_after` | 复习前后掌握分 |
| `next_review_at_before` / `next_review_at_after` | 复习前后计划时间 |

### 今日复习数据

- 基于当天 `review_logs` 统计 distinct card_id；
- 展示使用当前 card 内容（非快照）；
- 同一张卡当天重复复习不重复增加真实完成数。

### 历史复习记录

- 使用 ReviewLog 的 `card_snapshot` 作为快照内容；
- 快照内容不随当前卡片修改而改变。

### AI 分析结果

- 后端 `/api/analyze-english` 返回：翻译、理解建议、例句（仅 word/phrase）、分类、校验警告/错误。

### AI 例句

- 仅在 Add/Edit 页实时展示，**不作为 card 字段持久化到数据库**；
- 用户可通过"全部填入"按钮将例句写入备注。

---

## 三、页面功能总览

### 1. 首页

- **卡片列表**：展示所有有效卡片（非 deleted），包含分类标签、英文预览、理解预览、复习次数、来源 pill。
- **状态筛选**：标签栏切换，支持 `全部 / 待学习 / 复习中 / 待加强 / 已掌握`（对应 `reviewStateV2` 的值：`all / new / reviewing / strengthening / mastered`）。无"待同步"卡片筛选项——pending 是后台同步状态概念，不在前端 UI 展示为筛选维度。
- **搜索**：卡片数 > 10 时显示搜索栏，可搜索英文内容、我的理解、补充备注、whereEncountered、分类、复习状态等字段。
- **whereEncountered 来源 pill**：每张卡片以灰色 pill 展示"来自：xxx"，仅在有值时显示。
- **今日完成进度入口**：顶部状态卡片展示 `今日已完成 / 今日目标` 进度条和完成数，点击进入今日复习情况页。
- **添加卡片入口**：绿色渐变主按钮（`flex:2`，约 66% 宽），为主要操作。
- **开始/继续复习入口**：白色描边次级按钮（`flex:1`，约 34% 宽）。按钮文案根据是否有进行中的复习会话动态切换为"开始复习"或"继续复习"。
- **离线缓存展示**：有未同步的复习反馈 action 时，底部显示弱网提示"网络恢复后会更新学习记录"。
- **0 卡片快速开始区**：无卡片时展示预设示例卡片，引导用户快速上手。
- 首页弱化"任务感"的主次按钮语义：添加卡片为主操作（绿色渐变），复习为次级操作（白色描边）——Phase 8C-first-mini 已确认。

### 2. 添加 / 编辑卡片页

- **输入英文内容**：多行文本输入，自动检测分类（word/phrase/sentence）。
- **输入我的理解**：多行文本输入，可手动填写或由 AI 生成后自动填入。
- **输入补充备注**：多行文本输入。
- **输入在哪里遇到**：文本输入，支持从最近来源标签中快速选择（最近使用的 whereEncountered 值以 pill 展示，点击即填入）。
- **英文内容分析**：blur 时自动触发后端 `/api/analyze-english`（直连 FastAPI 优先，云函数兜底，离线则跳过）。返回翻译、理解建议、例句、分类、校验警告/错误。
- **AI 翻译 / 建议 / 例句展示**：在"参考"区域展示。合并了原先独立展示的"参考理解"和"AI 例句"两个区域。包含：
  - 理解建议（suggestionText）
  - AI 例句英文（aiExampleSentence）
  - AI 例句中文翻译（aiExampleTranslation）
- **"全部填入"按钮**：一键将 AI 建议的理解填入"我的理解"字段，并将例句英文 + 中文翻译追加到"补充备注"。内容已匹配时按钮变为"已填入"。
- **输入合法性校验**：前端本地校验（非空、含拉丁字母、分类一致性）+ 后端校验（拼写、格式、混合语言等），结果以 error/warning/hint/success 分类展示。
- **本地缓存**：分析结果缓存到本地存储（`englishAnalyzeCache_v2`），30 天 TTL，最多 200 条，减少重复分析请求。
- **后端不可用时 pending fallback**：保存时若后端不可达，卡片保存到本地并标记 `backend_sync_status: 'pending'`，后续由同步机制批量上传，支持指数退避重试。
- **编辑英文后重新分析**：保存时检测英文内容或分类是否变更，若是则设置 `analysisStatus: 'pending'` 并触发后台重新分析。
- **保存后同步后端**：正常流程直接 POST/PATCH 到后端；pending 卡片由后台同步队列自动处理。

#### AI 例句生成能力（详见第五节）

- word / phrase 会尝试生成例句；
- sentence / paragraph 不生成例句；
- 支持普通单词、短语、连字符词、字母数字词条、缩写句点；
- 支持常见词形变化校验；
- 不对不自然短语做语义纠错；
- 不接受纯同义替换冒充原词用法。

### 3. 复习页

- **卡片式复习**：每次展示一张卡片，正面显示英文内容 + 来源（有来源时才展示）。
- **先看英文，再查看理解**：初始只展示英文，用户回忆后点击"查看理解"。
- **查看理解按钮**：白底 + 绿色描边次级按钮（Phase 8C 降级为描边次级按钮），点击后展开卡片背面。
- **展开我的理解 / 补充备注**：背面显示我的理解、补充备注（有则显示）、来源。展开后页面整体滚动，无内部滚动条（Phase 8C 去内部滚动）。
- **反馈按钮**：四个按钮对应不同反馈结果——
  - "想不起来" → `forgot`
  - "不太稳" → `shaky`
  - "基本掌握" → `got_it`
  - "很熟了" → `fluent`
- **回炉卡逻辑**：`forgot` 最多回炉 2 次（卡片间隔 5 位重新出现），`shaky` 最多回炉 1 次。
- **网络异常时的反馈处理**：前台反馈失败时弹 toast"网络连接异常，请检查网络后再试"，停留在当前卡片。未送达的反馈进入 action queue 后台重试。
- **完成后进入今日复习情况页**：所有卡片反馈完成后自动跳转 `today_review_status`，若跳转失败则展示页内完成面板。

### 4. 今日复习情况页

- **今日目标进度**：展示 `已完成数 / 每日目标` 进度条和统计卡片。
- **今日真实完成数**：按当天 distinct card_id 计数的实际完成数量。
- **超额完成显示**：真实完成数作为主信息（"今天完成了 N 张"），目标作为副信息。超额时展示庆祝图标。
- **状态覆盖**：支持以下 7 种状态——
  - `empty`：今天没有复习任务
  - `not_started`：0/N，尚未开始
  - `in_progress`：部分完成，进度条
  - `goal_blocked`：当前内容已学完但未达到目标
  - `all_done`：恰好完成今日目标
  - `overachieved`：超额完成
  - `offline_cached`：离线展示缓存数据
- **进入今日复习内容页**：点击"查看今天复习过的卡片"跳转 `today_reviewed`。
- **进入历史复习页**：点击入口跳转 `history_reviewed`。
- **每日目标入口**：底部显示"每日目标 N 张"，点击"调整"跳转设置页。
- **离线状态展示**：离线时显示"当前无网络连接，恢复后可继续复习"横幅，数据来源降级为本地缓存。

### 5. 今日复习内容页

- **展示今天已经复习过的卡片**：调用 `/api/reviews/today-reviewed` 获取列表。
- **使用当前 card 内容，不是 snapshot**：展示的是卡片最新字段值（content、understanding 等），随卡片编辑实时更新。
- **支持编辑**：点击卡片跳转编辑页，保存后本页返回时自动刷新。
- **whereEncountered 来源 pill**：每张卡片展示"来自：xxx"。
- **离线缓存展示**：后端不可用时展示本地缓存的今日复习数据，标记 offline。
- **返回后按需刷新**：编辑页保存后设置 `todayReviewedNeedsRefresh` 标记，返回时 `onShow` 检测并刷新。

### 6. 历史复习页

- **历史复习记录列表**：按复习日期分组展示卡片摘要，包含分类标签、反馈结果标签、英文内容、理解、复习次数、来源 pill。
- **时间范围筛选**：`近7天 / 近30天 / 全部历史` 三个选项。
- **反馈结果筛选**：`全部 / 想不起来 / 不太稳 / 已掌握` 四个快速筛选按钮，每个显示对应数量。
- **搜索**：支持搜索英文内容、理解、备注、whereEncountered、分类、考试场景（历史字段）、最近反馈结果。
- **whereEncountered 搜索和展示**：搜索覆盖 whereEncountered 字段，列表中展示来源 pill。
- **分页 / 底部加载状态**：后端分页（默认每页 100 条），触底加载更多。底部显示"正在加载更多..."或"没有更多了"。
- **后端优先、本地 fallback**：优先调用后端 `/api/reviews/history`，失败时检测本地是否有历史数据，有则降级展示本地数据，无则显示"当前无网络连接，暂时无法查看"。
- **离线缓存展示**：本地 fallback 使用 `historyReviewStorageFacade` 读取本地 `reviewRecords` 中的历史摘要。

### 7. 历史详情页

- **展示 review snapshot**：优先展示 ReviewLog 中保存的 `card_snapshot`，标题为"复习时卡片内容"。
- **展示当时复习记录**：复习结果（彩色标签）、复习时间、学习来源（会话类型）。
- **不作为主要编辑入口**：历史详情页无编辑按钮，为纯只读页面。
- **历史是快照语义**：`card_snapshot` 保存的是复习那一刻的卡片内容，后续卡片修改不会影响历史详情。
- 若无快照（旧数据），则展示"卡片当前内容"并额外显示当前 `review_state`、`next_review_at` 等字段。

### 8. 设置页

- **每日目标 dailyGoal**：picker 选择器，可选值为 `3 / 5 / 10` 张。
- **每日目标当天立即生效**：保存时直接写入 `wx.Storage`，首页和今日复习情况页读取时实时生效。
- 首页和今日复习情况页按 `dailyGoal` 展示进度（分母 = dailyGoal）。

---

## 四、复习与每日目标规则

### 首页进度语义

- 分母 = `dailyGoal`（用户设置，默认 5）。
- 主进度分子 = `min(今日真实完成数, dailyGoal)`。
- 今日真实完成数按当天 distinct `card_id` 计数。
- 同一张卡当天重复复习不重复计入真实完成数。
- 超额完成时主信息突出真实完成数，目标作为副信息。
- 卡片不足时（goal_blocked 状态）：当前可学内容已学完但仍未达到 dailyGoal，允许进入该状态展示。

### dailyGoal 生效规则

- 设置页修改后立即写入 `wx.Storage`，无需重启或等待次日。
- 首页和今日复习情况页每次读取时从 Storage 获取最新值。

### 复习会话 fallback 链

- `daily_suggested`（主）→ `new_only`（备）→ `free_review`（终极兜底）。
- `daily_suggested`：按优先级选卡（strengthening → due → new），new 卡有配额限制。
- `new_only`：仅选 `review_state == "new"` 的卡片。
- `free_review`：选任意 `is_review_ready == true` 的卡片，不限制 review_state。
- 点击"开始复习"时依次尝试上述链路，不可用则降级到下一级。

### 反馈与状态转换

- `forgot`：掌握分大幅下降，回炉深度设为 2，次日再出现。
- `shaky`：掌握分小幅下降，回炉深度设为 1，2 天后出现。
- `got_it`：掌握分 +1（最大 5），回炉深度 -1，间隔逐级递增（1d/2d/4d/7d/14d/30d）。
- `fluent`：掌握分 +2（最大 5），回炉深度 -1，m≥5 且 recovery=0 时进入 `mastered` 状态。
- 反馈通过 `client_action_id` 实现幂等，同一 action 不会重复处理。

---

## 五、AI 例句生成能力

本节详细记录 Phase 8B–8I 后的当前能力状态。

### 1. 生成范围

- **word / phrase** 进入例句生成（Hunyuan → TMT fallback → None 三级链路）。
- **sentence / paragraph** 不生成例句（产品语义保留，不改变）。

### 2. 已支持输入类型

| 类型 | 示例 | 例句 |
|---|---|---|
| 普通单词 | clutch, crave, avoid | Y |
| 常见短语 | break a leg, pick up, give up | Y |
| 连字符词 | well-known, full-time, follow-up, e-mail, co-worker | Y |
| 字母数字词条 | COVID-19, 5G, B2B, GPT-4 | Y |
| 缩写句点 | U.S., e.g., i.e., Dr. | Y |

### 3. 词形校验

- **单词**：支持常见词形变化（+s/+es/+ed/+ing、e-stem、y-stem）+ 36 个常见不规则动词。例句中 craves/craving/avoided 等变形均可通过。
- **短语**：仅第一核心词允许词形变化（break out → broke out、give up → gave up），后续词必须连续出现。
- **不接受纯同义替换**：crave → "She really wanted chocolate." 校验不通过。
- **不自然短语不强行纠错**：如 `commit guilty` 本身语义不自然，不自动改写为 `commit a crime`，校验正确拒绝非连续匹配。

### 4. 缓存策略

- **写入侧**：word/phrase 且 `exampleSentence` 为空时，不写入缓存（Phase 8D 修复）。
- **读取侧**：读取旧缓存时，word/phrase 且 `exampleSentence` 为空的旧条目被丢弃，触发新请求（Phase 8H 修复）。
- **translation 为空**：仍进入 Hunyuan 尝试生成例句（Phase 8D 移除 translation gate）。TMT fallback 仍依赖 translation。

### 5. 诊断能力

Hunyuan / TMT 路径有结构化诊断日志，使用 `[hunyuan][diag]` / `[tmt][diag]` 前缀和 `key=value` 格式，可区分：

| fail_reason | 含义 |
|---|---|
| `model_api_error` | 非 200 HTTP、无 API key、异常 |
| `model_timeout` | 请求超时（15s） |
| `empty_response` | 无 choices 或 content 为空 |
| `json_parse_failed` | 无 `{}` 或 JSON 解析失败 |
| `missing_example_sentence` | 例句/翻译字段为空 |
| `exact_match_failed` | strict 模式原词不在句中 |
| `too_few_words` | 句子 < 3 词 |
| `loose_match_failed` | loose 模式词形不在句中 |
| `tmt_fallback_failed` | 所有 TMT 模板翻译均失败 |

### 6. API 链路

- 前端 `analyzeEnglishDirect()` 直连 FastAPI `/api/analyze-english`（15s 超时）。
- 直连不可用时降级到云函数 `analyzeEnglish`（3s 超时限制，TokenHub 无法走通，实际仅作兜底）。
- 云函数也失败时返回离线/空结果。
- Hunyuan 通过 TokenHub OpenAI-compatible API 调用（`POST {base_url}/chat/completions`）。

---

## 六、离线与弱网能力

### 离线可看缓存

- 首页卡片列表、今日复习情况、今日复习内容、历史均有本地缓存。
- 离线时展示最近一次缓存数据，并显示离线提示。

### 离线可保存 pending 卡片

- 无网络时新增卡片保存到本地 `wx.Storage`（`add_queue`），标记 `backend_sync_status: 'pending'`。
- 已有卡片的编辑同样可本地暂存。

### 恢复网络后同步

- `syncPendingCardsToBackend` 在首页 `onShow` 和其他页面触发，指数退避重试。
- 后端以 `local_temp_id` 做幂等，避免重复创建。

### 复习反馈依赖网络

- 复习反馈需要网络提交到后端 session/feedback 端点。
- 网络异常时反馈停留在当前卡片，不前进到下一张。
- 未送达的反馈进入 action queue 后台自动重试。

### UI 文案

- 尽量避免 "local-only" "pending" "sync queue" 等技术词汇。
- 典型提示："网络恢复后会更新学习记录""当前无网络连接，恢复后可继续复习"。

---

## 七、后端与数据同步语义

### 技术栈

- **后端**：FastAPI + PostgreSQL，主数据源。
- **前端**：微信小程序原生框架，本地 `wx.Storage` 作缓存和离线兜底。

### 核心数据表

- `cards`：卡片主表，字段见第二节。
- `review_logs`：复习日志，每条反馈写入一条，含 `card_snapshot`。
- `review_sessions`：复习会话，包含 session_type 和状态。
- `review_session_items`：会话中的卡片项，含完成状态。
- `client_actions`：幂等记录表，按 `client_action_id` 去重。

### 同步机制

- **local_temp_id**：前端离线创建卡片时生成 UUID，作为临时标识。后端按 `(user_id, local_temp_id)` 做唯一约束，同步时幂等去重。
- **pending create / pending update**：卡片未同步到后端时标记 `backend_sync_status: 'pending'`，由同步队列在首页 `onShow` 时批量提交。
- **review snapshot**：每次反馈时后端在 ReviewLog 中保存 `card_snapshot`（反馈前的卡片字段快照），作为历史不可变记录。
- **analyze-english**：后端 `/api/analyze-english` 端点负责英文内容分析（分类、翻译、理解、例句）。前端直连优先，云函数兜底。

---

## 八、搜索和来源能力

### 搜索覆盖范围

- **首页搜索**：英文内容、我的理解、补充备注、whereEncountered、分类、复习状态。
- **历史搜索**：英文内容、理解、备注、whereEncountered、分类、考试场景（历史字段）、最近反馈结果。

### 来源展示

- **首页卡片**：灰色 pill "来自：xxx"，有值时展示。
- **今日复习内容**：灰色 pill "来自：xxx"。
- **历史复习列表**：灰色 pill "来自：xxx"。
- **复习页**：卡片正面显示"来自：xxx"（有来源且未翻面时展示），背面也展示来源。

### 最近来源标签

- 添加/编辑页中 `whereEncountered` 输入框下方展示最近使用过的来源值，以 pill 形式展示，点击即可快速填入。

---

## 九、当前明确不做 / 未完成

| 边界 | 说明 |
|---|---|
| AI 例句不持久化到 card | 例句仅在 Add/Edit 页实时展示，不存入数据库 |
| 不对完整句子生成额外例句 | sentence/paragraph 不进入例句生成链路 |
| 不对不自然表达自动改写 | 如 `commit guilty` 不重写为正确英语 |
| 不做语义纠错替换 | 不接受纯同义替换冒充原词用法 |
| 不保证所有输入都有例句 | 部分输入 Hunyuan 和 TMT 均无法生成时静默返回 None |
| 不把 History 当成编辑入口 | 历史详情页纯只读，不可编辑 |
| 不删除后端旧字段 | `exam_scene` / `exam_module` 保留在后端，前端当前不展示 |
| 暂不新增 Claude Code skill / command | 等例句链路经多轮人工验收稳定后再考虑 |
| 不做 Sentence 例句生成 | 产品语义保留 |
| 不保证不规则名词复数 | 如 analysis→analyses 未单独处理（但 analysis 是 analyses 子串，实际可过） |

---

## 十、人工验收入口

以下为新增功能或变更时的建议验收清单：

1. **添加普通单词**（如 clutch）→ 分析正常 → 例句正常生成 → 保存成功
2. **添加短语**（如 break a leg）→ 分析正常 → 例句正常生成 → 保存成功
3. **添加连字符词**（如 well-known, full-time）→ 分类为 word → 例句正常生成
4. **添加字母数字词条**（如 COVID-19, GPT-4, 5G）→ 分类为 word → 例句正常生成
5. **添加 whereEncountered** → 来源 pill 在各页面正确展示
6. **进入复习** → 卡片正确展示 → 先看英文 → 点击查看理解 → 展开内容
7. **完成反馈** → 四个按钮功能正常 → 回炉卡正确重新出现
8. **查看今日复习情况** → 进度条正确 → 超额/达标/未完成状态正确
9. **查看今日复习内容** → 列表正确 → 可点击编辑 → 返回后自动刷新
10. **查看历史** → 筛选/搜索正常 → 分页加载正常 → 详情页展示快照
11. **修改 dailyGoal** → 设置页修改 → 首页和今日复习情况页立即生效
12. **断网查看缓存** → 首页/复习情况/历史页面均能展示缓存数据

---

## 十一、维护说明

本文档的定位和使用方式：

- **product-features.md**（本文档）：记录当前产品能力全貌。每次较大产品阶段完成后更新对应章节，确保文档与代码一致。
- **current-phase.md**：记录当前所处阶段、最近完成的 phase、关键提交和产品语义。日常开发时主要参考这个文件。
- **Phase 总结文档**（如 `phase8H-*.md`）：记录某一阶段的细节、设计方案、修复过程和测试结果。完成阶段后存档到 `docs/`。

### 更新规则

- 新增功能：在 product-features.md 对应章节补充，更新"当前明确不做"列表如有变化。
- 修改现有行为：找到对应描述并更新，确保不遗留旧描述。
- 废弃功能：从本文档移除，加入"当前不做"列表或直接删除。
- 不确定的功能：标注"需代码确认"，不要凭记忆或推测写入。
