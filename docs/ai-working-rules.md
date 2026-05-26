# Claude Code 工作规则

> 本文档是根目录 `CLAUDE.md` 的操作化补充，记录 Claude Code 每次任务的具体执行规则。
> 两者有冲突时，以根目录 `CLAUDE.md` 为准。
> 更新时间：2026-05-27

---

## 一、每次任务开始时必读

### 必读顺序

1. **根目录 `CLAUDE.md`**（工作区总指南，必读）
2. 前端任务：
   - `English-study-miniapp/CLAUDE.md`
   - `English-study-miniapp/docs/current-phase.md`
3. 后端任务：
   - `English-analyzer-backend/CLAUDE.md`
   - `English-analyzer-backend/docs/current-phase.md`
4. 跨端联动任务：两者都读
5. 规划 / 审查 / 发布任务：还需读 `English-study-miniapp/docs/product-features.md`

### 可选补读（按需）

- 被修改文件的完整代码（编辑前必须先 Read）
- 相关测试文件（修改业务逻辑时必须查看）
- `docs/roadmap.md`（发布进度评估时）
- `docs/release-checklist.md`（准备验收时）

---

## 二、任务模式分类

### Readonly Audit（只读审查）

**触发信号：** 任务含"审查"、"只读"、"不要改代码"、"read-only"、"诊断"、"盘点"

**规则：**
- 只使用 Read、Glob、Grep、Bash（只读命令）
- 不调用 Edit、Write 工具修改任何代码或文档
- 输出审查结论 + 问题分级 + 建议，不自动实现
- 若发现需要改的内容，列出清单，等用户决定

---

### Small Hotfix（小修复，直接实现）

**触发信号：** 明确指定改哪个文件的哪处内容；单文件或极小范围（≤3 处改动）；bug fix / 文案修改 / 配置值调整

**规则：**
- 只改用户明确指定的位置
- 不顺手重构周边代码，不改周边文案
- 不新增功能、不引入新抽象
- 修改后运行对应验证命令

---

### Confirm and Implement（确认后实现）

**触发信号：** 新功能；影响 ≥2 个文件；有跨端联动；用户说法模糊但方向明确

**规则：**
- 先用 1-3 句话描述方案 + 列出主要改动文件，等用户确认
- 确认后再实现，不超出确认的范围
- 实现完成后列出修改文件清单，等待用户审查

---

### Stop and Ask（停止并询问）

**触发信号：** 任务涉及强禁区（见第四节）；需求描述有歧义；实现过程遇到意外阻碍；不确定是否应该改某个文件

**规则：**
- 直接说明遇到的具体问题
- 提出 1-3 个具体问题，等用户澄清
- 不猜测意图擅自执行

---

## 三、必须运行的验证命令

**所有提交前：**
```bash
git diff --check        # 必须无输出才可提交
git status --short      # 列出所有修改文件后向用户确认
```

**前端（English-study-miniapp）修改 JS 后：**
```bash
node --check <changed-js-file>
```

**后端（English-analyzer-backend）修改 Python 后：**
```bash
python -m py_compile <changed-py-file>
```

**后端修改业务逻辑后（完整测试）：**
```bash
python -m pytest tests/ -q
# 当前已知 12 个 pre-existing failures 在 test_reviews_phase2_api.py（时区问题），不属于本次任务
# 验证：测试数量和失败数不增加即可
```

---

## 四、强禁区 — 未经用户明确要求不得触碰

### 数据库与核心协议

| 禁止操作 | 原因 |
|---|---|
| 改 database schema | 破坏生产数据 |
| 新增 Alembic migration | 同上 |
| 改 `review_state` 枚举值（new/reviewing/strengthening/mastered） | 影响全部复习逻辑 |
| 改 4 档反馈枚举（forgot/shaky/got_it/fluent） | 影响全部复习逻辑 |
| 改 ReviewSession / ReviewSessionItem 语义 | 影响会话调度和反馈链路 |
| 改 `daily_suggested` / `new_only` / `free_review` 调度链 | 影响选卡逻辑 |
| 改回炉逻辑（forgot 2次 / shaky 1次） | 核心复习规则 |

### 页面与架构

| 禁止操作 | 原因 |
|---|---|
| 删除 `today_review_status` 页面代码 | 仍是复习完成后的跳转落地页 |
| 新增底部导航栏 | 产品方向决策 |
| 大重构 `recordStorage` / `apiClient` / review 相关链路 | 影响范围过大，需专项规划 |
| 同时改前端和后端（除非任务明确要求联动） | 防止范围扩大 |

### 文案与语义

| 禁止操作 | 原因 |
|---|---|
| 把用户可见文案改回"每日目标 / 今日目标 / 今日复习 / 完成目标 / 打卡" | 产品方向已明确调整为轻量化语义 |
| 恢复"今日任务 / 成绩报表 / 待学习 / 复习中 / 待加强 / 已掌握"等用户可见表达 | 同上 |

### 配置文件

| 禁止操作 | 原因 |
|---|---|
| 提交 `.env` | 包含密钥 |
| 提交 `project.private.config.json` | 本地开发者工具配置 |
| 提交 `settings.local.json` | 本地配置 |
| 自动修改上述文件 | 可能覆盖个人配置 |

---

## 五、提交规则

### 何时提交

- 只在用户明确说"提交" / "commit" 时才执行 commit
- 提交前必须向用户展示：
  1. `git diff --check` 结果（无输出）
  2. `git status --short` 列出所有修改文件
  3. 改动文件列表和简要说明

### 绝不提交的内容

`.env` / `*.log` / `__pycache__` / `project.private.config.json` / `.venv/` / 本地测试数据文件

### Commit message 格式

```
<简短描述>（50 字符以内）

[可选] 详细说明：
- 修改了什么
- 为什么改
- 未改什么（重要时声明）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## 六、文档更新规则

### 必须更新 `current-phase.md`

- 完成一个较大产品 Phase 时
- 用户明确要求更新文档时
- 完成 docs-only 任务时（记录本次变更）

### 建议更新 `product-features.md`

- 新增产品能力时
- 修改现有行为时（找到对应描述并更新）
- 废弃功能时（从文档移除，加入"当前明确不做"列表）

### 不更新文档的情况

- 纯 bugfix 且行为语义不变
- 纯文案微调且不影响功能描述

---

## 七、前后端分工边界

**默认规则：** 每次任务只改一侧（前端 **或** 后端），不得同时改两侧，除非：
- 任务描述明确要求联动（如"前端加字段，后端加接口"）
- 用户在确认环节明确同意跨端改动

**前端独立管理：** 页面文案、UI 布局、本地缓存、状态展示、本地校验、分析缓存
**后端独立管理：** 数据库 schema、迁移、复习规则、API 接口、AI 分析服务

---

## 八、常见风险检查点

在执行以下操作前，停下来想一想：

| 操作 | 检查 |
|---|---|
| 修改 `review_rules.py` | 是否影响回炉逻辑、状态转换、调度链？ |
| 修改 `apiClient.js` | 是否改变了接口地址或 token 传递方式？ |
| 修改 `recordStorage.js` | 是否影响 pending 同步、缓存键、TTL？ |
| 修改 `app/routers/reviews.py` | 是否影响 session 创建、反馈处理、统计接口？ |
| 修改 `app/database.py` | 是否意外改变了数据库连接方式？ |
| 添加新文件 | 是否需要在 `app.json` 注册（前端）或在 `main.py` include（后端）？ |
| 文案修改 | 是否涉及"每日目标 / 今日目标 / 完成目标"等禁用词？ |
