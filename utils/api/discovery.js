const transport = require('./transport');
const {
  mapDailyDiscovery,
  mapDiscoveryCategoryListResponse,
  mapDiscoveryCursorResponse,
  mapDiscoveryPack,
  mapDiscoveryItem,
  mapDiscoveryListResponse,
  mapPublicMaterialDetail,
  mapCard
} = require('./mappers');

module.exports = {
  listPacks() {
    return transport.request({ url: '/api/discovery/packs', method: 'GET' })
      .then((response) => (Array.isArray(response && response.items) ? response.items : []).map(mapDiscoveryPack));
  },
  listItems(params = {}) {
    return transport.request({
      url: '/api/discovery/items', method: 'GET', query: params
    }).then(mapDiscoveryListResponse);
  },
  listCategories() {
    return transport.request({ url: '/api/discovery/categories', method: 'GET' })
      .then(mapDiscoveryCategoryListResponse);
  },
  listCategoryItems(categoryCode, params = {}) {
    return transport.request({
      url: `/api/discovery/categories/${encodeURIComponent(categoryCode)}/items`,
      method: 'GET', query: params
    }).then(mapDiscoveryCursorResponse);
  },
  getItem(itemId) {
    return transport.request({
      url: `/api/discovery/items/${encodeURIComponent(itemId)}`,
      method: 'GET'
    }).then(mapPublicMaterialDetail);
  },
  recordEvent(itemId, event) {
    return transport.request({
      url: `/api/discovery/items/${encodeURIComponent(itemId)}/events`,
      method: 'POST', data: event
    });
  },
  analyzeItem(itemId, forceRefresh = false) {
    return transport.request({
      url: `/api/discovery/items/${encodeURIComponent(itemId)}/analysis`,
      method: 'POST', data: { force_refresh: Boolean(forceRefresh) }
    }).then(mapPublicMaterialDetail);
  },
  addToLibrary(itemId, clientActionId, participatesInReview = true) {
    return transport.request({
      url: `/api/discovery/items/${encodeURIComponent(itemId)}/add-to-library`,
      method: 'POST',
      data: {
        client_action_id: clientActionId,
        participates_in_review: Boolean(participatesInReview)
      }
    }).then((response) => ({
      status: response && response.status,
      card: mapCard((response && response.card) || response || {})
    }));
  },
  setKnown(itemId, known) {
    return transport.request({
      url: `/api/discovery/items/${encodeURIComponent(itemId)}/state`,
      method: 'PUT', data: { known: Boolean(known) }
    }).then(mapDiscoveryItem);
  },
  getTodayQuote() {
    return transport.request({ url: '/api/discovery/today-quote', method: 'GET' })
      .then(mapDailyDiscovery);
  }
};
