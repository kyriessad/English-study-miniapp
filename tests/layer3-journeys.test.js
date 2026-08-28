import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const corpusPath = path.resolve(
  import.meta.dirname,
  '../../English-analyzer-backend/tests/fixtures/sample_corpus.json',
);
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const runLayer3 = process.env.RUN_LAYER3 === '1';
const artifactPath = process.env.LAYER3_ARTIFACT_PATH
  ? path.resolve(process.env.LAYER3_ARTIFACT_PATH)
  : '';

const journeys = [
  { id: 'L3-VALIDATION-PASS', scenarioId: 'VAL-PASS-001', module: 'validation' },
  { id: 'L3-VALIDATION-CONTENT', scenarioId: 'VAL-CONTENT-001', module: 'validation' },
  { id: 'L3-VALIDATION-ADVISORY', scenarioId: 'VAL-ADVISORY-001', module: 'validation' },
  { id: 'L3-VALIDATION-SYSTEM', scenarioId: 'VAL-SYSTEM-001', module: 'validation' },
  { id: 'L3-VALIDATION-ERROR', scenarioId: 'VAL-HARD-001', module: 'validation' },
  { id: 'L3-CARD-WARNING-SAVE', scenarioId: 'VAL-CONTENT-001', module: 'card-create-edit' },
  { id: 'L3-AI-CONTENT-BLOCK', scenarioId: 'VAL-CONTENT-001', module: 'ai-analysis' },
  { id: 'L3-AI-CANCEL-REGENERATE', scenarioId: 'VAL-PASS-001', module: 'ai-analysis' },
  { id: 'L3-PRONUNCIATION-KNOWN', scenarioId: 'VAL-PASS-001', module: 'pronunciation' },
  { id: 'L3-PRONUNCIATION-CONTENT-BLOCK', scenarioId: 'VAL-CONTENT-001', module: 'pronunciation' },
  { id: 'L3-REVIEW-FIXTURE', scenarioId: 'VAL-PASS-001', module: 'review' },
  { id: 'L3-AUTH-RECOVERY-LOGOUT', scenarioId: 'VAL-PASS-001', module: 'auth' },
  { id: 'L3-SYNC-REPLAY', scenarioId: 'VAL-PASS-001', module: 'sync' },
  { id: 'L3-FULL-SMOKE', scenarioId: 'VAL-PASS-001', module: 'full-smoke' },
];

function loadArtifact() {
  assert.ok(artifactPath, 'RUN_LAYER3=1 requires LAYER3_ARTIFACT_PATH');
  assert.ok(fs.existsSync(artifactPath), `Layer 3 artifact does not exist: ${artifactPath}`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

test('Layer 3 journey manifest contains only fixed scenario references', () => {
  const ids = new Set(corpus.validation_scenarios.map((item) => item.scenario_id));
  for (const journey of journeys) {
    assert.ok(journey.id);
    assert.ok(journey.module);
    assert.ok(ids.has(journey.scenarioId), `${journey.id} references unknown scenario`);
  }
});

for (const journey of journeys) {
  test(
    `${journey.id} validates captured real-run evidence`,
    { skip: !runLayer3 },
    () => {
      const artifact = loadArtifact();
      assert.equal(artifact.schemaVersion, '1.0');
      assert.ok(artifact.runId);
      assert.ok(artifact.timestamp);
      assert.ok(artifact.sourceRevision && artifact.sourceRevision.backend);
      assert.ok(artifact.environment && artifact.environment.wechat_automation);

      const evidence = artifact.journeys.find((item) => item.journeyId === journey.id);
      assert.ok(evidence, `${journey.id} is absent from the captured artifact`);
      assert.equal(evidence.scenarioId, journey.scenarioId);
      assert.equal(evidence.module, journey.module);
      assert.equal(evidence.status, 'PASS');
      assert.ok(Array.isArray(evidence.operationLog) && evidence.operationLog.length > 0);
      assert.ok(Array.isArray(evidence.requestCapture) && evidence.requestCapture.length > 0);
      assert.ok(Array.isArray(evidence.requestIds) && evidence.requestIds.length > 0);
      assert.ok(Array.isArray(evidence.screenshots) && evidence.screenshots.length > 0);
      assert.ok(Array.isArray(evidence.backendLogRefs) && evidence.backendLogRefs.length > 0);
      assert.ok(evidence.finalDbState && evidence.finalDbState.status === 'PASS');
    },
  );
}
