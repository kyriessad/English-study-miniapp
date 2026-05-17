# Phase 6P-later 阶段总结：dailyGoal 深度接入

## 背景

Phase 6P 完成了 dailyGoal 本地设置（3 / 5 / 10 张可选，默认 5）。
Phase 6P-later 的目标是让 dailyGoal 真正影响首页目标进度显示和后端任务生成，
从"本地设置"升级为"端到端目标追踪"。

## 各子阶段完成情况

### Phase 6P-later-1：后端 overview.goal_progress 已完成

后端 GET /api/reviews/overview 新增 `goal_progress` 字段，包含：
- `display_numerator`：今日完成数（distinct card，当天重复复习不重复计数）
- `display_denominator`：dailyGoal 值
- `completed_unique_today`：当天唯一已完成卡数
- `is_goal_met`：目标是否已完成
- `is_overachieved`：是否超额完成
- `is_goal_blocked`：目标未完成但当前已无更多可贡献卡

### Phase 6P-later-2：后端 review session 接 daily_goal 已完成

后端 POST /api/reviews/sessions 接受 `daily_goal` 参数，用于任务生成时限制每日新卡数量：
- `daily_suggested` 类型：传 `daily_goal`
- `new_only` / `free_review` 类型：不传 `daily_goal`

### Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）

- 首页 GET /api/reviews/overview 请求时携带 `daily_goal`
- 优先使用 `goal_progress` 展示今日完成 M / N（M = display_numerator，N = display_denominator）
- `daily_suggested` 创建 session 时传 `daily_goal`
- `new_only` / `free_review` 不传 `daily_goal`
- 无 `goal_progress` 时 fallback 到原有本地计算逻辑

### Phase 6P-later-3-hotfix：首页 empty / goal_blocked 状态按钮语义修正（ef05157）

修正两个 UX 问题：

1. **0 张卡时不显示 blocked 文案**：当本地卡片数为 0 时，即使后端返回 `is_goal_blocked=true`，
   也不显示"当前可学内容已完成，可以添加卡片继续"，改为显示"新的一天，开始学习吧"。

2. **goal_blocked 状态按钮主次修正**：`is_goal_blocked=true` 且目标未完成且卡片数 > 0 时：
   - 左侧 75% 主按钮：文案"添加卡片继续"，点击跳转 Add 页（原为次按钮）

     *注：当前实现为左侧 25% "继续复习"（次）、右侧 75% "添加卡片继续"（主），
     与设计规则中"左侧仍是添加卡片"有出入，以实际提交实现为准。*

   - 右侧 25% 次按钮：文案"继续复习"，点击进入复习（原为主按钮）
   - 不完全删除"继续复习"，用户仍可继续看已有卡

## 最终产品语义

| 维度 | 语义 |
|------|------|
| 首页分母 | 始终是 dailyGoal（3 / 5 / 10），不改成可复习卡数量 |
| 首页分子 | 当天 distinct card 已完成数，同卡重复复习不重复计数 |
| goal_blocked | 目标未完成，但当前没有更多可贡献新卡/复习卡 |
| 0 张卡 | 不显示"当前可学内容已完成"，显示首次引导文案 |
| goal_blocked 且有卡 | 左小"继续复习"（25%），右大"添加卡片继续"（75%） |
| 正常可复习 | 左小"添加卡片"（25%），右大"继续复习"（75%） |
| 目标完成 / 超额完成 | 左小"添加卡片"（25%），右大"继续复习"（75%），不禁用 |

## 不做项

- 不做后端持久化 dailyGoal（当前仍为本地 wx.setStorageSync）
- 不改今日复习情况页（today_review_status）
- 不改今日复习内容页（today_reviewed）
- 不改历史页（history_reviewed / history_detail）
- 不做每日新卡上限、学习提醒、缓存自动清除

## 下一步建议

- **Phase 6P-later-4-readonly**：今日复习情况页接入完整 `goal_progress`，展示目标进度和 blocked 状态说明
- 或先做 Phase 6P-later-3 / hotfix 验收复查
