# English Study Miniapp 重构第 0 批审计报告

日期：2026-09-12  
结论：PASS / 第 0 批完成，允许进入第 1 批（本轮按用户要求在此停止）

## 1. 审计范围

本报告依据：

- `rebuild.txt`
- `English-study-miniapp_重构实施计划.txt`
- `English-study-miniapp_分批执行Prompts.txt`
- `文档/English-study-miniapp_Demo_UI_修改清单_V1.0.docx` 的非复习章节 1、2、3.1-3.6、3.8-3.10、4、5
- 当前两个仓库的正式代码、模型、schema、router、迁移和测试
- `design/references/final-screens` 文件清单（本批只核对文件存在和数量，不查看图片内容）

未读取、未引用：`文档/English-study-miniapp_PRD_V1.0.2.docx`。

说明：计划和 Prompt 声称有 27 张 final-screen，但当前目录实际有 26 张。已按用户确认，以当前 26 张作为完整验收集，不生成第 27 张。

## 2. 当前功能审计

### 前端

- 技术栈为原生微信小程序 JavaScript/WXML/WXSS，无 package.json，测试使用 Node 内置 test runner。
- `utils/apiClient.js` 是当前唯一 transport，已有 JWT、401 单次刷新、并发刷新复用、卡片、发现、复习、TTS、校验和 AI 流式能力。
- `pages/index/index.js`、`pages/add/add.js`、`utils/recordStorage.js` 较大，不能整页重写。
- 正式页已存在 `index`、`add`、`discover`、`review`、历史、今日已复习、设置、关于；三个 Tab 当前仍指向 `pages/demo/*`。
- demo 使用 `utils/demoMock.js` 和 `utils/demoStore.js`，只能作为视觉/交互参考。
- `recordStorage`、`cardStorageFacade`、`actionQueue`、`sessionProgressCache` 已覆盖用户隔离缓存、待同步动作和复习恢复能力，后续不得删除来改变离线语义。

### 后端

- FastAPI + SQLAlchemy + PostgreSQL，Alembic 当前 head 为 `i3j4k5l6m7n8`。
- 已有认证：`/api/auth/wechat-login`、`/api/auth/me`、`/api/auth/logout`。
- 已有个人卡片：`/api/cards` CRUD、sync、stats；当前 `Card` 有 version、content_normalized、分析、复习和来源上下文等字段。
- 已有公共素材：`/api/discovery/packs`、`/api/discovery/items`、素材状态、`/api/discovery/today-quote`。
- 已有个人复习：`/api/reviews/overview`、`/api/reviews/today`、`/api/reviews/feedback`、session summary、history、today-reviewed；模型包括 `ReviewSession`、`ReviewSessionItem`、`ReviewMcqQuestion`、`ReviewAnswerLog`、`ReviewLog`、`CardFsrsState`、`ClientAction`。
- 尚无正式 `WordBookLearningProfile`、`WordBookEntryProgress`、词汇书域 session 和词汇书域历史模型/API。

## 3. 不可破坏行为

- FastAPI + PostgreSQL 是正式业务事实的唯一权威来源。
- 本地 Storage 只能保存 token、偏好、可失效缓存、待同步队列和恢复信息；界面可显示本地“保存成功/删除成功”，但不得把本地成功误报为服务端已落库。同步失败保留在内部队列和失败记录中，按用户决定不展示 `pending/failed` 文案。
- 不创建第二套 request，不在页面拼 URL 或读取 token，不让正式页面读取 demo 数据。
- 保留英文校验 capability、AI 流取消和旧响应防覆盖、TTS、Card version、Review session/question/client_action_id、快照和幂等语义。
- 历史复习读取快照，不被当前 Card 编辑或删除覆盖。
- 词汇书开始/继续学习不能批量创建 PersonalCard；词汇书复习不能混入主复习。
- 不修改 `project.private.config.json`，不自动 commit/push，不操作生产数据库。

## 4. R-001 至 R-005 决策状态

| 规则 | 已能冻结的部分 | 仍需产品确认 | 当前建议 |
|---|---|---|---|
| R-001 错题流程 | 第一次错留在当前题展示例句；第二次错约 150ms 后进入详情；返回恢复同一 session/current item；答对后才进入下一题 | 已确认 | 第一次错和第二次错都立即写 `ReviewAnswerLog`；每次回答都更新 FSRS；第二次错进入详情，返回后允许继续回答 |
| R-002 批量 | 保留现有 `5 / 10 / 15`，不采用 Demo 复习章节的其他值 | 无 | 冻结为 `5 / 10 / 15` |
| R-003 首页精选 | 每日固定 3 条，1 主卡 + 2 紧凑卡；发现更多独立入口；加入状态来自后端 | 日期时区、批次稳定 key、详情 DTO 和失败重试实现细节 | 使用 `Asia/Shanghai` 自然日；后端生成稳定 batch key；重试复用同日成功或稳定失败记录，不随机换批 |
| R-004 后端与离线 | PostgreSQL 权威；允许按用户隔离缓存、乐观界面、待同步队列 | 已确认 | 保留离线新增、编辑、删除；界面显示“保存成功/删除成功”，不显示 `pending/failed`。内部仍保留队列、重试和失败记录 |
| R-005 词汇书关系 | 开始/继续按用户保存学习进度；不整本加入；单条可加入 PersonalCard；书内复习独立 | 无 | 新增独立 wordbook learning/review 域，不复用 Card 模拟 |

R-001、R-002、R-003、R-004、R-005 已冻结。

### Review feedback compatibility decision

用户已确认采用方案 B：正式反馈接口同时兼容旧 `result-only` 请求和 Review V1 请求。

- 当请求包含 `question_id` 与 `selected_option_id` 时，走 Review V1，服务端根据题目和选项判定对错。
- 当请求缺少上述字段但包含旧 `result` 时，走兼容分支；`forgot`/`shaky` 归为错误，`got_it`/`fluent` 归为正确。
- 两条路径都必须使用 `client_action_id` 幂等，并遵守 R-001：每次回答写 `ReviewAnswerLog`、更新 FSRS；第一次错和第二次错都不能丢失。
- 兼容请求不得覆盖 V1 请求的题目、选项和快照语义；旧 `ReviewLog` 仅作为兼容历史投影，不能替代 `ReviewAnswerLog`。
- 该规则已冻结，兼容分支已实现并通过旧 Phase 2 与 Review V1 回归。

## 5. 页面追踪矩阵

目录实际有 26 张截图，已确认这 26 张就是完整验收集。下表冻结正式目标 route、视图状态和数据边界；当前缺失的 route/API 由后续批次实现。

| final-screen | 正式目标 route | 关键状态 | 数据/API | 主要模型/测试 |
|---|---|---|---|---|
| home | `pages/index/index` | 3 条精选、加载、错误、重试、加入状态 | `GET /api/discovery/today-quote` 扩展为 3 条；详情/加入复用公共素材 API | PublicMaterial；discovery contract |
| life-english | `pages/life-english/index` | 分类、列表、分页、换一批、到底、回顶 | discovery 分类列表、曝光、weak feedback、TTS | PublicMaterial；discovery PostgreSQL |
| reading-english | `pages/reading-english/index` | 同上 | discovery 分类列表、分页、详情 | PublicMaterial；discovery PostgreSQL |
| material-detail | `pages/material-detail/index` | 公共详情、参考信息折叠、AI/TTS/加入失败 | 公共详情、按需 AI、TTS、PersonalCard upsert | PublicMaterial/Analysis/PersonalCard |
| material-added | `pages/material-detail/index` | 已加入成功状态 | PersonalCard 幂等创建 | PersonalCard；card contract |
| my-english-empty | `pages/index/index` | 我的英语空态 | cards list | Card |
| my-english-list | `pages/index/index` | 默认最近加入、搜索、筛选、分页 | `GET /api/cards` 扩展稳定 DTO | Card；cards API |
| my-english-search-empty | `pages/index/index` | 搜索无结果、清除、重试 | cards list query | Card；frontend list tests |
| my-english-vocabulary | `pages/index/index` | 词汇书来源 Tab、来源筛选 | cards list source filter | PersonalCardSource；cards API |
| my-english-detail-collapsed | `pages/my-english-detail/index` | 连续详情流、参考信息收起 | card detail | Card/Source/EncounterRecord |
| my-english-detail-expanded | `pages/my-english-detail/index` | 参考信息展开、AI 状态 | card detail/analysis | Card/Analysis |
| add-english | `pages/add/add` | 输入、校验、能力、草稿、AI/TTS、保存 | validation/analyze/cards create | Card；existing add tests |
| edit-english | `pages/add/add` | 编辑、版本冲突、删除、草稿恢复 | card detail/update/delete | Card version；card tests |
| review-home | `pages/review/review` | 5/10/15、空态、开始/继续 | review overview/session | ReviewSession/Card |
| review-question | `pages/review/review` | 未答题、四选项、不知道、退出恢复 | review today/question | ReviewQuestion |
| review-correct | `pages/review/review` | 正确反馈、自动下一题 | review feedback | AnswerLog/FSRS |
| review-wrong-first | `pages/review/review` | 第一次错、例句、不揭晓 | review feedback | AnswerLog/ReviewSessionItem |
| review-wrong-detail | `pages/my-english-detail/index` | 第二次错后详情 | review feedback + card detail | snapshot/Card |
| review-return-from-detail | `pages/review/review` | 返回同 session/current item | session recovery | ReviewSession/cache |
| review-done | `pages/review/review-done` | 本轮卡片列表、再来一轮、回入口 | session recap/summary | ReviewAnswerSnapshot |
| vocabulary-books | `pages/vocabulary-books/index` | 词汇书集合列表 | wordbook list | PublicMaterialPack |
| vocabulary-book-detail | `pages/vocabulary-book-detail/index` | 开始/继续、词条分页、进度 | wordbook detail/entries/progress | WordBookLearningProfile/EntryProgress |
| vocabulary-book-learning | `pages/vocabulary-book-learning/index` | 学习位置、退出、恢复 | learning progress | WordBookEntryProgress |
| vocabulary-word-detail | `pages/vocabulary-word-detail/index` | 公共词条详情、单条加入 | public detail + PersonalCard upsert | PublicMaterialItem/PersonalCard |
| vocabulary-book-review | `pages/vocabulary-book-review/index` | 书内独立答题 session | wordbook review session/feedback | WordBookReviewSession |
| vocabulary-book-review-done | `pages/vocabulary-book-review-done/index` | 本书复盘、返回当前书 | wordbook session summary | WordBook review history |

当前可直接复用的 API 不能完整支撑上述矩阵：公共素材详情、每日三条、分类父子关系、词汇书学习、词汇书复习和 PersonalCard 来源/遇见记录均需后续合同批次补齐。

## 6. API 缺口基线

### 已有且应保持兼容

- Auth：请求 `code/timezone`；响应用户和 JWT；401 只自动刷新并重放一次；logout 后旧 refresh 不得恢复身份。
- Cards：创建、列表、详情、更新、删除、sync、stats；当前响应为 Card DTO，但来源和多条遇见记录尚未形成独立稳定关系。
- Discovery：pack/item 列表、known 状态、today quote；today quote 当前只返回 1 条。
- Review：today/session/question/feedback/summary/history；feedback 同时兼容旧 `result-only` 与 Review V1。

### 后续必须定义的接口

| 领域 | 接口能力 | 必须冻结的合同 |
|---|---|---|
| cards | source、source wordbook、多个 encounter、参与复习 | 请求/响应字段、用户所有权、版本冲突、删除重加、幂等和分页 |
| discovery | 每日三条、分类、详情、曝光、换一批、公共 AI | Asia/Shanghai、batch key、公共缓存、失败隔离、错误码 |
| wordbooks | 列表、详情、开始/继续、词条分页、进度、单条加入 | user + book 唯一性、继续位置、不能批量建 Card、幂等 |
| reviews | R-001 状态机、书内 domain、恢复、快照 | 每个事件持久化时点、FSRS、question stale、session 过期、client_action_id |

## 7. 自动验收证据

### 前端

命令：`node --test tests/*.test.js`  
结果：57 项，41 通过，0 失败，16 跳过。跳过项是需要真实微信开发者工具证据的 Layer 3，不能视为 PASS。

命令：对前端 47 个 JavaScript 文件逐个执行 `node --check`。  
结果：47 通过，0 失败。

命令：`git diff --check`。  
结果：通过；输出仅包含当前已有文件的 LF/CRLF 警告。

### 后端

命令：`pytest --collect-only -q`。  
结果：635 项可收集。

命令：`pytest -q -m 'not layer2'`。  
初始结果：552 通过，37 失败，27 跳过，19 deselected。该旧结果用于记录 B 方案实施前的基线；兼容实现后的最终结果见第 9 节。

PostgreSQL：Windows 服务 `postgresql-x64-16` 正在运行。使用独立数据库 `english_analyzer_batch0_20260912` 完成迁移并执行 `tests/test_discovery_postgresql.py tests/test_review_v1_postgresql.py`，结果为 `6 passed, 3 warnings`。随后在同一隔离库完成 `alembic downgrade -1`、确认 `h2i3j4k5l6m7`、再 `alembic upgrade head`，最终恢复到 `i3j4k5l6m7n8 (head)`。未执行生产数据库迁移或数据写入。

微信开发者工具和真实 `wx.login + wx.request`：本批未验收，不能用自动化测试替代。

## 8. 工作区状态

### English-study-miniapp

第 0 批未修改产品代码。开始审计时已有用户修改：`app.json`、`project.config.json`、`pages/demo/*`、`utils/demoMock.js`、`utils/demoStore.js`、新增 `assets/` 和 `design/`，以及删除的 `CLAUDE.md`、`README.md`。这些修改全部保留。

第 0 批新增本报告：`docs/refactor/batch-0-audit-2026-09-12.md`。

### English-analyzer-backend

第 0 批新增 B 方案实现：`app/routers/reviews.py`。用户已有的 listening 资料文件保持不变；未修改迁移、生产配置或生产数据。

## 9. 未通过项、根因和需要确认的最小问题

1. 初始后端基线存在 37 个失败，根因是旧 Phase 2 测试合同和当前 Review V1 router 不一致；该问题已由 B 方案兼容分支解决。
2. 当前 `/api/reviews/feedback` 已同时支持 Review V1 和合法旧 `result-only` 请求；不支持的旧值仍按 schema 返回 422。

第 0 批最终复验已完成，原先记录的失败项已由 B 方案兼容实现解决：

- `pytest -q -m "not layer2"`：`589 passed, 27 skipped, 19 deselected, 15 warnings, 51 subtests passed`。
- `tests/test_review_v1_api.py tests/test_reviews_phase2_api.py`：兼容回归通过；旧 `result-only` 和 Review V1 均可用。
- `tests/test_discovery_postgresql.py tests/test_review_v1_postgresql.py`：`6 passed, 3 warnings`。
- `python -m compileall -q app`：通过。
- `git diff --check`：通过。

结论：第 0 批 PASS，可以进入第 1 批。允许进入的原因是 B 方案已经落到 `/api/reviews/feedback`：旧 `result-only` 请求会映射为稳定题目/选项并同时写入 `ReviewAnswerLog`、更新 FSRS、投影旧 `ReviewLog`；Review V1 仍保留严格题目、选项和 stale 校验。两条路径都保留 `client_action_id` 幂等语义。

本轮未查看图片、未生成图片、未修改微信开发者工具配置、未执行生产库迁移或写入；因此第 1 批开始前仍需按原计划做鉴权、transport 与领域 API 基础实现。
