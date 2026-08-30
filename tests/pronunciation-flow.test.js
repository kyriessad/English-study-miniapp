const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const apiPath = path.resolve(__dirname, '../utils/apiClient.js');
const pronunciationPath = path.resolve(__dirname, '../utils/pronunciation.js');

global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  createInnerAudioContext: () => ({
    onCanplay() {}, onPlay() {}, onWaiting() {}, onEnded() {}, onStop() {}, onError() {},
    stop() {}, destroy() {}
  }),
  showToast() {}
};

function makePage() {
  return {
    data: {},
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };
}

function loadController() {
  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: {
      getLexicalInfo: async (text) => ({
        text,
        phonetic: 'aɪ doʊnt noʊ',
        pronunciationAvailable: true
      }),
      getLastTtsRequestId: () => '',
      downloadPronunciationAudio: async () => '',
      downloadDiagnosticTestAudio: async () => '',
      logTtsDiagnostic: () => {}
    }
  };
  delete require.cache[pronunciationPath];
  return require(pronunciationPath).createPronunciationController;
}

test('new and asynchronously loaded edit cards populate the shared phoneticDisplay', async () => {
  const createPronunciationController = loadController();

  const addPage = makePage();
  await createPronunciationController(addPage).load("i don't know");
  assert.equal(addPage.data.phoneticDisplay, '/aɪ doʊnt noʊ/');

  const editPage = makePage();
  await createPronunciationController(editPage).load("i don't know");
  assert.equal(editPage.data.phoneticDisplay, '/aɪ doʊnt noʊ/');
  assert.equal(editPage.data.editPhoneticDisplay, undefined);
});

test('sentence categories do not display phonetics', () => {
  const shouldDisplay = (category, phoneticDisplay) =>
    (category === '单词' || category === '短语') && Boolean(phoneticDisplay);
  assert.equal(shouldDisplay('句子', '/aɪ doʊnt noʊ/'), false);
});

test('phrase phonetics require a complete lexical result', () => {
  loadController();
  const { resolvePhoneticDisplay } = require(pronunciationPath);
  assert.equal(resolvePhoneticDisplay({
    wordPhonetics: [
      { word: 'because', phonetic: 'bɪˈkɒz' },
      { word: 'of', phonetic: '' }
    ]
  }).phoneticDisplay, '');
});

test('add and edit share one compact phonetic header structure', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/add/add.wxml'), 'utf8');
  const pageJs = fs.readFileSync(path.resolve(__dirname, '../pages/add/add.js'), 'utf8');

  assert.match(wxml, /english-pronunciation-area/);
  assert.match(wxml, /phoneticDisplay/);
  assert.doesNotMatch(wxml, /edit-lexical-section|editPhoneticDisplay|男声|女声/);
  assert.doesNotMatch(pageJs, /editPhoneticDisplay|onEditPronunciationTap|_editAudioContext/);
});
