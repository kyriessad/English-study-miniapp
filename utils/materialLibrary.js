const api = require('./api/index');
const { newClientActionId } = require('./coreViewModels');

function cardFromAddResponse(result) {
  const source = (result && (result.card || result)) || {};
  return {
    id: String(source.id || source.card_id || source.cardId || ''),
    version: Number(source.version || 0)
  };
}

async function addMaterialToLibrary(itemId) {
  const result = await api.discovery.addToLibrary(itemId, newClientActionId('material-library'), true);
  const card = cardFromAddResponse(result);
  if (!card.id) {
    throw new Error('加入失败，请重试');
  }
  return card;
}

async function removeMaterialFromLibrary(current) {
  let cardId = String(current.libraryCardId || current.cardId || '');
  let version = Number(current.libraryCardVersion || current.version || 0);
  if (!cardId) {
    const list = await api.cards.list({ limit: 100, offset: 0 });
    const found = (list.items || []).find((card) => (
      String(card.publicMaterialItemId || '') === String(current.id || '') ||
      String(card.englishText || card.en || '') === String(current.en || current.content || '')
    ));
    if (!found || !found.id) {
      throw new Error('找不到对应卡片');
    }
    cardId = found.id;
    version = Number(found.version || 0);
  }
  await api.cards.remove(cardId, { baseVersion: version });
}

module.exports = {
  addMaterialToLibrary,
  removeMaterialFromLibrary
};
