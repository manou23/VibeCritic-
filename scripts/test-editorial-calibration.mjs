import assert from 'node:assert/strict';
import { assessCriticalQuestions, formatCriticalQuestionContext } from './critical-questions.mjs';

const TYPES = [
  { type: 'movie', expected: ['screenplay', 'acting', 'direction', 'sound', 'pacing'] },
  { type: 'series', expected: ['season-arc', 'episode-pacing', 'screenplay', 'acting', 'direction-sound'] },
  { type: 'game', expected: ['core-loop', 'technical-performance', 'world-design', 'narrative-execution', 'progression-balance'] }
];

// Every supported medium must have a complete, distinct critical-question set.
for (const fixture of TYPES) {
  const report = assessCriticalQuestions({ type: fixture.type, id: 'fixture', name: 'Calibration fixture' });
  assert.equal(report.questionCount, 5, fixture.type + ' should expose five questions');
  assert.deepEqual(report.questions.map(question => question.id), fixture.expected);
  assert.equal(report.unanswered, 5);
  assert.equal(report.multiDomain, 0);
  assert.equal(report.singleSource, 0);
  assert.ok(report.questions.every(question => question.status === 'unanswered'));
}

// Multiple URLs from the same publisher domain are not independent corroboration.
const sameDomain = assessCriticalQuestions({
  type: 'movie',
  criticalEvidence: {
    script_analysis: [
      { source: 'Publisher A', url: 'https://www.publisher.example/review-one', claim: 'Claim one', observedAt: '2026-11-14T10:00:00Z' },
      { source: 'Publisher A', url: 'https://publisher.example/review-two', claim: 'Claim two', observedAt: '2026-11-14T11:00:00Z' },
      { source: 'Publisher A', url: 'https://publisher.example/review-three', claim: 'Claim three', observedAt: '2026-11-14T12:00:00Z' }
    ]
  }
});
const sameDomainQuestion = sameDomain.questions.find(question => question.id === 'screenplay');
assert.equal(sameDomainQuestion.status, 'single-source');
assert.equal(sameDomainQuestion.evidenceCount, 3);
assert.deepEqual(sameDomainQuestion.distinctDomains, ['publisher.example']);

// Different domains permit a multi-domain label, while malformed records are discarded.
const independent = assessCriticalQuestions({
  type: 'movie',
  criticalEvidence: {
    script_analysis: [
      { source: 'Publisher A', url: 'https://a.example/review', claim: 'A specific observation', observedAt: '2026-11-14T10:00:00Z' },
      { source: 'Publisher B', url: 'https://b.example/review', claim: 'A separate observation', observedAt: '2026-11-14T11:00:00Z' },
      { source: 'Insecure source', url: 'http://c.example/review', claim: 'Reject HTTP', observedAt: '2026-11-14T11:00:00Z' },
      { source: 'Undated source', url: 'https://d.example/review', claim: 'Reject invalid date', observedAt: 'not-a-date' },
      { source: '', url: 'https://e.example/review', claim: 'Reject missing publisher', observedAt: '2026-11-14T11:00:00Z' }
    ]
  }
});
const independentQuestion = independent.questions.find(question => question.id === 'screenplay');
assert.equal(independentQuestion.status, 'multi-domain');
assert.equal(independentQuestion.evidenceCount, 2);
assert.deepEqual(independentQuestion.distinctDomains, ['a.example', 'b.example']);
assert.equal(independent.multiDomain, 1);
assert.equal(independent.unanswered, 4);

// Evidence is bounded: at most six valid entries, each claim at most 420 characters.
const bounded = assessCriticalQuestions({
  type: 'game',
  criticalEvidence: {
    performance_tests: Array.from({ length: 9 }, (_, index) => ({
      source: 'Lab ' + index,
      url: 'https://lab-' + index + '.example/test',
      claim: 'x'.repeat(500),
      observedAt: '2026-11-14T10:00:00Z'
    }))
  }
});
const performance = bounded.questions.find(question => question.id === 'technical-performance');
assert.equal(performance.evidenceCount, 6);
assert.ok(performance.evidence.every(entry => entry.claim.length === 420));

// Preview mode must not inherit review evidence or imply a completed evaluation.
const preview = assessCriticalQuestions({
  type: 'series',
  criticalEvidence: {
    season_structure_analysis: [{
      source: 'Publisher',
      url: 'https://publisher.example/season',
      claim: 'A review claim',
      observedAt: '2026-11-14T10:00:00Z'
    }]
  }
}, { preview: true });
assert.equal(preview.mode, 'preview');
assert.equal(preview.questionCount, 5);
assert.equal(preview.unanswered, 5);
assert.ok(preview.questions.every(question => question.evidenceCount === 0));
assert.ok(preview.questions.every(question => question.question.startsWith('ما الذي أُعلن رسمياً')));

// Unknown types must fail closed instead of silently borrowing another medium's rubric.
const unknown = assessCriticalQuestions({ type: 'documentary' });
assert.equal(unknown.workType, 'unknown');
assert.equal(unknown.questionCount, 0);

// Prompt formatting must preserve the anti-hallucination and non-punitive evidence rules.
const context = formatCriticalQuestionContext(assessCriticalQuestions({ type: 'movie' }));
assert.match(context, /لا تجب عن سؤال بلا دليل/);
assert.match(context, /لا تحوّل السؤال غير المحسوم إلى نقطة سلبية/);
assert.match(context, /لا تخترع إجابة لسد فراغ المقال/);

console.log('Editorial calibration tests passed: media coverage, source independence, invalid evidence, bounded context, preview safety, and evidence guardrails.');
