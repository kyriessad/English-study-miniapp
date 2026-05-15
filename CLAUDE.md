# English-study-miniapp Project Rules

## 项目性质

微信小程序前端，配套后端为 English-analyzer-backend。

## 常用目录

- pages/index — 首页
- pages/add — 新增/编辑卡片
- pages/review — 复习页
- pages/history_reviewed — 历史复习列表
- pages/history_detail — 历史详情
- utils/recordStorage.js — 本地缓存、fallback、卡片存储兼容逻辑
- utils/apiClient.js — 后端 API 请求

## 强制边界

- 不要修改 project.private.config.json。
- 不要主动重构大文件。
- hotfix 默认只改用户指定文件。
- 不要把"历史复习内容页"和"今日复习内容页"混用。
- 历史页基于 ReviewLog 快照，只读。
- 今日复习内容页基于今天复习过的当前卡片，可编辑、不可删除。
- 不要在没有明确要求时修改 review session 创建逻辑、回炉逻辑、pending 自动同步逻辑。

## 当前首页统计语义

首页"今日任务 / 今日已完成"采用 unique card count：

- 今日任务 = 当前今日建议任务的有效唯一卡片数
- 今日已完成 = 当前今日任务中已完成反馈的有效唯一卡片数
- 不统计已删除卡片
- 不按回炉次数累计
- 不使用 review session dynamic steps
- 不被 is_all_done 覆盖为 0

## 验证命令

- 修改 JS 后运行：`node --check <changed-js-file>`
- 提交前运行：`git diff --check`
- 提交前确认：`git status --short`

## Git 规则

- 不要自动提交，除非用户明确要求。
- 提交前必须输出修改文件、验证结果、git status。
- project.private.config.json 如被微信开发者工具自动修改，应还原，不要提交。
