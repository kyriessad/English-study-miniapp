# Phase 7G–7J 总结：首页体验与来源输入体验优化

## 阶段定性

本阶段是纯前端体验 polish，在 Phase 7F 完成 whereEncountered 展示闭环后，继续补齐：

- Add/Edit 来源输入的可用性问题
- 首页卡片 meta 行文案冗余问题
- 首页筛选布局可发现性问题
- 离线编辑数据不写入本地 cache 的缺陷

**不改后端、不改数据库、不改 Card schema、不改 review session、不删除 exam_scene / exam_module。**

---

## 各子阶段详情

### Phase 7G-1：Add/Edit 来源 placeholder 修复

**问题**：微信小程序原生 `<input>` 组件不能通过 CSS `padding` 自然撑高高度，导致"在哪里遇到"输入框的 placeholder 只显示下半截。

**修复**：新增 `.input-source` 类，显式设置 `height: 80rpx; line-height: 80rpx; padding-top/bottom: 0`，同时将 placeholder 文案改为更贴近用户习惯的"例如 美剧、电影、抖音、B站等"。

**修改文件**：`pages/add/add.wxml`、`pages/add/add.wxss`

**commit**：`42300ad`

---

### Phase 7H-1：首页底部 meta 行复习文案精简

**问题**：首页卡片底部 meta 行左侧显示"未复习"、"已复习 N 次 · 上次：xxx"，信息密度过高，"复习次数"对用户决策价值低。

**修改语义**：

| 场景 | 修改前 | 修改后 |
|---|---|---|
| 从未复习 | "未复习" | 不显示 |
| 今天复习过 | "已复习 N 次 · 上次：今天" | "今天复习过" |
| 之前复习过 | "已复习 N 次 · 上次：xxx" | "上次：xxx" |

source pill（来自：xxx）不受影响，meta 行整体不消失，只是左侧文案更轻。

**修改文件**：`pages/index/index.js`（`decorateCards` 中的 `reviewCountText` IIFE）、`pages/index/index.wxml`（meta 行加 `wx:if` 避免空行）

**commit**：`e9342e5`

---

### Phase 7I-1：首页卡片类型筛选平铺与状态 Tab 单行优化

**问题**：状态 Tab（全部/待学习/复习中/待加强/已掌握）在窄屏幕上折成两行；卡片类型筛选（全部/单词/短语/句子）藏在折叠的高级筛选区，用户难以发现。

**修复**：
- 状态 Tab 外层加 `<scroll-view scroll-x>` 并改为 `display: inline-flex; flex-wrap: nowrap`，单行横向可滚动。
- 卡片类型筛选提升为常驻 pill bar，放在搜索框上方，移除原折叠筛选区中的重复入口。
- 新增 `onCategoryPillTap` handler 读取 `dataset.index`，复用原有 `applyFilters` 逻辑，筛选语义不变。
- 搜索仍覆盖英文、理解、备注、来源四个字段。

**修改文件**：`pages/index/index.wxml`、`pages/index/index.wxss`、`pages/index/index.js`

**commit**：`337704a`

---

### Phase 7J-1：Add/Edit 最近用过来源快捷标签

**问题**：用户经常从同一个来源（美剧、B站等）记录单词，每次手动输入来源重复度高。

**实现**：在来源输入框下方新增"最近用过"快捷标签。

- 从现有 `cardsCache`（`wx.getStorageSync('cardsCache')`）同步读取，不新增 storage key。
- 读取 `card.whereEncountered`，兼容旧字段 `card.where_encountered`。
- 去空、去重（保留最近出现顺序的第一次），最多显示 5 个。
- 点击标签后直接填入 `form.whereEncountered`，覆盖当前值。
- readonly 详情页隐藏该区域。
- 不改保存 payload，不改后端。

**修改文件**：`pages/add/add.js`（`buildRecentWhereEncounteredOptions`、`onSourceSuggestionTap`）、`pages/add/add.wxml`、`pages/add/add.wxss`

**commit**：`7387781`

---

### Phase 7J-2-hotfix：Add/Edit 离线更新兜底与保存文案简化

**问题 A**：新增卡片离线可以成功（`addCard` 的 POST 失败分支有 fallback），但编辑已有卡片离线时 `updateCard` 末尾的 PATCH 没有 try/catch，抛出异常后 `saveCard` 显示"更新失败"，本地 cache 完全不写入。

**问题 B**：保存成功的 toast 文案"已先保存，联网后自动更新"对用户有歧义，暴露了内部同步状态。

**修复**：

1. `updateCard`（recordStorage.js）：末尾 PATCH block 包进 try/catch。PATCH 失败时调用 `buildCardFields(form, currentCard)` 构建最新字段，以 `{...currentCard, ...latestFormFields, backend_sync_status: 'pending', updatedAt: Date.now()}` 写入本地 cache，返回 localCard（不再抛异常）。

2. `refreshCardsCacheFromBackend`（recordStorage.js）：修改 `pendingCards` filter，含 `backend_card_id` 的 pending 卡（pending-update 类型）不再被排除，交由 `dedupeCards` 的 `updatedAt` 时间戳判断（本地编辑时间 > 后端旧时间戳，本地版本胜出），防止联网刷新时覆盖本地未同步的修改。

3. `syncPendingCardsToBackend`（recordStorage.js）：新增 `if (pendingCard.backend_card_id)` 分支，直接 PATCH，避免对已知后端 id 的卡片发起重复 POST（可能创建副本）。

4. 保存文案简化（add.js）：
   - 新增卡片：一律显示"已保存"（无论在线/离线）
   - 编辑卡片：一律显示"已更新"（无论在线/离线）
   - 内部 pending 状态保留，不向用户暴露。

**修改文件**：`utils/recordStorage.js`、`pages/add/add.js`

**commit**：`e30d09b`

---

## 最终产品语义

### Add/Edit 页

- 来源输入框 placeholder 完整可见，文案为"例如 美剧、电影、抖音、B站等"
- 输入框下方有"最近用过"快捷标签（最多 5 个，从 cardsCache 推导，不新增 storage key）
- 点击标签后来源输入框立即填充，保存逻辑不变
- 离线新增：toast"已保存"，卡片写入本地 pending，联网后自动同步
- 离线编辑：toast"已更新"，修改写入本地 cache（含 whereEncountered），联网后 PATCH 到后端
- 在线新增/编辑：toast 同上，后端立即同步

### 首页卡片库

- 状态 Tab 单行横向可滚动
- 卡片类型筛选常驻在搜索框上方（全部/单词/短语/句子）
- meta 行左侧：未复习不显示、今天复习过显示"今天复习过"、之前复习过显示"上次：xxx"
- meta 行右侧：source pill"来自：xxx"不变
- 搜索覆盖英文、理解、备注、来源

---

## 本阶段未做的事

- 未做动态 placeholder（根据已有来源变化）
- 未做来源语义联想（如"工作相关 → Slack"）
- 未做设置页管理常用来源
- 未新增来源统计接口
- 未新增任何 storage key
- 未改历史页 / 今日复习内容页 / 复习页展示语义
- 未改后端 schema、Card model、review session
- 未删除 exam_scene / exam_module

---

## 下一步建议

进入 **Phase 7K-readonly**：整体产品验收与技术债审查。

重点检查项：
- 离线编辑后 pending-update 卡在联网后是否完整 PATCH 到后端
- `syncPendingCardsToBackend` 新增的 backend_card_id 分支在实际网络恢复后的日志
- 首页 Tab 滚动在较小设备上的体验

暂不建议：
- 继续增加 whereEncountered 展示点（已闭环）
- 继续扩展来源管理系统（超出当前阶段范围）
