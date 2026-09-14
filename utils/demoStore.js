const mock = require('./demoMock');

const state = {
  remembered: {}, personalAdded: {}, personalEdits: {}, deletedPersonal: {}, bookProgress: {}, bookReviewResults: {}, joinedPersonal: { p1: true, p2: true, p3: true, p4: true },
  analyses: {}, reviewSize: 5, reviewIndex: 0, reviewCards: mock.clone(mock.reviewCards), reviewResults: [], reviewAttempts: {}
};

function findMaterial(id) {
  const material = mock.featured.concat(mock.sceneMaterials).find(item => item.id === id);
  if (material) return material;
  for (let i = 0; i < mock.books.length; i += 1) {
    const entry = mock.books[i].entries.find(item => item.id === id);
    if (entry) return Object.assign({}, entry, { source: mock.books[i].title + ' · 词汇书', category: '词汇书', context: entry.sentence });
  }
  return null;
}
function findBook(id) { const book = mock.books.find(item => item.id === id); return book ? Object.assign({}, book, { learned: state.bookProgress[id] === undefined ? book.learned : state.bookProgress[id] }) : null; }
function findPersonal(id) { if (state.deletedPersonal[id]) return null; const base = mock.personalCards.find(item => item.id === id) || (state.personalAdded[id] ? findMaterial(id) : null); return base ? Object.assign({}, base, state.personalEdits[id] || {}) : null; }
function getPersonalCards() {
  const dynamic = Object.keys(state.personalAdded).map(id => {
    const item = findMaterial(id); return item ? Object.assign({ id: item.id, en: item.en, zh: item.zh, my: '', note: item.context || '', category: item.category || '生活英语', source: item.source || '发现更多', addedAt: 0, participate: true }, state.personalEdits[id] || {}) : null;
  }).filter(Boolean);
  return mock.personalCards.filter(item => !state.deletedPersonal[item.id]).concat(dynamic.filter(item => !mock.personalCards.some(existing => existing.id === item.id))).map(item => Object.assign({}, item, { joined: !!state.joinedPersonal[item.id] }));
}
function remember(id) { state.deletedPersonal[id] = false; state.remembered[id] = true; state.joinedPersonal[id] = true; state.personalAdded[id] = true; }
function joinPersonal(id) { state.deletedPersonal[id] = false; state.joinedPersonal[id] = true; state.personalAdded[id] = true; }
function removePersonal(id) { delete state.joinedPersonal[id]; delete state.remembered[id]; state.deletedPersonal[id] = true; delete state.personalAdded[id]; }
function updatePersonal(id, fields) { state.personalEdits[id] = Object.assign({}, state.personalEdits[id] || {}, fields); }
function startBook(id) { const book = findBook(id); if (book && state.bookProgress[id] === undefined) state.bookProgress[id] = Math.max(1, book.learned); return state.bookProgress[id] || 0; }
function getBookEntries(bookId) {
  const book = findBook(bookId); if (!book) return [];
  const reviewed = (state.bookReviewResults[bookId] || []).reduce((ids, result) => { ids[result.card.id] = true; return ids; }, {});
  return book.entries.map(entry => Object.assign({}, entry, { joined: !!state.joinedPersonal[entry.id], reviewed: !!reviewed[entry.id] }));
}
function getBookReviewCount(bookId) { return (state.bookReviewResults[bookId] || []).length; }
function saveBookReviewResult(bookId, entry, correct, attempts) {
  if (!state.bookReviewResults[bookId]) state.bookReviewResults[bookId] = [];
  state.bookReviewResults[bookId].push({ card: Object.assign({}, entry, { context: entry.sentence }), correct, attempts });
}
function analyze(id, personal) {
  const key = (personal ? 'personal-' : 'public-') + id;
  if (!state.analyses[key]) state.analyses[key] = { meaning: '在真实交流中表达清晰、自然的意思。', usages: ['适合日常沟通，也可以用于较正式的表达。'], examples: [{ en: 'Here is a practical example in context.', zh: '这是一个贴近语境的例子。' }], related: ['keep in mind', 'remember this'] };
  return state.analyses[key];
}
function startReview(size) { state.reviewSize = Number(size) || 5; state.reviewIndex = 0; state.reviewResults = []; state.reviewAttempts = {}; state.reviewCards = mock.clone(mock.reviewCards).slice(0, Math.min(state.reviewSize, mock.reviewCards.length)); return state.reviewCards; }
function answerReview(cardId, optionIndex, isUnknown) {
  const card = state.reviewCards.find(item => item.id === cardId); if (!card) return null;
  const attempts = (state.reviewAttempts[cardId] || 0) + 1; state.reviewAttempts[cardId] = attempts;
  const correct = !isUnknown && card.options[optionIndex] === card.answer;
  const reveal = attempts >= 2 && !correct;
  if (correct) { state.reviewResults.push({ card, correct, reveal: false, attempts }); state.reviewIndex += 1; }
  return { correct, reveal, attempts, card, done: state.reviewIndex >= state.reviewCards.length };
}
function resetReview() { state.reviewIndex = 0; state.reviewResults = []; state.reviewAttempts = {}; }

module.exports = { state, findMaterial, findBook, findPersonal, getPersonalCards, remember, joinPersonal, removePersonal, updatePersonal, startBook, getBookEntries, getBookReviewCount, analyze, saveBookReviewResult, startReview, answerReview, resetReview };
