const transport = require('./transport');
const {
  mapWordbook,
  mapWordbookDetail,
  mapWordbookEntryList,
  mapWordbookProgress,
  mapWordbookEntryDetail,
  mapWordbookReviewSession
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
  updateSettings(bookCode, newWordsPerSession) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/settings`,
      method: 'PATCH',
      data: { new_words_per_session: newWordsPerSession }
    }).then(mapWordbookDetail);
  },
  listEntries(bookCode, params = {}) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries`,
      method: 'GET',
      query: params
    }).then(mapWordbookEntryList);
  },
  search(query, limit = 12, options = {}) {
    const generateAi = Boolean(options.generateAi || options.generate_ai);
    const requestQuery = {
      q: String(query || '').trim(),
      limit
    };
    if (generateAi) requestQuery.generate_ai = true;
    return transport.request({
      url: '/api/wordbooks/search',
      method: 'GET',
      query: requestQuery,
      timeout: generateAi ? 60000 : 10000
    });
  },
  getEntry(bookCode, itemId, params = {}) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries/${encodeURIComponent(itemId)}`,
      method: 'GET',
      query: {
        sort: params.sort || params.sortKey || 'position',
        progress: params.progress || params.progressFilter || 'all'
      }
    }).then(mapWordbookEntryDetail);
  },
  generateCollocations(bookCode, itemId) {
    return transport.request({
      url: `/api/wordbooks/${encodeURIComponent(bookCode)}/entries/${encodeURIComponent(itemId)}/collocations`,
      method: 'POST',
      timeout: 45000
    }).then((response) => {
      const items = Array.isArray(response && response.items) ? response.items : [];
      return items.map((item) => ({
        en: String((item && (item.en || item.english)) || '').trim(),
        zh: String((item && (item.zh || item.chinese)) || '').trim()
      })).filter((item) => item.en);
    });
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
