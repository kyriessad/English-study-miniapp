const test = require('node:test');
const assert = require('node:assert/strict');

let pageDefinition = null;

global.wx = {
  getWindowInfo() { return { statusBarHeight: 20, windowWidth: 375 }; },
  getSystemInfoSync() { return { statusBarHeight: 20, windowWidth: 375 }; },
  getMenuButtonBoundingClientRect() { return { left: 280 }; },
  showToast() {},
  navigateTo() {},
  navigateBack() {},
  switchTab() {},
  createInnerAudioContext() {
    return { onCanplay() {}, onPlay() {}, onWaiting() {}, onEnded() {}, onStop() {}, onError() {}, destroy() {} };
  }
};
global.Page = (definition) => { pageDefinition = definition; };

const api = require('../utils/api/index');
require('../pages/library/detail');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  page.pronunciationController = { load() {}, playText() {}, destroy() {} };
  return page;
}

test('wordbook browse detail shows arabic rank, pos gloss and next word', () => {
  const page = createPage();
  page.fromWordbook = true;
  page.bookCode = 'postgraduate';
  page.id = 'w1';
  page.loadWordbookExample = async () => {};
  page.loadWordbookCollocations = async () => {};
  page.applyPublicItem(
    { en: 'various', zh: '各种各样的', joined: false, source: '考研', raw: {} },
    {},
    {
      entry: {
        id: 'w1',
        chinese: 'adj.各种各样的；多方面的',
        progressState: 'not_started',
        position: 1,
        inLibrary: false
      },
      unmasteredRank: 1,
      unmasteredTotal: 5390,
      prevEntry: null,
      nextEntry: { id: 'w2', content: 'variable' },
      collocations: [{ en: 'in various ways', zh: '以各种方式' }],
      exampleEn: 'She solved the problem in various ways.',
      exampleZh: '她用各种方式解决了这个问题。',
      collocationStatus: 'available',
      usageNote: '形容词；常用于名词前。'
    }
  );
  assert.equal(page.data.browseRank, 1);
  assert.equal(page.data.unmasteredTotal, 5390);
  assert.equal(page.data.chinese, 'adj.各种各样的；多方面的');
  assert.equal(page.data.prevEntry, null);
  assert.equal(page.data.nextEntry.content, 'variable');
  assert.equal(page.data.collocations[0].en, 'in various ways');
  assert.equal(page.data.exampleEn, 'She solved the problem in various ways.');
  assert.equal(page.data.collocationStatus, 'available');
  assert.equal(page.data.usageNote, '形容词；常用于名词前。');
  assert.equal(page.data.navPrevLabel, '<--');
});

test('wordbook next neighbor loads in place', async () => {
  const page = createPage();
  page.fromWordbook = true;
  page.bookCode = 'postgraduate';
  page.id = 'w1';
  page.data.nextEntry = { id: 'w2', content: 'variable' };
  page.data.prevEntry = null;
  page.load = async function () {
    this.data.english = 'variable';
  };
  assert.equal(page.goPrevEntry(), undefined);
  await page.goNextEntry();
  assert.equal(page.id, 'w2');
  assert.equal(page.data.english, 'variable');
});

test('public detail saved action preserves the card and opens my English', async () => {
  let removed = false;
  let destination = '';
  global.wx.switchTab = ({ url }) => { destination = url; };
  api.discovery.addToLibrary = async () => ({ status: 'created', card: { id: 'card-9', version: 1 } });
  api.cards.remove = async () => { removed = true; return { id: 'card-9' }; };
  const page = createPage();
  page.id = 'material-9';
  page.mode = 'public';
  page.data.mode = 'public';
  page.data.item = { id: 'material-9', joined: false };
  page.data.english = 'Take your time.';
  page.data.saved = false;
  await page.remember();
  assert.equal(page.data.saved, true);
  assert.equal(page.data.libraryCardId, 'card-9');
  await page.remember();
  assert.equal(page.data.saved, true);
  assert.equal(page.data.libraryCardId, 'card-9');
  assert.equal(removed, false);
  assert.equal(destination, '/pages/library/index');
});
