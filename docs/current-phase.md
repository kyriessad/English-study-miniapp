# Current Phase

## 当前阶段

Phase 8A/8B 已完成：复习页来源上移 + 添加页 AI 例句最小接入。

## 最新提交

前端（English-study-miniapp）：
- `5137767` implement review source prominence and AI example note adoption

## Phase 8A：复习页来源上移（已完成）

- **改动**：`review.wxml` 在 `.task-main`（英文区）与 `.task-answer-slot` 之间插入来源行
- **条件**：`wx:if="{{currentCard.whereEncountered && !answerVisible}}"` — 仅在卡片未翻面时展示，翻面后由原来的 answer panel 展示
- **格式**：`来自：xxx`，居中，24rpx，弱灰色（#9ba8a0）
- **保留**：原来 answer panel 内的来源展示不动
- **未改变**：feedback 四个按钮、review session 创建/完成/跳转逻辑、状态机、进度条

## Phase 8B：添加页 AI 例句最小接入（已完成）

- **AI 例句来源**：复用现有 `suggestionText`（来自 `analyzeEnglish` 云函数，中文理解建议）
- **英文例句**：用户正在录入的 `form.englishText`（即遇到的英文内容本身）
- **改动**：在现有"参考理解"建议框底部增加"采用到备注"按钮
- **采纳格式**：`AI例句：[englishText]\n参考理解：[suggestionText]`，追加到 `form.notes`
- **保护**：重复检测（已含同一 `AI例句：[text]` 则不追加）；`translating` 时禁用；`isReadonlyDetailMode` 时禁用
- **未改变**：现有"采纳建议"按钮（→ 我的理解）逻辑、保存流程、离线保存、pending sync、编辑旧卡

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
