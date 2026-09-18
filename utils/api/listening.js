const transport = require('./transport');
const { mapCard, mapListeningItem, mapListeningListResponse } = require('./mappers');

module.exports = {
  list() {
    return transport.request({ url: '/api/listening/materials', method: 'GET' })
      .then(mapListeningListResponse);
  },
  get(sourceId) {
    return transport.request({
      url: `/api/listening/materials/${encodeURIComponent(sourceId)}`,
      method: 'GET'
    }).then(mapListeningItem);
  },
  addSegment(sourceId, position, clientActionId) {
    return transport.request({
      url: `/api/listening/materials/${encodeURIComponent(sourceId)}/segments/${encodeURIComponent(position)}/add-to-library`,
      method: 'POST',
      data: { client_action_id: clientActionId, participates_in_review: true }
    }).then((response) => ({
      status: response && response.status,
      card: mapCard((response && response.card) || {})
    }));
  }
};
