const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWordbookApi() {
  const file = path.resolve(__dirname, '..', 'utils/api/wordbooks.js');
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (name === './transport') {
        return {
          request(options) {
            requests.push(options);
            return Promise.resolve({ items: [] });
          }
        };
      }
      if (name === './mappers') {
        return {
          mapWordbook: (value) => value,
          mapWordbookDetail: (value) => value,
          mapWordbookEntryList: (value) => value,
          mapWordbookProgress: (value) => value,
          mapWordbookEntryDetail: (value) => value,
          mapWordbookReviewSession: (value) => value
        };
      }
      throw new Error('Unexpected dependency: ' + name);
    }
  }, { filename: file });
  return { api: module.exports, requests };
}

test('wordbook search uses a long timeout only for model enrichment', async () => {
  const { api, requests } = loadWordbookApi();

  await api.search('review');
  await api.search('longtailword', 12, { generateAi: true });

  assert.equal(requests[0].timeout, 10000);
  assert.equal(requests[0].query.generate_ai, undefined);
  assert.equal(requests[1].timeout, 60000);
  assert.equal(requests[1].query.generate_ai, true);
});
