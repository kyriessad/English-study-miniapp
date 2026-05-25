/**
 * Add 页英文输入校验 — 100 个本地校验测试用例
 * Phase 8G-add-input-validation-ux-polish（中英混合规则修订）
 *
 * 运行方式：node scripts/test-add-input-validation-cases.js
 * 不依赖微信运行时，只测试纯函数规则。
 *
 * 测试目标函数：getLocalValidationResult, transformSpellingWarning
 * 测试维度：输入 + 类别 → 期望级别 + 期望文案片段 + 是否可保存
 *
 * 规则变更（Phase 8G 修订）：
 *   英文内容字段不再允许任何中文。含中文 → error "英文内容请只填写英文"。
 *   中文检测优先于"完全无英文"检测（纯中文提示"请只填写英文"，纯数字/符号提示"请输入英文内容"）。
 *   不再有"少量中文 warning 可保存"的设计。
 */

'use strict';

const assert = require('assert');

// ─────────────────────────────────────────────
// 从 add.js 提取的纯函数（不依赖微信 API）
// ─────────────────────────────────────────────

function normalizeEnglishText(text) {
  var result = String(text || '');

  // 1. 弯引号 → 直引号
  result = result.replace(/[\u2018\u2019]/g, '\'');
  result = result.replace(/[\u201C\u201D]/g, '"');

  // 2. 各种 dash → 英文连字符
  result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\-]/g, '-');

  // 3. 中文标点 → 英文标点
  result = result.replace(/\uFF0C/g, ',');
  result = result.replace(/\u3002/g, '.');
  result = result.replace(/\uFF01/g, '!');
  result = result.replace(/\uFF1F/g, '?');
  result = result.replace(/\uFF1B/g, ';');
  result = result.replace(/\uFF1A/g, ':');

  // 4. 特殊空白 → 普通空格
  result = result.replace(/\u00A0/g, ' ');
  result = result.replace(/\u3000/g, ' ');
  result = result.replace(/[\t\n\r]+/g, ' ');

  // 5. 合并连续空白
  result = result.replace(/\s{2,}/g, ' ');

  // 5b. 修复分裂缩写中间空格（he ' s → he 's）
  result = result.replace(/'\s+(s|m|t|ve|ll|re|d)\b/gi, '\'$1');

  // 6. 修复分裂缩写 / 所有格（he 's → he's）
  result = result.replace(/\s+'(s|m|t|ve|ll|re|d)\b/gi, '\'$1');

  // 7. 删除标点前多余空格
  result = result.replace(/\s+([,.!?;:])/g, '$1');

  // 8. 清理括号内侧多余空格
  result = result.replace(/\(\s+/g, '(');
  result = result.replace(/\s+\)/g, ')');
  result = result.replace(/\[\s+/g, '[');
  result = result.replace(/\s+\]/g, ']');

  // 9. 再次合并连续空白
  result = result.replace(/\s{2,}/g, ' ');

  // 10. 去除前后空格
  result = result.trim();

  return result;
}
function getLatinLetterPattern() {
  return 'A-Za-zÀ-ÖØ-öø-ÿ';
}

function hasLatinLetter(text) {
  return new RegExp('[' + getLatinLetterPattern() + ']').test(String(text || ''));
}

function getNormalizedWordList(text) {
  var latinPattern = getLatinLetterPattern();
  return normalizeEnglishText(text)
    .split(/[\s,.!?;:]+/)
    .map(function(word) {
      var trimRegex = new RegExp('^[^' + latinPattern + ']+|[^' + latinPattern + ']+$', 'g');
      return word.replace(trimRegex, '');
    })
    .filter(Boolean);
}

// 统计汉字数量（CJK 表意文字，不含全角标点）
function hasChineseChar(text) {
  return /[一-鿿㐀-䶿豈-﫿]/.test(String(text || ''));
}

// 阈值常量
var MAX_ENGLISH_CHARS = 500;

function getLocalValidationResult(text, category) {
  var normalizedText = normalizeEnglishText(text);
  var errors = [];
  var warnings = [];
  var info = [];

  if (!normalizedText) {
    errors.push('英文内容为空');
    return { normalizedText: normalizedText, errors: errors, warnings: warnings, info: info, words: [] };
  }

  if (normalizedText.length > MAX_ENGLISH_CHARS) {
    errors.push('内容较长，建议拆分后再保存');
    return { normalizedText: normalizedText, errors: errors, warnings: warnings, info: info, words: [] };
  }

  var chineseCount = hasChineseChar(normalizedText);
  var hasEnglish = hasLatinLetter(normalizedText);

  if (chineseCount) {
    errors.push('英文内容请只填写英文');
    return { normalizedText: normalizedText, errors: errors, warnings: warnings, info: info, words: [] };
  }

  if (!hasEnglish) {
    errors.push('请输入英文内容');
    return { normalizedText: normalizedText, errors: errors, warnings: warnings, info: info, words: [] };
  }

  var words = getNormalizedWordList(normalizedText);

  if (category === '单词' && words.length !== 1) {
    errors.push('单词类别请只填一个词');
  }

  if (category === '短语' && words.length < 2) {
    errors.push('短语类别至少需要两个词');
  }

  return {
    normalizedText: normalizedText,
    errors: errors,
    warnings: warnings,
    info: info,
    words: words
  };
}

// 拼写提示变换
var SPELL_WITH_CORRECTION_RE = /^拼写疑似有误：(.+?)。你是不是想写\s*"(.+?)"/;
var SPELL_NO_CORRECTION_RE = /^拼写疑似有误：/;

function transformSpellingWarning(w) {
  var m = SPELL_WITH_CORRECTION_RE.exec(w);
  if (m) {
    return { text: '也可能是：' + m[2] + '。确认原词没问题的话，可以继续保存', isHint: true };
  }
  if (SPELL_NO_CORRECTION_RE.test(w)) {
    return null;
  }
  return { text: w, isHint: false };
}

// ─────────────────────────────────────────────
// 辅助：运行单个测试
// ─────────────────────────────────────────────

var passed = 0;
var failed = 0;
var failDetails = [];

function runCase(id, input, category, expectLevel, expectMsgIncludes, expectCanSave, note) {
  var result = getLocalValidationResult(input, category);
  var level;
  if (result.errors.length > 0) {
    level = 'error';
  } else if (result.warnings.length > 0) {
    level = 'warning';
  } else {
    level = 'success';
  }
  var canSave = result.errors.length === 0;
  var msg = result.errors.length > 0
    ? result.errors[0]
    : (result.warnings.length > 0 ? result.warnings[0] : '');

  var ok = true;
  var failures = [];

  if (level !== expectLevel) {
    ok = false;
    failures.push('level: got "' + level + '", want "' + expectLevel + '"');
  }
  if (canSave !== expectCanSave) {
    ok = false;
    failures.push('canSave: got ' + canSave + ', want ' + expectCanSave);
  }
  if (expectMsgIncludes && !msg.includes(expectMsgIncludes)) {
    ok = false;
    failures.push('message: got "' + msg + '", want includes "' + expectMsgIncludes + '"');
  }

  if (ok) {
    passed++;
  } else {
    failed++;
    failDetails.push('FAIL #' + id + ' [' + note + ']: ' + failures.join('; '));
  }
}

// ─────────────────────────────────────────────
// 100 个测试用例
// ─────────────────────────────────────────────

// ── A. 空 / 无效输入（1-10）──────────────────────────────────────────────
// 这类输入要么为空，要么完全没有英文字母，全部应该报 error 并阻止保存

runCase(1,  '',         '单词', 'error', '英文内容为空',    false, 'A1: 空字符串');
runCase(2,  '   ',      '单词', 'error', '英文内容为空',    false, 'A2: 纯空格');
runCase(3,  '你好',     '单词', 'error', '英文内容请只填写英文',  false, 'A3: 纯中文');
runCase(4,  '2024',     '单词', 'error', '请输入英文内容',  false, 'A4: 纯数字');
runCase(5,  '100-200',  '单词', 'error', '请输入英文内容',  false, 'A5: 数字范围');
runCase(6,  '!!!',      '单词', 'error', '请输入英文内容',  false, 'A6: 纯符号 !!!');
runCase(7,  '###',      '单词', 'error', '请输入英文内容',  false, 'A7: 纯符号 ###');
runCase(8,  '-50',      '单词', 'error', '请输入英文内容',  false, 'A8: 负数');
runCase(9,  '+50%',     '单词', 'error', '请输入英文内容',  false, 'A9: 百分号');
// #N/A 含字母 N/A，通过 hasLatinLetter，本地校验 success（后端会返回 error）
runCase(10, '#N/A',     '单词', 'success', '',              true,  'A10: #N/A 本地通过（后端另处理）');

// ── B. 正常英文单词（11-20）──────────────────────────────────────────────
// 纯英文单词，category=单词，均应 success

runCase(11, 'hello',    '单词', 'success', '', true, 'B11: hello');
runCase(12, 'clutch',   '单词', 'success', '', true, 'B12: clutch');
runCase(13, 'crave',    '单词', 'success', '', true, 'B13: crave');
runCase(14, 'esoteric', '单词', 'success', '', true, 'B14: esoteric');
runCase(15, 'plethora', '单词', 'success', '', true, 'B15: plethora');
runCase(16, 'go',       '单词', 'success', '', true, 'B16: go');
runCase(17, 'be',       '单词', 'success', '', true, 'B17: be');
runCase(18, 'in',       '单词', 'success', '', true, 'B18: in');
runCase(19, 'art',      '单词', 'success', '', true, 'B19: art');
runCase(20, 'he',       '单词', 'success', '', true, 'B20: he');

// ── C. 短语（21-30）──────────────────────────────────────────────────────
// 短语 category=短语，词数 >=2，均应 success

runCase(21, 'break a leg',     '短语', 'success', '', true, 'C21: break a leg');
runCase(22, 'pick up',         '短语', 'success', '', true, 'C22: pick up');
runCase(23, 'give up',         '短语', 'success', '', true, 'C23: give up');
runCase(24, 'double team',     '短语', 'success', '', true, 'C24: double team');
runCase(25, 'good morning',    '短语', 'success', '', true, 'C25: good morning');
runCase(26, 'very good',       '短语', 'success', '', true, 'C26: very good');
runCase(27, 'make sense',      '短语', 'success', '', true, 'C27: make sense');
runCase(28, 'in terms of',     '短语', 'success', '', true, 'C28: in terms of');
runCase(29, 'look forward to', '短语', 'success', '', true, 'C29: look forward to');
runCase(30, 'commit guilty',   '短语', 'success', '', true, 'C30: commit guilty');

// ── D. 句子 / 段落（31-40）───────────────────────────────────────────────
// 使用 category=句子，无词数限制

runCase(31, 'I love English.',      '句子', 'success', '', true, 'D31: 句子带句号');
runCase(32, 'I love English!',      '句子', 'success', '', true, 'D32: 句子带感叹号');
runCase(33, 'I love English?',      '句子', 'success', '', true, 'D33: 句子带问号');
runCase(34, 'I love English. It is useful.', '句子', 'success', '', true, 'D34: 两句话');
// D35: 100-170 字符英文
runCase(35, 'The quick brown fox jumps over the lazy dog. This famous sentence contains every letter of the alphabet.', '句子', 'success', '', true, 'D35: 100-170 字符英文');
// D36: 180-500 字符英文（本地不拦截，后端可能 warning）
var str180 = 'Learning English is a journey that requires patience and dedication. Every day brings new words and expressions to explore. Reading books and watching movies help improve comprehension significantly.';
runCase(36, str180, '句子', 'success', '', true, 'D36: 180-500 字符英文，本地 success');
// D37: 超过 500 字符，本地 error
var str501 = 'The quick brown fox jumps over the lazy dog. '.repeat(12); // 45*12=540 chars
runCase(37, str501, '句子', 'error', '内容较长', false, 'D37: 超 500 字符');
// D38: 带换行英文
runCase(38, 'hello\nworld',       '短语', 'success', '', true, 'D38: 带换行');
// D39: 带制表符英文
runCase(39, 'hello\tworld',       '短语', 'success', '', true, 'D39: 带制表符');
// D40: 多句英文
runCase(40, 'I think therefore I am. This is a classic philosophical statement.', '句子', 'success', '', true, 'D40: 多句英文');

// ── E. 连字符词（41-50）──────────────────────────────────────────────────
// 连字符词被视为 1 个词，category=单词

runCase(41, 'well-known',        '单词', 'success', '', true, 'E41: well-known');
runCase(42, 'full-time',         '单词', 'success', '', true, 'E42: full-time');
runCase(43, 'follow-up',         '单词', 'success', '', true, 'E43: follow-up');
runCase(44, 'e-mail',            '单词', 'success', '', true, 'E44: e-mail');
runCase(45, 'co-worker',         '单词', 'success', '', true, 'E45: co-worker');
runCase(46, 'part-time',         '单词', 'success', '', true, 'E46: part-time');
runCase(47, 'state-of-the-art',  '单词', 'success', '', true, 'E47: state-of-the-art');
runCase(48, 'mother-in-law',     '单词', 'success', '', true, 'E48: mother-in-law');
runCase(49, 'long-term',         '单词', 'success', '', true, 'E49: long-term');
runCase(50, 'user-friendly',     '单词', 'success', '', true, 'E50: user-friendly');

// ── F. 字母数字词（51-60）────────────────────────────────────────────────
// 有英文字母即通过，category=单词

runCase(51, 'COVID-19', '单词', 'success', '', true, 'F51: COVID-19');
runCase(52, 'GPT-4',    '单词', 'success', '', true, 'F52: GPT-4');
runCase(53, '5G',       '单词', 'success', '', true, 'F53: 5G');
runCase(54, 'B2B',      '单词', 'success', '', true, 'F54: B2B');
runCase(55, 'Web3',     '单词', 'success', '', true, 'F55: Web3');
runCase(56, 'iPhone15', '单词', 'success', '', true, 'F56: iPhone15');
runCase(57, 'C2C',      '单词', 'success', '', true, 'F57: C2C');
runCase(58, 'HSK6',     '单词', 'success', '', true, 'F58: HSK6');
runCase(59, 'NBA2K',    '单词', 'success', '', true, 'F59: NBA2K');
runCase(60, '4K',       '单词', 'success', '', true, 'F60: 4K');

// ── G. 缩写（61-70）──────────────────────────────────────────────────────
// 含句点缩写，前端检测时句点是词语分隔符，分割后可能 >1 词。
// U.S./e.g. 等用 category=句子（前端自动检测为句子，无词数限制）。
// vs. → 分割后 1 词，category=单词 可用。

runCase(61, 'U.S.',  '句子', 'success', '', true, 'G61: U.S. (句子类别，无词数限)');
runCase(62, 'e.g.',  '句子', 'success', '', true, 'G62: e.g.');
runCase(63, 'i.e.',  '句子', 'success', '', true, 'G63: i.e.');
runCase(64, 'Dr.',   '句子', 'success', '', true, 'G64: Dr.');
runCase(65, 'Mr.',   '句子', 'success', '', true, 'G65: Mr.');
runCase(66, 'Ph.D.', '句子', 'success', '', true, 'G66: Ph.D.');
runCase(67, 'U.K.',  '句子', 'success', '', true, 'G67: U.K.');
runCase(68, 'a.m.',  '句子', 'success', '', true, 'G68: a.m.');
runCase(69, 'p.m.',  '句子', 'success', '', true, 'G69: p.m.');
// vs. → split by '.' → ['vs', ''] → filter → ['vs'] → 1 词，category=单词 ✓
runCase(70, 'vs.',   '单词', 'success', '', true, 'G70: vs. (单词类别，1词)');

// ── H. 中英混合：含中文即 error（71-80）─────────────────────────
// 英文内容字段不再允许任何中文，全部 error 阻止保存

runCase(71, 'NBA clutch 时刻',         '短语', 'error', '英文内容请只填写英文', false, 'H71: NBA clutch 时刻 (含中文)');
runCase(72, 'ChatGPT prompt 示例',     '短语', 'error', '英文内容请只填写英文', false, 'H72: ChatGPT prompt 示例 (含中文)');
runCase(73, 'iPhone camera 设置',      '短语', 'error', '英文内容请只填写英文', false, 'H73: iPhone camera 设置 (含中文)');
runCase(74, 'break a leg 这个表达',    '短语', 'error', '英文内容请只填写英文', false, 'H74: break a leg 这个表达 (含中文)');
runCase(75, 'double team 防守',        '短语', 'error', '英文内容请只填写英文', false, 'H75: double team 防守 (含中文)');
runCase(76, 'YouTube 评论区',          '短语', 'error', '英文内容请只填写英文', false, 'H76: YouTube 评论区 (含中文)');
runCase(77, 'full-time 工作',          '单词', 'error', '英文内容请只填写英文', false, 'H77: full-time 工作 (含中文)');
runCase(78, 'GPT-4 回答',             '单词', 'error', '英文内容请只填写英文', false, 'H78: GPT-4 回答 (含中文)');
runCase(79, '5G 网络',                '单词', 'error', '英文内容请只填写英文', false, 'H79: 5G 网络 (含中文)');
runCase(80, 'pick up 电话',           '短语', 'error', '英文内容请只填写英文', false, 'H80: pick up 电话 (含中文)');

// ── I. 中英混合：较多中文，error 阻止（81-90）────────────────────────────
// 所有含中文的输入 → error "英文内容请只填写英文"

runCase(81, '我今天看到一个词 hello',             '短语', 'error', '英文内容请只填写英文', false, 'I81: 含中文');
runCase(82, '这个表达 break a leg 很常见',         '短语', 'error', '英文内容请只填写英文', false, 'I82: 含中文');
runCase(83, '我想记录 clutch 这个词',              '短语', 'error', '英文内容请只填写英文', false, 'I83: 含中文');
runCase(84, '这是 NBA 解说里看到的 double team',   '短语', 'error', '英文内容请只填写英文', false, 'I84: 含中文');
runCase(85, 'hello 你好你好你好你好',              '短语', 'error', '英文内容请只填写英文', false, 'I85: 含中文');
runCase(86, 'GPT-4 是一个模型，我想记录一下',     '短语', 'error', '英文内容请只填写英文', false, 'I86: 含中文');
runCase(87, 'iPhone 的 camera setting 怎么说',    '短语', 'error', '英文内容请只填写英文', false, 'I87: 含中文');
runCase(88, '这个 phrase pick up 是什么意思',     '短语', 'error', '英文内容请只填写英文', false, 'I88: 含中文');
runCase(89, '我在 YouTube 评论区看到 amazing',    '短语', 'error', '英文内容请只填写英文', false, 'I89: 含中文');
runCase(90, '今天学到一个词 esoteric',            '短语', 'error', '英文内容请只填写英文', false, 'I90: 含中文');

// ── J. 标点 / emoji / 边界（91-100）──────────────────────────────────────
// 含英文字母，无中文汉字，本地校验均应 success（后端可能有连续标点 warning）

runCase(91, 'hello!',        '单词', 'success', '', true, 'J91: hello!');
runCase(92, 'hello?',        '单词', 'success', '', true, 'J92: hello?');
runCase(93, 'hello.',        '单词', 'success', '', true, 'J93: hello. (句点去掉后1词)');
runCase(94, 'hello???',      '单词', 'success', '', true, 'J94: hello???');
runCase(95, 'really?!',      '单词', 'success', '', true, 'J95: really?!');
runCase(96, 'good job 👍', '短语', 'success', '', true, 'J96: good job 👍');
runCase(97, 'break a leg 🎭', '短语', 'success', '', true, 'J97: break a leg 🎭');
// hello，：中文全角逗号不在 CJK 表意字符范围（U+FF0C），countChineseChars=0
runCase(98, 'hello，',   '单词', 'success', '', true, 'J98: hello，(中文逗号，无汉字)');
// hello。：句号 U+3002 不在表意字符范围
runCase(99, 'hello。',   '单词', 'success', '', true, 'J99: hello。(中文句号，无汉字)');
// hello ！：全角感叹号 U+FF01 不在表意字符范围
runCase(100, 'hello ！',  '单词', 'success', '', true, 'J100: hello ！(全角感叹号，无汉字)');

// ─────────────────────────────────────────────
// 附加：transformSpellingWarning 专项测试
// ─────────────────────────────────────────────

function runSpellCase(id, input, expectNull, expectIsHint, expectTextIncludes, note) {
  var result = transformSpellingWarning(input);
  var ok = true;
  var failures = [];

  if (expectNull) {
    if (result !== null) {
      ok = false;
      failures.push('expected null, got ' + JSON.stringify(result));
    }
  } else {
    if (!result) {
      ok = false;
      failures.push('expected non-null result');
    } else {
      if (result.isHint !== expectIsHint) {
        ok = false;
        failures.push('isHint: got ' + result.isHint + ', want ' + expectIsHint);
      }
      if (expectTextIncludes && !result.text.includes(expectTextIncludes)) {
        ok = false;
        failures.push('text: "' + result.text + '" does not include "' + expectTextIncludes + '"');
      }
    }
  }

  if (ok) {
    passed++;
  } else {
    failed++;
    failDetails.push('FAIL spell#' + id + ' [' + note + ']: ' + failures.join('; '));
  }
}

// 有 correction → hint
runSpellCase('S1', '拼写疑似有误：clutch。你是不是想写 "crutch"？', false, true, '也可能是：crutch', 'S1: 有correction→hint');
// 无 correction → null（隐藏）
runSpellCase('S2', '拼写疑似有误：esoteric。如果这是人名、地名、品牌名或专有名词，可以继续保存。', true, false, '', 'S2: 无correction→隐藏');
// 普通 warning（非拼写）→ 透传
runSpellCase('S3', '内容包含中文，建议确认卡片英文内容是否需要拆分。', false, false, '内容包含中文', 'S3: 普通warning透传');
// hint 文案中包含 correction
runSpellCase('S4', '拼写疑似有误：helo。你是不是想写 "hello"？', false, true, '也可能是：hello。确认原词没问题的话，可以继续保存', 'S4: correction文案格式验证');

// ─────────────────────────────────────────────
// 额外边界测试：类别-词数规则
// ─────────────────────────────────────────────

// 单词类别，多词 → error
runCase('E1', 'hello world', '单词', 'error', '单词类别请只填一个词', false, 'Extra: 单词类别输入两词');
// 短语类别，单词 → error
runCase('E2', 'hello', '短语', 'error', '短语类别至少需要两个词', false, 'Extra: 短语类别只有一词');
// 500 字符边界（正好 500）→ success
var str500 = 'a'.repeat(500);
runCase('E3', str500, '句子', 'success', '', true, 'Extra: 正好500字符 success');
// 501 字符 → error
var str501b = 'a'.repeat(501);
runCase('E4', str501b, '句子', 'error', '内容较长', false, 'Extra: 501字符 error');
// 单词类别 + 连字符词（1词）→ success
runCase('E5', 'well-known', '单词', 'success', '', true, 'Extra: well-known 单词类别 1词');

// ─────────────────────────────────────────────
// Phase 8H 新增：英文内容规范化测试
// ─────────────────────────────────────────────

var normalizationPassed = 0;
var normalizationFailed = 0;
var normalizationFailDetails = [];

function runNormalizeCase(id, input, expected, note) {
  var result = normalizeEnglishText(input);
  var ok = result === expected;

  if (ok) {
    normalizationPassed++;
  } else {
    normalizationFailed++;
    normalizationFailDetails.push(
      'FAIL norm#' + id + ' [' + note + ']: got "' + result + '", want "' + expected + '"'
    );
  }
}

// ── A. 空白规范化 ──────────────────────────────────────────────────

runNormalizeCase('N1',  ' hello ',              'hello',             'A1: 前后空格');
runNormalizeCase('N2',  'good   morning',       'good morning',      'A2: 多空格合并');
runNormalizeCase('N3',  'hello\nworld',         'hello world',       'A3: 换行→空格');
runNormalizeCase('N4',  'hello\tworld',         'hello world',       'A4: tab→空格');
runNormalizeCase('N5',  'hello\r\nworld',       'hello world',       'A5: CRLF→空格');
runNormalizeCase('N6',  'hello world',     'hello world',       'A6: NBSP→空格');

// ── B. 缩写 / 所有格 ──────────────────────────────────────────────

runNormalizeCase('N7',  "he 's",               "he's",              'B7: he \'s → he\'s');
runNormalizeCase('N8',  "he ' s",              "he's",              'B8: he \' s → he\'s');
runNormalizeCase('N9',  "I 'm",                "I'm",               'B9: I \'m → I\'m');
runNormalizeCase('N10', "don 't",              "don't",             'B10: don \'t → don\'t');
runNormalizeCase('N11', "John 's book",        "John's book",       'B11: John \'s book → John\'s book');
runNormalizeCase('N12', "they 've",            "they've",           'B12: they \'ve → they\'ve');
runNormalizeCase('N13', "we 'll",              "we'll",             'B13: we \'ll → we\'ll');

// ── C. 引号 / dash ────────────────────────────────────────────────

runNormalizeCase('N14', 'I’m happy',       "I'm happy",         'C14: 弯单引号→直');
runNormalizeCase('N15', '“hello”',    '"hello"',           'C15: 弯双引号→直');
runNormalizeCase('N16', 'long—term',       'long-term',         'C16: em dash→hyphen');
runNormalizeCase('N17', 'well–known',      'well-known',        'C17: en dash→hyphen');

// ── D. 标点前空格 ─────────────────────────────────────────────────

runNormalizeCase('N18', 'hello , world',        'hello, world',      'D18: 逗号前空格删除');
runNormalizeCase('N19', 'hello .',              'hello.',            'D19: 句号前空格删除');
runNormalizeCase('N20', 'hello ?',              'hello?',            'D20: 问号前空格删除');

// ── E. 中文标点 ───────────────────────────────────────────────────

runNormalizeCase('N21', 'hello，world',     'hello,world',       'E21: 中文逗号→英文逗号');
runNormalizeCase('N22', 'hello。',          'hello.',            'E22: 中文句号→英文句号');
runNormalizeCase('N23', 'hello！',           'hello!',            'E23: 中文感叹号→英文');
runNormalizeCase('N24', 'hello？',           'hello?',            'E24: 中文问号→英文');
runNormalizeCase('N25', 'hello；world',     'hello;world',       'E25: 中文分号→英文');
runNormalizeCase('N26', 'hello：world',     'hello:world',       'E26: 中文冒号→英文');

// ── F. 括号空格 ───────────────────────────────────────────────────

runNormalizeCase('N27', '( hello )',            '(hello)',           'F27: 圆括号内侧空格');
runNormalizeCase('N28', '[ hello ]',            '[hello]',           'F28: 方括号内侧空格');

// ── G. 不应自动改写 ──────────────────────────────────────────────

runNormalizeCase('N29', 'HELLO',            'HELLO',            'G29: 大写保留');
runNormalizeCase('N30', 'i am happy',       'i am happy',       'G30: 小写保留');
runNormalizeCase('N31', 'cluch',            'cluch',            'G31: 拼写不纠错');
runNormalizeCase('N32', 'good job 👍', 'good job 👍', 'G32: emoji保留');
runNormalizeCase('N33', 'hello!!!',         'hello!!!',         'G33: 多余标点保留');
runNormalizeCase('N34', 'e-mail',           'e-mail',           'G34: 连字符保留');
runNormalizeCase('N35', 'email',            'email',            'G35: 正常词不变');
runNormalizeCase('N36', 'GPT-4',            'GPT-4',            'G36: GPT-4保留');
runNormalizeCase('N37', '5G',               '5G',               'G37: 5G保留');
runNormalizeCase('N38', 'C++',              'C++',              'G38: C++保留');
runNormalizeCase('N39', 'A/B testing',      'A/B testing',      'G39: A/B保留');

// ── H. Phase 8G error 规则仍然有效 ────────────────────────────────

runCase('N40', 'hello 你好', '单词', 'error', '英文内容请只填写英文', false, 'N40: 含中文 error');
runCase('N41', '你好',       '单词', 'error', '英文内容请只填写英文', false, 'N41: 纯中文 error');
runCase('N42', '2024',               '单词', 'error', '请输入英文内容',       false, 'N42: 纯数字 error');
runCase('N43', '!!!',                '单词', 'error', '请输入英文内容',       false, 'N43: 纯符号 error');
var str501 = 'a'.repeat(501);
runCase('N44', str501,               '句子', 'error', '内容较长',             false, 'N44: 501字符 error');

// ── I. 保存时机一致性 ────────────────────────────────────────────

// 验证同一个输入经 normalizeEnglishText 后已得到稳定的 content
// 不需要后端 normalizedText 就能确定保存结果
runNormalizeCase('N45', "he 's",     "he's",        'I45: 输入he \'s → 稳定he\'s');
runNormalizeCase('N46', "he ' s",    "he's",        'I46: 输入he \' s → 稳定he\'s');
runNormalizeCase('N47', "good   morning", "good morning", 'I47: 多空格 → 稳定单空格');
runNormalizeCase('N48', "hello\nworld",   "hello world",  'I48: 换行 → 稳定空格');
runNormalizeCase('N49', "hello，world", "hello,world", 'I49: 中文逗号 → 稳定');
runNormalizeCase('N50', "HELLO",         "HELLO",       'I50: 大写稳定不变');

// 合并归一化测试结果
passed += normalizationPassed;
failed += normalizationFailed;
failDetails = failDetails.concat(normalizationFailDetails);

// ─────────────────────────────────────────────
// 输出结果
// ─────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Add 页英文输入本地校验测试结果');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (failDetails.length > 0) {
  console.log('\n失败用例：');
  failDetails.forEach(function(d) { console.log('  ' + d); });
}

var totalOriginalTests = 109;  // Phase 8G
var newRunCaseTests = 5;       // N40-N44 (Phase 8G error rules, use runCase)
var newNormalizeTests = normalizationPassed + normalizationFailed;
var totalNewTests = newRunCaseTests + newNormalizeTests;
console.log('\n原有测试数：' + totalOriginalTests);
console.log('新增测试数：' + totalNewTests + ' (含 ' + newRunCaseTests + ' 个 error 规则 + ' + newNormalizeTests + ' 个规范化)');
console.log('总测试数：' + (totalOriginalTests + totalNewTests));
console.log('通过：' + passed + '，失败：' + failed);

if (failed > 0) {
  console.log('❌ 有失败用例，请修复后再提交。');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}
