# Phase 6N: 今日复习情况页与完成页收口总结

## 背景

Phase 6M 完成后，今天复习相关页面已具备三层语义：

- **今日复习情况页** (`today_review_status`) — 今日学习总览
- **今日复习内容页** (`today_reviewed`) — 今天复习过的当前卡片，可编辑
- **历史复习内容页** (`history_reviewed` / `history_detail`) — ReviewLog snapshot，只读

但出现三个问题需要收口：

1. 今日复习情况页进行中态 / 完成态展示不理想：进行中态有重复数字，完成态反馈价值弱，入口重复
2. review 页旧 done-panel 与新版 today_review_status 完成态体验不一致
3. add.js 存在 `applyEditedCardFromReview` 死代码

Phase 6N 分三个阶段逐个解决。

---

## Phase 6N-1: 优化 today_review_status 状态展示

**提交**: `ae861ff` — improve today review status states

### 进行中态 (`completed < total`)

| 区域 | 内容 |
|------|------|
| 标题 | 今日复习情况 |
| 进度区 | "今日进度" heading + 进度条 + `completed / total` |
| 统计 | 今日任务 N 张 / 已完成 M 张 / 剩余 R 张 |
| 主按钮 | 继续复习（剩余 R 张） |
| 次级入口 | 今日已复习内容（不带数字） / 历史复习内容 |

### 完成态 (`completed >= total`)

| 区域 | 内容 |
|------|------|
| 标题 | 今日复习情况 |
| 主文案 | 🎉 今日任务完成！ |
| 结果区 | "今日复习结果" heading + 掌握较好 X 张 / 还需巩固 Y 张 |
| 主按钮 | 查看今日复习内容 |
| 次级入口 | 查看历史复习内容 / 返回首页 |

统计规则：

- 掌握较好 = `got_it` + `fluent`（从 `GET /api/reviews/today-reviewed` 按 `last_result` 聚合）
- 还需巩固 = `forgot` + `shaky`
- 降级链：API → `todayReviewedCache` → 显示 0（不硬编码假数据）

### 离线态补充

`offline_cached` 次级入口新增"返回首页"。

---

## Phase 6N-2: done-panel 改成极简兜底

**提交**: `03e9b84` — simplify review completion fallback panel

### 背景

Phase 6M 后复习完成主路径已从 review 页 redirectTo 到 today_review_status。但 review.wxml 中仍保留旧 done-panel 作为 redirectTo 失败 / 同步恢复完成的兜底显示。旧 done-panel 与新版 today_review_status 体验割裂（标题不同、统计维度不同、按钮结构不同）。

### 变更

review done-panel 从完整旧完成页改为极简兜底：

**删除**：

- "这轮复习完成"标题
- 本轮复习 N 次 / 共涉及 N 张卡片统计
- 四项反馈细分统计（想不起来/不太稳/基本掌握/很熟了）
- summaryTip 动态文案
- "继续复习"按钮
- "查看历史复习内容"按钮
- done-summary-* / done-ratio-* 全部样式（约 150 行 WXSS）

**保留**：

| 元素 | 内容 |
|------|------|
| 标题 | 复习已完成 |
| 说明 | 今日复习情况已更新，可以前往查看。 |
| 主按钮 | 查看今日复习情况 → redirectTo today_review_status |
| 次按钮 | 返回首页 → goToHomePage |

**可达路径**（不变）：

1. redirectTo today_review_status fail 回调
2. 同步恢复 _showCompletedFromSession
3. 同步恢复 _showCompletedFromResponse
4. 同步恢复无 session 直接完成

### 职责边界

- today_review_status：今日复习情况的权威展示页，包含进度和完成结果
- done-panel：仅作为页面跳转失败 / 同步恢复完成时的安全出口，不再承担完成页展示职责

---

## Phase 6N-3: 删除 add.js 死代码

**提交**: `ddabce2` — remove dead review edit callback

### 背景

`pages/add/add.js` 的 `isFromReviewPage` 保存分支中存在：

```javascript
const pages = getCurrentPages();
const previousPage = pages[pages.length - 2];
if (previousPage && typeof previousPage.applyEditedCardFromReview === 'function') {
    previousPage.applyEditedCardFromReview(this.data.cardId);
}
```

但 `pages/review/review.js` 从未定义 `applyEditedCardFromReview`，此调用永不可达。Phase 6G 已通过 `_returningFromEdit` flag + `_refreshCurrentCardFromStorage` 实现 from=review 编辑后刷新。

### 变更

删除上述 6 行死代码。`isFromReviewPage` 分支简化为 `wx.navigateBack({ delta: 1 })`。

各入口返回语义不变：

- from=review → navigateBack → review.js onShow → _returningFromEdit → _refreshCurrentCardFromStorage
- from=today_reviewed → setStorageSync todayReviewedNeedsRefresh → navigateBack → onShow refresh
- from=history → navigateBack
- 普通 Add/Edit → navigateBack

---

## 最终页面语义

```
today_review_status (今日复习情况页)
  ├── 进行中态: 今日进度 + 统计 + 继续复习
  ├── 完成态: 🎉 今日任务完成 + 掌握较好/还需巩固 + 查看今日复习内容
  └── 离线态: 缓存数据 + 不可开始/继续复习 + 返回首页

today_reviewed (今日复习内容页)
  └── 今天复习过的当前卡片，可编辑，不可删除

history_reviewed / history_detail (历史复习记录页)
  └── 基于 ReviewLog.card_snapshot，只读

review done-panel (极简兜底)
  └── 仅 redirectTo fail / 同步恢复完成时显示
      复习已完成 → 查看今日复习情况 / 返回首页
```

---

## 验收结果

```
node --check pages/today_review_status/today_review_status.js  passed
node --check pages/review/review.js                             passed
node --check pages/add/add.js                                   passed
git diff --check                                                clean
git status --short                                              clean
```

验收清单：

- [x] 进行中态显示今日进度 + 今日任务/已完成/剩余
- [x] "今日已复习内容"不带数字
- [x] 完成态显示 🎉 今日任务完成 + 今日复习结果 + 掌握较好/还需巩固
- [x] 完成态无重复"查看今日复习内容"入口
- [x] 离线态有"返回首页"
- [x] 结果分布实时从 API 聚合，无硬编码假数据
- [x] 正常复习完成仍 redirectTo today_review_status
- [x] done-panel 仅极简兜底（复习已完成 + 两个按钮）
- [x] applyEditedCardFromReview 死代码已删除
- [x] 旧 done-summary/done-ratio 样式已删除且无残留引用
- [x] from=review / from=today_reviewed / from=history 返回语义完好
- [x] 无 P0 / P1

---

## 技术债（已记录，未处理，均为 P2）

| ID | 描述 | 位置 |
|----|------|------|
| TD-6N-1 | recordStorage.js 文件仍较大，含 [LEGACY] / [COMPAT-HISTORY] 分区，后续需单独只读审查 | utils/recordStorage.js |
| TD-6N-2 | 首页 `startReviewWithFallback` 与 today_review_status `_startReview` 降级链各自实现，可抽公共函数 | index.js / today_review_status.js |
| TD-6N-3 | 历史页 `history_index.js` 仍保留后端 + 本地 fallback 双数据源，后续可评估是否移除 | pages/history_reviewed/history_index.js |

---

## 不在本阶段做的事

- 不改后端
- 不改 ReviewLog schema / card_snapshot 逻辑
- 不删除 done-panel（保留为极简兜底）
- 不重构 recordStorage
- 不改 actionQueue
- 不处理 Add 保存链路其他逻辑
- 不新增页面

---

## 提交记录

| 序号 | 提交 | 描述 |
|------|------|------|
| 1 | `ae861ff` | improve today review status states |
| 2 | `03e9b84` | simplify review completion fallback panel |
| 3 | `ddabce2` | remove dead review edit callback |

---

## 下一步建议

Phase 6N 主线已收口。建议下一阶段：

- **Phase 6O-1**: recordStorage [LEGACY] 区只读审查，评估哪些旧代码可安全删除
- **Phase 6O-2**: 降级链统一，将首页和 today_review_status 的 session 创建降级逻辑抽为公共函数
- **Phase 6O-3**: 历史页双数据源评估（如有产品需求再进入）

优先建议 Phase 6O-1（只读审查），先看清 recordStorage legacy 区现状再决定是否进入代码改动。
