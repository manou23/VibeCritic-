import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mapCatalogRecord, syncCatalogKnowledge } from './ingest-d1-catalog-knowledge.mjs';

const endpoint = 'https://vibecritic.pages.dev/api/catalog';
const row = {
  tmdbId: 123, type: 'tv', title: 'Original Series', titleAr: 'مسلسل أصلي',
  overview: 'وصف موثق من كتالوج D1.', releaseDate: '2025-03-01',
  year: 2025, runtime: 48, status: 'Returning Series', rating: 8.1,
  votes: 900, popularity: 22, originalLanguage: 'en',
  updatedAt: '2026-11-01T10:00:00.000Z',
  genres: 'دراما | خيال | دراما', cast: 'ممثل أ | ممثل ب',
  directors: 'مخرج أ', creators: 'مبدع أ'
};
const mapped = mapCatalogRecord(row, endpoint);
assert.equal(mapped.type, 'series');
assert.equal(mapped.source, 'VIBECRITIC_D1');
assert.equal(mapped.name, 'مسلسل أصلي');
assert.deepEqual(mapped.genres, ['دراما', 'خيال']);
assert.deepEqual(mapped.metadata.directors, ['مخرج أ']);
assert.equal(mapped.metadata.catalogContext.base.rating, 8.1);
assert.equal(mapped.metadata.catalogContext.base.votes, 900);
assert.equal(mapCatalogRecord({ ...row, tmdbId: 'invalid' }, endpoint), null);

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-d1-knowledge-'));
const statePath = path.join(directory, 'data', 'd1-catalog-sync.json');
const recorded = [];
const pages = {
  1: { available: true, pages: 2, total: 2, items: [row] },
  2: { available: true, pages: 2, total: 2, items: [{ ...row, tmdbId: 456, title: 'Second Film', titleAr: 'فيلم ثان', type: 'movie', updatedAt: '2026-11-02T10:00:00.000Z' }] }
};
const firstRun = await syncCatalogKnowledge({
  endpoint, statePath, pageSize: 1,
  fetchImpl: async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('mode'), 'knowledge-export');
    return new Response(JSON.stringify(pages[Number(parsed.searchParams.get('page'))]), { status: 200 });
  },
  record: async item => recorded.push(item)
});
assert.equal(firstRun.scanned, 2);
assert.equal(firstRun.indexed, 2);
assert.equal(recorded.length, 2);
assert.equal(recorded[0].metadata.catalogContext.source, 'VibeCritic D1 entertainment catalog');
assert.equal(recorded[1].type, 'movie');
const saved = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(saved.lastUpdatedAt, '2026-11-02T10:00:00.000Z');
assert.equal(Object.keys(saved.items).length, 2);

let incrementalCursor = '';
const secondRun = await syncCatalogKnowledge({
  endpoint, statePath,
  fetchImpl: async url => {
    const parsed = new URL(url);
    incrementalCursor = parsed.searchParams.get('since');
    return new Response(JSON.stringify({ available: true, pages: 0, total: 0, items: [] }), { status: 200 });
  },
  record: async item => recorded.push(item)
});
assert.equal(incrementalCursor, '2026-11-02T10:00:00.000Z');
assert.equal(secondRun.indexed, 0);
assert.equal(recorded.length, 2);
await fs.rm(directory, { recursive: true, force: true });
console.log('D1 catalog knowledge ingestion tests passed.');
