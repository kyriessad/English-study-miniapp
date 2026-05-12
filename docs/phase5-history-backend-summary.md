# Phase 5 历史页后端化阶段总结

## 1. 当前阶段状态

截至当前版本，英语学习小程序历史页已完成：

- Phase 5-2B：历史页列表接入后端
- Phase 5-2C：历史页 summary 接入后端
- Phase 5-2D：历史页后端化收尾只读审查

当前 Git 状态：

```text
git status --short 干净
```

已提交版本：

```text
d99feaa connect history page to backend list
9271d80 connect history summary to backend
```

Phase 5-2D 仅做审查，没有业务代码修改，没有 commit。

---

## 2. 已完成内容

### 2.1 Phase 5-2B：历史页列表接入后端

提交：

```text
d99feaa connect history page to backend list
```

完成内容：

历史页列表已接入后端接口：

```text
GET /api/reviews/history?limit=100&offset=0
```

后端开启时：

- 历史页使用后端返回的 history list。
- 页面正常展示后端历史记录。
- 保留时间范围、搜索、quick filter 等前端筛选逻辑。
- 后端结果文案使用新文案：
  - 想不起来
  - 不太稳
  - 基本掌握
  - 很熟了

后端关闭时：

- `/api/reviews/history` 请求失败。
- 页面 fallback 到本地 `reviewRecords`。
- 页面不崩溃。

本阶段边界：

- 未改 WXML。
- 未改 WXSS。
- 未改后端。
- 未迁移 `reviewRecords`。
- 未清 Storage。
- 未删除本地 fallback。
- 未提交 `project.private.config.json`。

---

### 2.2 Phase 5-2C：历史页 summary 接入后端

提交：

```text
9271d80 connect history summary to backend
```

完成内容：

历史页顶部统计和筛选按钮数字已接入后端接口：

```text
GET /api/reviews/history/summary
```

后端 list 成功时：

- 列表数据来源：

```text
GET /api/reviews/history
```

- 顶部统计和筛选按钮数字来源：

```text
GET /api/reviews/history/summary
```

后端 summary 返回字段示例：

```json
{
  "total_reviews": 22,
  "unique_cards": 16,
  "latest_result_card_counts": {
    "forgot": 0,
    "shaky": 0,
    "got_it": 0,
    "fluent": 16
  }
}
```

页面字段映射关系：

| 后端字段 | 页面含义 |
|---|---|
| `total_reviews` | 总复习次数 |
| `unique_cards` | 涉及卡片数 |
| `latest_result_card_counts.forgot` | 想不起来 |
| `latest_result_card_counts.shaky` | 不太稳 |
| `latest_result_card_counts.got_it + latest_result_card_counts.fluent` | 已掌握 |

核心规则：

```text
list 来源决定 stats 来源。
```

具体路径：

1. 后端 list 成功，summary 成功：
   - list 使用后端 list。
   - stats / quickFilterOptions 使用后端 summary。

2. 后端 list 成功，summary 失败：
   - list 仍然使用后端 list。
   - stats / quickFilterOptions fallback 到 backend list items 临时计算。
   - 不切换到本地 `reviewRecords`。

3. 后端 list 失败：
   - list fallback 到本地。
   - stats / quickFilterOptions 也 fallback 到本地。
   - 不允许使用 backend summary。

---

### 2.3 Phase 5-2D：历史页后端化收尾审查

审查结论：

```text
PASS
```

审查内容：

#### 时间范围参数一致性

已确认 list 和 summary 的时间范围参数一致：

| 范围 | list 参数 | summary 参数 | 结果 |
|---|---|---|---|
| 全部历史 | 不传 `date_from/date_to` | 不传 `date_from/date_to` | 通过 |
| 最近 7 天 | `date_from=T-7`, `date_to=today` | `date_from=T-7`, `date_to=today` | 通过 |
| 最近 30 天 | `date_from=T-30`, `date_to=today` | `date_from=T-30`, `date_to=today` | 通过 |

当前页面没有自定义时间范围功能，暂不扩展。

#### 数据源一致性

已确认不存在以下混用风险：

```text
本地 list + 后端 summary
```

实际路径：

| 场景 | list 来源 | stats 来源 | 结果 |
|---|---|---|---|
| backend list success + summary success | 后端 | 后端 summary | 通过 |
| backend list success + summary fail | 后端 | 后端 list items 计算 | 通过 |
| backend list fail | 本地 | 本地 stats | 通过 |

#### 搜索行为

已确认：

- 搜索只影响可见列表。
- 搜索不覆盖 `stats`。
- 搜索不覆盖 `quickFilterOptions`。
- 搜索不触发错误的 summary 覆盖。
- `_applyFrontendFilters()` 只更新可见列表相关字段，不 touch stats / quickFilterOptions。

#### 筛选按钮行为

当前筛选按钮文案：

```text
全部
想不起来
不太稳
已掌握
```

映射关系：

| 按钮 | 结果映射 |
|---|---|
| 全部 | 不过滤 |
| 想不起来 | `forgot` |
| 不太稳 | `shaky` |
| 已掌握 | `got_it + fluent` |

已确认没有把筛选按钮拆成：

```text
基本掌握 / 很熟了
```

#### 后端关闭 fallback

已确认：

- `/api/reviews/history` 请求失败后进入本地 fallback。
- 本地列表使用 `getHistoryCardSummaries(selectedRange)`。
- 本地统计使用 `getHistorySummaryStats(selectedRange)`。
- 本地筛选按钮计数使用本地 summaries 计算。
- fallback 后页面不崩。
- fallback 后不会采用后端 summary。

#### 旧文案检查

旧文案：

```text
没记住
模糊
记住了
太简单
```

搜索结果显示：

- 旧文案只存在于 legacy fallback 或旧存储兼容逻辑中。
- 不进入后端历史展示主路径。
- 当前后端展示主文案仍是：
  - 想不起来
  - 不太稳
  - 基本掌握
  - 很熟了

---

## 3. 当前历史页已经做到什么程度

历史页当前已经从纯本地历史记录页面，变成：

```text
后端优先 + 本地 fallback 的历史页
```

已经完成：

1. 后端 list 主链路。
2. 后端 summary 主链路。
3. 本地 fallback 保留。
4. list/stats 数据源一致性保护。
5. 时间范围参数一致性。
6. 搜索不污染 summary。
7. quick filter 映射正确。
8. 后端关闭时页面可用。
9. 旧文案不回流到新后端展示路径。

---

## 4. 当前仍未完成的内容

以下内容尚未完成，后续阶段不要误认为已经完成。

### 4.1 未迁移旧 reviewRecords

当前没有把本地 `reviewRecords` 迁移到后端数据库。

因此：

- 后端历史数据来自后端 ReviewLog / review history 数据源。
- 本地 fallback 数据来自本地旧 `reviewRecords`。
- 两者可能不完全一致。

这是当前阶段允许的状态。

---

### 4.2 未删除本地 fallback

当前仍然保留：

- 本地历史记录读取。
- 本地 stats 计算。
- 本地 quick filter 计数。

这是有意保留，不要在后续阶段随手删除。

---

### 4.3 未改 WXML / WXSS

Phase 5-2B / 5-2C 只处理数据接入，没有重做 UI 结构。

未完成：

- 历史页布局重构。
- 新增加载更多按钮 UI。
- 新增分页提示 UI。
- 新增高级统计图表 UI。

---

### 4.4 未接分页加载更多

当前后端 list 请求仍是：

```text
limit=100&offset=0
```

还没有做：

- 滚动加载更多。
- offset 分页。
- 下一页数据合并。
- `has_more` / `total_count` 驱动的分页状态。
- 后续页请求失败时的局部错误提示。

这是后续 Phase 5-3 的优先候选任务。

---

### 4.5 未做历史详情页

当前历史页仍是列表页。

还没有做：

- 单条历史详情。
- 单张卡片的历史时间线。
- 每张卡片所有 review logs 展示。

---

### 4.6 未做高级统计

当前 summary 只用于顶部基础统计和筛选按钮数字。

还没有做：

- 按天统计复习趋势。
- 正确率趋势。
- 薄弱卡趋势。
- 最近 N 天掌握变化。
- 图表。

---

### 4.7 未统一所有页面的统计口径

当前历史页统计已经后端化，但不代表首页、复习页、完成页、历史页的所有统计口径都已经完全统一。

后续如果发现首页数字、历史页数字、复习完成页数字不一致，需要单独做统计口径对齐。

---

### 4.8 未清理旧存储模块

`utils/recordStorage.js` 等旧模块仍然存在。

这些模块可能仍被以下逻辑使用：

- 本地 fallback。
- 旧页面。
- 兼容逻辑。

不要直接删除。

---

## 5. 后续开发注意事项

### 5.1 不要重复做的事

后续不要重复做：

- 再接一次 `/api/reviews/history`。
- 再接一次 `/api/reviews/history/summary`。
- 再把 summary 改回基于 list items 临时计算。
- 再让搜索覆盖 summary。
- 再让 quick filter 覆盖 summary。
- 再删除本地 fallback。
- 再把 quick filter 拆成 `基本掌握 / 很熟了`。

---

### 5.2 必须保持的规则

历史页后续继续保持：

```text
backend list success -> backend summary
backend list success + summary fail -> backend list-derived stats
backend list fail -> local list + local stats
```

也就是：

```text
list 来源决定 stats 来源。
```

---

## 6. 建议下一阶段：Phase 5-3

建议 Phase 5-3 做：

```text
历史页后端分页 / 加载更多 / list 完整化
```

原因：

当前历史页后端 list 只请求：

```text
limit=100&offset=0
```

当后端历史记录超过 100 条时，页面不能完整显示全部后端记录。

Phase 5-3 可以考虑实现：

1. 后端 list 分页参数：
   - `limit`
   - `offset`

2. 前端加载更多逻辑：
   - 初始加载前 100 条。
   - 滚动到底部或点击加载更多。
   - 请求下一页。
   - 合并 history items。
   - 避免重复记录。

3. summary 规则：
   - summary 仍然代表当前时间范围的总体统计。
   - summary 不随分页 offset 改变。
   - 加载更多只影响列表，不影响 summary。

4. fallback 规则：
   - 后端第一页失败时 fallback 本地。
   - 后端第一页成功、后续页失败时，只提示加载更多失败，不切换整个页面到本地。

5. 边界建议：
   - 优先只改 `pages/history_reviewed/history_index.js`。
   - 尽量不改 WXML/WXSS。
   - 如果必须增加按钮或底部提示，再单独拆成小阶段。

---

## 7. 当前推荐状态

当前推荐状态：

```text
Phase 5-2B：完成
Phase 5-2C：完成
Phase 5-2D：审查通过
下一步：Phase 5-3
```

Phase 5-3 开始前，先确认：

```text
git status --short
```

必须干净。
