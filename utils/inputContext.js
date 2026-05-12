const { DEFAULT_EXAM_SCENE, DEFAULT_EXAM_MODULE } = require('./cardStorageFacade');

const INPUT_CONTEXT_KEY = 'englishCardInputContext';

function normalizeContext(context) {
  const source = context || {};

  return {
    examScene: String(source.examScene || DEFAULT_EXAM_SCENE).trim() || DEFAULT_EXAM_SCENE,
    examModule: String(source.examModule || DEFAULT_EXAM_MODULE).trim() || DEFAULT_EXAM_MODULE
  };
}

function getInputContext() {
  const storedContext = wx.getStorageSync(INPUT_CONTEXT_KEY);
  return normalizeContext(storedContext);
}

function saveInputContext(context) {
  const normalizedContext = normalizeContext(context);
  wx.setStorageSync(INPUT_CONTEXT_KEY, normalizedContext);
  return normalizedContext;
}

function clearInputContext() {
  const clearedContext = {
    examScene: DEFAULT_EXAM_SCENE,
    examModule: DEFAULT_EXAM_MODULE
  };

  wx.setStorageSync(INPUT_CONTEXT_KEY, clearedContext);
  return clearedContext;
}

function hasActiveInputContext(context) {
  const normalizedContext = normalizeContext(context);

  return normalizedContext.examScene !== DEFAULT_EXAM_SCENE
    || normalizedContext.examModule !== DEFAULT_EXAM_MODULE;
}

module.exports = {
  INPUT_CONTEXT_KEY,
  getInputContext,
  saveInputContext,
  clearInputContext,
  hasActiveInputContext
};
