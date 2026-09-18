const test = require('node:test');
const assert = require('node:assert/strict');
const {
  englishSizeClass,
  extraExplanation,
  sourceLabel
} = require('../utils/detailExplanation');

test('detail explanation hides filler usage and duplicated example', () => {
  const extras = extraExplanation({
    translation: '慢慢来。',
    usage_scenario: '在真实语境中理解和使用这条英语。',
    example_sentence: 'Take your time.',
    example_translation: '慢慢来。'
  }, 'Take your time.', '慢慢来。');
  assert.equal(extras, null);
});

test('detail explanation keeps only new information', () => {
  const extras = extraExplanation({
    understanding: '慢慢来，不必着急。',
    usage_scenario: '有人催你时用来缓和节奏。',
    example_sentence: 'Take your time, I can wait.',
    example_translation: '你慢慢来，我可以等。',
    similar_phrases: [{ text: 'No rush' }]
  }, 'Take your time.', '慢慢来。');
  assert.equal(extras.meaning, '慢慢来，不必着急。');
  assert.equal(extras.usage, '有人催你时用来缓和节奏。');
  assert.equal(extras.exampleEn, 'Take your time, I can wait.');
  assert.equal(extras.relatedText, 'No rush');
});

test('source chip prefers category over internal public label', () => {
  assert.equal(sourceLabel({ category: '日常生活', source: '公开素材' }, 'public'), '日常生活');
  assert.equal(sourceLabel({ where: '今日一句', source: '公开素材' }, 'personal'), '今日一句');
});

test('long sentences use a smaller english size', () => {
  assert.equal(englishSizeClass('Hi'), '');
  assert.equal(englishSizeClass('A quiet morning can leave enough room for a better question.'), 'detail-en-compact');
});
