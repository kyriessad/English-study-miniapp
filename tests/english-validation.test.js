const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildValidationView,
  makeValidationKey,
  validationResponseFromCardError
} = require('../utils/englishValidation');

test('PASS is silent', () => {
  const view = buildValidationView({
    level: 'pass',
    category: 'word',
    normalizedText: 'because',
    warnings: [],
    errors: [],
    evidence: []
  });
  assert.equal(view.status, 'pass');
  assert.deepEqual(view.visibleIssues, []);
});

test('spelling suggestion is shown without offering an unsafe replacement action', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'word',
    normalizedText: 'becuase',
    warnings: ['拼写可能有误：becuase。你是不是想写 because？'],
    errors: [],
    evidence: [{ source: 'symspell', type: 'spelling', result: 'suggestion', polarity: 'warning' }]
  });
  assert.equal(view.visibleIssues[0].message, '这个词可能拼错了');
  assert.equal(view.visibleIssues[0].detail, '可能想写：because');
  assert.equal(view.visibleIssues[0].actionType, '');
});

test('warnings are prioritized, limited to two, and never expose provider names', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'sentence',
    normalizedText: 'This are okay???',
    warnings: [
      '内容中有连续或混合标点，建议确认是否为有意输入。',
      'Harper grammar: Agreement problem',
      'Harper usage: Unnatural phrase',
      '这段内容看起来更像句子。'
    ],
    evidence: [
      { source: 'harper', type: 'grammar', result: 'lint', polarity: 'warning' },
      { source: 'harper', type: 'usage', result: 'lint', polarity: 'warning' }
    ]
  });
  assert.deepEqual(view.visibleIssues.map((item) => item.type), ['category_mismatch', 'grammar']);
  assert.equal(view.hiddenCount, 2);
  assert.equal(JSON.stringify(view).includes('Harper'), false);
  assert.equal(view.visibleIssues[0].actionCategory, '句子');
});

test('punctuation-only warning is light and can auto-hide', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'sentence',
    normalizedText: 'Really???',
    warnings: ['内容中有连续或混合标点，建议确认是否为有意输入。'],
    evidence: []
  });
  assert.equal(view.visibleIssues[0].severity, 'light');
  assert.equal(view.persistent, false);
});

test('system warnings are shown without exposing provider names', () => {
  const view = buildValidationView({
    level: 'warning',
    category: 'word',
    normalizedText: 'because',
    warnings: ['Harper unavailable'],
    warningTypes: ['SYSTEM_WARNING'],
    evidence: [{ source: 'harper', result: 'unavailable', polarity: 'neutral' }],
    canSave: true,
    canAnalyze: true,
    canPronounce: true
  });
  assert.equal(view.status, 'warning');
  assert.equal(view.visibleIssues[0].type, 'system');
  assert.equal(JSON.stringify(view).includes('Harper'), false);
  assert.equal(view.canSave, true);
  assert.equal(view.canAnalyze, true);
  assert.equal(view.canPronounce, true);
});

test('invalid server reasons become user-facing input guidance', () => {
  const response = validationResponseFromCardError({
    statusCode: 422,
    data: {
      detail: {
        code: 'invalid_english_content',
        normalizedText: '我的',
        errors: ['英文内容请只填写英文，不能包含中文字符。']
      }
    }
  });
  const view = buildValidationView(response);
  assert.equal(view.status, 'invalid');
  assert.equal(view.visibleIssues[0].message, '英文内容里混入了中文，请删除中文后再试');
});

test('a specific INVALID reason suppresses the redundant missing-English reason', () => {
  const view = buildValidationView({
    level: 'error',
    category: 'unknown',
    normalizedText: '12345',
    warnings: [],
    errors: ['内容需要包含英文，不能只填写数字或数值。', '内容需要包含英文。'],
    evidence: []
  });
  assert.deepEqual(view.visibleIssues.map((item) => item.message), [
    '这段内容只有数字，请补充要记录的英文'
  ]);
});

test('validation key changes with raw text or category', () => {
  assert.notEqual(makeValidationKey('because', '单词'), makeValidationKey('because ', '单词'));
  assert.notEqual(makeValidationKey('because', '单词'), makeValidationKey('because', '句子'));
});
