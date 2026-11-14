import assert from 'node:assert/strict';
import {
  buildEditorialReasoning,
  formatEditorialReasoningContext,
  evaluateEditorialReview
} from './editorial-reasoning.mjs';
import { assessCriticalQuestions } from './critical-questions.mjs';

const game = {
  id: 'gta6', type: 'game', name: 'Grand Theft Auto VI',
  description: 'An open-world action adventure set in a fictional state inspired by Florida, featuring two protagonists and a large modern city.',
  genres: ['Action', 'Adventure'],
  platforms: ['PlayStation 5', 'Xbox Series X'],
  developers: ['Rockstar Games'],
  gameModes: ['Single-player']
};

// Popularity and audience ratings are not evidence of artistic quality and
// must not change the deterministic angle-selection result.
const baseline = buildEditorialReasoning(game);
const popularityBiased = buildEditorialReasoning({
  ...game, rating: 10, popularity: 999999, trendRank: 1,
  sourceMetricValue: 999999999, sourceVoteCount: 10000000
});
assert.equal(baseline.selected.id, popularityBiased.selected.id);
assert.equal(baseline.selected.score, popularityBiased.selected.score);

// A high angle-selection score is not a confidence score for facts or source
// independence. The context must explicitly preserve that boundary.
assert.equal(baseline.selected.evidenceBasis, 'distinct-fields-not-independent-sources');
assert.ok(['strong', 'moderate', 'limited'].includes(baseline.selected.selectionStrength));
const reasoningContext = formatEditorialReasoningContext(baseline);
assert.match(reasoningContext, /لا يمثل ثقة في صحة الوقائع أو استقلال المصادر/);
assert.doesNotMatch(baseline.summary, /مجموعتين مستقلتين/);

// Sparse metadata must fail closed rather than inventing a critical angle.
const sparse = buildEditorialReasoning({
  id: 'unknown', type: 'movie', name: 'Unknown Work',
  description: 'A short, insufficient description.'
});
assert.equal(sparse.eligible, false);
assert.equal(sparse.selected, null);

// Shared catalog metadata may create a research question, never an assertion
// of artistic similarity, influence, quotation, or quality.
const related = buildEditorialReasoning({
  ...game,
  metadata: {
    catalogContext: {
      relatedWorks: [{
        title: 'Another Action Game', year: 2024,
        sharedGenreCount: 2, sharedPersonCount: 1,
        sharedGenres: 'Action, Adventure', sharedPeople: 'Shared Creator'
      }]
    }
  }
});
const relatedCandidate = related.candidates.find(entry => entry.id === 'catalog-comparative-context');
assert.ok(relatedCandidate);
assert.match(relatedCandidate.instruction, /لا تثبت تشابهاً فنياً أو تأثيراً أو اقتباساً أو تفوقاً/);

// Critical questions remain unanswered without supplied evidence.
const noEvidence = assessCriticalQuestions({ type: 'game' });
assert.equal(noEvidence.unanswered, 5);
assert.ok(noEvidence.questions.every(question => question.status === 'unanswered'));

// Several URLs from one publisher domain are still one source, not corroboration.
const oneDomain = assessCriticalQuestions({
  type: 'game',
  criticalEvidence: {
    performance_tests: [
      { source: 'Lab', url: 'https://lab.example/test-a', claim: 'Measured frame pacing.', observedAt: '2026-11-14T10:00:00Z' },
      { source: 'Lab', url: 'https://lab.example/test-b', claim: 'Measured frame pacing again.', observedAt: '2026-11-14T11:00:00Z' }
    ]
  }
});
assert.equal(oneDomain.questions.find(q => q.id === 'technical-performance').status, 'single-source');

// Different publisher domains can be marked multi-domain, not automatically true.
const twoDomains = assessCriticalQuestions({
  type: 'game',
  criticalEvidence: {
    performance_tests: [
      { source: 'Lab A', url: 'https://lab-a.example/test', claim: 'Measured frame pacing.', observedAt: '2026-11-14T10:00:00Z' },
      { source: 'Lab B', url: 'https://lab-b.example/test', claim: 'Independent frame pacing measurements.', observedAt: '2026-11-14T11:00:00Z' }
    ]
  }
});
assert.equal(twoDomains.questions.find(q => q.id === 'technical-performance').status, 'multi-domain');

// A structural pass must never be represented as factual verification.
const body = Array.from({ length: 5 }, (_, index) =>
  '### Section ' + (index + 1) + '\n' +
  ('Rockstar Games Action Adventure PlayStation 5 Xbox Series X Single-player. ').repeat(35)
).join('\n\n');
const evaluation = evaluateEditorialReview(
  game,
  { headline: 'A focused game analysis', hook: 'A bounded thesis', review: body },
  baseline,
  []
);
assert.equal(evaluation.status, 'structural-pass');
assert.equal(evaluation.sourceTruthVerified, false);
assert.match(evaluation.scope, /لا يثبت صحة الوقائع/);

console.log('Reasoning guardrail benchmark passed: popularity neutrality, evidence boundaries, fail-closed behavior, source-domain independence, and no false factual-verification claim.');
