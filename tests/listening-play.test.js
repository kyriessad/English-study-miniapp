const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let pageDefinition = null;
let playHandler = null;
let audioContext = null;
const apiPath = path.resolve(__dirname, '../utils/api/index.js');
const apiClientPath = path.resolve(__dirname, '../utils/apiClient.js');
const pagePath = path.resolve(__dirname, '../pages/listening/play.js');
const previousApi = require.cache[apiPath];
const previousApiClient = require.cache[apiClientPath];

let detailRequests = 0;
let downloadRequests = 0;

global.wx = {
  getWindowInfo() { return { statusBarHeight: 20 }; },
  getSystemInfoSync() { return { statusBarHeight: 20 }; },
  createInnerAudioContext() {
    audioContext = {
      obeyMuteSwitch: true,
      onTimeUpdate() {},
      onPlay(handler) { playHandler = handler; },
      onPause() {},
      onStop() {},
      onEnded() {},
      onError() {},
      play() { if (playHandler) playHandler(); },
      pause() {},
      stop() {},
      destroy() {}
    };
    return audioContext;
  },
  showToast() {}
};
global.Page = (definition) => { pageDefinition = definition; };

require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    listening: {
      async get() {
        detailRequests += 1;
        return {
          sourceId: 'listen-001',
          durationMs: 12600,
          durationLabel: '0:13',
          segments: [
            { position: 1, text: 'Welcome aboard.', startMs: 0, endMs: 12600 }
          ]
        };
      }
    }
  }
};
require.cache[apiClientPath] = {
  id: apiClientPath,
  filename: apiClientPath,
  loaded: true,
  exports: {
    async downloadListeningAudio(sourceId) {
      downloadRequests += 1;
      assert.equal(sourceId, 'listen-001');
      return '/tmp/listen-001.wav';
    }
  }
};
delete require.cache[pagePath];
require(pagePath);

test.after(() => {
  if (previousApi) require.cache[apiPath] = previousApi;
  else delete require.cache[apiPath];
  if (previousApiClient) require.cache[apiClientPath] = previousApiClient;
  else delete require.cache[apiClientPath];
  delete require.cache[pagePath];
});

test('first listening play refreshes synthesized timeline before playback', async () => {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = (patch) => Object.assign(page.data, patch);
  page.sourceId = 'listen-001';
  page.isPageUnloaded = false;
  page.pageHidden = false;

  await page.togglePlay();

  assert.equal(downloadRequests, 1);
  assert.equal(detailRequests, 1);
  assert.equal(audioContext.src, '/tmp/listen-001.wav');
  assert.equal(page.data.durationMs, 12600);
  assert.equal(page.data.durationClock, '0:12');
  assert.equal(page.data.segments[0].startMs, 0);
  assert.equal(page.data.segments[0].endMs, 12600);
  assert.equal(page.data.playing, true);
});
