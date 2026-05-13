# Phase 5-6 页面视觉一致性整理阶段总结

## 一、阶段背景

Phase 5-6 的目标是**页面视觉一致性整理**，不是功能开发。

用户反馈：历史列表页 / 历史详情页整体偏白，与首页、复习页相比，页面背景、卡片层次、区块感不一致。

核心原则：
- Define globally, apply locally
- app.wxss 只做 token 字典，不直接改变所有页面的默认外观
- token 先局限在 history_index 和 history_detail 两个页面应用
- 不污染首页、复习页、添加页

---

## 二、提交记录

| commit | message | 内容 |
|--------|---------|------|
| `2e8573b` | `add history visual tokens` | app.wxss 新增 12 个 CSS 变量 + 技术债注释；history_index.wxss 局部 token 化 |
| `0a89f87` | `unify history detail visual state` | history_detail 全面接入 token；JS 补 card.id + resultTagType；WXML 拆孤儿 DOM |

仅涉及 **5 个文件**、**2 个 commit**。未修改首页、复习页、添加页。

---

## 三、Phase 5-6B-mini + hotfix 总结

### 3.1 app.wxss 新增最小 Design Tokens

在 `page {}` 块中定义 12 个 CSS 变量：

| Token | 最终值 | 说明 |
|-------|--------|------|
| `--bg-color-page` | `#fbfcf7` | 页面底色 |
| `--bg-color-card` | `#fbfdf8` | 卡片实色背景（hotfix 从 rgba 改为实色） |
| `--color-text-primary` | `#263128` | 主文字色 |
| `--color-text-secondary` | `#657465` | 辅助文字色 |
| `--color-text-muted` | `#99a398` | 弱化文字色 |
| `--color-primary` | `#5eaa64` | 主色调 |
| `--border-color-muted` | `#e7eee4` | 卡片浅边框 |
| `--border-color-dashed` | `#dcebd8` | 虚线边框 |
| `--radius-card` | `28rpx` | 卡片统一圆角 |
| `--radius-pill` | `999rpx` | 药丸圆角 |
| `--shadow-card` | `0 10rpx 26rpx rgba(86, 126, 82, 0.07)` | 卡片绿色调投影 |
| `--space-card` | `24rpx` | 卡片内边距基准 |

### 3.2 保留 legacy page background 并加技术债注释

```css
/* [技术债] Phase 5-6 遗留全局背景。
   后续待首页、复习页、历史列表页、历史详情页、添加页、编辑页
   全部显式接入 --bg-color-page token 后，方可移除此行。
   在此之前，各页面通过 .page / page {} 局部覆盖背景。 */
background: #ffffff;
```

### 3.3 --bg-color-card 热修复

初始值 `rgba(255, 255, 255, 0.96)` 存在两个问题：
1. 半透明导致页面背景透色污染，视觉上偏白刺眼
2. rgba 值不适合作为长期 Design Token

hotfix 改为实色 `#fbfdf8`，比纯白柔和，适合作为主信息卡片背景。

### 3.4 history_index.wxss 局部使用 token

收口层（文件末尾 `/* ===== 历史复习内容页最终收口 */` 注释后）18 处硬编码替换为 `var(--xxx)`：

| 替换项 | 原值 | 替换为 |
|--------|------|--------|
| page 背景渐变起始色 | `#fbfcf7` | `var(--bg-color-page)` |
| page 文字色 | `#263128` | `var(--color-text-primary)` |
| 四合一卡片选择器 background | `rgba(255, 255, 255, 0.96)` | `var(--bg-color-card)` |
| 四合一卡片选择器 border | `#e7eee4` | `var(--border-color-muted)` |
| 四合一卡片选择器 shadow | 硬编码 rgba | `var(--shadow-card)` |
| .history-stats-value color | `#5eaa64` | `var(--color-primary)` |
| .history-stats-label color | `#8a9689` | `var(--color-text-muted)` |
| .history-range-select-label color | `#748274` | `var(--color-text-secondary)` |
| .history-range-select-arrow color | `#5eaa64` | `var(--color-primary)` |
| .history-search-icon color | `#9aa89d` | `var(--color-text-muted)` |
| .history-search-input color | `#263128` | `var(--color-text-primary)` |
| 各卡片 border-radius | `28rpx` / `26rpx` | `var(--radius-card)` |
| .history-meta-pill color | `#758575` | `var(--color-text-secondary)` |
| .history-card__title color | `#263128` | `var(--color-text-primary)` |
| .history-card__meaning color | `#4d5a50` | `var(--color-text-secondary)` |
| .history-card__meta color | `#99a398` | `var(--color-text-muted)` |

### 3.5 严格未触碰

- history_index.js — 零修改
- history_index.wxml — 零修改
- Quick filter active 状态颜色组 — 保留硬编码
- history-result-tag 颜色组 — 保留硬编码
- `::before` 伪元素左侧色条 — 保留硬编码（规避低版本基础库 CSS 变量 Bug）
- 空状态、底部加载状态、日期 sticky 标题、快速滚动条 — 全部 untouched
- 搜索、分页、summary、fallback 逻辑 — 全部 untouched

---

## 四、Design Token Dictionary（最终版本）

```
page {
  /* [技术债] Phase 5-6 遗留全局背景。... */
  background: #ffffff;

  /* ===== Mini Visual Token Dictionary (Phase 5-6B) ===== */
  --bg-color-page:        #fbfcf7;
  --bg-color-card:        #fbfdf8;    /* 实色，非 rgba */
  --color-text-primary:   #263128;
  --color-text-secondary: #657465;
  --color-text-muted:     #99a398;
  --color-primary:        #5eaa64;
  --border-color-muted:   #e7eee4;
  --border-color-dashed:  #dcebd8;
  --radius-card:          28rpx;
  --radius-pill:          999rpx;
  --shadow-card:          0 10rpx 26rpx rgba(86, 126, 82, 0.07);
  --space-card:           24rpx;
}
```

### 未引入的 token

以下 token 被明确排除，原因是状态标签保留 legacy 硬编码，不做半 token 化：

- `--color-success` — 未引入
- `--color-warning` — 未引入
- `--color-danger` — 未引入
- `--color-success-strong` — 未引入
- `--bg-color-disabled` — 未引入

---

## 五、Phase 5-6C-mini 总结

### 5.1 history_detail.wxss 全面接入已有 token

- `page` 背景渐变：`var(--bg-color-page)` 替换起始色，中间色和结束色对齐历史列表页
- `.detail-section`：background、border、border-radius、box-shadow、padding 全部使用 token
- `.section-title`：color 使用 `var(--color-text-primary)`，border-bottom 使用 `var(--border-color-muted)`（从 `2rpx` 减为 `1rpx`）
- `.info-label`：color 使用 `var(--color-text-secondary)`
- `.info-value`：color 使用 `var(--color-text-primary)`
- `.state-card`、`.state-title`：使用对应 text token
- 未修改 app.wxss，未新增 token

### 5.2 history_detail.js 修改

两处最小改动，不修改接口请求逻辑：

**card.id 安全映射**（[history_detail.js:35](pages/history_detail/history_detail.js#L35)）：
```javascript
var cardId = raw.card ? (raw.card.id || raw.card.card_id || '') : '';
```
使用三元保护，`raw.card` 为 null 时返回空字符串，不会抛错。

**resultTagType 派生**（[history_detail.js:50-56](pages/history_detail/history_detail.js#L50-L56)）：
```javascript
forgot → again
shaky  → hard
got_it → good
fluent → good
其他   → default
```
仅用于 WXML class，不改变业务逻辑。

### 5.3 history_detail.wxml 修改

三处改动：

1. **复习结果药丸化**（第 16 行）：`info-value` 纯文本 → `<view class="detail-result-tag detail-result-tag--{{detail.resultTagType}}">`
2. **卡片条件加 card.id**（第 28 行）：`wx:if="{{detail.card}}"` → `wx:if="{{detail.card && detail.card.id}}"`
3. **孤儿独立 class**（第 64 行）：`detail-section detail-section--orphan` → `detail-orphan-card`

复习信息区（复习结果、复习时间、学习来源）始终在条件块外部，无论 card 是否存在都展示。

### 5.4 孤儿日志方案

使用冷灰失活态，不采用暖黄/便利贴色：

```css
.detail-orphan-card {
  background: #f5f6f8;
  border: 1rpx dashed #d6dbe0;
  border-radius: var(--radius-card);
  padding: var(--space-card);
  box-shadow: none;
  text-align: center;
}
```

### 5.5 复习结果标签

从 history_index.wxss 收口层复制 legacy 硬编码色值（非 token 化）：

| 状态 | 文字色 | 背景色 | 边框色 |
|------|--------|--------|--------|
| again | `#bd6b74` | `#fff8f8` | `#f1d4d8` |
| hard | `#a7772e` | `#fffaf0` | `#efd9ab` |
| good | `#3f8b61` | `#f0faf4` | `#ccebd8` |
| default | `var(--color-text-muted)` | `#f3f7f2` | `var(--border-color-muted)` |

### 5.6 未新增功能

确认不包含：编辑卡片、查看卡片、重新复习、删除记录。

---

## 六、验收结果

| 检查项 | 结果 |
|--------|------|
| 正常 card 详情态 | 页面背景 + 卡片 + 文字 + 阴影已统一到暖绿体系 |
| 复习结果标签 | 与历史列表页一致的彩色药丸 |
| card:null 孤儿态 | 独立 class，冷灰失活态，代码分支已实现 |
| 复习信息区永远可见 | WXML 确认，条件块仅包裹卡片内容区 |
| 5-6D 只读审查 | 无 P0/P1 问题 |
| 首页/复习页/添加页 | 未被 Phase 5-6 修改 |
| raw.card.id 安全访问 | 三元保护，无裸访问 |
| 未新增状态色 token | 确认无 --color-success / --color-warning / --color-danger |
| node --check | 通过 |
| git diff --check | 通过 |
| git status --short | 干净 |

---

## 七、遗留技术债

| # | 描述 | 优先级 | 建议 |
|---|------|--------|------|
| 1 | history_index.wxss 前 396 行为旧样式（已被收口层覆盖），文件体积偏大 | P3 | 后续大版本可清理 dead CSS |
| 2 | review.wxss 未接入 token，使用硬编码渐变和颜色 | P3 | 后续 Phase 逐步接入 |
| 3 | add.wxss 未接入 token，使用硬编码渐变和颜色 | P3 | 后续 Phase 逐步接入 |
| 4 | app.wxss 中 `page { background: #ffffff }` 仍存在 | P3 | 待所有页面显式接入 `--bg-color-page` 后移除 |
| 5 | 孤儿日志真实数据暂未完整验收 | P2 | 需要一次真机验收确认后端返回 card:null 的 case |
| 6 | Add 页保存失败 / cloud function timeout | **不属于 Phase 5-6** | 应另开 hotfix 分支 |

---

## 八、后续建议

1. **提交本总结文档** — 作为 Phase 5-6 收口交付物
2. **单独开 Add 页保存链路 hotfix** — 与视觉一致性完全独立，不混在一起
3. **首页视觉问题单独处理** — 不要和 Add hotfix 混在一个 PR
4. **后续 Phase 逐步将 review.wxss / add.wxss 接入 token** — 不扩大本次范围
