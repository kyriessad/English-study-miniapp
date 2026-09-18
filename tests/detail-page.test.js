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

test('public detail remember toggles add and remove without switching tabs', async () => {
  api.discovery.addToLibrary = async () => ({ status: 'created', card: { id: 'card-9', version: 1 } });
  api.cards.remove = async () => ({ id: 'card-9' });
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
  assert.equal(page.data.saved, false);
  assert.equal(page.data.libraryCardId, '');
});
