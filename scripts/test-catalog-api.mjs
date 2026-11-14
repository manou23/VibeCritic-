import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/catalog.js';

function makeDb() {
  const calls = [];
  const db = {
    prepare(sql) {
      return { bind(...values) {
        calls.push({ sql, values });
        return {
          async first() { return { total: 1 }; },
          async all() {
            if (sql.includes('FROM genres')) return { results: [{ id: 1, name_ar: 'دراما' }] };
            return { results: [{ id: 7, title_ar: 'اختبار عربي', type: 'movie' }] };
          }
        };
      } };
    }
  };
  return { db, calls };
}
const { db, calls } = makeDb();
const response = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?q=اختبار عربي&type=movie&year=2024'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.total, 1);
assert.equal(payload.items[0].title_ar, 'اختبار عربي');
assert.equal(calls.length, 2);
assert.ok(calls.every(call => !call.sql.includes('اختبار عربي')));
assert.ok(calls[0].values.includes('movie'));
assert.ok(calls[0].values.includes(2024));
const invalid = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?id=not-a-number'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalid.status, 400);
const missing = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog'),
  env: {}
});
assert.equal(missing.status, 503);

const contextResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-context&tmdb_id=123&type=movie'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      return { bind(...values) {
        calls.push({ sql, values });
        return {
          async first() { return { id: 9, tmdb_id: 123, type: 'movie', title: 'فيلم أساسي', year: 2024, updated_at: '2026-11-14' }; },
          async all() { return { results: [{ tmdb_id: 456, type: 'movie', title: 'عمل مرتبط', year: 2020, sharedGenreCount: 2, sharedPersonCount: 1, sharedGenres: 'دراما، خيال', sharedPeople: 'مخرج مشترك' }] }; }
        };
      } };
    }
  } }
});
assert.equal(contextResponse.status, 200);
const context = await contextResponse.json();
assert.equal(context.available, true);
assert.equal(context.relatedWorks[0].title, 'عمل مرتبط');
assert.equal(context.relatedWorks[0].sharedPersonCount, 1);
assert.ok(calls.some(call => call.sql.includes('sharedGenreCount') && call.values.length === 7));
const invalidContext = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-context&tmdb_id=x&type=movie'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidContext.status, 400);

console.log('Catalog API tests passed.');
