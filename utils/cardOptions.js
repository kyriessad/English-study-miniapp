const { DEFAULT_EXAM_SCENE, DEFAULT_EXAM_MODULE } = require('./recordStorage');

const CARD_CATEGORIES = ['单词', '短语', '句子'];
const EXAM_SCENE_OPTIONS = ['高考', '四级', '六级', '考研', '托福', '雅思', DEFAULT_EXAM_SCENE];
const EXAM_MODULE_OPTIONS = ['听力', '阅读', '写作', '口语', DEFAULT_EXAM_MODULE];

module.exports = {
  CARD_CATEGORIES,
  EXAM_SCENE_OPTIONS,
  EXAM_MODULE_OPTIONS
};
