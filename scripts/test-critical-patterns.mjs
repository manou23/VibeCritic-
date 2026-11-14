import assert from 'node:assert/strict';
import { deriveCriticalPatterns, formatCriticalPatternsContext } from './critical-patterns.mjs';

const works = [
  { id: 'work:a', kind: 'work', name: 'Alpha', workType: 'movie' },
  { id: 'work:b', kind: 'work', name: 'Beta', workType: 'movie' },
  { id: 'work:c', kind: 'work', name: 'Gamma', workType: 'tv' },
  { id: 'work:d', kind: 'work', name: 'Delta', workType: 'movie' }
];
const genre = { id: 'concept:science-fiction', kind: 'concept', name: 'Science Fiction' };
const director = { id: 'person:director', kind: 'person', name: 'A Director' };
const graph = {
  entities: [...works, genre, director],
  relations: [
    ...works.slice(0, 3).map(work => ({
      from: work.id, to: genre.id, type: 'has_genre',
      evidence: [{ source: 'TMDB', field: 'genres', url: 'https://www.themoviedb.org/movie/1' }]
    })),
    ...works.slice(0, 2).map(work => ({
      from: work.id, to: director.id, type: 'directed_by',
      evidence: [{ source: 'TMDB', field: 'directors', url: 'https://www.themoviedb.org/movie/1' }]
    })),
    { from: 'work:d', to: genre.id, type: 'catalog_related_by_shared_metadata', evidence: [{ source: 'VIBECRITIC_D1' }] }
  ]
};

const patterns = deriveCriticalPatterns(graph, 'work:a');
assert.equal(patterns.length, 1, 'Only a pattern repeated across at least three works should be emitted.');
assert.equal(patterns[0].feature, 'Science Fiction');
assert.equal(patterns[0].workCount, 3);
assert.equal(patterns[0].status, 'observed-not-interpreted');
assert.match(patterns[0].interpretation, /لا يثبت/);
assert.equal(deriveCriticalPatterns(graph, 'work:d').length, 0, 'Catalog-derived similarity edges must not become pattern evidence.');
assert.equal(deriveCriticalPatterns(graph, 'missing').length, 0);
assert.match(formatCriticalPatternsContext(patterns), /ثلاثة أعمال مستقلة/);
assert.match(formatCriticalPatternsContext([]), /^$/);
console.log('Critical pattern tests passed.');
