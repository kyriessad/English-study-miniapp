const mock = require('./demoMock');

const state = {
  remembered: {}, personalAdded: {}, joinedBooks: {}, joinedPersonal: { p1: true, p2: true, p3: true, p4: true },
  analyses: {}, reviewSize: 5, reviewIndex: 0, reviewCards: mock.clone(mock.reviewCards), reviewResults: [], reviewAttempts: {}
};

function findMaterial(id) {
  return mock.featured.concat(mock.sceneMaterials).find(item => item.id === id);
}
function findBook(id) { return mock.books.find(item => item.id === id); }
function findPersonal(id) { return mock.personalCards.find(item => item.id === id) || (state.personalAdded[id] ? findMaterial(id) : null); }
function getPersonalCards() {
  const dynamic = Object.keys(state.personalAdded).map(id => {
    const item = findMaterial(id); return item ? { id: item.id, en: item.en, zh: item.zh, my: '', note: item.context || '', category: item.category || '生活英语', source: item.source || '发现更多', addedAt: 0, participate: true } : null;
  }).filter(Boolean);
  return mock.personalCards.concat(dynamic.filter(item => !mock.personalCards.some(existing => existing.id === item.id))).map(item => Object.assign({}, item, { joined: !!state.joinedPersonal[item.id] }));
}
function remember(id) { state.remembered[id] = true; state.joinedPersonal[id] = true; state.personalAdded[id] = true; }
function joinPersonal(id) { state.joinedPersonal[id] = true; state.personalAdded[id] = true; }
function toggleBook(id) { state.joinedBooks[id] = !state.joinedBooks[id]; return state.joinedBooks[id]; }
function getBookEntries(bookId) {
  const book = findBook(bookId); if (!book) return [];
  return book.entries.map(entry => Object.assign({}, entry, { joined: !!state.joinedPersonal[entry.id] }));
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
  if (correct || reveal) { state.reviewResults.push({ card, correct, reveal, attempts }); state.reviewIndex += 1; }
  return { correct, reveal, attempts, card, done: state.reviewIndex >= state.reviewCards.length };
}
function resetReview() { state.reviewIndex = 0; state.reviewResults = []; state.reviewAttempts = {}; }

module.exports = { state, findMaterial, findBook, findPersonal, getPersonalCards, remember, joinPersonal, toggleBook, getBookEntries, analyze, startReview, answerReview, resetReview };
