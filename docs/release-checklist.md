# 发布前人工验收清单

> 本清单用于正式提交微信审核前的人工全流程验收。
> 每次发布前逐项勾选，未勾选项必须解决或在旁边注明豁免理由。
> 更新时间：2026-05-27

---

## 零、发布前仓库清洁检查

提交审核前必须确认仓库状态干净，无敏感文件和开发占位符。

- [ ] `git status --short` 输出为空（无未提交的改动）
- [ ] `utils/localBackendConfig.js` 未被提交（确认未在 git status 中出现）
- [ ] `.env` 未被提交（`git log --all -- .env` 无输出）
- [ ] `project.private.config.json` 未被提交
- [ ] `settings.local.json` 未被提交
- [ ] 非 docs 代码中无 `127.0.0.1:8001`（`grep -r "127.0.0.1:8001" pages/ utils/` 无输出）
- [ ] 非 docs 代码中无局域网 IP（`grep -r "192\.168\.\|10\.\." pages/ utils/` 无输出）
- [ ] 非 docs 代码中无占位符域名 `api.yourdomain.com`（`grep -r "api.yourdomain.com" pages/ utils/` 无输出）
- [ ] 非 docs 代码中无密钥值（`HUNYUAN_API_KEY`、`WECHAT_SECRET`、`JWT_SECRET_KEY` 的实际值未出现在代码中）

---

## 一、后端部署验证

- [ ] 服务器可 SSH 访问
- [ ] PostgreSQL 已运行，数据库和用户已创建
- [ ] 生产 `.env` 已配置：`DATABASE_URL`（PostgreSQL）、`JWT_SECRET_KEY`、`HUNYUAN_API_KEY`、`WECHAT_APPID`、`WECHAT_SECRET`
- [ ] **人工确认 `DATABASE_URL` 以 `postgresql://` 开头，不是 `sqlite:///`**（`app/database.py` 在 URL 未设置时静默 fallback 到 SQLite，必须人工核查）
- [ ] `alembic upgrade head` 已运行，输出无 ERROR，所有 migration 已应用
- [ ] uvicorn 服务已启动，`GET /health` 返回 `{"status":"ok"}`
- [ ] systemd 服务已启用（`systemctl status english-backend` 为 active (running)），且设置了 `Restart=on-failure`
- [ ] systemd 服务使用 `EnvironmentFile` 或 `Environment=` 加载 `.env` 中的密钥，而非依赖 shell 环境
- [ ] Nginx 配置已生效，`curl -I https://api.yourdomain.com/health` 返回 HTTP 200
- [ ] Nginx 配置包含 `proxy_set_header Host`、`proxy_set_header X-Forwarded-For`、`proxy_set_header X-Forwarded-Proto`
- [ ] Nginx `proxy_read_timeout` 已设置（建议 60s 以上，AI 分析接口可能较慢）
- [ ] HTTP 请求自动跳转 HTTPS（`curl -I http://api.yourdomain.com/health` 返回 301/302）
- [ ] HTTPS 证书有效期 > 30 天（`certbot certificates` 确认）

---

## 二、域名与微信平台配置

- [ ] 域名 ICP 备案已完成，可在工信部官网查询到
- [ ] DNS A 记录指向服务器 IP，`nslookup api.yourdomain.com` 返回正确 IP
- [ ] 微信公众平台 → 开发管理 → 服务器域名 → **request 合法域名**已添加生产 HTTPS 域名
- [ ] 微信开发者工具重新编译后，调试面板无"不在以下合法域名列表中"黄色警告

---

## 三、前端生产配置

- [ ] `utils/apiClient.js` 中 `BACKEND_BASE_URL` 已改为生产 HTTPS 域名（非 `http://127.0.0.1:8001`）
- [ ] 已使用微信开发者工具完整编译（无编译错误）
- [ ] 开发者工具 Network 面板可见接口请求打到生产域名且返回正常

---

## 四、添加卡片

- [ ] 输入普通英文单词（如 `clutch`），分析正常返回翻译 + 理解建议
- [ ] word/phrase 类别有 AI 例句展示
- [ ] 输入短语（如 `break a leg`），例句正常生成
- [ ] 输入连字符词（如 `well-known`），分类为"单词"，有例句
- [ ] 输入字母数字词（如 `COVID-19`、`GPT-4`、`5G`），分类为"单词"，有例句
- [ ] 点击"全部填入"，我的理解字段正确填入，备注追加例句英文 + 中文翻译
- [ ] 输入含中文内容（如 `hello 你好`），显示红色 error "英文内容请只填写英文"，不可保存
- [ ] 输入纯数字/纯符号（如 `2024`），显示红色 error "请输入英文内容"
- [ ] 输入空内容，显示红色 error "英文内容为空"
- [ ] 输入超长内容（>500 字符），显示 error "内容较长，建议拆分后再保存"
- [ ] 单词类别下输入多个词（如 `hello world`），显示 error "单词类别请只填一个词"
- [ ] 保存成功后显示 toast "已保存"
- [ ] 编辑已有卡片修改后保存，显示 toast "已更新"
- [ ] 填写 whereEncountered 来源并保存，首页卡片显示"来自：xxx"

---

## 五、英文规范化

- [ ] 输入 `he 's`，等待分析触发后，英文输入框自动变为 `he's`
- [ ] 输入 `good   morning`（多余空格），自动变为 `good morning`
- [ ] 输入含中文标点（如 `hello，world`），自动变为 `hello,world`
- [ ] 输入 `HELLO`，**不**自动变为小写（保持 `HELLO`）
- [ ] 输入 `cluch`，**不**自动改为 `clutch`，只显示 hint "也可能是：clutch"
- [ ] 输入 `good job 👍`，emoji 保留不被删除

---

## 六、首页

- [ ] 卡片列表正常加载，显示英文内容 + 来源 pill（有来源时）
- [ ] 状态筛选正常：全部 / ○ 新卡 / ◑ 熟悉中 / ! 有点忘 / ✓ 记得
- [ ] 卡片右上角状态图标颜色正确：灰(new) / 蓝(reviewing) / 琥珀(strengthening) / 绿(mastered)
- [ ] 添加卡片主按钮（绿色渐变，约 66% 宽度）
- [ ] 查看卡片/继续查看次按钮（约 34% 宽度）
- [ ] 有今日复习记录时，显示"今天看过 X 张 · 查看 ›"，点击进入今天看过页面
- [ ] 无今日复习记录时，显示"今天还没看过卡片"（静态文字，不可点击）
- [ ] 卡片数 > 10 时搜索栏出现，搜索英文/理解/来源等正常过滤
- [ ] 首页无"每日目标"进度条、无"今日任务 X/Y"大卡片

---

## 七、开始查看（复习）

- [ ] 点击"查看卡片"，后端创建 session 并进入复习页
- [ ] 有进行中 session 时，按钮文案变为"继续查看"
- [ ] 设置“每次看几张”为 5，卡片库有 6 张，其中 5 张今天已看过且为 reviewing/mastered，新加 1 张新卡；新建 session 应进入 5 张，包含新卡，另 4 张由旧卡补位，同一轮不重复同一张卡
- [ ] 卡片库只有 3 张、设置每次看 5 张时，新建 session 返回 3 张，不报错
- [ ] 同时存在新卡、到期卡、熟悉中卡、已记得卡时，新卡 / 到期 / 熟悉中排在已记得 / mastered 补位卡之前
- [ ] 复习页顶部显示"当前进度 X / Y"，卡片内**不**重复显示进度数字
- [ ] 卡片正面显示英文内容（有来源时显示"来自：xxx"）
- [ ] 初始只显示英文，点击"查看理解"后展开背面
- [ ] 背面显示：我的理解 + 补充备注（有则显示）+ 来源
- [ ] 卡片展开后页面整体滚动，无内部滚动条
- [ ] 卡片左上角类型标签显示"单词 / 短语 / 句子"

---

## 八、四档反馈

- [ ] 点击"没想起"（forgot）提交反馈，进入下一张
- [ ] 点击"有点模糊"（shaky）提交反馈，进入下一张
- [ ] 点击"记得"（got_it）提交反馈，进入下一张
- [ ] 点击"很熟"（fluent）提交反馈，进入下一张
- [ ] 全部反馈完成后，页面跳转到 today_reviewed（今天看过）或展示页内完成面板

---

## 九、回炉卡

- [ ] 对某张卡片选择"没想起"，该卡在约 5 张后重新出现
- [ ] 重新出现的回炉卡，再次选择"没想起"，该卡第二次回炉（最多 2 次）
- [ ] 对某张卡片选择"有点模糊"，该卡在约 5 张后重新出现（最多 1 次）
- [ ] 回炉卡（首次反馈为 forgot/shaky）选择"很熟"后，状态升为 `reviewing`（**不**升为 `mastered`，Phase 8J cap）

---

## 十、今日看过页面

- [ ] 复习若干张后，首页"今天看过 X 张"正确计数（distinct card_id）
- [ ] 同一张卡当天重复查看时，ReviewLog 可以新增多条，但"今天看过 X 张"去重数不重复增加
- [ ] 点击进入今天看过页面，页面标题为"今天看过"
- [ ] 展示今日复习的卡片列表（使用当前 card 内容，非 snapshot）
- [ ] 筛选：全部 / 有点忘了 / 记得，切换正常
- [ ] 筛选结果为空时，显示"今天还没有这类复习内容"
- [ ] 卡片**不**展示"复习 X 次"
- [ ] 来源 pill 放卡片右下角"来自：xxx"，无来源不显示
- [ ] 右上角"历史记录 ›"链接可跳转历史记录页
- [ ] 从今天看过页点击卡片进入编辑，保存后返回时列表自动刷新

---

## 十一、历史记录

- [ ] 历史记录页标题为"历史记录"
- [ ] 顶部弱统计展示（今天看过 X 张 · 共 Y 次）
- [ ] 时间范围筛选（今天 / 近7天 / 近30天 / 全部）切换正常，数据随之变化
- [ ] 反馈筛选（全部 / 有点忘了 / 记得）切换正常
- [ ] 搜索框搜索英文内容、理解、来源等，结果过滤正确
- [ ] 卡片时间文案显示"最后查看：xxx"（**不**显示"本时段复习 X 次"）
- [ ] 来源 pill 放右下角"来自：xxx"，无来源不显示，**不**显示"未分类"标签
- [ ] 触底加载更多，或显示"没有更多了"
- [ ] 点击历史卡片进入历史详情页，展示 ReviewLog snapshot 内容（非当前卡片内容）
- [ ] 历史详情页为只读，无编辑按钮

---

## 十二、设置页

- [ ] "每次看几张" picker 可选 3 / 5 / 10 / 15 张
- [ ] 修改设置后新建 session，复习张数符合设置值
- [ ] 卡片库可用卡足够时，新建 session 尽量凑满“每次看几张”的目标数量
- [ ] 有未完成 session 时点击"继续查看"，进入原 session，**不**重建，**不**受新设置影响
- [ ] 设置页无"每日目标"等任务化文案

---

## 十三、离线与弱网

- [ ] 断网情况下添加卡片：toast 显示"已保存"；首页立即出现该卡片；首页底部显示"网络恢复后会更新学习记录"
- [ ] 断网情况下首页显示缓存卡片，底部显示"网络恢复后会更新学习记录"
- [ ] 断网情况下今天看过页显示缓存数据
- [ ] 断网情况下历史页：有本地缓存时显示缓存数据；无缓存时显示"当前无网络连接，暂时无法查看"
- [ ] 恢复网络后，pending 卡片自动同步到后端（首页 onShow 触发）
- [ ] 离线状态下复习反馈无法提交时，弹 toast "网络连接异常，请检查网络后再试"，停留在当前卡片

---

## 十四、真机扫码验收

- [ ] 微信开发者工具上传体验版，使用真实手机微信扫码
- [ ] 真机登录（微信授权）正常
- [ ] 真机上添加卡片 → 分析 → 保存全流程正常
- [ ] 真机上复习流程完整（查看理解、反馈、回炉）
- [ ] 真机上今天看过页、历史页正常加载
- [ ] 真机上无明显布局错乱（iOS 和 Android 各测一台）
- [ ] 通过微信开发者工具远程调试确认真机 console 无报错

---

## 十五、生产后端接口验证

以下接口路径均已通过 grep `app/routers/` 和 `app/main.py` 代码核实。

- [ ] `GET https://api.yourdomain.com/health` → `{"status":"ok"}`
- [ ] `POST https://api.yourdomain.com/api/auth/wechat-login` → 返回 JWT token（核实：`app/routers/auth.py` `prefix="/api/auth"`）
- [ ] `GET https://api.yourdomain.com/api/auth/me`（携带 Bearer token）→ 返回用户信息（核实：同上）
- [ ] `POST https://api.yourdomain.com/api/analyze-english`（传入 `{"text":"clutch","cardType":"word","targetLang":"zh"}`）→ 返回翻译 + 例句（核实：`app/main.py:30`）
- [ ] `GET https://api.yourdomain.com/api/cards`（携带 Bearer token）→ 返回卡片列表（核实：`app/routers/cards.py` `prefix="/api/cards"`）
- [ ] `POST https://api.yourdomain.com/api/review-sessions`（携带 Bearer token）→ 创建复习 session 返回 items（核实：`app/routers/reviews.py` `review_sessions_router` `prefix="/api/review-sessions"`）
- [ ] `GET https://api.yourdomain.com/api/reviews/today-reviewed`（携带 Bearer token）→ 返回今日复习列表（核实：`app/routers/reviews.py:1447`）
- [ ] `GET https://api.yourdomain.com/api/reviews/history`（携带 Bearer token）→ 返回历史复习列表（核实：`app/routers/reviews.py:838`）
- [ ] `GET https://api.yourdomain.com/api/reviews/history/summary`（携带 Bearer token）→ 返回历史统计摘要（核实：`app/routers/reviews.py:962`）

---

## 十六、新用户从零使用验收

- [ ] 用全新微信账号（从未登录过）扫体验版码，小程序正常打开
- [ ] 首次打开完成微信登录（`wx.login` → JWT token），无报错
- [ ] 无卡片时首页显示空状态引导区，不崩溃
- [ ] 添加第一张卡片：输入英文、填写理解，点击保存，toast 显示"已保存"
- [ ] 保存后首页出现该卡片，内容正确
- [ ] 点击卡片可查看详情 / 进入编辑

---

## 十七、多用户数据隔离验收

- [ ] 用微信账号 A 登录，添加卡片"hello"
- [ ] 用微信账号 B 登录，确认首页不显示账号 A 的"hello"卡片
- [ ] 账号 B 的复习历史、今天看过页面均不显示账号 A 的数据
- [ ] 账号 A 和账号 B 各自的今日看过数量互不影响

---

## 十八、隐私保护指引验收

- [ ] 微信公众平台 → 设置 → 隐私设置中，隐私保护指引已配置并与当前版本对应
- [ ] 隐私指引中声明的信息收集类型（用户输入内容、学习记录、微信登录标识、AI 分析调用）与实际实现一致
- [ ] 小程序首次需要用户授权时弹窗正常显示（不跳过）
- [ ] 用户拒绝授权时功能降级提示合理（非强制性、非崩溃）

---

## 十九、AI 服务失败降级验收

- [ ] 模拟 Hunyuan 不可用（临时关闭 HUNYUAN_API_KEY）：添加卡片时 AI 分析失败，前端显示"网络暂时不稳，可以先保存"（不暴露错误详情）
- [ ] 用户仍可点击保存，卡片正常保存，toast 显示"已保存"
- [ ] 主流程（首页、查看卡片、今天看过、历史）不依赖 AI 分析，正常可用
- [ ] 恢复 Hunyuan 配置后，新输入的卡片 AI 分析恢复正常

---

## 二十、服务重启验收

- [ ] 执行 `systemctl restart english-backend` 后，`GET /health` 返回 `{"status":"ok"}`
- [ ] 重启后已有用户的卡片数据仍可正常访问（数据库持久化正常）
- [ ] Nginx 仍正常转发请求（`curl -I https://api.yourdomain.com/health` 返回 200）
- [ ] systemd 服务设置了 `Restart=on-failure`，确认崩溃后自动拉起
- [ ] `journalctl -u english-backend --since today` 无 ERROR 级别日志

---

## 二十一、数据库备份验收

- [ ] 手动执行 `pg_dump` 导出成功，备份文件存在且可读
- [ ] 记录恢复命令（如 `psql -U user -d dbname < backup.sql`）并存档
- [ ] 备份文件已上传到服务器本机以外的安全位置（对象存储 / 本地备份）
- [ ] 自动备份定时任务（cron 或 systemd timer）已配置并验证可运行

---

## 二十二、体验版灰度验收

- [ ] 微信开发者工具已上传体验版，版本号正确
- [ ] 非开发者体验成员扫码打开体验版，无"无权限"提示
- [ ] iOS 真机（非开发者账号）：完整走一遍添加卡片 → 查看卡片 → 反馈 → 今天看过 → 历史流程
- [ ] Android 真机（非开发者账号）：同上
- [ ] 远程调试（微信开发者工具 → 真机调试）console 无关键报错（无红色 Error）

---

## 二十三、回滚预案验收

- [ ] 确认知道如何回滚前端版本（微信公众平台 → 版本管理 → 切换版本）
- [ ] 确认知道如何回滚后端代码（`git checkout <stable-commit>` + `systemctl restart english-backend`）
- [ ] 确认知道如何回滚 Nginx 配置（`nginx -t` + `systemctl reload nginx`）
- [ ] 数据库 migration 不随意 downgrade，发布前已完成 `pg_dump` 备份
- [ ] 回滚操作文档（或本文档该节）已告知参与发布的人员

---

## 二十四、审核提交前检查

在微信公众平台点击"提交审核"前逐项确认。

- [ ] 小程序名称已填写完整，符合微信规范，无违禁词
- [ ] 小程序头像（图标）已上传，清晰无违规内容
- [ ] 小程序简介已填写，准确描述核心功能，不夸大不误导
- [ ] 服务类目已选择，与实际功能匹配
- [ ] 隐私保护指引已在微信公众平台配置完成（见十八节）
- [ ] 本次提交的版本说明已填写（描述本次更新内容）
- [ ] 审核说明已填写（如有 AI 生成内容，说明 AI 来源和用途；如功能需登录，提供测试账号说明）
- [ ] 体验版已完成灰度测试，无严重问题（见二十二节）
