const CARD_MAX_CONTENT_CHARS = 300;
const PASSAGE_MAX_CONTENT_CHARS = 20000;

function collapseWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function measureContentLength(text) {
  return collapseWhitespace(text).length;
}

function isPassageContent(text) {
  return measureContentLength(text) > CARD_MAX_CONTENT_CHARS;
}

function isCardContent(text) {
  const length = measureContentLength(text);
  return length > 0 && length <= CARD_MAX_CONTENT_CHARS;
}

function normalizePassageText(text) {
  var result = String(text || '');
  if (typeof result.normalize === 'function') {
    result = result.normalize('NFKC');
  }
  result = result.replace(/[\u2018\u2019\u201B\u2032`]/g, '\'');
  result = result.replace(/[\u201C\u201D\u201F\u2033]/g, '"');
  result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-');
  result = result.replace(/\u3002/g, '.');
  result = result.replace(/[\uFF0C\u3001]/g, ',');
  result = result.replace(/\uFF01/g, '!');
  result = result.replace(/\uFF1F/g, '?');
  result = result.replace(/\uFF1B/g, ';');
  result = result.replace(/\uFF1A/g, ':');
  result = result.replace(/\u00A0/g, ' ');
  result = result.replace(/\u3000/g, ' ');
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  result = result.replace(/[ \t]+\n/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]{2,}/g, ' ');
  return result.trim();
}

module.exports = {
  CARD_MAX_CONTENT_CHARS,
  PASSAGE_MAX_CONTENT_CHARS,
  collapseWhitespace,
  measureContentLength,
  isPassageContent,
  isCardContent,
  normalizePassageText
};
