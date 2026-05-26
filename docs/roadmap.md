# 英语学习小程序 — 发布路线图

> 本文档列出从当前开发状态到正式发布的任务清单，按优先级分 P0 / P1 / P2 三级。
> 更新时间：2026-05-27

---

## P0 — 发布阻断项（上线前必须完成）

### P0-1 生产后端 HTTPS 部署

当前后端只在本地运行（`http://127.0.0.1:8001`），微信小程序正式发布要求所有接口必须走 HTTPS。

| 子任务 | 说明 |
|---|---|
| 准备 Linux 服务器 | 推荐 Ubuntu 22.04；安装 Python 3.11+、PostgreSQL、Nginx、Certbot |
| 配置生产 `.env` | DATABASE_URL → PostgreSQL；JWT_SECRET_KEY（64位随机串）；HUNYUAN_API_KEY；WECHAT_APPID/SECRET |
| 运行 `alembic upgrade head` | 首次部署必须执行，7 个 migration 文件全部应用 |
| 启动 uvicorn 服务 | `uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 1`（不带 `--reload`） |
| 配置 systemd 服务 | 确保服务器重启后自动拉起，`systemctl enable english-backend` |
| 配置 Nginx 反向代理 | 监听 443，转发到 127.0.0.1:8001；HTTP 自动跳转 HTTPS |
| 申请 Let's Encrypt 证书 | `certbot --nginx -d api.yourdomain.com`；配置自动续期 |
| 验证 `/health` 接口 | `curl https://api.yourdomain.com/health` 返回 `{"status":"ok"}` |

**参考文档：** 上一轮只读审查报告（2026-05-27 对话）

---

### P0-2 域名备案与 DNS 配置

| 子任务 | 说明 |
|---|---|
| ICP 备案 | 域名必须完成工信部 ICP 备案（中国大陆服务器要求） |
| DNS 解析 | A 记录 / CNAME 指向服务器 IP |
| 验证解析生效 | `nslookup api.yourdomain.com` 返回正确 IP |

---

### P0-3 微信公众平台合法域名配置

微信小程序正式版只允许向已在平台配置的 HTTPS 域名发起请求。

| 子任务 | 说明 |
|---|---|
| 登录微信公众平台 | https://mp.weixin.qq.com |
| 配置 request 合法域名 | 开发 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名，添加生产域名 |
| 配置上传合法域名（如有云存储） | 暂无，跳过 |
| 在开发者工具中验证 | 重新编译后无"不在以下合法域名列表中"黄色警告 |

---

### P0-4 前端生产 BACKEND_BASE_URL

**最大单点风险：** `utils/apiClient.js` 中 `BACKEND_BASE_URL` 当前硬编码为 `http://127.0.0.1:8001`，发布前必须改为生产 HTTPS 地址，否则所有接口请求失败。

| 子任务 | 说明 |
|---|---|
| 修改 `utils/apiClient.js` | 将 `BACKEND_BASE_URL` 改为 `https://api.yourdomain.com` |
| 微信开发者工具重新编译 | 确认无域名错误 |
| 真机扫码体验版验证 | 用手机微信扫码测试版二维码，确认接口正常 |

---

### P0-5 真机全流程扫码验收

开发者工具不等于真机。发布前必须在真实手机上完成完整流程验收（见 `docs/release-checklist.md`）。

---

## P1 — 发布后短期优化（上线后 1-2 周内）

### P1-1 后端启动断言

`app/database.py` 当前在 `DATABASE_URL` 未设置时静默降级为 SQLite。建议在启动时加入断言，防止误操作：

```python
assert DATABASE_URL.startswith("postgresql"), "DATABASE_URL must be PostgreSQL in production"
```

---

### P1-2 CORS Middleware

`app/main.py` 当前没有配置 `CORSMiddleware`。微信小程序本身不受浏览器 CORS 约束，不影响上线。但微信开发者工具 Web 模拟器会触发 CORS，建议后续添加以方便调试。

---

### P1-3 alembic.ini SQLite URL 注释化

`alembic.ini:89` 中 `sqlalchemy.url = sqlite:///./english_analyzer.db` 在运行时已被 `alembic/env.py` 覆盖，不影响功能，但容易误导维护者。建议改为注释说明。

---

### P1-4 requirements.txt 版本锁定

当前依赖均无精确版本号（如 `fastapi`、`sqlalchemy>=2.0`），可能因第三方包更新引发不兼容。建议在部署稳定后执行 `pip freeze > requirements-lock.txt` 并在 CI 中使用锁定版本。

---

### P1-5 前端 pending commits 整理

以下前端 phase 的 commit 标记为 `pending`，确认代码正确后需提交：

| Phase | 状态 |
|---|---|
| extend-batch-size-options | frontend pending |
| fix-review-batch-size | frontend pending |
| Phase about-polish | frontend pending |
| Release-P1-copy-alignment | frontend pending |
| Phase 8D-home-lightweight | frontend pending |
| hotfix-bulk-action-position | frontend pending |
| Phase 8A-home-review-navigation-lightweight | frontend pending |

---

### P1-6 后端 pending commit 确认

`extend-batch-size-options` 后端改动（`VALID_DAILY_GOALS = {3, 5, 10, 15}`）标记为 backend pending，需提交。

---

## P2 — 以后再做

| 任务 | 说明 |
|---|---|
| Docker 化 | 将后端容器化，方便部署和迁移 |
| CI/CD Pipeline | 自动化测试 + 部署流程 |
| 接口限流 | 防止异常请求量，保护 Hunyuan API 额度 |
| 日志收集 | 结构化日志 + 错误告警（Sentry / ELK） |
| 云数据库备份 | PostgreSQL 定期快照，防止数据丢失 |
| 多机型真机验收 | iOS / Android 多个机型的显示一致性 |
| today_review_status 页面重构 | 从进度重复页重构为"今日复盘页"（Phase 8K 有方案草稿） |
| 性能监控 | API 响应时间、例句生成延迟监控 |
| 用户增长分析 | 微信小程序数据面板接入（现有官方分析即可） |
