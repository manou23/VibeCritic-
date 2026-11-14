import assert from 'node:assert/strict';
import { hasCompleteRawgMetadata, normalizeGameTitle, selectExactRawgMatch } from './rawg-catalog-utils.mjs';

assert.equal(normalizeGameTitle('Hádès II: The Witch of the Underworld'), 'hades ii the witch of the underworld');
const unique = [{ id: 1, name: 'Hades II', released: '2025-09-25' }];
assert.equal(selectExactRawgMatch(unique, 'Hades II', '2025-09-25')?.id, 1);
assert.equal(selectExactRawgMatch([{ id: 1, name: 'Hades II' }, { id: 2, name: 'Hades II' }], 'Hades II', ''), null);
assert.equal(selectExactRawgMatch([{ id: 1, name: 'Game X', released: '2020-01-01' }, { id: 2, name: 'Game X', released: '2025-01-01' }], 'Game X', '2025-06-01')?.id, 2);
assert.equal(selectExactRawgMatch([{ id: 1, name: 'Game X', released: '2010-01-01' }, { id: 2, name: 'Game X', released: '2020-01-01' }], 'Game X', '2025-06-01'), null);
assert.equal(selectExactRawgMatch([{ id: 1, name: 'Other Game' }], 'Game X', '2025-01-01'), null);

const complete = ['rawgSourceId: 123','rawgSourceUrl: "https://rawg.io/games/hades-ii"','rawgReleaseDate: "2025-09-25"','rawgGenres:','rawgPlatforms: []','rawgDevelopers: []'].join('\n');
assert.equal(hasCompleteRawgMetadata(complete), true);
assert.equal(hasCompleteRawgMetadata(complete.replace('https://rawg.io/games/hades-ii', 'https://attacker.example/games/hades-ii')), false);
assert.equal(hasCompleteRawgMetadata(complete.replace('rawgDevelopers: []\n', '')), false);
console.log('RAWG backfill utility tests passed: exact identity, ambiguity rejection, year matching, provenance URL and idempotent metadata detection.');
