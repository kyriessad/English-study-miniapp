const transport = require('./transport');
const { mapReviewOverview, mapReviewSessionResponse } = require('./mappers');

module.exports = {
  getOverview(params = {}) {
    return transport.request({
      url: '/api/reviews/overview', method: 'GET', query: params
    }).then(mapReviewOverview);
  },
  createSession(data = {}) {
    return transport.request({
      url: '/api/review-sessions', method: 'POST', data
    }).then(mapReviewSessionResponse);
  },
  getToday(params = {}) {
    return transport.request({
      url: '/api/reviews/today', method: 'GET', query: params
    }).then(mapReviewSessionResponse);
  },
  getSession(sessionId) {
    return transport.request({
      url: `/api/review-sessions/${encodeURIComponent(sessionId)}`, method: 'GET'
    }).then(mapReviewSessionResponse);
  },
  returnFromDetail(sessionId, data) {
    return transport.request({
      url: `/api/review-sessions/${encodeURIComponent(sessionId)}/detail-return`,
      method: 'POST',
      data
    }).then(mapReviewSessionResponse);
  },
  submitFeedback(data) {
    return transport.request({ url: '/api/reviews/feedback', method: 'POST', data });
  }
};
