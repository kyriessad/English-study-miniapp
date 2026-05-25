# 添加页英文输入检测规则 — 产品可读版

> 最后更新：Phase 8G-add-input-validation-ux-polish 修订版（2026-05-25）
> 上一版本：Phase 8F-readonly（只读审查，2026-05-25）
> 依据文件：pages/add/add.js、pages/add/add.wxml、utils/apiClient.js
> 变更摘要：本阶段重写前端本地校验规则，统一文案，降级拼写提示，清理技术性文案。**修订：英文内容字段不再允许任何中文，含中文即 error。**

---

## 一、一句话结论

**英文内容字段只允许英文内容。含中文即 error 阻止保存。**

- **前端本地校验**（6 条规则）负责拦截保存：全部显示红色 error 并阻止保存。
- **后端异步分析**完全 fire-and-forget：其返回的 error 在 UI 上降级为 warning 展示，不阻止保存。
- 不再有"少量中文 warning 可保存"的设计。
- **拼写提示**（pyspellchecker）：有建议词时降级为 hint；无建议词时静默隐藏。
- AI 例句和参考理解均属于"增强分析"，失败时静默处理，不影响卡片保存。
- 中文解释、备注、场景请写到"我的理解 / 补充备注 / 这次是在哪里看到的"等字段。

---

## 二、前端本地校验规则（全部 6 条，均为 error，均阻止保存）

| 规则 | 触发条件 | 用户看到的文案 | 阻止保存 |
|---|---|---|---|
| 空内容 | 英文输入框为空，或纯空格 trim 后为空 | `英文内容为空` | **是** |
| 包含中文 | 含任何 CJK 表意文字（无论数量） | `英文内容请只填写英文` | **是** |
| 完全无英文且无中文 | 不含拉丁字母（纯数字 / 纯符号） | `请输入英文内容` | **是** |
| 超长 | 内容 > 500 字符 | `内容太长了，建议拆成几张卡片再保存` | **是** |
| 单词类别多词 | category=单词，但词数 ≠ 1 | `单词类别请只填一个词` | **是** |
| 短语类别单词 | category=短语，但词数 < 2 | `短语类别至少需要两个词` | **是** |

### 阈值常量

```javascript
MAX_ENGLISH_CHARS = 500  // 字符数 > 500 → error
```

### 检测顺序

1. 空内容 → error "英文内容为空"
2. 超过 500 字符 → error "内容太长了"
3. 包含中文（`hasChineseChar`，CJK 表意文字）→ error "英文内容请只填写英文"
4. 完全无英文（`hasLatinLetter`）→ error "请输入英文内容"
5. 类别=单词 且 词数 ≠ 1 → error
6. 类别=短语 且 词数 < 2 → error

### 注意：中文检测优先于"无英文"判断

纯中文（如"你好"）→ "英文内容请只填写英文"；纯数字/纯符号（如"2024"、"!!!"）→ "请输入英文内容"。

---

## 三、后端异步分析展示规则

后端分析 fire-and-forget，**不阻止保存**。

| 后端返回 | 原级别 | UI 展示级别 | 说明 |
|---|---|---|---|
| errors（如超长 / 纯符号） | error | **降级为 warning** | 不阻止保存，因为前端已先行拦截大多数情况 |
| warnings（如中英混合 / 较长内容） | warning | warning | 不阻止保存 |
| 拼写提示（有 correction） | warning | **hint** | 降级展示，文案更轻 |
| 拼写提示（无 correction） | warning | **隐藏** | 不展示，不干扰用户 |
| ok=false（网络失败） | — | hint | "网络暂时不稳，可以先保存" |

### 核心原则

**红色 error = 不能保存。**  
只有前端本地 error 才显示红色、阻止保存。后端 error 在展示层降级为 warning。

---

## 四、拼写提示降级规则

| 后端原始文案 | 处理方式 | 用户看到的内容 | 对参考区的影响 |
|---|---|---|---|
| `拼写疑似有误：{token}。你是不是想写 "{correction}"？` | 转为 hint | `也可能是：{correction}。确认原词没问题的话，可以继续保存` | **不隐藏**参考区 |
| `拼写疑似有误：{token}。如果这是人名、地名、品牌名或专有名词，可以继续保存。` | 隐藏 | 无任何提示 | 参考区正常显示 |

**拼写 hint 不隐藏参考理解。** `shouldSkipMachineSuggestionForUnknownSingleWord` 只在后端返回"词典未收录"类警告时触发，拼写提示不触发该逻辑。

---

## 五、网络 / 分析失败文案统一

| 场景 | 旧文案 | 新文案 |
|---|---|---|
| wx.cloud 不存在 + 直连失败 | `网络不可用，暂未完成增强分析。` | `网络暂时不稳，可以先保存` |
| 云函数失败 | `请检查网络，可先保存。` | `网络暂时不稳，可以先保存` |
| 所有云端路径失败 | `暂未发现明显问题，请检查您的网络，可先保存。` | `网络暂时不稳，可以先保存` |
| 保存成功 toast（新增） | — | `已保存` |
| 保存成功 toast（编辑） | — | `已更新` |

---

## 六、analysisWarnings 字段处理

`analysisWarnings` 在首页 `index.js` 的 `getAnalysisProblems` 函数中有读取，但该函数从未被调用（Phase 6G 决策：首页不展示技术分析状态）。

**Phase 8G 决策：** 停止向 `analysisWarnings` 写入用户可见文案。
- 后台分析失败（`analysisStatus='failed'`）时：`analysisWarnings: []`
- 状态由 `analysisStatus='failed'` 足以表达，不需要冗余的用户文案字段

---

## 七、保存行为总结

| 情况 | 能否保存 | 提示 |
|---|---|---|
| 英文内容为空 / 纯空格 | **否** | error "英文内容为空" |
| 包含任何中文汉字 | **否** | error "英文内容请只填写英文" |
| 完全无英文字母（纯数字/纯符号） | **否** | error "请输入英文内容" |
| 内容 > 500 字符 | **否** | error "内容太长了，建议拆成几张卡片再保存" |
| 单词类别 + 多词 | **否** | error "单词类别请只填一个词" |
| 短语类别 + 单词 | **否** | error "短语类别至少需要两个词" |
| 后端返回任何 error/warning | **是** | 降级展示，不阻止保存 |
| 网络失败 | **是** | hint "网络暂时不稳，可以先保存" |
| 保存成功（新增） | — | toast "已保存" |
| 保存成功（编辑） | — | toast "已更新" |

---

## 八、100 个测试用例

**测试文件：** `scripts/test-add-input-validation-cases.js`  
**运行方式：** `node scripts/test-add-input-validation-cases.js`  
**总用例数：** 109（100 主用例 + 4 拼写 hint 转换 + 5 边界补充）

### 覆盖类别

| 类别 | 用例编号 | 说明 |
|---|---|---|
| A. 空/无效输入 | 1-10 | 空字符串、纯空格、纯中文、纯数字、纯符号、#N/A |
| B. 正常英文单词 | 11-20 | hello/clutch/go/be/in 等 |
| C. 短语 | 21-30 | break a leg/pick up/commit guilty 等 |
| D. 句子/段落 | 31-40 | 带标点句子、100-170字符、180-500字符、>500字符 |
| E. 连字符词 | 41-50 | well-known/full-time/state-of-the-art 等 |
| F. 字母数字词 | 51-60 | COVID-19/GPT-4/5G/B2B/iPhone15 等 |
| G. 缩写 | 61-70 | U.S./e.g./Dr./vs. 等 |
| H. 中英混合 | 71-80 | 含中文 → error "英文内容请只填写英文" |
| I. 中英混合（较多中文）| 81-90 | 含中文 → error "英文内容请只填写英文" |
| J. 标点/emoji/边界 | 91-100 | hello!/👍/中文标点/全角符号 |

---

## 九、未改内容

- 后端 `validator.py` / `analyzer.py` 的校验和分析逻辑不变
- 后端数据库 schema 不变
- review_state / ReviewSession / 4档反馈逻辑不变
- `Hunyuan → TMT → None` 例句生成链路不变
- `today_review_status` 页面不变
- 后端异步 error 降级为 warning（不显示红色、不阻止保存）不变
- 拼写提示降级逻辑（有 correction → hint；无 correction → 隐藏）不变
- 网络失败文案统一为"网络暂时不稳，可以先保存"不变
- `analysisWarnings` 不再写入用户可见文案不变
- 保存成功 toast `已保存` / `已更新` 不变
- 保存仍 fire-and-forget，不等待后端分析完成不变
- `shouldSkipMachineSuggestionForUnknownSingleWord` 逻辑不变

---

## 附录：关键函数位置速查（Phase 8G 修订版）

| 函数 / 常量 | 文件 | 说明 |
|---|---|---|
| `MAX_ENGLISH_CHARS` | add.js | 最大字符数（500） |
| `hasChineseChar` | add.js | 检查是否包含 CJK 表意文字 |
| `transformSpellingWarning` | add.js | 拼写提示转换（有correction→hint；无→null） |
| `getLocalValidationResult` | add.js | 前端本地校验（6 条规则，全部 error） |
| `buildDisplayState` | add.js | 决定展示哪种级别提示（含降级逻辑） |
| `analyzeEnglishInput` | add.js | 整合本地 + 后端分析，拼写 hint 在此分离 |
| `runBackgroundEnglishCheck` | add.js | 保存后后台分析（analysisWarnings 已清空用户文案） |
