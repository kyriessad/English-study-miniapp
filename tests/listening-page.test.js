const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apiIndexPath = path.resolve(__dirname, '../utils/api/index.js');
const pagePath = path.resolve(__dirname, '../pages/listening/index.js');
const mappers = require('../utils/api/mappers');

let pageDefinition = null;
const listed = {
  items: [
    {
      sourceId: 'listen-v2-b02-001',
      title: 'Why Volcanoes Are Not All the Same Shape',
      targetDifficulty: 'intermediate',
      difficulty: '中级',
      durationLabel: '1:12',
      chineseSummary: '火山形态',
      contentTags: [
        { code: 'academic_talk', title: '学术 / 知识讲解', kind: 'material_type', key: 'material_type:academic_talk' }
      ]
    },
    {
      sourceId: 'listen-v2-b02-009',
      title: 'What Happens to a Returned Library Book',
      targetDifficulty: 'basic',
      difficulty: '基础',
      durationLabel: '0:48',
      chineseSummary: '还书流程',
      contentTags: [
        { code: 'listening_passage', title: '听力篇章', kind: 'material_type', key: 'material_type:listening_passage' }
      ]
    }
  ],
  difficultyFilters: [
    { code: 'basic', title: '基础' },
    { code: 'intermediate', title: '中级' },
    { code: 'advanced', title: '进阶' },
    { code: 'high', title: '高阶' }
  ],
  total: 2
};

test.before(() => {
  global.wx = {
    getWindowInfo() { return { statusBarHeight: 20 }; },
    getSystemInfoSync() { return { statusBarHeight: 20 }; },
    navigateTo() {},
    navigateBack() {}
  };
  global.Page = (definition) => { pageDefinition = definition; };
  const previousApi = require.cache[apiIndexPath];
  require.cache[apiIndexPath] = {
    id: apiIndexPath,
    filename: apiIndexPath,
    loaded: true,
    exports: {
      listening: {
        list: async () => listed
      }
    }
  };
  delete require.cache[pagePath];
  require(pagePath);
  if (previousApi) require.cache[apiIndexPath] = previousApi;
  else delete require.cache[apiIndexPath];
});

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

test('listening mapper keeps taxonomy difficulty and content tags', () => {
  const mapped = mappers.mapListeningListResponse({
    items: [{
      source_id: 'listen-v2-b02-001',
      title: 'Why Volcanoes Are Not All the Same Shape',
      material_type: 'academic_talk',
      context: 'science_environment',
      topic: 'geology',
      tags: ['volcano'],
      target_difficulty: 'intermediate',
      difficulty_label: '中级',
      content_tags: [
        { code: 'academic_talk', title: '学术 / 知识讲解', kind: 'material_type' },
        { code: 'science_environment', title: '自然科学与环境', kind: 'context' },
        { code: 'geology', title: '地质', kind: 'topic' },
        { code: 'volcano', title: 'volcano', kind: 'tag' }
      ]
    }],
    total: 1,
    difficulty_filters: [
      { code: 'basic', title: '基础' },
      { code: 'intermediate', title: '中级' },
      { code: 'advanced', title: '进阶' },
      { code: 'high', title: '高阶' }
    ]
  });
  assert.equal(mapped.items[0].targetDifficulty, 'intermediate');
  assert.equal(mapped.items[0].difficulty, '中级');
  assert.equal(mapped.difficultyFilters.length, 4);
  assert.equal(mapped.items[0].contentTags[0].title, '学术 / 知识讲解');
  assert.ok(!mapped.materialTypeFilters);
});

test('listening page filters by taxonomy difficulty only', async () => {
  const page = createPage();
  await page.load();
  assert.equal(page.data.items.length, 2);
  assert.equal(page.data.difficultyFilters.length, 4);
  page.onDifficultyTap({ currentTarget: { dataset: { code: 'basic' } } });
  assert.equal(page.data.selectedDifficulty, 'basic');
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.items[0].sourceId, 'listen-v2-b02-009');
  page.onDifficultyTap({ currentTarget: { dataset: { code: '' } } });
  assert.equal(page.data.items.length, 2);
});
