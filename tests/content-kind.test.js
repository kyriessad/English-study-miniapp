const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_MAX_CONTENT_CHARS,
  isCardContent,
  isPassageContent,
  measureContentLength,
  normalizePassageText
} = require('../utils/contentKind');

test('card max is 300 characters after collapsing whitespace', () => {
  assert.equal(CARD_MAX_CONTENT_CHARS, 300);
  const atLimit = 'a'.repeat(300);
  assert.equal(isCardContent(atLimit), true);
  assert.equal(isPassageContent(atLimit + 'b'), true);
});

test('newlines do not change the card/passage decision', () => {
  const body = ('This is a normal English sentence with useful context for review. ').repeat(8).trim();
  const wrapped = body.split('. ').join('.\n\n');
  assert.equal(measureContentLength(body), measureContentLength(wrapped));
  assert.equal(isPassageContent(body), isPassageContent(wrapped));
});

test('passage normalize keeps paragraph breaks', () => {
  const normalized = normalizePassageText('Hello world.  \r\n\r\n\r\nNext paragraph.');
  assert.equal(normalized, 'Hello world.\n\nNext paragraph.');
});
