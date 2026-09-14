const transport = require('./transport');
const { mapCard, mapCardListResponse } = require('./mappers');

module.exports = {
  list(params = {}) {
    return transport.request({
      url: '/api/cards', method: 'GET', query: params
    }).then(mapCardListResponse);
  },
  get(cardId) {
    return transport.request({
      url: `/api/cards/${encodeURIComponent(cardId)}`, method: 'GET'
    }).then(mapCard);
  },
  create(card) {
    return transport.request({ url: '/api/cards', method: 'POST', data: card }).then(mapCard);
  },
  update(cardId, patch) {
    return transport.request({
      url: `/api/cards/${encodeURIComponent(cardId)}`, method: 'PATCH', data: patch
    }).then(mapCard);
  },
  remove(cardId, options = {}) {
    return transport.request({
      url: `/api/cards/${encodeURIComponent(cardId)}`, method: 'DELETE', query: {
        base_version: options.baseVersion || options.base_version
      }
    }).then(mapCard);
  }
};
