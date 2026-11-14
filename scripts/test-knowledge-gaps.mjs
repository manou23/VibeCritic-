import assert from 'node:assert/strict';
import { assessKnowledgeGaps, formatKnowledgeGapContext } from './knowledge-gaps.mjs';

const upcomingGame = assessKnowledgeGaps({
  id: 'gta6', type: 'game', name: 'Grand Theft Auto VI',
  date: '2027-11-19', description: 'A sufficiently detailed official synopsis describing the setting, protagonists, central conflict, major locations, and the announced premise of this upcoming game without making claims about gameplay quality or performance.',
  source: 'RAWG', sourceUrl: 'https://rawg.io/games/gta6',
  genres: ['Action', 'Adventure'], platforms: ['PlayStation 5', 'Xbox Series X'],
  developers: ['Rockstar Games'], rating: 0, sourceVoteCount: 0
}, { today: '2026-11-14', assessedAt: '2026-11-14T00:00:00.000Z' });

assert.equal(upcomingGame.releaseMode, 'preview');
assert.ok(!upcomingGame.missingFields.some(gap => gap.id === 'reception_sample'), 'Upcoming work should not require audience ratings.');
assert.ok(upcomingGame.blindSpots.some(gap => gap.id === 'platform_performance'));
assert.equal(upcomingGame.status, 'metadata-covered');
assert.match(formatKnowledgeGapContext(upcomingGame), /غياب الدليل ليس دليلاً على وجود عيب/);
assert.match(formatKnowledgeGapContext(upcomingGame), /لا تثبتها بيانات الكتالوج وحدها/);

const sparseFilm = assessKnowledgeGaps({
  id: 'film-1', type: 'movie', name: 'Sparse Film', date: '',
  description: 'Short synopsis.', source: 'TMDB',
  genres: [], metadata: { cast: ['Actor One'], directors: [] }
}, { today: '2026-11-14', assessedAt: '2026-11-14T00:00:00.000Z' });

assert.equal(sparseFilm.status, 'evidence-incomplete');
assert.ok(sparseFilm.missingFields.some(gap => gap.id === 'release_date'));
assert.ok(sparseFilm.missingFields.some(gap => gap.id === 'creative_leadership'));
assert.ok(sparseFilm.missingFields.some(gap => gap.id === 'cast'));
assert.equal(sparseFilm.coverage.availableCore, 0);

const conflictReport = assessKnowledgeGaps({
  id: 'film-2', type: 'movie', name: 'Conflict Film',
  date: '2026-01-01',
  description: 'A sufficiently detailed description that gives the premise and context of this particular film without claiming its artistic quality.',
  genres: ['Drama'], metadata: { cast: ['A', 'B', 'C'], directors: ['Director'], runtime: 110 },
  rating: 7.5, sourceVoteCount: 100
}, {
  today: '2026-11-14',
  unresolvedConflicts: [{ field: 'release_date', status: 'unresolved', note: 'different source values' }]
});
assert.equal(conflictReport.risk, 'high');
assert.equal(conflictReport.unresolvedConflicts[0].field, 'release_date');

console.log('Knowledge gap detection tests passed.');
