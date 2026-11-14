import assert from 'node:assert/strict';
import { compactKnowledgeGraph, compactEditorialMemory, compactLearningMemory } from './memory-maintenance.mjs';

const graph = compactKnowledgeGraph({
  version: 2,
  entities: [
    { id: 'work:one', kind: 'work', name: 'One', sources: ['TMDB'], firstSeenAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    { id: 'work:one', kind: 'work', name: 'One: Full Title', sources: ['IGDB'], firstSeenAt: '2025-12-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' }
  ],
  relations: [
    { from: 'work:one', type: 'has_genre', to: 'concept:action', evidence: [{ source: 'TMDB', field: 'genres', url: 'https://themoviedb.org/movie/1', observedAt: '2026-01-01T00:00:00Z' }] },
    { from: 'work:one', type: 'has_genre', to: 'concept:action', evidence: [{ source: 'TMDB', field: 'genres', url: 'https://themoviedb.org/movie/1', observedAt: '2026-01-01T00:00:00Z' }, { source: 'TMDB', field: 'genres', url: 'https://themoviedb.org/movie/1', observedAt: '2026-01-02T00:00:00Z' }] }
  ],
  observations: [
    { id: 'o1', workId: 'work:one', field: 'genres', source: 'TMDB', normalizedValue: 'Action', firstObservedAt: '2026-01-01T00:00:00Z', lastObservedAt: '2026-01-01T00:00:00Z', observations: 2 },
    { id: 'o1', workId: 'work:one', field: 'genres', source: 'TMDB', normalizedValue: 'Action', firstObservedAt: '2026-01-01T00:00:00Z', lastObservedAt: '2026-01-03T00:00:00Z', observations: 3 }
  ],
  conflicts: [
    { id: 'conflict-1', workId: 'work:one', field: 'release_date', observationIds: ['a','b'], status: 'resolved', detectedAt: '2026-01-01T00:00:00Z' },
    { id: 'conflict-1', workId: 'work:one', field: 'release_date', observationIds: ['a','b'], status: 'unresolved', detectedAt: '2026-01-02T00:00:00Z' }
  ],
  knowledgeGaps: [
    { workKey: 'game:1', assessedAt: '2026-01-01T00:00:00Z', firstSeenAt: '2026-01-01T00:00:00Z', assessments: 2 },
    { workKey: 'game:1', assessedAt: '2026-01-03T00:00:00Z', firstSeenAt: '2026-01-02T00:00:00Z', assessments: 3 }
  ],
  stats: {}
});
assert.equal(graph.entities.length, 1);
assert.deepEqual(graph.entities[0].sources, ['TMDB', 'IGDB']);
assert.equal(graph.entities[0].name, 'One: Full Title');
assert.equal(graph.relations.length, 1);
assert.equal(graph.relations[0].evidence.length, 2);
assert.equal(graph.observations.length, 1);
assert.equal(graph.observations[0].observations, 3);
assert.equal(graph.observations[0].lastObservedAt, '2026-01-03T00:00:00Z');
assert.equal(graph.conflicts.length, 1);
assert.equal(graph.conflicts[0].status, 'unresolved');
assert.equal(graph.knowledgeGaps.length, 1);
assert.equal(graph.knowledgeGaps[0].assessments, 3);
assert.equal(graph.stats.works, 1);

const editorial = compactEditorialMemory({
  stats: { candidates: 8, approved: 3, rejected: 1 },
  candidates: [{ id: 'game:1', headline: 'old', capturedAt: '2026-01-01T00:00:00Z' }, { id: 'game:1', headline: 'new', capturedAt: '2026-01-02T00:00:00Z' }, { id: 'movie:2', headline: 'candidate' }],
  approvedExamples: [{ id: 'game:1', headline: 'approved', humanRating: 5, reviewedAt: '2026-01-03T00:00:00Z' }],
  principles: [{ key: 'p1', text: 'A principle' }, { key: 'p1', text: 'A principle duplicate' }, { text: 'Another principle' }]
});
assert.equal(editorial.candidates.length, 1);
assert.equal(editorial.candidates[0].id, 'movie:2');
assert.equal(editorial.approvedExamples.length, 1);
assert.equal(editorial.approvedExamples[0].headline, 'approved');
assert.equal(editorial.principles.length, 2);
assert.equal(editorial.stats.candidates, 8);

const learning = compactLearningMemory({
  stats: { successes: '4', failures: 9 },
  lessons: [{ key: 'depth', count: 2 }, { key: 'depth', count: 5 }, { key: 'evidence', count: 1 }],
  recentSuccesses: Array.from({ length: 15 }, (_, i) => ({ i })),
  recentQuality: Array.from({ length: 40 }, (_, i) => ({ i }))
});
assert.equal(learning.stats.successes, 4);
assert.equal(learning.lessons.length, 2);
assert.equal(learning.lessons.find(entry => entry.key === 'depth').count, 5);
assert.equal(learning.recentSuccesses.length, 10);
assert.equal(learning.recentQuality.length, 30);

console.log('Memory maintenance tests passed.');
