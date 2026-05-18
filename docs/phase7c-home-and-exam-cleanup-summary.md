# Phase 7C：首页搜索与考试分类清理完成总结

## 阶段目标

- 强化 whereEncountered 作为场景记忆字段。
- 清理前端考试分类（exam_scene / exam_module）入口。
- 让产品从考试分类语义回到随手记 / 场景记忆语义。

## 已完成内容

### 7C-1：首页搜索纳入 whereEncountered（c980ddd）

- `pages/index/index.js`：`getSearchableText()` 新增 `card.whereEncountered`。
- 搜索 placeholder 更新为"搜索英文、理解、备注或来源"。
- examScene / examModule 仍保留在搜索文本中作为老卡搜索兜底。

### 7C-2：Add 页删除考试场景 / 考试模块入口（ee85106）

`pages/add/add.wxml`：
- 删除考试场景 picker 和只读 pill（-32 行）。
- 删除考试模块 picker 和只读 pill。

`pages/add/add.js`：
- 清理 picker 相关 import、data 字段、index 状态、handler（-38 行）。

`utils/recordStorage.js`：
- `buildBackendCardCreatePayload` 移除 `exam_scene` / `exam_module`。
- `buildBackendCardPatchPayload` 移除 `exam_scene` / `exam_module`。
- 新卡 POST 不再写入考试字段，编辑 PATCH 不再触碰考试字段。

### 7C-3：首页删除考试分类筛选与批量设置（79d14f4）

`pages/index/index.wxml`：
- 删除高级筛选区"考试场景"filter-item（-15 行）。
- 删除高级筛选区"考试模块"filter-item（-15 行）。
- 删除管理模式"批量设场景"按钮。
- 删除管理模式"批量设模块"按钮。
- 高级筛选保留"卡片类型"。
- 管理模式保留"全选/取消""批量删除""退出管理"。

`pages/index/index.js`：
- 删除 `EXAM_SCENE_OPTIONS` / `EXAM_MODULE_OPTIONS` import。
- 删除 6 个本地常量（DEFAULT_EXAM_SCENE、DEFAULT_EXAM_MODULE、EXAM_SCENE_FILTER_OPTIONS 等）。
- 删除 8 个 data 字段（examSceneFilterOptions、examModuleFilterOptions 等）。
- 删除 applyFilters 中 examScene / examModule 筛选逻辑和计数逻辑。
- 删除 `onExamSceneFilterChange` / `onExamModuleFilterChange` 两个 handler。
- 删除 `handleBatchAssignExamScene` / `handleBatchAssignExamModule` 两个 handler。
- 删除 `onBatchPanelOptionTap` 中 examScene / examModule 两个分支。
- 删除不再使用的 `updateCardsMeta` import。
- 保留 `getSearchableText()` 中 examScene / examModule 兜底。
- 保留 `matchesExactFilter()` 供 category 筛选复用。

## 保留内容

| 保留项 | 位置 | 原因 |
|--------|------|------|
| 后端 exam_scene / exam_module 字段 | English-analyzer-backend | 老数据保留，不删除字段 |
| 老数据不迁移、不清理 | 数据库 | 旧值无害，搜索兜底可用 |
| `getSearchableText` 含 examScene / examModule | pages/index/index.js L211-212 | 老卡仍可被"雅思 / 听力"等关键词搜到 |
| `normalizeBackendCardToLocal` 读取映射 | utils/recordStorage.js L786-787 | 后端→本地映射保留 |
| `cardsNeedUpdate` 比较逻辑 | utils/recordStorage.js L885-886 | 移除有风险，保留无害 |
| `updateCardsMeta` 支持 examScene / examModule | utils/recordStorage.js L2415-2430 | 通用 API，保留函数签名 |
| `cardOptions.js` 常量 | utils/cardOptions.js | 可能有未来用途 |
| `buildBackendCardPayload` in add.js | pages/add/add.js L119-120 | Phase 7C-2 已处理，形式保留 |

## 最终产品语义

- **用户前端不再看到"考试场景""考试模块"**：Add 页无 picker，首页无筛选，管理模式无批量设置。
- **新卡不再写入 exam_scene / exam_module**：CREATE payload 不含这些字段。
- **编辑卡不再触碰 exam_scene / exam_module**：PATCH payload 不含这些字段。
- **老卡旧考试字段只作为搜索兼容存在**：搜索关键词仍可命中老卡的 exam_scene / exam_module 值。
- **whereEncountered 成为唯一的场景记忆字段**：自由输入，可选，弱展示。

## 不做事项

- 不删除后端 exam_scene / exam_module 字段。
- 不迁移旧数据，不清理数据库。
- 不删除 cardOptions.js 中的考试常量。
- 不在首页卡片展示"来自 XXX"。
- 不做最近用过 / 常见来源快捷标签。
- 不改 review / today / history / dailyGoal。

## 验收结论

- 7C-1 / 7C-2 / 7C-3 均已提交。
- 工作区干净。
- `node --check` 通过。
- 首页、Add、搜索、管理模式主链路保持可用。
- 用户已无任何前端入口可以查看或修改 exam_scene / exam_module。

## 下一步建议

Phase 7D-readonly：审查是否需要在今日复习内容页 / 历史详情页展示 whereEncountered。
不需要继续删除 exam_scene / exam_module 后端字段。
