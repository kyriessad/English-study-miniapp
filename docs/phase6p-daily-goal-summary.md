# Phase 6P 阶段总结：每日目标设置 MVP

## 1. 阶段背景

Phase 6P 在 Phase 6R（首页视觉 polish + 今日页面视觉统一）收口完成后，引入"每日目标设置"最小可行产品。

核心原则：
- 每日目标（X）= 用户希望每天完成的不同卡片数，纯用户偏好
- 系统今日任务（N）= 系统推荐的有效唯一卡片数，纯系统事实
- M / N 不替换为 M / X，两者共存但不混淆
- 同一张卡当天重复复习不重复计入目标
- 不改变后端推荐、session 创建、overview 计算

## 2. 已完成子阶段

### 6P-1：首页顶部统计语义改为"今日完成 M / N"（commit: `224e702`）

将首页顶部双列统计（今日任务 N / 今日已完成 M）改为单一进度表达"今日完成 M / N"。数据来源不变，仅展示方式调整。

修改文件：`pages/index/index.wxml`、`pages/index/index.wxss`

### 6P-2-readonly：每日目标设置产品与数据流审查

只读审查：M 数据来源（`completed_suggested.total_count`，DISTINCT card_id）、N 数据来源（`suggested` 块）、M/N 与 X 的共存方案、设置入口方案、技术方案（本地存储 → 逐步后端化）。结论：建议现在做，做最小 MVP，纯本地存储。

### 6P-3：新建设置页骨架 + 每日目标本地设置（commit: `519361c`）

新建 `pages/settings/index`，支持本地设置每日目标（key: `dailyGoal`，默认 5，可选 3/5/10）。首页 header 右侧加弱设置入口。

修改文件：
- `pages/settings/index.{js,wxml,wxss,json}`（新建）
- `app.json`（注册页面）
- `pages/index/index.{js,wxml,wxss}`（设置入口）

### 6P-4：今日复习情况页弱接入每日目标（commit: `465d7de`）

今日复习情况页底部增加弱展示"每日目标 X 张 · 调整 ›"，点击跳转设置页。`onShow` 时刷新目标值，确保设置后返回可见最新值。

修改文件：`pages/today_review_status/today_review_status.{js,wxml,wxss}`

### 6P-5：收口审查 + 阶段总结文档（本次）

只读审查所有 Phase 6P 改动，确认无 P0/P1 回归，编写本总结文档。

## 3. 最终语义

| 符号 | 含义 | 数据来源 | 展示位置 |
|------|------|----------|----------|
| M | 今日实际完成的不同卡片数 | `completed_suggested.total_count`（后端 DISTINCT card_id） | 首页"今日完成 M / N" |
| N | 系统今日推荐的不同卡片数 | `suggested` 块（后端 overview） | 首页"今日完成 M / N" |
| X | 用户设置的每日目标 | `wx.getStorageSync('dailyGoal')`，默认 5，可选 3/5/10 | 设置页编辑、今日复习情况页弱展示 |

展示规则：
- 首页：M / N，不显示 X
- 今日复习情况页：进度 M / N + 弱入口"每日目标 X 张 · 调整 ›"
- 设置页：picker 编辑 X（3/5/10）
- X 不影响后端推荐、session 创建、overview 计算

## 4. 存储方案

| 属性 | 值 |
|------|-----|
| key | `dailyGoal` |
| 存储方式 | `wx.setStorageSync('dailyGoal', value)` |
| 默认值 | 5 |
| 合法值 | [3, 5, 10] |
| 非法值处理 | 回退到 5 |
| 持久化位置 | 微信小程序本地 storage |
| 是否跨设备 | 否（后续可迁移到后端） |

## 5. 设置页结构

```
设置
├── 学习设置
│   └── 每日目标 → [picker: 3/5/10]
└── 其他
    └── 关于 → 英语知识卡片本
```

## 6. 入口链路

```
首页 header "设置" → /pages/settings/index
今日复习情况页 "每日目标 X 张 · 调整 ›" → /pages/settings/index
```

## 7. 审查结论（6P-5）

| 审查项 | 结果 |
|--------|------|
| dailyGoal key 一致（两页都用 'dailyGoal'） | PASS |
| 默认值一致（5） | PASS |
| 合法值一致（3/5/10） | PASS |
| 非法值回退一致（→5） | PASS |
| 设置页修改持久化 | PASS |
| 今日复习情况页 onShow 刷新 | PASS |
| 首页 M / N 未混入 X | PASS |
| 无焦虑文案（还差X张/未完成目标/卡片不足） | PASS |
| 无灰掉预留项（新卡上限/提醒/清除缓存） | PASS |
| 后端关闭时可正常使用（纯本地） | PASS |
| 5 个状态（empty/not_started/in_progress/all_done/offline）不受影响 | PASS |
| 未改后端 | PASS |
| 未改 review session 逻辑 | PASS |
| 未改 Add 保存链路 | PASS |
| 未改 pending 同步逻辑 | PASS |
| 未改历史页 | PASS |

## 8. 明确未做

- 未把首页 M / N 替换为 M / X
- 未改后端 `/api/reviews/overview`
- 未改后端 `/api/review-sessions`
- 未改 review session 创建逻辑
- 未改 Add 保存链路
- 未改 pending 同步逻辑
- 未做首次弹窗（首次引导放在设置页内，不弹窗）
- 未做每日新卡上限
- 未做复习提醒
- 未做清除缓存
- 未做自动补卡机制
- 未做额外练习计数
- 未做跨设备同步
- 未改历史页
- 未改今日复习内容页
- 所有 JS 文件 node --check 均通过
- 所有 git diff --check 无实质性空白问题

## 9. 验收建议

建议在真实微信环境中验证以下场景：

**设置页：**
- 默认显示每日目标 5 张
- picker 可选 3 / 5 / 10
- 修改后 toast "已更新"
- 退出再进入仍显示最新值
- 后端关闭时仍可正常打开和保存

**今日复习情况页：**
- 底部显示"每日目标 X 张 · 调整 ›"
- 点击"调整"跳转设置页
- 在设置页修改后返回，目标值已刷新
- 进行中 / 完成 / 离线等 5 个状态均正常显示

**首页：**
- "今日完成 M / N"不变
- header 右上角"设置"可点击
- 进入复习流程不变

**业务边界：**
- 复习 session 创建正常
- Add 保存正常
- pending 同步正常
- 历史页正常

## 10. 下一阶段建议

1. 优先考虑 Phase 6M：独立"今日复习内容"页（`docs/current-phase.md` 已标记）
2. 或 Phase 6P-6：首页集成每日目标弱展示（不替换 M / N）
3. 或 Phase 6P-later：dailyGoal 后端持久化
