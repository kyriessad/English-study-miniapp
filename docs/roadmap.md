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
| 配置 systemd 服务 | 服务文件中使用 `EnvironmentFile=/path/to/.env` 或 `Environment=KEY=VALUE` 显式加载环境变量；设置 `Restart=on-failure`、`RestartSec=5s`；`systemctl enable english-backend` 开机自启；使用 `journalctl -u english-backend -f` 查看服务日志 |
| 配置 Nginx 反向代理 | 监听 443，转发到 127.0.0.1:8001；HTTP 自动跳转 HTTPS；必须配置 `proxy_set_header Host $host`、`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`、`proxy_set_header X-Forwarded-Proto $scheme`；AI 分析接口最多 30s，需设置 `proxy_read_timeout 60s`（或更长） |
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

### P0-6 微信小程序账号、服务类目、备案、基础信息确认

正式发布前须确保小程序账号信息完整、服务类目与实际功能匹配。

| 子任务 | 说明 |
|---|---|
| 小程序主体确认 | 确认注册主体（个人 / 企业）和服务提供方 |
| 服务类目 | 选择与小程序功能匹配的类目（工具 / 教育等），避免审核驳回 |
| 名称与头像 | 检查小程序名称、头像是否符合微信规范，不含违规词汇 |
| 简介 | 检查服务简介是否清晰准确描述功能，不夸大不误导 |
| 审核风险自查 | 涉及 AI 生成内容需在小程序描述中说明；不出现违禁词；功能与服务类目吻合 |

---

### P0-7 用户隐私保护指引与授权弹窗

微信要求小程序在收集用户信息前展示隐私保护指引（2023 年后强制执行）。

| 子任务 | 说明 |
|---|---|
| 微信公众平台隐私保护指引 | 在微信公众平台 → 设置 → 隐私设置中填写隐私保护指引；与代码实际收集的信息类型一致 |
| 收集信息类型声明 | 至少声明：用户输入的英文内容 / 我的理解 / 备注 / 来源；复习日志（学习记录）；通过 `wx.login` 获取的微信登录标识（openid）；英文内容传入后端用于 AI 翻译和例句生成 |
| 授权弹窗 | 当前流程仅用 `wx.login` 获取 openid，确认是否需要额外授权弹窗；若需要，用户拒绝时功能降级提示需合理 |
| 隐私指引版本对齐 | 隐私指引版本需与小程序上传版本对应，微信审核会核查 |

---

### P0-8 生产密钥与配置安全

| 子任务 | 说明 |
|---|---|
| JWT_SECRET_KEY | 生产环境必须使用 64 位以上随机字符串，与开发环境不同 |
| HUNYUAN_API_KEY | 确认腾讯 TokenHub API key 有效，无额度超限或到期风险 |
| WECHAT_APPID / WECHAT_SECRET | 使用正式小程序的 AppID 和 Secret（非测试号）|
| .env 文件权限 | 服务器上 `.env` 文件权限设为 600（仅 owner 可读）|
| Git 历史检查 | 确认 `.env` 未被提交到 Git 历史（运行 `git log --all -- .env` 确认无记录）|
| 日志不打印 token/secret | 确认服务器日志、uvicorn 输出中不含 token、secret、API key 等敏感信息 |

---

### P0-9 PostgreSQL 备份与恢复预案

> **重要：** 这是上线前必须人工确认的步骤，不是代码自动检测。生产环境代码断言见 P1-1（计划后续加入，本次未实现）。

| 子任务 | 说明 |
|---|---|
| 人工确认生产 DATABASE_URL | **必须人工打开生产 `.env`，确认 `DATABASE_URL` 以 `postgresql://` 开头，不是 `sqlite:///`**。`app/database.py` 在 URL 未设置时会静默 fallback 到 SQLite，生产误配将导致数据隔离失效。 |
| pg_dump 导出验证 | 手动运行一次 `pg_dump`，确认可成功导出 `.sql` 或 `.dump` 文件 |
| 备份存放位置 | 明确备份文件存放路径，建议定期上传到独立对象存储（OSS / COS）|
| 恢复验证 | 至少在测试数据库上验证一次 `pg_restore` 或 `psql < backup.sql` 可恢复 |
| 自动备份计划 | 配置服务器定时任务（cron / systemd timer）每天至少备份一次 |

---

### P0-10 AI 分析服务生产可用性与降级

| 子任务 | 说明 |
|---|---|
| Hunyuan API Key 生产可用 | 确认 TokenHub API key 在生产环境有效；可手动 curl 测试 `/chat/completions` 接口 |
| analyze 接口超时不阻塞保存 | AI 分析失败时卡片仍可正常保存；分析是 fire-and-forget，不阻塞主流程 |
| 分析失败提示友好 | AI 分析失败时前端提示"网络暂时不稳，可以先保存"，不暴露 HTTP 错误码或 stack trace |
| Hunyuan 超时上限 | 后端 Hunyuan 请求有 15s 超时，确认不会使整个 analyze 接口阻塞超时 |

---

### P0-11 微信登录生产链路与多用户隔离

| 子任务 | 说明 |
|---|---|
| 正式 WECHAT_APPID / SECRET | 生产环境使用正式小程序的 AppID 和 Secret，不使用沙箱或测试号 |
| 真机登录测试 | 在真实手机上完整走通 `wx.login` → 后端 `/api/auth/wechat-login` → 获得 JWT token 全流程 |
| JWT 有效期 | 确认 JWT 有合理的有效期（如 7 天），过期后前端能重新登录获取新 token |
| token 过期重登 | 前端在 token 过期（401 响应）时能提示用户重新登录，不无限循环 |
| A 用户不可见 B 用户数据 | 用两个微信账号分别登录，确认卡片列表、复习历史、今日看过完全隔离 |

---

### P0-12 体验版灰度测试

发布正式版前必须先通过体验版流程完整验证。

| 子任务 | 说明 |
|---|---|
| 上传体验版 | 微信开发者工具 → 上传 → 设置版本号 → 生成体验版 |
| 添加体验成员 | 在微信公众平台添加非开发者体验成员（至少 1 位）|
| iOS 真机测试 | 用 iOS 手机（非开发者账号）扫体验版码，从头完整走流程 |
| Android 真机测试 | 用 Android 手机（非开发者账号）扫体验版码，从头完整走流程 |
| 功能覆盖 | 添加卡片、查看卡片、反馈、今天看过、历史记录、设置，全部在真机上验证 |
| 远程调试确认 | 开发者工具远程调试体验版，确认 console 无关键报错 |

---

### P0-13 最小回滚预案

| 子任务 | 说明 |
|---|---|
| 前端回滚方案 | 知道如何回退到上一个体验版或稳定的正式版（微信公众平台 → 版本管理）|
| 后端代码回滚 | `git checkout <stable-commit>` + 重启 uvicorn 服务 |
| 数据库 migration 不轻易回滚 | Alembic downgrade 有数据丢失风险；优先保留备份，发布前确认迁移脚本安全 |
| 发布前手动备份 | 每次正式发布前手动 `pg_dump` 一次，保存到安全位置 |
| 回滚验证能力 | 确认知道如何重启 Nginx/systemd；回滚后 `/health` 接口正常 |

---

### P0-14 微信审核材料准备

正式提交审核前，必须准备齐以下材料，否则审核必驳回。

| 子任务 | 说明 |
|---|---|
| 小程序名称 | 确认名称已通过微信规范审查，不含违禁词，与实际功能相符 |
| 小程序图标 | 已上传高清正方形图标（建议 512×512 px 以上），无违规内容 |
| 小程序简介 | 简洁准确描述核心功能（记录英文、轻量回顾），不夸大、不误导、不含违禁词 |
| 服务类目 | 在微信公众平台选择与功能匹配的服务类目（工具 / 学习辅助等），避免类目与功能不符导致驳回 |
| 版本说明 | 在上传版本时填写版本说明（本次更新了什么），帮助审核员理解功能 |
| 隐私保护指引 | 在微信公众平台完成隐私保护指引配置，与代码实际收集的信息类型保持一致（见 P0-7）|
| 审核说明 | 如有 AI 生成内容，在审核说明中说明 AI 功能来源（Hunyuan）及用途（辅助翻译/例句）；功能需登录才能使用时，提供测试账号说明 |
| 功能截图 | 准备关键页面截图：添加卡片、首页卡片列表、查看卡片（复习流程）、历史记录，各至少 1 张 |

---

### P0-15 发布前仓库清洁检查

提交微信审核前，必须确认仓库状态干净，无敏感信息泄露。

| 检查项 | 命令 / 说明 |
|---|---|
| 工作区干净 | `git status --short` 输出为空（无未提交的改动）|
| 不提交本地配置 | 确认 `utils/localBackendConfig.js`、`.env`、`project.private.config.json`、`settings.local.json` 未被 `git add`（加入 `.gitignore` 或手动确认）|
| 非 docs 代码无本地地址 | `grep -r "127.0.0.1:8001" pages/ utils/` 应无输出（apiClient.js 已改为生产域名）|
| 非 docs 代码无局域网 IP | `grep -r "10\.\|192\.168\." pages/ utils/` 应无输出 |
| 非 docs 代码无占位符域名 | `grep -r "api.yourdomain.com" pages/ utils/` 应无输出 |
| 无密钥泄露 | `grep -r "HUNYUAN_API_KEY\|WECHAT_SECRET\|JWT_SECRET_KEY" pages/ utils/` 应无 key 值 |
| Git 历史无密钥 | `git log --all -- .env` 无输出 |

---

## P1 — 发布后短期优化（上线后 1-2 周内）

### P1-1 后端启动断言（计划后续加入，本次未实现）

`app/database.py` 当前在 `DATABASE_URL` 未设置时静默降级为 SQLite。**本次未加代码断言**，生产 URL 正确性由 P0-9 人工确认保证。建议后续在启动时加入断言，防止误操作：

```python
assert DATABASE_URL.startswith("postgresql"), "DATABASE_URL must be PostgreSQL in production"
```

> 说明：不要把此项误以为已完成；这是发布后的改进项，不是发布阻断项。

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

### P1-5 前端 pending commits — 已核实完成

截至 2026-05-27 git log 核实，以下 phase 的前端代码均已提交，无 pending commit：

| Phase | 前端 commit | 提交说明 |
|---|---|---|
| extend-batch-size-options | `e3009f9` | extend review batch size options |
| fix-review-batch-size | `1008751` | fix review batch size setting |
| Phase about-polish | `537bc56` | polish about page guidance and feedback entry |
| Release-P1-copy-alignment | `e99aaab` | align review result copy before release |
| Phase 8D-home-lightweight | `4d2caa4` | remove home new-card prompt |
| hotfix-bulk-action-position | `b753bf1` | move bulk actions near card list |
| Phase 8A-home-review-navigation-lightweight | `9143346` | lighten home review entry |

---

### P1-6 后端 pending commit — 已核实完成

截至 2026-05-27 git log 核实，`extend-batch-size-options` 后端改动已提交：

| Phase | 后端 commit | 提交说明 |
|---|---|---|
| extend-batch-size-options | `121b565` | allow larger review daily goals |

---

### P1-7 生产日志与错误排查

- [ ] uvicorn 日志（access log + error log）写入文件，不只输出到 stdout
- [ ] 定期检查服务器 journal 或日志文件是否有 ERROR 级别日志（`journalctl -u english-backend --since today`）
- [ ] Hunyuan / TMT 诊断日志（`[hunyuan][diag]`）可用于排查例句生成问题
- [ ] 日志轮转配置（logrotate 或 systemd journal 大小限制），防止磁盘占满

---

### P1-8 服务器基础监控

- [ ] CPU / 内存 / 磁盘使用率有监控告警（云服务商控制台或第三方工具）
- [ ] 磁盘剩余空间 > 20%
- [ ] 服务器可用性检测（ping / HTTP 健康检查）

---

### P1-9 后端错误告警

- [ ] uvicorn 进程崩溃后 systemd 自动重启（`Restart=on-failure` 已配置）
- [ ] 可选：配置告警通知（邮件 / 微信 webhook）在服务不可用时通知开发者

---

### P1-10 API 限流（保护 Hunyuan API 成本）

- [ ] 对 `/api/analyze-english` 接口添加限流（如每用户每分钟 10 次，或全局 QPS 限制）
- [ ] 对 `/api/cards` POST 添加限流，防止批量写入
- [ ] 限流触发时返回 HTTP 429，前端友好提示"请求过于频繁，请稍后再试"

---

### P1-11 用户反馈入口

- [ ] 关于页 → "联系开发者"弹窗已上线（Phase about-polish 已提交 `537bc56`）
- [ ] 验证弹窗可正常复制开发者邮箱（`wx.setClipboardData`）

---

## P2 — 以后再做

| 任务 | 说明 |
|---|---|
| Docker 化 | 将后端容器化，方便部署和迁移 |
| CI/CD Pipeline | 自动化测试 + 部署流程 |
| Sentry 或错误追踪 | 生产错误聚合告警（Sentry / 自建 ELK） |
| 管理后台 | 简单后台界面，查看用户数量、卡片数量、分析失败率等 |
| 用户数据导出 | 用户可导出自己的卡片数据（CSV / JSON） |
| 注销账号 / 删除数据 | 用户可注销账号、删除所有个人数据（合规要求） |
| 成本看板 | Hunyuan API 用量监控，防止成本异常增长 |
| 防滥用机制 | 检测异常请求模式，自动封禁或告警 |
| 更完善自动备份 | PostgreSQL 定期快照自动上传对象存储（P0-9 的生产强化版） |
| 多机型真机验收 | iOS / Android 多个机型的显示一致性 |
| 性能监控 | API 响应时间、例句生成延迟监控 |
| 用户增长分析 | 微信小程序数据面板接入（现有官方分析即可） |
