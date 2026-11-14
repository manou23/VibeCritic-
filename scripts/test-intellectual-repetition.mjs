import assert from 'node:assert/strict';
import {
  buildIntellectualRepetitionReport,
  formatIntellectualRepetitionContext,
  buildIntellectualPatternRecord
} from './intellectual-repetition.mjs';

const game = {
  id: 'game-new', type: 'game', name: 'New Action Game',
  description: 'An open world action adventure focused on a city, exploration, vehicle missions, and character progression.',
  genres: ['Action', 'Adventure']
};
const reasoning = {
  selected: {
    id: 'interactive-product-context',
    question: 'How do the interactive systems shape player choice?',
    instruction: 'Analyze how the game systems and player decisions interact.',
    evidence: [{ field: 'platforms' }, { field: 'developers' }]
  }
};
const questions = { questions: [{ id: 'core-loop' }, { id: 'technical-performance' }, { id: 'world-design' }] };
const prior = [{
  id: 'game-old', type: 'game', title: 'Older Action Game',
  intellectualPattern: {
    workId: 'game:game-old',
    workType: 'game',
    angleId: 'interactive-product-context',
    questionIds: ['core-loop', 'technical-performance', 'world-design'],
    genres: ['Action', 'Adventure'],
    evidenceFields: ['platforms', 'developers'],
    argumentTokens: ['open','world','action','adventure','city','exploration','vehicle','missions','character','progression','player','choice','systems']
  }
}];
const repeated = buildIntellectualRepetitionReport(game, reasoning, questions, prior);
assert.equal(repeated.status, 'high-repetition-risk');
assert.ok(repeated.topScore >= 78);
assert.match(formatIntellectualRepetitionContext(repeated), /غيّر السؤال المركزي/);

const distinct = buildIntellectualRepetitionReport(
  { ...game, id: 'game-other', description: 'A puzzle game built around time manipulation, abstract rooms, and environmental riddles.' },
  { selected: { id: 'narrative-premise', question: 'How does time manipulation shape puzzle logic?', instruction: 'Focus on puzzle construction and time-based reasoning.', evidence: [{ field: 'genres' }] } },
  { questions: [{ id: 'narrative-execution' }] },
  prior
);
assert.equal(distinct.status, 'distinct-thinking');

const moderate = buildIntellectualRepetitionReport(game, reasoning, { questions: [{ id: 'core-loop' }] }, prior);
assert.ok(['moderate-overlap', 'high-repetition-risk'].includes(moderate.status));

const baseline = buildIntellectualRepetitionReport(game, reasoning, questions, []);
assert.equal(baseline.status, 'distinct-thinking');
assert.equal(baseline.comparedCount, 0);

const record = buildIntellectualPatternRecord(game, reasoning, questions, {
  hook: 'A distinct argument about player choice.',
  summary: 'A concise thesis.',
  pros: ['Strong exploration'],
  cons: ['Uneven progression']
});
assert.equal(record.version, 1);
assert.equal(record.angleId, 'interactive-product-context');
assert.ok(record.argumentTokens.length > 0);

console.log('Intellectual repetition tests passed.');
