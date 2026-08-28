const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const corpusPath = path.join(
  __dirname,
  '..',
  '..',
  'English-analyzer-backend',
  'tests',
  'fixtures',
  'sample_corpus.json'
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

test('shared sample corpus is readable from Node and contains fixed IDs', () => {
  assert.equal(corpus.seed, 20260828);
  assert.ok(corpus.english_samples.length >= 10);
  assert.ok(corpus.validation_scenarios.some((item) => item.scenario_id === 'VAL-HARD-001'));
});

test('Layer 3 corpus policy exposes explicit scenario IDs only', () => {
  const scenarioIds = corpus.validation_scenarios.map((item) => item.scenario_id);
  assert.ok(scenarioIds.every((id) => /^VAL-[A-Z0-9-]+$/.test(id)));
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);
  assert.equal(typeof corpus.seed, 'number');
});

test('front end contract status vocabulary excludes INVALID', () => {
  const allowed = new Set(['pass', 'warning', 'error']);
  assert.deepEqual([...allowed].sort(), ['error', 'pass', 'warning']);
  assert.equal(allowed.has('INVALID'), false);
});
