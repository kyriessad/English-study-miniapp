const transport = require('./transport');
const {
  mapWordbook,
  mapWordbookDetail,
  mapWordbookEntryList,
  mapWordbookProgress
  , mapWordbookReviewSession
} = require('./mappers');

module.exports = {
  list() {
    return transport.request({ url: '/api/wordbooks', method: 'GET' })
      .then((response) => (Array.isArray(response && response.items) ? response.items : []).map(mapWordbook));
  },
  get(bookCode) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}`,
      method: 'GET'
    }).then(mapWordbookDetail);
  },
  startOrContinue(bookCode) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/start`,
      method: 'POST'
    }).then(mapWordbookDetail);
  },
  listEntries(bookCode, params = {}) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries`,
      method: 'GET',
      query: params
    }).then(mapWordbookEntryList);
  },
  updateProgress(bookCode, itemId, progress) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries/${encodeURIComponent(itemId)}/progress`,
      method: 'PUT',
      data: {
        client_action_id: progress.clientActionId || progress.client_action_id,
        status: progress.status
      }
    }).then(mapWordbookProgress);
  },
  addEntryToLibrary(bookCode, itemId, clientActionId, participatesInReview = true) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries/${encodeURIComponent(itemId)}/add-to-library`,
      method: 'POST',
      data: {
        client_action_id: clientActionId,
        participates_in_review: Boolean(participatesInReview)
      }
    });
  },
  createReviewSession(bookCode, data = {}) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/review-sessions`,
      method: 'POST',
      data
    }).then(mapWordbookReviewSession);
  },
  getReviewSession(sessionId) {
    return transport.request({
      url: `/api/wordbook-review-sessions/${encodeURIComponent(sessionId)}`,
      method: 'GET'
    }).then(mapWordbookReviewSession);
  },
  submitReviewAnswer(sessionId, data) {
    return transport.request({
      url: `/api/wordbook-review-sessions/${encodeURIComponent(sessionId)}/answer`,
      method: 'POST',
      data
    }).then(mapWordbookReviewSession);
  },
  returnFromReviewDetail(sessionId, data) {
    return transport.request({
      url: `/api/wordbook-review-sessions/${encodeURIComponent(sessionId)}/detail-return`,
      method: 'POST',
      data
    }).then(mapWordbookReviewSession);
  }
};
