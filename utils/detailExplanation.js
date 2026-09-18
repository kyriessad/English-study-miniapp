function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function sameText(left, right) {
  return clean(left).replace(/\s+/g, ' ').toLowerCase() === clean(right).replace(/\s+/g, ' ').toLowerCase();
}

function isGenericUsage(text) {
  const value = clean(text);
  return !value || /真实语境中理解和使用/.test(value);
}

function englishSizeClass(text) {
  const length = clean(text).length;
  if (length > 68) return 'detail-en-small';
  if (length > 34) return 'detail-en-compact';
  return '';
}

function extraExplanation(reference, english, chinese) {
  if (!reference) return null;
  const related = (reference.similar_phrases || reference.synonyms || [])
    .map((item) => item.text || item.content || item.word || '')
    .filter(Boolean);
  const meaning = clean(reference.understanding || reference.translation || reference.meaning);
  const usage = clean(reference.usage_scenario || reference.usageScenario || reference.usage);
  const exampleEn = clean(reference.example_sentence || reference.exampleSentence || reference.exampleEn);
  const exampleZh = clean(reference.example_translation || reference.exampleTranslation || reference.exampleZh);
  const extras = {};
  if (meaning && !sameText(meaning, chinese)) extras.meaning = meaning;
  if (usage && !isGenericUsage(usage) && !sameText(usage, chinese) && !sameText(usage, english)) extras.usage = usage;
  if (exampleEn && !sameText(exampleEn, english)) {
    extras.exampleEn = exampleEn;
    if (exampleZh && !sameText(exampleZh, chinese)) extras.exampleZh = exampleZh;
  }
  if (related.length) extras.relatedText = related.join('、');
  return Object.keys(extras).length ? extras : null;
}

function sourceLabel(item, mode) {
  if (mode === 'personal') {
    return clean(item.where || item.source) || '我的英语';
  }
  return clean(item.category || item.source) || '发现';
}

module.exports = {
  clean,
  sameText,
  englishSizeClass,
  extraExplanation,
  sourceLabel
};
