# 英语学习小程序当前功能总览

> 维护说明：本文档记录产品当前能力全貌。每完成一个较大产品阶段后更新。
> 当前阶段信息见 [current-phase.md](current-phase.md)，单一阶段细节见各 phase 总结文档。

---

## 一、产品定位

这是一款**场景记忆 + 自己理解 + 轻量复习**型英语学习微信小程序，核心思路区别于传统背单词 App：

- 用户**自己记录**在生活、工作、学习中遇到的英语词、短语或句子；
- 可以补充"我的理解""补充备注""在哪里遇到"等上下文信息；
- 系统辅助生成中文翻译、理解建议和 AI 例句；
- 用户通过**针对性****卡片式复习**进行巩固，每次反馈如实记录；
- 不追求刷词量，不设强制记忆曲线，重点是**记住语境和当初为什么记这个词**。

---

## 二、核心数据对象

### 卡片 Card

| 字段                   | 说明                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `id`                 | 后端 UUID 主键                                                       |
| `local_temp_id`      | 离线创建时的本地临时 ID，同步后幂等去重                              |
| `content`            | 原始英文内容（用户输入）                                             |
| `content_normalized` | Unicode NFKC 标准化后的英文内容                                      |
| `card_type`          | 分类：`word` / `phrase` / `sentence`                           |
| `understanding`      | 我的理解（用户或 AI 生成）                                           |
| `note`               | 补充备注                                                             |
| `where_encountered`  | 在哪里遇到（可选）                                                   |
| `translation`        | 中文翻译（AI 生成）                                                  |
| `analysis_status`    | 分析状态：`pending` / `done` / `failed`                        |
| `review_state`       | 复习状态：`new` / `reviewing` / `strengthening` / `mastered` |
| `mastery_score`      | 掌握程度 0-5                                                         |
| `recovery_stage`     | 回炉深度 0-2                                                         |
| `review_count`       | 累计复习次数                                                         |
| `last_review_result` | 最近一次复习反馈结果                                                 |
| `next_review_at`     | 计划下次复习时间                                                     |
| `status`             | 生命周期：`active` / `archived` / `deleted`                    |
| `exam_scene`         | 考试场景标签（历史字段，保留但前端已不展示）                         |
| `exam_module`        | 考试模块标签（历史字段，保留但前端已不展示）                         |

### 复习日志 ReviewLog

| 字段                                                 | 说明                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `id`                                               | UUID 主键                                                      |
| `card_id`                                          | 关联卡片                                                       |
| `result`                                           | 反馈结果：`forgot` / `shaky` / `got_it` / `fluent`     |
| `session_type`                                     | 会话类型：`daily_suggested` / `new_only` / `free_review` |
| `reviewed_at`                                      | 复习时间                                                       |
| `card_snapshot`                                    | 复习时的卡片快照（JSON）                                       |
| `review_state_before` / `review_state_after`     | 复习前后状态                                                   |
| `mastery_score_before` / `mastery_score_after`   | 复习前后掌握分                                                 |
| `next_review_at_before` / `next_review_at_after` | 复习前后计划时间                                               |

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

首页不再作为"今日目标页"或"任务完成页"，而是轻量的卡片管理与复习入口。

**页面主结构：**
```
首页
├── 添加卡片（主入口）
├── 查看卡片 / 继续查看（复习入口）
├── 今天看过 X 张 · 查看 ›（或：今天还没看过卡片）
│   └── 今天看过页面
│       └── 历史记录
└── 设置
```

- **卡片列表**：展示所有有效卡片（非 deleted），包含分类标签、英文预览、理解预览、来源 pill。
- **状态筛选**：标签栏切换，保留轻量文字 + 图标 + 颜色：
  - 全部
  - ○ 新卡（`review_state == "new"`）
  - ◑ 熟悉中（`reviewing`）
  - ! 有点忘（`strengthening`）
  - ✓ 记得（`mastered`）
  - 无"待同步"筛选项——pending 是后台同步状态，不作为前端筛选维度。
- **搜索**：卡片数 > 10 时显示搜索栏，可搜索英文内容、我的理解、补充备注、whereEncountered、分类、复习状态等字段。
- **whereEncountered 来源 pill**：每张卡片以灰色 pill 展示"来自：xxx"，仅在有值时显示。
- **卡片右上角状态图标**：弱提示，不显示文字，仅颜色 + 图标：
  - 灰色 `○` = new / 待学习
  - 蓝色 `◑` = reviewing / 复习中
  - 琥珀色 `!` = strengthening / 待加强
  - 绿色 `✓` = mastered / 已掌握
- **今日状态入口**（轻量，替代原"今日目标"大卡片）：
  - 今天未看：显示"今天还没看过卡片"（静态，不可点击）
  - 今天已看：显示"今天看过 X 张 · 查看 ›"，点击进入 `today_reviewed`（今天看过页面）
  - 不再展示每日目标进度条和完成数。
- **添加卡片入口**：绿色渐变主按钮（`flex:2`，约 66% 宽），为主要操作。
- **查看卡片 / 继续查看入口**：白色描边次级按钮（`flex:1`，约 34% 宽）。按钮文案根据是否有进行中的复习会话动态切换为"查看卡片"（普通状态）或"继续查看"（有活跃 session 时）。
- **已删除内容**：
  - 不再展示"学习新卡"推荐模块（"还有 X 张新卡可以开始学习"/"学习 X 张新卡"）。新卡仍由"查看卡片 / 继续查看"内部调度（new_only session type 不变）。
  - 不再展示今日目标大卡片、5 / 5、进度条、超额完成主文案。
  - 不再通过主入口进入 today_review_status / 今日复习情况页。
  - 不展示任务激励型动态副标题（"今天多了不少，继续加油"/"今日目标已完成"等）。
- **离线缓存展示**：有未同步的复习反馈 action 时，底部显示弱网提示"网络恢复后会更新学习记录"。
- **0 卡片快速开始区**：无卡片时展示预设示例卡片，引导用户快速上手。
- **不新增底部导航栏**。

### 2. 添加 / 编辑卡片页

- **输入英文内容**：多行文本输入。支持自动检测分类（word/phrase/sentence）。
- **输入我的理解**：多行文本输入，可手动填写或由 AI 生成后自动填入。
- **输入补充备注**：多行文本输入。
- **输入在哪里遇到**：文本输入，支持从最近来源标签中快速选择（最近使用的 whereEncountered 值以 pill 展示，点击即填入）。

#### 英文内容校验

前端本地 error 规则（6 条，均为红色 error，均阻止保存）：

| 情况 | 文案 | 是否阻止保存 |
|---|---|---|
| 空内容（trim 后为空） | `英文内容为空` | 是 |
| 含中文汉字（任何 CJK 表意文字） | `英文内容请只填写英文` | 是 |
| 无拉丁字母（纯数字/纯符号） | `请输入英文内容` | 是 |
| >500 字符 | `内容较长，建议拆分后再保存` | 是 |
| 单词类别多词（category=单词 且词数 ≠ 1） | `单词类别请只填一个词` | 是 |
| 短语类别单词（category=短语 且词数 < 2） | `短语类别至少需要两个词` | 是 |

补充规则：
- 中文检测优先于"无英文"判断：纯中文 → "英文内容请只填写英文"；纯数字/纯符号 → "请输入英文内容"。
- **红色 error = 只有前端本地 error 才显示**。后端 error 不展示（不透传原文，不降级为 warning）。
- 后端 warning 正常展示为 warning。
- 网络分析失败统一提示："网络暂时不稳，可以先保存"。
- 拼写 correction 降级为 hint："也可能是：X。确认原词没问题的话，可以继续保存"。hint 不自动替换英文内容。
- 无 correction 的拼写 warning 隐藏（人名/品牌/专有名词提示不展示）。
- 保存成功 toast：新增 → `已保存`；编辑 → `已更新`。

#### 英文内容规范化

前端在分析前和保存前执行同一套低风险 `normalizeEnglishText`（10 步）：

1. 去除前后空格
2. 弯引号 → 直引号
3. 各种 dash → 英文连字符 `-`
4. 中文标点 → 英文标点
5. 特殊空白 → 普通空格（NBSP、全角空格、tab、换行、CRLF）
6. 合并连续空白
7. 修复分裂缩写中间空格（`he ' s` → `he 's`）
8. 修复分裂缩写 / 所有格（`he 's` → `he's`）
9. 删除标点前多余空格
10. 清理括号内侧空格

规范化不依赖后端，弱网/后端关闭时也生效。规范化只做格式清理，不做英语纠错或表达改写。

**会自动做的例子：**

| 输入 | 规范化后 |
|---|---|
| ` he ` | `he` |
| `good   morning` | `good morning` |
| `hello\nworld` | `hello world` |
| `hello\tworld` | `hello world` |
| `he 's` | `he's` |
| `don 't` | `don't` |
| `John 's book` | `John's book` |
| `I'm happy` | `I'm happy` |
| `long—term` | `long-term` |
| `hello，world` | `hello,world` |
| `hello。` | `hello.` |
| `hello , world` | `hello, world` |
| `( hello )` | `(hello)` |

**不会自动做的例子：**

| 输入 | 行为 |
|---|---|
| `HELLO` | 不转小写 |
| `i am happy` | 不自动改成 `I am happy` |
| `cluch` | 不自动改成 `clutch` |
| `good job 👍` | 不删除 emoji |
| `hello!!!` | 不删除感叹号 |
| `e-mail` ↔ `email` | 不互相转换 |
| 语法错误 | 不做语法纠错或表达润色 |

#### 后端 normalizedText 规则

- 后端 `/api/analyze-english` 仍可返回 `normalizedText`。
- 但前端**不会**把后端 `normalizedText` 自动写回英文输入框。
- 后端负责更细致的分析、warning、hint、AI 理解、例句。
- 最终英文内容由前端本地 normalize + 用户输入决定，不由后端返回快慢决定。

#### 自动类别识别

- 新增卡片时，如果用户没有手动选择类别，系统会自动识别：
  - `hello` → 单词
  - `hello world` / `break a leg` → 短语
  - `I am happy.` / `How are you?` → 句子
- 用户手动选择过类别后，系统不再自动覆盖（`hasUserChangedCategory` guard）。
- 编辑已有卡片时不自动乱改类别。
- `U.S.`、`e.g.`、`Dr.` 等缩写不会因末尾句点误判为句子。

#### 英文分析触发时机

- Add 页在用户输入后进行 **本地校验 → 自动类别识别 → 分析前规范化**，并触发英文分析请求。
- 直连 FastAPI 优先（15s 超时），云函数兜底（3s 超时限制）。
- 弱网/离线时跳过或失败，但不影响本地规范化和保存前校验。

#### 其他

- **AI 翻译 / 建议 / 例句展示**：在"参考"区域展示。合并了原先独立展示的"参考理解"和"AI 例句"两个区域。包含：
  - 理解建议（suggestionText）
  - AI 例句英文（aiExampleSentence）
  - AI 例句中文翻译（aiExampleTranslation）
- **"全部填入"按钮**：一键将 AI 建议的理解填入"我的理解"字段，并将例句英文 + 中文翻译追加到"补充备注"。内容已匹配时按钮变为"已填入"。"全部填入"只填入我的理解 / 备注，不改英文内容。
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

### 3. 查看卡片页面（复习页）

用户入口文案：首页普通状态为"查看卡片"，有进行中 session 时为"继续查看"。系统帮用户挑一组值得看的卡片，不强调每日目标打卡。底层仍是原复习 session 和反馈逻辑，不改算法。

- **页面标题**：导航栏和页内标题均为"查看卡片"；副标题"先想一想，再看理解"可保留。
- **顶部进度文案**：显示"当前进度 X / Y"（建议后续改为"第 X / Y 张"）；卡片内不重复显示进度数字。
- **卡片左上角类型标签**：显示"单词 / 短语 / 句子"。
- **卡片式复习**：每次展示一张卡片，正面显示英文内容（建议居中展示）+ 来源（有来源时才展示）。
- **先看英文，再查看理解**：初始只展示英文，用户回忆后点击"查看理解"。
- **查看理解按钮**：白底 + 绿色描边次级按钮，点击后展开卡片背面。
- **展开我的理解 / 补充备注**：背面显示我的理解、补充备注（有则显示）、来源。展开后页面整体滚动，无内部滚动条。
- **反馈按钮**：四个按钮对应不同反馈结果——
  - "没想起" → `forgot`
  - "有点模糊" → `shaky`
  - "记得" → `got_it`
  - "很熟" → `fluent`
  - 底层 `data-result` / 后端枚举仍为 `forgot` / `shaky` / `got_it` / `fluent`，不变。
- **回炉卡逻辑**：`forgot` 最多回炉 2 次（卡片间隔 5 位重新出现），`shaky` 最多回炉 1 次。
- **网络异常时的反馈处理**：前台反馈失败时弹 toast"网络连接异常，请检查网络后再试"，停留在当前卡片。未送达的反馈进入 action queue 后台重试。
- **完成后跳转**：所有卡片反馈完成后自动跳转 `today_review_status`，若跳转失败则展示页内完成面板。

### 4. 今日复习情况页（today_review_status）

**页面代码暂时保留，但已从首页主流程下线。** 首页不再通过主入口进入该页；后续将继续审查复习完成、兜底状态等遗留跳转，决定是否彻底下线或改为轻量统计页。

- 用户可见文案已调整，避免"每日目标 / 今日目标 / 完成目标"措辞：
  - "今日目标" → "本次"
  - "每日目标 X 张" → "每次看 X 张"
  - `offline_cached` 标题"今日目标：X 张" → "共 X 张"
  - `all_done` 子标题"今日目标已完成" → "今天的复习完成了"
- **状态覆盖**：支持以下 7 种状态——
  - `empty`：今天没有复习任务
  - `not_started`：`actualCompletedToday == 0` 且 `displayTotal > 0`，今天有目标但尚未开始
  - `in_progress`：部分完成
  - `goal_blocked`：当前内容已学完但未达到目标
  - `all_done`：恰好完成
  - `overachieved`：超额完成（真实完成数作为主信息，目标作为副信息）
  - `offline_cached`：离线展示缓存数据
- **not_started 状态**：
  - 页面顶部右侧显示弱链接"历史复习内容 ›"（点击进入历史页）；
  - 主按钮"开始复习"；
  - **不显示**"暂无复习内容"卡片入口；
  - **不显示**大号"查看历史复习内容"按钮。
- **复习完成 redirect**：复习结束后由 review.js 自动跳转到本页（遗留链路，暂保留）。
- **离线状态展示**：离线时显示"当前无网络连接，恢复后可继续复习"横幅。

### 5. 今天看过页面（原今日复习内容页）

页面语义从"今日复习内容"调整为"今天看过"。展示今天看过的卡片，不强调复习次数。

- **页面标题**：顶部导航标题和页面大标题均建议改为"今天看过"。
- **展示今天已经看过的卡片**：调用 `/api/reviews/today-reviewed` 获取列表。
- **使用当前 card 内容，不是 snapshot**：展示最新字段值，随卡片编辑实时更新。
- **支持编辑**：点击卡片跳转编辑页，保存后本页返回时自动刷新。
- **右上角历史入口**：弱链接"历史记录 ›"（字号 24rpx、颜色 muted 灰绿），点击进入历史记录页。
- **结果筛选**（建议调整为）：
  - 全部
  - 有点忘了（forgot + shaky）
  - 记得（got_it + fluent）
  - 筛选仅影响本地展示，不改后端接口；筛选为空时显示"今天还没有这类复习内容"。
- **卡片展示**：
  - 右上角状态图标（颜色 + 图标，不显示文字）。
  - 来源 pill 放右下角："来自：xxx"，无来源则不显示。
  - 不展示"复习 X 次"。
- **离线缓存展示**：后端不可用时展示本地缓存的今日复习数据，标记 offline。
- **返回后按需刷新**：编辑页保存后设置 `todayReviewedNeedsRefresh` 标记，返回时 `onShow` 检测并刷新。

### 6. 历史记录页（原历史复习页）

定位是"以前看过什么"的查询页，不是学习成绩报表。页面标题和页面大标题均建议改为"历史记录"。

- **历史复习记录列表**：按复习日期分组展示卡片摘要，包含分类标签、反馈结果标签、英文内容、理解、来源 pill。
- **顶部弱统计**（替代原来的两个大统计卡）：一行弱统计，根据当前时间范围显示：
  - 今天：今天看过 X 张 · 共 Y 次
  - 近7天：近7天看过 X 张 · 共 Y 次
  - 近30天：近30天看过 X 张 · 共 Y 次
  - 全部：累计看过 X 张 · 共 Y 次
- **时间范围筛选**：`今天 / 近7天 / 近30天 / 全部` 四个选项（或 `近7天 / 近30天 / 全部历史`）。
- **反馈结果筛选**（建议调整为三档）：
  - 全部
  - 有点忘了（forgot + shaky）
  - 记得（got_it + fluent）
- **搜索**：搜索框文案"搜索英文、释义、来源等"；覆盖英文内容、理解、备注、whereEncountered、分类、最近反馈结果。
- **卡片展示**：
  - 来源 pill 放右下角："来自：xxx"，无来源则不显示。
  - 不显示"未分类"标签：字段为空 / 未分类 / 无值时不展示来源标签。
  - 不展示"本时段复习 X 次"。
  - 时间文案建议："最后查看：xxx"（或弱展示"看过 X 次 · 最后查看：xxx"）。
- **whereEncountered 搜索和展示**：搜索覆盖 whereEncountered 字段，列表中展示来源 pill。
- **分页 / 底部加载状态**：后端分页（默认每页 100 条），触底加载更多。底部显示"正在加载更多..."或"没有更多了"。
- **后端优先、本地 fallback**：优先调用后端 `/api/reviews/history`，失败时降级展示本地数据，无则显示"当前无网络连接，暂时无法查看"。
- **离线缓存展示**：本地 fallback 使用 `historyReviewStorageFacade` 读取本地 `reviewRecords` 中的历史摘要。

### 7. 历史详情页

- **展示 review snapshot**：优先展示 ReviewLog 中保存的 `card_snapshot`，标题为"复习时卡片内容"。
- **展示当时复习记录**：复习结果（彩色标签）、复习时间、学习来源（会话类型）。
- **不作为主要编辑入口**：历史详情页无编辑按钮，为纯只读页面。
- **历史是快照语义**：`card_snapshot` 保存的是复习那一刻的卡片内容，后续卡片修改不会影响历史详情。
- 若无快照（旧数据），则展示"卡片当前内容"并额外显示当前 `review_state`、`next_review_at` 等字段。

### 8. 设置页

- **每次看几张**：picker 选择器，可选值为 `3 / 5 / 10` 张。语义从"每天必须完成多少张"改成"每次点看一看 / 继续看时，一组看几张"。
- **立即生效**：保存时直接写入 `wx.Storage`，相关页面读取时实时生效。
- 底层 `dailyGoal` key、变量名、存储逻辑暂时保持不变，避免大重构；产品文档不再将其描述为"每日目标"。

---

## 四、复习调度与"每次看几张"规则

### 首页今日状态语义

- 今日看过卡片数 = 当天 distinct `card_id` 计数（`actualCompletedToday`）。
- 同一张卡当天重复复习不重复计入今日看过数。
- 首页只展示轻量今日状态，不展示进度条或完成比例。

### 首页今天看过入口点击规则

- 判断依据：`actualCompletedToday`（= `goal_progress.completed_unique_today`，当天 distinct card_id 计数）。
- `actualCompletedToday == 0` → 显示"今天还没看过卡片"，不可点击。
- `actualCompletedToday > 0` → 显示"今天看过 X 张 · 查看 ›"，点击进入 `today_reviewed`（今天看过页面）。

### 每次看几张（原 dailyGoal）生效规则

- 设置页修改后立即写入 `wx.Storage`，无需重启或等待次日。
- 底层字段名仍为 `dailyGoal`，语义为"每次点看一看 / 继续看时一组看几张"，而不是每日强制目标。

### 复习会话 fallback 链

- `daily_suggested`（主）→ `new_only`（备）→ `free_review`（终极兜底）。
- `daily_suggested`：按优先级选卡（strengthening → due → new），new 卡有配额限制。
- `new_only`：仅选 `review_state == "new"` 的卡片。
- `free_review`：选任意 `is_review_ready == true` 的卡片，不限制 review_state。
- 点击"查看卡片 / 继续查看"时依次尝试上述链路，不可用则降级到下一级。

### 反馈与状态转换

- `forgot`（没想起）：掌握分大幅下降，回炉深度设为 2，次日再出现。
- `shaky`（有点模糊）：掌握分小幅下降，回炉深度设为 1，2 天后出现。
- `got_it`（记得）：掌握分 +1（最大 5），回炉深度 -1，间隔逐级递增（1d/2d/4d/7d/14d/30d）。
- `fluent`（很熟）：掌握分 +2（最大 5），回炉深度 -1，m≥5 且 recovery=0 时进入 `mastered` 状态。**Phase 8J cap：** 若为回炉项（`is_repeat=True`）且首次反馈（`first_failed_result`）为 `forgot` 或 `shaky`，即使满足上述 mastered 条件，同一轮内 `review_state` 也只升为 `reviewing`；`mastery_score` / `next_review_at` / `ReviewLog.result` 仍按原规则不变。
- 反馈通过 `client_action_id` 实现幂等，同一 action 不会重复处理。

---

## 五、AI 例句生成能力

本节详细记录 Phase 8B–8I 后的当前能力状态。

### 1. 生成范围

- **word / phrase** 进入例句生成（Hunyuan → TMT fallback → None 三级链路）。
- **sentence / paragraph** 不生成例句（产品语义保留，不改变）。

### 2. 已支持输入类型

| 类型         | 示例                                                | 例句 |
| ------------ | --------------------------------------------------- | ---- |
| 普通单词     | clutch, crave, avoid                                | Y    |
| 常见短语     | break a leg, pick up, give up                       | Y    |
| 连字符词     | well-known, full-time, follow-up, e-mail, co-worker | Y    |
| 字母数字词条 | COVID-19, 5G, B2B, GPT-4                            | Y    |
| 缩写句点     | U.S., e.g., i.e., Dr.                               | Y    |

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

| fail_reason                  | 含义                          |
| ---------------------------- | ----------------------------- |
| `model_api_error`          | 非 200 HTTP、无 API key、异常 |
| `model_timeout`            | 请求超时（15s）               |
| `empty_response`           | 无 choices 或 content 为空    |
| `json_parse_failed`        | 无 `{}` 或 JSON 解析失败    |
| `missing_example_sentence` | 例句/翻译字段为空             |
| `exact_match_failed`       | strict 模式原词不在句中       |
| `too_few_words`            | 句子 < 3 词                   |
| `loose_match_failed`       | loose 模式词形不在句中        |
| `tmt_fallback_failed`      | 所有 TMT 模板翻译均失败       |

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
- **今天看过页面**：来源 pill 放右下角"来自：xxx"，无来源则不显示。
- **历史记录列表**：来源 pill 放右下角"来自：xxx"，无来源则不显示；不显示"未分类"标签。
- **看一看页面**：卡片正面显示"来自：xxx"（有来源且未翻面时展示），背面也展示来源。

### 最近来源标签

- 添加/编辑页中 `whereEncountered` 输入框下方展示最近使用过的来源值，以 pill 形式展示，点击即可快速填入。

---

## 九、当前明确不做 / 未完成

| 边界                                 | 说明                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| AI 例句不持久化到 card               | 例句仅在 Add/Edit 页实时展示，不存入数据库                                 |
| 不对完整句子生成额外例句             | sentence/paragraph 不进入例句生成链路                                      |
| 不对不自然表达自动改写               | 如 `commit guilty` 不重写为正确英语                                      |
| 不做语义纠错替换                     | 不接受纯同义替换冒充原词用法                                               |
| 不保证所有输入都有例句               | 部分输入 Hunyuan 和 TMT 均无法生成时静默返回 None                          |
| 不把 History 当成编辑入口            | 历史详情页纯只读，不可编辑                                                 |
| 不删除后端旧字段                     | `exam_scene` / `exam_module` 保留在后端，前端当前不展示                |
| 暂不新增 Claude Code skill / command | 等例句链路经多轮人工验收稳定后再考虑                                       |
| 不做 Sentence 例句生成               | 产品语义保留                                                               |
| 不保证不规则名词复数                 | 如 analysis→analyses 未单独处理（但 analysis 是 analyses 子串，实际可过） |
| today_review_status 页面代码暂时保留 | 已从首页主流程下线；后续评估是否彻底下线或改为轻量统计页                   |
| 不改底层复习调度规则                 | daily_suggested / new_only / free_review / 4 档反馈 / 回炉逻辑不变      |
| 不改 review_state 枚举               | 卡片状态枚举值不变，仅前端展示改为图标弱提示                               |
| 不改 dailyGoal 底层 key              | 底层字段名保持 dailyGoal，用户可见文案改为"每次看几张"                    |
| 暂不把首页做成复盘页                 | 首页保持"添加卡片 + 看一看 + 今天看过入口"轻量形态                       |
| 历史页内部逻辑未改                   | history_reviewed / history_detail 基于 ReviewLog 快照，只读，未改动      |
| 不自动拼写纠错                       | `cluch` 不自动改成 `clutch`，仅显示 hint                                 |
| 不自动大小写修正                     | `HELLO` 保持大写，不自动变小写                                           |
| 不自动语法改写                       | 不做语法纠错或表达润色                                                   |
| 不删除 emoji                         | `good job 👍` 保留 emoji                                                  |
| 不新增"规范写法建议按钮"             | 当前不做，暂不扩展                                                       |
| 不让后端 normalizedText 覆盖英文框   | 后端 normalizedText 不回写英文输入框                                     |
| 不对历史数据做 normalize 迁移        | 仅新保存/编辑的卡片经过 normalize                                        |

---

## 十、人工验收入口

以下为新增功能或变更时的建议验收清单：

**Phase 8L / 8K 相关验收**

1. **首页 0/5 状态点击今日目标** → 进入 today_review_status not_started 引导页，显示"今日完成 0/N"、"还没开始，今天先复习一点"、"开始复习"按钮、右上角"历史复习内容 ›"；页面底部显示"每日目标 N 张 调整 ›"
2. **首页 >0 已复习状态点击今日目标** → 直接进入 today_reviewed（今日复习内容页）
3. **首页 0 状态时** → 右侧箭头 `›` 仍显示；首页 hover 态仍生效
4. **today_reviewed 右上角** → 显示"历史复习内容 ›"（弱链接），点击进入历史复习页；不再显示"共 X 张卡片"
5. **today_reviewed 结果筛选** → 全部 / 待加强 / 已掌握丸子均正常切换；筛选为空时显示"今天还没有这类复习内容"
6. **复习完成后** → 仍 redirect 到 today_review_status（结果落地页）
7. **today_review_status not_started 页面** → 不出现"暂无复习内容"卡片入口；不出现大号"查看历史复习内容"按钮

**基础功能验收**

8. **添加普通单词**（如 clutch）→ 分析正常 → 例句正常生成 → 保存成功
9. **添加短语**（如 break a leg）→ 分析正常 → 例句正常生成 → 保存成功
10. **添加连字符词**（如 well-known, full-time）→ 分类为 word → 例句正常生成
11. **添加字母数字词条**（如 COVID-19, GPT-4, 5G）→ 分类为 word → 例句正常生成
12. **添加 whereEncountered** → 来源 pill 在各页面正确展示
13. **进入复习** → 顶部显示"当前进度 X / Y"→ 卡片内不重复显示进度 → 先看英文 → 点击查看理解 → 展开内容
14. **完成反馈** → 四个按钮功能正常 → 回炉卡正确重新出现
15. **查看今日复习情况** → 进度条正确 → 超额/达标/未完成状态正确
16. **查看历史** → 筛选/搜索正常 → 分页加载正常 → 详情页展示快照
17. **修改 dailyGoal** → 设置页修改 → 首页和今日复习情况页立即生效
18. **断网查看缓存** → 首页/复习情况/历史页面均能展示缓存数据

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
