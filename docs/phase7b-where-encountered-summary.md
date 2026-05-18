# Phase 7B：在哪里遇到（whereEncountered）完成总结

## 阶段目标

用"在哪里遇到"强化场景记忆，让用户复习时能想起这条英文来自哪里。
例如：NBA 解说 / 美剧 Friends / 工作邮件。

## 已完成内容

### 后端（English-analyzer-backend）

- **e43eaab** `add where encountered field to cards`
  - `app/models/card.py`：Card 表新增 `where_encountered`（Text，nullable）
  - `app/schemas/card.py`：CardCreate / CardUpdate / CardResponse 均加入该字段
  - `app/services/card_service.py`：create_card / update_card 透传该字段
  - `alembic/versions/a8b9c0d1e2f3`：idempotent migration（IF NOT EXISTS 守卫）
  - `tests/test_cards_api.py`：新增 3 个测试用例

- **55829f1** `include where encountered in review items`
  - `app/schemas/reviews.py`：ReviewItemResponse 新增 `where_encountered: str | None = None`
  - `app/routers/reviews.py`：`_item_response()` 从 `card.where_encountered` 取值
  - `tests/test_reviews_phase2_api.py`：新增 2 个测试（有值 / 无值各一）

### 前端（English-study-miniapp）

- **614631b** `connect add page where encountered field`
  - `pages/add/add.js`：createEmptyForm / getFormStateFromCard / resetFormForContinuousAdd 含 whereEncountered；新增 `onWhereEncounteredInput` handler；buildBackendCardPayload 含 `where_encountered`
  - `pages/add/add.wxml`：新增"在哪里遇到（可选）"输入框（位于英文内容与我的理解之间）；补充备注 placeholder 去除"来源 / 语境"
  - `pages/index/index.js`：示例卡 clutch / break a leg / I'll keep you posted 均填入 whereEncountered
  - `utils/recordStorage.js`：normalizeCard / buildCardFields / buildBackendCardCreatePayload / buildBackendCardPatchPayload / normalizeBackendCardToLocal / cardsNeedUpdate / syncPendingCardsToBackend 全部接入 whereEncountered

- **8d47ead** `show where encountered in review answer`
  - `pages/review/review.js`：normalizeReviewItem 映射 `where_encountered → whereEncountered`；`_refreshCurrentCardFromStorage` 编辑返回后同步刷新 `currentCard.whereEncountered`
  - `pages/review/review.wxml`：answerVisible 答案区内，有值时显示"来自：{whereEncountered}"（复用 task-notes-divider 分隔线）
  - `pages/review/review.wxss`：新增 `.task-source` / `.task-source-text`（字号 24rpx，颜色 #9ba8a0，弱于备注的 27rpx / #68786e）

## 产品语义

- **字段可选**：不强制填写，空值不展示，不制造"卡片不完整"压力。
- **不做下拉分类**：自由输入，不替代补充备注，不与 exam_scene / exam_module 混淆。
- **Add 页标签**：在哪里遇到（可选）；placeholder：例如 NBA 解说、美剧 Friends、工作邮件；maxlength 100。
- **复习页展示**：只在点击"查看理解"后显示，文案为"来自：XXX"，弱色小字，不抢英文内容和理解的视觉重心。
- **场景定位**：帮助用户唤起记忆场景，不是考试分类系统。

## 技术边界

- 后端字段名：`where_encountered`（snake_case）
- 前端字段名：`whereEncountered`（camelCase）
- 后端 `exam_scene` / `exam_module` 保留，不删除。
- 旧卡 `where_encountered` 为空是正常状态，不需要回填。
- 本地开发数据库曾因 Alembic 两分支状态问题（Branch 1 已追踪 `a6b7c8d9e0f1`，Branch 2 migration `a8b9c0d1e2f3` 未自动追踪）导致 PostgreSQL 缺列，需手动补列并 stamp。代码层 migration 文件本身正确存在。

## 不做事项

- 不做最近用过 / 常见来源快捷标签
- 不做首页搜索纳入 whereEncountered
- 不做首页卡片"来自 XXX"展示
- 不删除后端 exam_scene / exam_module 字段
- 不改历史 snapshot 展示
- 不改 today_reviewed 展示
- 不改 dailyGoal / review session 选卡 / feedback 逻辑

## 验收结果

后端测试 175 passed，前端语法检查通过，两个仓库工作区干净。

全链路人工验收通过（2026-05-18）：
1. Add 页新建卡含 whereEncountered，POST payload 和 response 正确。
2. 编辑页回显并修改保存，PATCH payload 和 response 正确。
3. 空字段保存正常，后端 where_encountered 为 null，复习页不显示"来自"。
4. pending fallback 离线保存，恢复后端同步不丢 whereEncountered。
5. 示例卡 whereEncountered 正确（clutch→NBA解说，break a leg→美剧/舞台表演，I'll keep you posted.→工作邮件）。
6. review session items 返回 where_encountered，前端映射为 whereEncountered。
7. 复习页点击"查看理解"后弱展示"来自：XXX"，feedback 按钮和下一张逻辑不受影响。

## 后续候选方向

以下方向尚未实现，后续按优先级选做：

- 首页搜索纳入 whereEncountered（关键词同时搜"在哪里遇到"字段）
- 首页卡片列表弱展示"来自 XXX"
- 删除前端考试场景 / 考试模块入口（exam_scene / exam_module 在 Add 页的 picker，用户较少用到）
- Add 页"最近用过 / 常见来源"输入辅助（快捷标签）
- history snapshot 是否展示 whereEncountered（需要单独审查历史快照语义）
- today_reviewed 页是否展示 whereEncountered（需要单独审查）
