const CARD_TYPE_LABELS = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
};

function clean(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function newClientActionId(prefix) {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === 'x' ? value : ((value & 0x3) | 0x8)).toString(16);
  });
}

function cardSourceLabel(card) {
  if (card.addChannel === 'public_material') return '公开素材';
  if (card.addChannel === 'wordbook') return '词汇书';
  return '自己添加';
}

function toCardView(card) {
  const encounter = Array.isArray(card.encounters) && card.encounters.length ? card.encounters[0] : null;
  const where = clean(card.whereEncountered || (encounter && encounter.whereEncountered));
  const raw = card.raw || {};
  return {
    id: clean(card.id),
    en: clean(card.englishText),
    zh: clean(card.translation || card.understanding),
    my: clean(card.understanding),
    note: clean(card.note),
    where,
    context: clean(card.sourceContext || (encounter && encounter.context)),
    sentence: clean(card.exampleSentence),
    sentenceZh: clean(card.exampleTranslation),
    category: CARD_TYPE_LABELS[card.category] || '英语表达',
    source: cardSourceLabel(card),
    participate: card.participatesInReview !== false,
    createdAt: clean(card.createdAt || raw.created_at || raw.createdAt),
    version: Number(card.version || 0),
    raw: card
  };
}

function toMaterialView(item, reference) {
  const ref = reference || {};
  return {
    id: clean(item.id),
    en: clean(item.content),
    zh: clean(item.chinese || item.translation || ref.translation || ref.understanding),
    category: clean(item.categoryTitle || item.packTitle || '公开素材'),
    source: clean(item.sourceLabel || item.packTitle || '公开素材'),
    type: clean(item.domain),
    context: clean(ref.usage_scenario || ref.usageScenario),
    sentence: clean(ref.example_sentence || ref.exampleSentence),
    sentenceZh: clean(ref.example_translation || ref.exampleTranslation),
    joined: Boolean(item.inLibrary),
    saved: Boolean(item.inLibrary),
    raw: item
  };
}

function toReviewView(item) {
  if (!item) return null;
  return {
    id: clean(item.card_id || item.cardId),
    sessionItemId: clean(item.session_item_id || item.sessionItemId),
    questionId: clean(item.question_id || item.questionId),
    en: clean(item.content),
    cardType: clean(item.card_type || item.cardType || 'auto'),
    phonetic: clean(item.phonetic),
    answer: clean(item.understanding || item.translation),
    where: clean(item.where_encountered || item.whereEncountered),
    context: clean(item.source_context || item.sourceContext),
    example: clean(item.example_sentence || item.exampleSentence),
    exampleZh: clean(item.example_translation || item.exampleTranslation),
    flowState: item.flow_state || item.flowState || 'question',
    wrongCount: Number(item.wrong_count || item.wrongCount || 0),
    options: Array.isArray(item.options) ? item.options.map((option) => ({
      optionId: option.option_id || option.optionId || '',
      text: clean(option.text)
    })) : [],
    raw: item
  };
}

function errorMessage(error, fallback) {
  const detail = error && error.data && error.data.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (detail && detail.message) return detail.message;
  return clean(error && (error.message || error.errMsg)) || fallback || '操作失败，请稍后重试';
}

module.exports = {
  clean,
  newClientActionId,
  toCardView,
  toMaterialView,
  toReviewView,
  errorMessage
};
