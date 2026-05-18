# Current Phase

## 当前阶段

Phase 6P-later 已封板：dailyGoal 真接入全系列收口（含主链路 + P2 收尾 hotfix）。

## 最新提交

- 1783325 refresh today status on return
- 3008d97 document daily goal integration phase
- 960a8a9 connect today status goal progress
- ef05157 fix home blocked goal actions
- ddfdf05 connect home daily goal progress

## Phase 6P-later 系列进度（已全部完成，已封板）

- Phase 6P-later-1：后端 overview.goal_progress 已完成
- Phase 6P-later-2：后端 review session 接 daily_goal 已完成
  - daily_suggested 按 remaining_to_goal 安排可贡献卡，传 daily_goal
  - new_only / free_review 不传 daily_goal
- Phase 6P-later-3：前端首页接 goal_progress 已完成（ddfdf05）
  - 首页 GET /api/reviews/overview 传 daily_goal
  - 首页优先使用 goal_progress 显示今日完成 M / N
  - daily_suggested 创建 session 时传 daily_goal
- Phase 6P-later-3-hotfix：首页 empty / goal_blocked 状态文案和按钮语义修正（ef05157）
  - 0 张卡时不显示"当前可学内容已完成"，只显示首次引导文案
  - goal_blocked 时：左侧 25% "继续复习"（次），右侧 75% "添加卡片继续"（主）
- Phase 6P-later-4：今日复习情况页接入完整 goal_progress（960a8a9）
  - getReviewOverview 传 daily_goal，优先读 goal_progress
  - 新增 goal_blocked / overachieved 状态
  - _startReview 的 daily_suggested 传 daily_goal
  - onShow 检测 dailyGoal 变更时自动刷新
- Phase 6P-later-4-hotfix：今日复习情况页返回后自动刷新（1783325）
  - onShow 改为每次进入页面都刷新 overview，不再仅在 dailyGoal 变化时刷新
  - 修复复习完成后返回今日复习情况页进度不更新的问题
- Phase 6P-later-P2-3-hotfix：today_review_status startReview fallback 链修复（待提交）
  - 新增 _reviewStarting 实例标志，防止并发重入
  - 循环内明确区分 stepReason: 'empty' vs 'network_error'
  - network_error 停止 fallback 链；empty 继续尝试下一 session 类型
  - 网络错误文案对齐首页："当前网络不可用，请稍后再试"
  - 全空文案改为："暂无可复习内容，可以添加卡片继续"

## 当前产品语义

- 首页和今日复习情况页分母始终是 dailyGoal，不改成可复习卡数量
- 今日完成数按当天 distinct card 统计，同一张卡当天重复复习不重复计数
- goal_blocked = 目标未完成，但没有更多今天未复习过、能增加今日完成数的卡
- 0 张卡时不显示"当前可学内容已完成"，只引导添加第一张卡或使用示例
- 目标完成 / 超额完成后，仍允许继续复习
- 离线态：offline_cached 状态主按钮 disabled，不支持离线启动 session
- 历史复习内容页仍是 ReviewLog 快照，只读
- 今日复习内容页仍是今天复习过的当前卡片，可编辑，不可删除

## 每日目标设置

- 存储 key: `dailyGoal`（本地 wx.setStorageSync，不跨设备同步）
- 默认值: 5 张，可选 3 / 5 / 10
- 设置页: pages/settings/index
- 首页入口: header 右上角"设置"
- 今日复习情况页底部: 弱展示"每日目标 X 张 · 调整 ›"

## 下一步

Phase 6P-later 已封板，下一阶段建议先做产品方向只读审查，
明确优先级后再进入具体开发阶段。

## 注意

不要把今日页和历史页混用。历史页是历史快照语义，今日页是当前卡片语义。
