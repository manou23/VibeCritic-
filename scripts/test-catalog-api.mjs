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
console.log('Catalog API tests passed.');
