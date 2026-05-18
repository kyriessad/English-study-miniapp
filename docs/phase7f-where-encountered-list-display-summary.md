# Phase 7F whereEncountered 列表展示与摘要结构总结

## 阶段目标

- 让 whereEncountered 不只藏在详情页 / 复习页，而是在列表层级也能轻量可见。
- 让"来自：xxx"成为场景记忆辅助信息。
- 控制信息密度，避免卡片变厚。
- 统一首页、历史复习列表、今日复习内容页的标签位置与摘要结构。

## 已完成提交

| 阶段 | Commit | Message | 主要改动 |
|------|--------|---------|---------|
| 7F-1 | `c6531fb` | show where encountered on home cards | 首页 `decorateCards()` 提取 whereEncountered；卡片底部 meta 行右侧新增 source pill；meta 行改为 flex space-between；新增 `.card-source-pill` 弱绿色样式 |
| 7F-2 | `f39545a` | show where encountered in history list | `mapBackendHistoryItem()` 映射 whereEncountered；`searchHistoryCards()` 搜索字段加入 whereEncountered；历史卡片底部 meta 行右侧新增 source pill；新增 `.history-source-pill` 样式 |
| 7F-3 | `1600c85` | align today reviewed card tags | 今日复习卡片新增顶部行（类型 tag 左 + 结果 tag 右）；结果标签从底部移到右上角；source 补单行省略 |
| 7F-4-hotfix | `d4194bd` | simplify card summaries in list pages | 首页移除 note 备注块；今日复习 source 从中间移到底部 meta 行右侧 pill；首页和今日复习卡片默认不展示备注 |

## 最终页面语义

### 首页卡片

```
┌─────────────────────────────────────┐
│ 单词                        待学习  │  ← 左上类型 tag + 右上状态 pill
│ clutch                              │  ← 英文内容
│ 关键时刻顶得住                       │  ← 我的理解
│ ─────────────────────────────────── │
│ 已复习 1 次 · 上次：今天   来自：NBA解说│  ← 底部 meta 左 + source pill 右
└─────────────────────────────────────┘
```

- 左上：类型 tag（单词 / 短语 / 句子）
- 右上：学习状态 pill（待学习 / 复习中 / 待加强 / 已掌握）
- 中间：英文内容 + 我的理解 / 未填写理解提示
- 默认不展示备注 note
- 底部左：已复习 x 次 · 上次：今天
- 底部右：来自：xxx source pill

### 历史复习列表

```
┌─────────────────────────────────────┐
│ 单词  未分类  未分类         基本掌握 │  ← 左上类型/exam pill + 右上结果 tag
│ clutch                              │  ← 英文内容
│ 关键时刻顶得住                       │  ← 我的理解
│ ─────────────────────────────────── │
│ 本时段复习 1 次 | 最后复习：今天  来自 │  ← 底部 meta 左 + source pill 右
└─────────────────────────────────────┘
```

- 左上：类型 / legacy exam pill
- 右上：结果 tag（基本掌握 / 很熟了 / 想不起来 / 不太稳）
- 中间：英文内容 + 我的理解
- 底部左：本时段复习 x 次 · 最后复习时间
- 底部右：来自：xxx source pill

### 今日复习内容页

```
┌─────────────────────────────────────┐
│ 单词                        基本掌握 │  ← 左上类型 tag + 右上结果 tag
│ clutch                              │  ← 英文内容
│ 关键时刻顶得住                       │  ← 我的理解
│ ─────────────────────────────────── │
│ 复习 1 次                来自：NBA解说│  ← 底部 meta 左 + source pill 右
└─────────────────────────────────────┘
```

- 左上：类型 tag（单词 / 短语 / 句子）
- 右上：结果 tag（基本掌握 / 很熟了 / 想不起来 / 不太稳）
- 中间：英文内容 + 我的理解
- 默认不展示备注 note
- 底部左：复习 x 次
- 底部右：来自：xxx source pill

## whereEncountered 展示策略

- **有值才展示**：`wx:if="{{item.whereEncountered}}"`，无值不占位。
- **统一文案**："来自：xxx"，不使用"来源"。
- **统一样式**：弱绿色 pill，font-size 22rpx，color #5f9f79，background #eef8ef，border-radius 999rpx。
- **长文本截断**：max-width 280rpx（历史）/ 300rpx（首页），white-space nowrap + text-overflow ellipsis 单行省略。
- **视觉层级**：弱于英文内容、我的理解、复习状态/结果 tag，不抢视觉重心。
- **底部定位**：三页统一放在底部 meta 行右侧，不与中间内容行混排。

## 备注 note 展示策略

- **首页默认不展示 note**：卡片库列表不需要看到备注，减少信息密度。
- **今日复习内容页默认不展示 note**：同样作为列表页，不展示备注。
- **note 保留在详情场景**：Add/Edit 编辑页、复习页答案区、历史详情页仍可查看备注。
- **不删除 note 字段**：不影响保存、不影响搜索（首页搜索仍可搜备注关键词）。

## 搜索与兼容

- 首页搜索已支持 whereEncountered（Phase 7C-1，`getSearchableText()` 包含）。
- 历史复习列表后端搜索已支持 where_encountered（Phase 7E-1）。
- 历史复习列表本地搜索（`searchHistoryCards()`）已支持 whereEncountered（Phase 7F-2）。
- 老数据 whereEncountered 为空时不展示，不需要回填。
- exam_scene / exam_module 老字段仍仅作为搜索兜底存在，不重新暴露入口。

## 技术边界

- 不改后端。
- 不改 Add 保存链路。
- 不改 review session。
- 不改 feedback。
- 不改 dailyGoal。
- 不继续清理 exam_scene / exam_module。
- 不做最近用过 / 常见来源。
- 不做复杂统计。

## 验收结果

- `node --check`：全部通过（index.js、today_reviewed.js、history_index.js）
- `git diff --check`：全部通过
- `git status`：各阶段提交后工作区干净

人工验收：

- [x] 首页 source pill 正常，有值显示"来自：xxx"，无值不显示
- [x] 首页不再默认展示备注 note
- [x] 首页有理解的卡片显示英文 + 理解 + 底部 meta/source
- [x] 首页无理解的卡片显示英文 + 未填写理解提示 + 底部 meta/source
- [x] 历史列表 source pill 正常
- [x] 历史搜索可搜 whereEncountered 关键词
- [x] 今日复习内容页结果标签在右上角，与首页/历史页统一
- [x] 今日复习内容页 source 在底部右侧 pill，不在中间行
- [x] 长 source 单行省略，不撑高卡片
- [x] 三页 source pill 样式一致（弱绿色、小字号、圆角药丸）
- [x] 三页卡片高度更轻，信息密度受控

## 当前 whereEncountered 覆盖范围

| 场景 | 状态 | 阶段 |
|------|------|------|
| Add/Edit 编辑页 | 已覆盖 | 7B-2 |
| pending fallback 离线保存 | 已覆盖 | 7B-2 |
| review session items | 已覆盖 | 7B-3A |
| 复习页答案区 | 已覆盖 | 7B-3B |
| 首页搜索 | 已覆盖 | 7C-1 |
| 首页卡片列表 | 已覆盖 | 7F-1 |
| 今日复习内容页 | 已覆盖 | 7D-1 → 7F-3/4 |
| 历史详情页 | 已覆盖 | 7E-1/2 |
| 历史列表 | 已覆盖 | 7E-1 → 7F-2 |
| 历史列表搜索 | 已覆盖 | 7E-1 → 7F-2 |
| history snapshot | 已覆盖 | 7E-1 |

## 后续建议

- **Phase 7G-readonly**：是否需要 whereEncountered 输入辅助，例如最近用过 / 常见来源快捷标签。
- 不建议马上继续加展示点：当前列表页信息密度已合理，不需进一步增加。
- 不建议现在删除后端 exam_scene / exam_module：老数据搜索兜底仍有价值。
- 不建议现在做 whereEncountered 填写率统计或数据分析。
