import assert from 'node:assert/strict';
import { assessCriticalQuestions, formatCriticalQuestionContext } from './critical-questions.mjs';

const game = { type: 'game', id: 'gta6', name: 'Example' };
const initial = assessCriticalQuestions(game);
assert.equal(initial.questionCount, 5);
assert.equal(initial.multiDomain, 0);
assert.equal(initial.unanswered, 5);
assert.match(formatCriticalQuestionContext(initial), /لا تجب عن سؤال بلا دليل/);

const single = assessCriticalQuestions({
  ...game,
  criticalEvidence: {
    performance_tests: [{
      source: 'Independent Lab',
      url: 'https://lab.example/review/game-performance',
      claim: 'Frame pacing was measured on a defined platform.',
      observedAt: '2026-11-14T10:00:00Z'
    }]
  }
});
const technical = single.questions.find(question => question.id === 'technical-performance');
assert.equal(technical.status, 'single-source');
assert.equal(technical.evidenceCount, 1);

const multiDomain = assessCriticalQuestions({
  ...game,
  criticalEvidence: {
    performance_tests: [
      { source: 'Lab A', url: 'https://lab-a.example/test', claim: 'Measured stable frame pacing.', observedAt: '2026-11-14T10:00:00Z' },
      { source: 'Lab B', url: 'https://lab-b.example/test', claim: 'Independent measurements confirm frame pacing.', observedAt: '2026-11-14T11:00:00Z' },
      { source: 'Invalid HTTP', url: 'http://bad.example/test', claim: 'Should be rejected.', observedAt: '2026-11-14T11:00:00Z' },
      { source: 'Missing date', url: 'https://lab-c.example/test', claim: 'Should be rejected.', observedAt: 'not-a-date' }
    ]
  }
});
const confirmed = multiDomain.questions.find(question => question.id === 'technical-performance');
assert.equal(confirmed.status, 'multi-domain');
assert.equal(confirmed.evidenceCount, 2);
assert.equal(confirmed.distinctDomains.length, 2);

const preview = assessCriticalQuestions({ type: 'movie' }, { preview: true });
assert.equal(preview.mode, 'preview');
assert.ok(preview.questions.every(question => question.status === 'unanswered'));
assert.ok(preview.questions.every(question => question.question.startsWith('ما الذي أُعلن رسمياً')));

const series = assessCriticalQuestions({ type: 'series' });
assert.ok(series.questions.some(question => question.id === 'season-arc'));
const unknown = assessCriticalQuestions({ type: 'unknown' });
assert.equal(unknown.questionCount, 0);

console.log('Critical question engine tests passed.');
