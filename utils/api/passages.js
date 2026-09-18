const transport = require('./transport');
const { mapPassage, mapPassageListResponse } = require('./mappers');

module.exports = {
  list(params = {}) {
    return transport.request({
      url: '/api/passages', method: 'GET', query: params
    }).then(mapPassageListResponse);
  },
  get(passageId) {
    return transport.request({
      url: `/api/passages/${encodeURIComponent(passageId)}`, method: 'GET'
    }).then(mapPassage);
  },
  create(passage) {
    return transport.request({ url: '/api/passages', method: 'POST', data: passage }).then(mapPassage);
  },
  update(passageId, patch) {
    return transport.request({
      url: `/api/passages/${encodeURIComponent(passageId)}`, method: 'PATCH', data: patch
    }).then(mapPassage);
  },
  remove(passageId, options = {}) {
    return transport.request({
      url: `/api/passages/${encodeURIComponent(passageId)}`, method: 'DELETE', query: {
        base_version: options.baseVersion || options.base_version
      }
    }).then(mapPassage);
  }
};
