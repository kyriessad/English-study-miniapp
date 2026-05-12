# Phase 5-4 历史页统一查询语义阶段总结

## 一、阶段目标

Phase 5-4 的目标是将历史页的搜索、时间范围、quick filter、分页、summary 统一为**后端查询语义**，从根本上解决此前前端只过滤当前已加载页导致的多项问题：

- **list 请求**由后端根据 `date_range`、`search`、`result[]`、`limit`、`offset` 执行完整查询，前端不再对本地已加载页做二次过滤。
- **summary 请求**由后端根据 `date_range`、`search` 统计（不跟随 `result` filter），确保 quick filter 按钮数字始终表示当前条件下的全量分布，而不是当前 filter 下的局部数量。
- **quick filter** 点击后重新向后端请求对应 filter 的数据，不再只从当前已加载页做前端过滤。
- **已掌握**对应 `got_it` + `fluent` 多值 result（`result=got_it&result=fluent`），不是单一 `got_it`。
- **分页**在搜索、时间范围、quick filter 切换时自动重置；加载更多只改变 `offset`，其余条件不变。

## 二、阶段拆分与提交记录

### 1. Phase 5-4A：后端能力补齐

> 此部分发生在后端仓库，不在本前端仓库提交记录中。

内容：

- `/api/reviews/history` 支持多值 `result` 过滤
- 支持 `result=got_it&result=fluent`
- `/api/reviews/history/summary` 支持 `search`
- summary search 搜索范围与 list 保持一致
- 不改数据库 schema
- 不改前端

验证：

- `python -m pytest -q` 通过
- 人工接口验收：
  - 单值 result 过滤正确
  - 多值 result 过滤正确
  - 多值 result + search 组合过滤正确
  - summary 对搜索存在词返回正确统计
  - summary 对搜索空结果返回全 0

---

### 2. Phase 5-4B：前端接入统一查询语义

**commit:** `c597aa5`  
**message:** `connect history filters to backend pagination`

内容：

- 历史页 list 请求统一携带 `date_from` / `date_to` / `search` / `result[]` / `limit` / `offset`
- summary 请求统一携带 `date_from` / `date_to` / `search`
- summary **不跟随** `result` filter
- quick filter 点击后调用 `loadHistoryData()` 重新请求后端 list，不再只过滤当前已加载页
- "已掌握"传 `result=got_it&result=fluent`
- 搜索确认、时间范围切换、quick filter 切换后重置分页（offset = 0，hasMore 重置）
- 加载更多延续当前 range / search / filter，只递增 `offset`
- 保留后端失败时的本地 fallback

验证：

- 后端开启时 Network 请求参数符合预期
- 搜索、时间范围、quick filter、加载更多基本流程通过
- 后端关闭时 fallback 不崩

---

### 3. Phase 5-4C：只读审查 + hotfix

**commit:** `01ddbbf`  
**message:** `fix history search clear summary refresh`

Phase 5-4C 最初计划为纯只读审查，不改代码。审查结果为 PASS, 但人工验收发现一个 **P1 状态一致性 bug**：

**bug 表现：**
1. 后端开启，搜索不存在的关键词 "abc"
2. 后端返回空列表，页面显示空状态，summary / quick filter 数字全为 0（此处合理）
3. 点击搜索框右侧 × 清空搜索
4. **预期：** list 和 summary 恢复
5. **实际：** 数字仍然卡 0，空搜索框按回车仍然 0，点击"想不起来"再按回车仍然 0
6. 点击"全部"后列表有卡片但按钮数字仍为 0
7. 在搜索框再按一次回车才恢复

**根因：**

```
搜索无结果 → _renderEmpty() 设置 usingBackendHistory = false
         → 清空搜索时 onSearchClear() 检查 usingBackendHistory = false
         → 走 _applyFrontendFilters() 路径
         → _applyFrontendFilters() 操作于空 allSummaries（已被 _renderEmpty 清空）
         → 永远返回空，无法恢复
```

本质上：后端查询成功但返回空结果，不等于后端不可用。但代码把"空结果"与"后端不可用"混为一谈，并且清空搜索没有强制走后端重新加载。

**hotfix 内容：**

修改 [pages/history_reviewed/history_index.js](pages/history_reviewed/history_index.js) 中三个搜索 handler：

| 函数 | 改动 |
|------|------|
| `onSearchInput` auto-clear | 去掉 `usingBackendHistory` 分支，直接调 `loadHistoryData({ refreshSummary: true })` |
| `onSearchConfirm` | 同上 |
| `onSearchClear` | 同上 |

**修复原理：** 搜索确认和清空搜索统一走后端 `loadHistoryData()`，不依赖 `usingBackendHistory` 标志判断。后端可用时正常请求，后端不可用时 catch 块自动 fallback 到本地数据。

**验证：**
- `node --check pages/history_reviewed/history_index.js` 通过
- `git diff --check` 通过
- 搜索不存在关键词后清空搜索，summary 数字恢复
- 空搜索框按回车后 summary 数字恢复
- quick filter / "全部"切换后列表和数字一致
- 临时将 `backendHistoryLimit` 改为 5 验证加载更多：offset 正确递增、limit 保持、date range 延续
- 提交后 `git status --short` 干净

## 三、最终查询语义

### 1. list 请求

```
GET /api/reviews/history?date_from=...&date_to=...&search=...&result=...&limit=100&offset=0
```

| 参数 | 必填 | 语义 |
|------|------|------|
| `date_from` | 非全部历史时 | 时间范围起始 |
| `date_to` | 非全部历史时 | 时间范围结束 |
| `search` | 否 | 关键词搜索（英文内容、释义、备注等） |
| `result[]` | 否 | quick filter（多值，可重复出现） |
| `limit` | 是 | 每页条数，正式值 100 |
| `offset` | 是 | 偏移量，初始加载 0，加载更多递增 |

**加载更多：** 只改变 `offset`（= 当前已加载的 `allSummaries.length`），其余条件不变。

### 2. summary 请求

```
GET /api/reviews/history/summary?date_from=...&date_to=...&search=...
```

| 参数 | 必填 | 语义 |
|------|------|------|
| `date_from` | 非全部历史时 | 同 list |
| `date_to` | 非全部历史时 | 同 list |
| `search` | 否 | 同 list |

**约束：**
- summary 跟随时间范围
- summary 跟随搜索关键词
- summary **不跟随** quick filter 的 `result`
- quick filter 按钮数字表示当前 date range + search 下的全量结果分布，而不是当前 filter 的局部数量

### 3. quick filter 映射

| 按钮 | `result` 参数 | 说明 |
|------|--------------|------|
| 全部 | 不传 | — |
| 想不起来 | `result=forgot` | 单值 |
| 不太稳 | `result=shaky` | 单值 |
| 已掌握 | `result=got_it&result=fluent` | **多值**，后端须以数组中任一匹配 |

多值序列化：`buildQueryString` 将数组展开为多个同名参数（`result=got_it&result=fluent`），非逗号拼接。

## 四、fallback 边界

| 场景 | 行为 | 说明 |
|------|------|------|
| 后端成功 | 使用后端 list + summary | 正常路径 |
| 后端 list 失败 | fallback 到本地历史数据 | catch → `_fallbackToLocalHistory()` |
| 后端 summary 失败 | 基于已返回 list 做近似统计 | catch → `computeHistoryStatsFromItems()` + `buildBackendQuickFilterOptions()` |
| 后端成功但空列表 | 不等于后端不可用 | hotfix 后已不污染后续清空搜索路径 |
| 搜索无结果 | 正常空状态 | 列表为空，summary 全 0，属于正确语义 |
| 无本地历史数据 | 显示合理空状态 | "当前条件下还没有历史记录" |

## 五、已知非阻塞技术债

### 1. `_loadMoreBackendHistory` 中 limit / offset 重复赋值

[history_index.js 中 `_loadMoreBackendHistory`](pages/history_reviewed/history_index.js#L501-L505)

```js
const params = buildBackendHistoryParams(..., limit, offset);
params.limit = ...;  // 重复赋值
params.offset = ...; // 重复赋值
```

- **影响：** 代码冗余，无行为差异
- **建议：** 后续小清理阶段移除重复赋值

### 2. quick filter 与搜索 handler 的 fallback 控制流曾不一致

hotfix 之后：

- `onSearchConfirm` / `onSearchClear` / `onSearchInput` auto-clear 直接调 `loadHistoryData()`，不检查 `usingBackendHistory`
- `onQuickFilterTap` 也直接调 `loadHistoryData({ refreshSummary: false })`，不检查 `usingBackendHistory`

- **当前状态：** 行为已统一为优先请求后端
- **注意：** 未来维护者需注意 `usingBackendHistory`、空结果、fallback 三者不能混淆

### 3. summary 失败时基于当前 list 做近似统计

当后端 summary 单独失败时，fallback 使用第一页（≤100 条）的数据做近似统计。

- **影响：** 分页未加载全量时，统计数字可能不精确
- **建议：** 降级策略可接受。如需要更严谨，可增加重试或 UI 提示

### 4. `backendHistoryLimit` 正式值为 100

- 测试分页时可临时改小，**禁止提交**改小的值
- 当前正式值为 100，与后端默认分页大小一致

## 六、下一阶段可选方向

### 选项 A：Phase 5-5 历史详情页 / 复习记录详情 ⭐ 推荐

- 点击历史卡片进入详情
- 展示当次复习结果、卡片内容、理解、备注、考试场景、模块、时间
- 理由：历史列表后端化已经稳定，详情页是自然延伸，用户可直接受益

### 选项 B：历史页统计图 / 趋势图

- 按日期统计复习次数
- 按结果统计分布 / 趋势
- 风险：需新增 stats 接口或扩展现有 summary，容易扩大范围
- 建议：暂不优先

### 选项 C：代码小清理

- 移除 `_loadMoreBackendHistory` 重复赋值
- 梳理 fallback / empty state 命名
- 风险低但收益不如详情页

### 选项 D：直接进入下一大功能

- 可行，但建议保持小步验收，不建议同时推进详情页 + 图表 + 复杂统计

**最终建议：** 优先进入 Phase 5-5 历史详情页。

## 七、阶段结论

Phase 5-4 已完成。

当前历史页搜索、时间范围、quick filter、分页、summary 已统一为后端查询语义。

Phase 5-4C 发现的 P1 状态一致性问题（搜索空结果后清空搜索导致 summary 无法恢复）已通过 `01ddbbf` 修复。

当前工作区**无 P0 / P1 阻塞问题**。
