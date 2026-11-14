import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assessJudgmentRevision, buildJudgmentRevisionContext, createJudgmentSnapshot,
  loadJudgmentHistory, recordJudgmentVersion
} from './judgment-history.mjs';

const item = {
  id: '42', type: 'movie', name: 'Test Film', source: 'TMDB',
  sourceUrl: 'https://www.themoviedb.org/movie/42',
  description: 'A family drama about memory and responsibility.',
  genres: ['Drama'], metadata: { directors: ['A Director'] }
};
const first = createJudgmentSnapshot(item, {
  score: 8, scores: { story: 8, visuals: 8 }, verdict: 'عمل متماسك في بنائه.',
  pros: ['تماسك السرد والشخصيات'], cons: ['إيقاع بطيء في المنتصف']
}, { capturedAt: '2026-01-01T00:00:00.000Z' });
const sameEvidence = createJudgmentSnapshot(item, {
  score: 4, scores: { story: 4 }, verdict: 'الحكم تغير.',
  pros: ['إيقاع بطيء في المنتصف'], cons: ['تماسك السرد والشخصيات']
}, { capturedAt: '2026-02-01T00:00:00.000Z' });
const assessment = assessJudgmentRevision(first, sameEvidence);
assert.equal(assessment.status, 'needs-review');
assert.equal(assessment.evidenceChanged, false);
assert.equal(assessment.scoreDelta, -4);
assert.ok(assessment.opposingClaims.length >= 1, 'Opposing claims should be flagged for review, not silently reconciled.');

const changedItem = { ...item, description: item.description + ' New verified production notes.' };
const changed = createJudgmentSnapshot(changedItem, {
  score: 7, verdict: 'حكم محدث مع دليل جديد.', pros: ['تماسك السرد'], cons: []
});
assert.equal(assessJudgmentRevision(first, changed).evidenceChanged, true);

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-judgment-history-'));
try {
  const filePath = path.join(directory, 'data', 'judgments.json');
  const empty = await loadJudgmentHistory(filePath);
  assert.equal(empty.works.length, 0);
  assert.equal(buildJudgmentRevisionContext(item, empty), '');
  const saved = await recordJudgmentVersion(item, {
    score: 8, scores: { story: 8 }, verdict: 'حكم أول.', pros: ['تماسك السرد'], cons: ['بطء الإيقاع']
  }, { filePath, capturedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(saved.recorded, true);
  const loaded = await loadJudgmentHistory(filePath);
  assert.match(buildJudgmentRevisionContext(item, loaded), /ذاكرة الأحكام السابقة/);
  const duplicate = await recordJudgmentVersion(item, {
    score: 8, scores: { story: 8 }, verdict: 'حكم أول.', pros: ['تماسك السرد'], cons: ['بطء الإيقاع']
  }, { filePath, capturedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(duplicate.duplicate, true);
  const revised = await recordJudgmentVersion(item, {
    score: 5, scores: { story: 5 }, verdict: 'حكم ثانٍ.', pros: ['بطء الإيقاع'], cons: ['تماسك السرد']
  }, { filePath, capturedAt: '2026-02-01T00:00:00.000Z' });
  assert.equal(revised.recorded, true);
  assert.equal(revised.assessment.status, 'needs-review');
  assert.equal((await loadJudgmentHistory(filePath)).works[0].versions.length, 2);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
console.log('Judgment history tests passed.');
