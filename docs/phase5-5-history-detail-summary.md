# Phase 5-5 历史详情页阶段总结

## 一、阶段目标

Phase 5-5 的目标是：

- 从历史列表点击某条历史记录，进入历史详情页
- 详情页以 **review_log** 为主实体（不是 card）
- 展示**复习事件信息**和**关联卡片当前内容**
- 不在历史详情页做编辑、删除、重新复习

---

## 二、子阶段完成情况

### Phase 5-5A：前端页面骨架

- 新增 `pages/history_detail` 页面（`.js` / `.wxml` / `.wxss` / `.json`）
- `app.json` 注册 `pages/history_detail/history_detail`
- 历史列表点击跳转 `/pages/history_detail/history_detail?id=<logId>`
- 当时只是页面骨架，`onShow` 不请求后端，页面显示"详情接口待接入"

### Phase 5-5B：后端详情接口

> 此部分发生在后端仓库，不在本前端仓库提交记录中。

- 后端 `/api/reviews/history` list item 新增 `review_log_id` 字段
- 新增 `GET /api/reviews/history/{log_id}` 详情接口
- 详情接口主实体为 **ReviewLog**，返回字段包括：
  - `id`
  - `review_log_id`
  - `reviewed_at`
  - `result`
  - `result_label`
  - `session_type`
  - `session_type_label`
  - `card`（可为 null）
- `card` 为可空关联实体：后端始终查询关联卡片，但卡片删除/归档/软删除/不可用时返回 `200` + `card: null`（不是异常）
- `log` 不存在时返回 `404`
- 后端 commit：`dce27e4`，提交信息 `add history detail endpoint and log id`

### Phase 5-5C：前端接入详情接口

**commit:** `3310e87`
**message:** `connect history detail page to backend`

内容：

- `history_index.js` 中 `mapBackendHistoryItem` 的 `logId` 改为使用 `item.review_log_id`
- 后端路径下不再用 `card_id` 冒充 `log_id`
- 详情页 `history_detail.js` 完整实现：
  - `onLoad` 解析 `logId`，不发起请求
  - `onShow` 调用 `loadDetailData()`
  - `loadDetailData` 实现 loading / refreshing 并发锁
  - `try / catch / finally` 完整状态机
  - `onUnload` 后 `_isUnmounted` 防止 setData
  - 首次加载失败显示全屏 error UI（404 → "这条历史记录不存在或已被删除"；其他 → "历史详情加载失败"）
  - 静默刷新失败保留已有 `detail`，只 toast "最新状态同步失败"
- `apiClient.js` 新增 `getReviewHistoryDetail(logId)` 函数
- WXML 展示两个区块：
  - **复习信息**：复习结果、复习时间、学习来源
  - **卡片当前内容**：英文内容、我的理解、补充备注、卡片类型、考试场景、考试模块、当前卡片状态、下次复习时间（card 存在时）
- `card: null` 时显示孤儿日志 UI："该卡片已被删除或不可用，无法查看当前内容"
- 所有 `detail.card.xxx` 访问均被 `wx:if="{{detail.card}}"` 保护，无空指针风险
- 本地 fallback 数据兼容：`_fallbackToLocalHistory` 中为本地 items 添加 `logId`

验证：

- `node --check` 全部通过
- `git diff --check` 通过
- 后端开启时 Network 出现 `GET /api/reviews/history/{review_log_id}`
- 页面正常显示复习信息和卡片内容
- Console 无 JS 报错

### Phase 5-5D-hotfix：删除"前往编辑卡片"按钮

**commit:** `e20bf47`
**message:** `remove redundant card entry from history detail`

内容：

- Phase 5-5D 曾加入"前往编辑卡片"按钮，位于卡片当前内容区块下方
- 产品复盘后认为：历史详情页本身已展示关联卡片的完整当前内容，不应再提供冗余的查看/编辑入口
- 删除内容：
  - WXML 中 `.detail-actions` + `.edit-card-button` 节点
  - JS 中 `canEditCard` / `editCardId` data 字段
  - JS 中 `loadDetailData` 的 `editCardId` 计算
  - JS 中 `goEditCard()` 方法
  - JS 中 `normalizeHistoryDetail` 的 `card.id` / `card.card_id` / `card.cardId` 赋值
  - WXSS 中 `.detail-actions` / `.edit-card-button` 样式
- 历史详情页的核心展示能力（复习信息、卡片内容、card:null UI、loading/error 状态）完整保留

验证：

- `node --check` 通过
- `git diff --check` 通过
- 按钮完全消失，页面功能正常

---

## 三、最终数据契约

| 项目 | 约定 |
|------|------|
| **详情页主实体** | `review_log`（ReviewLog），不是 `card` |
| **复习事件字段** | `result` / `reviewed_at` / `session_type` / `result_label` / `session_type_label` — 属于历史事件，不可变 |
| **card 字段** | 当前卡片最新状态，**不是历史快照** |
| **card 可为 null** | 关联卡片已删除、归档、软删除或不可用时，后端返回 `200` + `card: null` |
| **log 不存在** | 后端返回 `404` |
| **内容快照** | 本阶段不做 `content_snapshot` / `understanding_snapshot` / `note_snapshot` |
| **本地 fallback** | 本阶段详情页不支持本地 fallback；无后端时无法查看详情 |

---

## 四、最终页面行为

### 正常流程

1. 用户从历史列表点击一条历史记录
2. 进入 `/pages/history_detail/history_detail?id=<review_log_id>`
3. 页面发起 `GET /api/reviews/history/{review_log_id}`
4. 加载成功后显示两个区块：

**复习信息区：**
- 复习结果（`result_label`）
- 复习时间（`reviewed_at` 格式化后的文本）
- 学习来源（`session_type_label`）

**卡片当前内容区（card 存在时）：**
- 英文内容、我的理解、补充备注
- 卡片类型、考试场景、考试模块
- 当前卡片状态、下次复习时间

### card:null 时

- 复习信息区正常显示
- 卡片区显示："该卡片已被删除或不可用，无法查看当前内容"
- 不白屏，不报 `detail.card.content` 空指针错误

### 错误处理

| 场景 | 行为 |
|------|------|
| 缺少 logId | 显示"缺少历史记录 ID"，不发请求 |
| 首次加载 404 | 显示"这条历史记录不存在或已被删除" |
| 首次加载网络/5xx 错误 | 显示"历史详情加载失败" |
| 静默刷新失败（已有 detail） | 保留旧 detail，toast "最新状态同步失败" |
| onUnload 后 | 所有 setData 被 `_isUnmounted` 阻止 |

### 不在详情页提供的功能

- 不显示"前往编辑卡片"按钮
- 不支持编辑卡片
- 不支持删除历史记录
- 不支持重新复习

---

## 五、验收结果

| 验收项 | 结果 |
|--------|------|
| 后端 5-5B 单文件测试和全量测试 | 通过 |
| 前端 5-5C 主流程验收 | 通过 |
| 历史页点击进入详情页 | 成功 |
| Network 出现 `GET /api/reviews/history/{review_log_id}` | 确认 |
| 页面显示复习信息和卡片当前内容 | 确认 |
| 5-5D-hotfix 后按钮已删除 | 确认 |
| 最终前端工作区干净 | 确认 |
| `node --check` | 通过 |
| `git diff --check` | 通过 |

**已知未完整覆盖：** 静默刷新失败和 `card:null` 的人工场景不一定完整覆盖，但代码层面已有状态机和条件渲染保护（`this._isUnmounted` / `wx:if="{{detail.card}}"` / `try-catch-finally`），不阻塞当前阶段收口。

---

## 六、后续技术债 / 后续阶段

| 技术债 / 后续任务 | 说明 |
|-------------------|------|
| **本地 fallback 详情页** | 当前详情页不支持无后端模式；如将来需要离线查看历史详情，需实现本地 fallback |
| **card:null 孤儿日志治理** | 删除卡片后关联的历史记录变为孤儿日志；可考虑清理或标记 |
| **内容快照** | 如果将来需要保留删除卡片后的历史内容，需引入 `review_log` 的内容快照字段（`content_snapshot` 等） |
| **历史记录删除 / 级联清理** | 删除历史记录、过滤孤儿日志暂不做 |
| **页面视觉一致性** | 进入 Phase 5-6 单独处理，不在本阶段解决 |
| **编辑卡片入口** | 产品决策：不在历史详情页内加入编辑卡片能力；入口保留在历史列表页和首页 |

---

## 七、阶段结论

**Phase 5-5 完成。**

历史详情页主流程已打通：

- 历史列表 → 点击记录 → 详情页 → 展示复习事件信息 + 关联卡片当前内容
- card:null 有独立的孤儿日志 UI
- loading / refreshing / error / 首次失败 / 静默刷新失败 / onUnload 防 setData 全部就位
- 编辑按钮已按产品决策删除

**当前可以进入 Phase 5-6：页面视觉一致性整理。**
