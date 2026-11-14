import assert from 'node:assert/strict';
import { buildTitleStatements, buildRetentionStatements, chunkStatements, sqlValue } from './sync-tmdb.mjs';

assert.equal(sqlValue(null), 'NULL');
assert.equal(sqlValue(4.5), '4.5');
assert.equal(sqlValue(Number.NaN), 'NULL');
assert.equal(sqlValue("O'Brien"), "'O''Brien'");
assert.equal(sqlValue("x'); DROP TABLE titles; --"), "'x''); DROP TABLE titles; --'");

const chunks = chunkStatements(Array.from({ length: 125 }, (_, index) => `SELECT ${index};`), 60);
assert.deepEqual(chunks.map(batch => batch.length), [60, 60, 5]);
assert.throws(() => chunkStatements([], 0), /positive integer/);

const movie = buildTitleStatements({
  id: 550,
  original_title: 'Fight Club',
  title: 'نادي القتال',
  overview: 'ملخص عربي',
  release_date: '1999-10-15',
  runtime: 139,
  vote_average: 8.4,
  vote_count: 1000,
  popularity: 42.2,
  genres: [{ id: 18, name: 'دراما' }],
  credits: {
    cast: [{ id: 10, name: "Brad O'Brien", character: 'Tyler', order: 0 }],
    crew: [{ id: 20, name: 'Director One', job: 'Director' }, { id: 21, name: 'Other Crew', job: 'Editor' }]
  }
}, 'movie', '2026-11-14T00:00:00.000Z');

assert.ok(movie.some(sql => sql.includes("'Fight Club','نادي القتال'")));
assert.ok(movie.some(sql => sql.includes("DELETE FROM title_genres")));
assert.ok(movie.some(sql => sql.includes("DELETE FROM credits")));
assert.ok(movie.some(sql => sql.includes("Brad O''Brien")));
assert.ok(movie.some(sql => sql.includes("'cast','Tyler',NULL,0")));
assert.ok(!movie.some(sql => sql.includes('Other Crew')));

const tv = buildTitleStatements({
  id: 1399,
  original_name: 'Example Series',
  name: 'مسلسل تجريبي',
  first_air_date: '2026-01-01',
  episode_run_time: [52],
  created_by: [{ id: 30, name: 'Creator One' }],
  genres: [],
  credits: { cast: [], crew: [] }
}, 'tv');
assert.ok(tv.some(sql => sql.includes("'Example Series','مسلسل تجريبي'")));
assert.ok(tv.some(sql => sql.includes("'Creator One'")));
assert.ok(tv.some(sql => sql.includes("'Creator'")));

const retention = buildRetentionStatements();
assert.equal(retention.length, 3);
assert.ok(retention[0].includes("julianday('now', '-179 days')"));
assert.ok(retention[1].includes('FROM credits'));
assert.ok(retention[2].includes('FROM title_genres'));

assert.throws(() => buildTitleStatements({ id: 1 }, 'game'), /Invalid TMDB title/);
assert.throws(() => buildTitleStatements({ id: 1 }, 'movie'), /missing its name/);

console.log('TMDB D1 sync tests passed.');
