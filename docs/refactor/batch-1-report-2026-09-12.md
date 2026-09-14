# 第 1 批验收报告：鉴权、transport 与领域 API 基础

日期：2026-09-12
结论：PASS

## 本批完成

- 保留 `utils/apiClient.js` 作为唯一 `wx.request` 实现。
- 统一 transport 错误为 `AppError`，包含稳定 `code`、HTTP 状态、原始数据和可重试标记。
- 保留现有旧导出，新增 `utils/api/` 正式入口：`auth`、`cards`、`discovery`、`reviews`、`wordbooks` 和 mapper。
- GET 请求支持统一 query 编码；领域 API 不需要页面拼接 URL 或读取 token。
- 增加鉴权状态：`loading`、`authenticated`、`unauthenticated`、`network-error`。
- 并发 401 仍使用单飞刷新；每个请求最多重放一次。
- logout 或身份世代变化后，旧 refresh 和旧响应不能恢复或覆盖当前身份。
- 保留离线缓存、离线动作队列、TTS、AI 流式和现有页面导出。

## 验收证据

- `node --test tests/api-foundation.test.js`：4 passed。
- `node --test tests/*.test.js`：45 passed, 16 skipped, 0 failed。
- 所有前端 JavaScript `node --check`：通过。
- `git diff --check`：通过；仅有既有 LF/CRLF 提示，无空白错误。
- 未查看图片，未生成图片，未修改正式页面视觉。
- 未修改后端、Alembic 或生产数据库。

## 范围说明

现有正式页面继续使用 `apiClient` 兼容导出，因此本批不改变页面行为。后续批次可以逐页切换到 `utils/api/`，但不在本批提前迁移页面。

Layer 3 真实微信开发者工具验收仍按总计划留到需要真实链路的批次；本批没有新增视觉验收项。

第 1 批通过，可以进入第 2 批；本轮到此停止。
