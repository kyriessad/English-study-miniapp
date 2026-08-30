const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildValidationView,
  makeValidationKey,
  validationResponseFromCardError
} = require('../utils/englishValidation');

test('PASS is silent when all capabilities are available', () => {
  const view = buildValidationView({
    level: 'pass',
    category: 'word',
    normalizedText: 'because',
    warnings: [],
    errors: [],
    evidence: [],
    canSave: true,
    canAnalyze: true,
    canPronounce: true
  });
  assert.equal(view.status, 'pass');
  assert.deepEqual(view.visibleIssues, []);
});

test('spelling reason is shown before capability reason', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'word',
    normalizedText: 'becuase',
    warnings: ['拼写可能有误：becuase。你是不是想写 because？'],
    errors: [],
    evidence: [{ source: 'symspell', type: 'spelling', result: 'suggestion', polarity: 'warning' }],
    warningTypes: ['CONTENT_WARNING'],
    canSave: true,
    canAnalyze: false,
    canPronounce: false
  });
  assert.deepEqual(view.visibleIssues.map((item) => item.message), [
    '这个词可能拼错了',
    '这段内容暂不支持 AI 分析和发音'
  ]);
});

test('advisory and system warnings do not disable AI or TTS', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'sentence',
    normalizedText: 'I really like this movie.',
    warnings: ['Harper unavailable', '这段内容更像一句话。'],
    warningTypes: ['ADVISORY_WARNING', 'SYSTEM_WARNING'],
    evidence: [{ source: 'harper', result: 'unavailable', polarity: 'neutral' }],
    canSave: true,
    canAnalyze: true,
    canPronounce: true
  });
  assert.equal(view.canAnalyze, true);
  assert.equal(view.canPronounce, true);
  assert.equal(JSON.stringify(view).includes('Harper'), false);
  assert.equal(JSON.stringify(view).includes('SYSTEM_WARNING'), false);
});

test('unknown but legitimate word can save and explains pronunciation only', () => {
  const view = buildValidationView({
    level: 'pass',
    category: 'word',
    normalizedText: 'doomscroll',
    warnings: [],
    errors: [],
    evidence: [{ source: 'ecdict', type: 'lexical_match', result: 'miss', polarity: 'neutral' }],
    canSave: true,
    canAnalyze: true,
    canPronounce: false
  });
  assert.equal(view.status, 'pass');
  assert.equal(view.canSave, true);
  assert.equal(view.canAnalyze, true);
  assert.equal(view.visibleIssues[0].message, '暂时无法确认这个词的可靠发音');
});

test('invalid server reasons become natural Chinese', () => {
  const response = validationResponseFromCardError({
    statusCode: 422,
    data: {
      detail: {
        code: 'invalid_english_content',
        normalizedText: '/usr/local/bin',
        errors: ['English content contains forbidden control or path characters.']
      }
    }
  });
  const view = buildValidationView(response);
  assert.equal(view.status, 'invalid');
  assert.deepEqual(view.visibleIssues.map((item) => item.message), [
    '内容中有无法识别的字符，请删除后再试'
  ]);
  assert.equal(JSON.stringify(view).includes('English content contains forbidden control or path characters'), false);
  assert.equal(JSON.stringify(view).includes('English backend error'), false);
});

test('path-only reason uses path guidance', () => {
  const view = buildValidationView({
    level: 'error',
    category: 'unknown',
    normalizedText: 'C:\\Users\\Admin\\Desktop',
    warnings: [],
    errors: ['这里像文件路径，请输入想记录的英文'],
    evidence: [],
    canSave: false,
    canAnalyze: false,
    canPronounce: false
  });
  assert.equal(view.visibleIssues[0].message, '这里像文件路径，请输入想记录的英文');
  assert.equal(view.visibleIssues.some((item) => item.message.includes('暂不支持')), false);
});

test('validation key changes with raw text or category', () => {
  assert.notEqual(makeValidationKey('because', '鍗曡瘝'), makeValidationKey('because ', '鍗曡瘝'));
  assert.notEqual(makeValidationKey('because', '鍗曡瘝'), makeValidationKey('because', '鍙ュ瓙'));
});
