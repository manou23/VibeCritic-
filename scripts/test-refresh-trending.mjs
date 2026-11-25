import assert from 'node:assert/strict';
import { buildTrendingData } from './refresh-trending.mjs';

const tmdbItems = [
  ...[1,2,3,4].map((id) => ({ id, media_type: 'movie', title: 'Film   ' + id, overview: 'Overview ' + id, popularity: 100-id, poster_path: '/p'+id+'.jpg', backdrop_path: '/b'+id+'.jpg' })),
  ...[11,12,13,14].map((id) => ({ id, media_type: 'tv', name: 'Series ' + id, overview: 'Overview ' + id, popularity: 90-id, poster_path: '/p'+id+'.jpg', backdrop_path: '/b'+id+'.jpg' }))
];
const gameItems = [21,22,23,24].map((id) => ({ id, name: 'Game ' + id, slug: 'game-'+id, added: 500-id, background_image: 'https://example.com/'+id+'.jpg' }));
const now = '2026-11-17T00:00:00.000Z';
const data = buildTrendingData({ tmdbItems, gameItems, now });
assert.equal(data.length, 9);
assert.equal(data.find(x => x.type === 'movie').title, 'Film 1');
assert.deepEqual(['movie','series','game'].map(type => data.filter(x => x.type === type).length), [3,3,3]);
assert.deepEqual(data.map(x => x.rank), [1,2,3,4,5,6,7,8,9]);
assert.ok(data.every(x => x.updatedAt === now && x.snapshotWindow === 'weekly'));
assert.equal(data.find(x => x.type === 'game').trendConfidence, 'متوسط');
assert.equal(data.find(x => x.type === 'game').sourceMetricName, 'RAWG added count (cumulative snapshot)');
assert.throws(() => buildTrendingData({ tmdbItems: [], gameItems }), /expected exactly 3 valid movies, 3 valid series, and 3 valid games/);
assert.throws(() => buildTrendingData({ tmdbItems, gameItems: gameItems.slice(0, 1) }), /expected exactly 3 valid movies, 3 valid series, and 3 valid games/);
console.log('Weekly trending tests passed.');
