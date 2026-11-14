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
            if (sql.startsWith('SELECT COALESCE(g.name_ar,g.name_en) AS name FROM title_genres')) return { results: [{ name: 'دراما' }, { name: 'خيال علمي' }] };
            if (sql.startsWith('SELECT p.name,c.kind,c.job,c.character FROM credits')) return { results: [
              { name: 'ممثل أول', kind: 'cast', character: 'البطل' },
              { name: 'ممثل ثان', kind: 'cast', character: 'الصديق' },
              { name: 'ممثل ثالث', kind: 'cast', character: null },
              { name: 'مخرج معروف', kind: 'crew', job: 'Director' },
              { name: 'كاتب معروف', kind: 'crew', job: 'Writer' }
            ] };
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
          async first() { return { id: 9, tmdb_id: 123, type: 'movie', title: 'Original Film', title_ar: 'فيلم أساسي', overview_ar: 'وصف كتالوجي موثق للعمل.', release_date: '2024-06-01', year: 2024, runtime: 120, status: 'Released', rating: 7.5, votes: 1200, popularity: 44, original_language: 'en', updated_at: '2026-11-14' }; },
          async all() {
            if (sql.startsWith('SELECT COALESCE(g.name_ar,g.name_en) AS name FROM title_genres')) return { results: [{ name: 'دراما' }, { name: 'خيال علمي' }] };
            if (sql.startsWith('SELECT p.name,c.kind,c.job,c.character FROM credits')) return { results: [
              { name: 'ممثل أول', kind: 'cast', character: 'البطل' },
              { name: 'ممثل ثان', kind: 'cast', character: 'الصديق' },
              { name: 'ممثل ثالث', kind: 'cast', character: null },
              { name: 'مخرج معروف', kind: 'crew', job: 'Director' },
              { name: 'كاتب معروف', kind: 'crew', job: 'Writer' }
            ] };
            return { results: [{ tmdb_id: 456, type: 'movie', title: 'عمل مرتبط', year: 2020, sharedGenreCount: 2, sharedPersonCount: 1, sharedGenres: 'دراما، خيال', sharedPeople: 'مخرج مشترك' }] };
          }
        };
      } };
    }
  } }
});
assert.equal(contextResponse.status, 200);
const context = await contextResponse.json();
assert.equal(context.available, true);
assert.equal(context.base.title, 'فيلم أساسي');
assert.equal(context.base.originalTitle, 'Original Film');
assert.deepEqual(context.base.genres, ['دراما', 'خيال علمي']);
assert.deepEqual(context.base.cast, ['ممثل أول بدور البطل', 'ممثل ثان بدور الصديق', 'ممثل ثالث']);
assert.deepEqual(context.base.directors, ['مخرج معروف']);
assert.equal(context.base.runtime, 120);
assert.equal(context.relatedWorks[0].title, 'عمل مرتبط');
assert.equal(context.relatedWorks[0].sharedPersonCount, 1);
assert.ok(calls.some(call => call.sql.includes('sharedGenreCount') && call.values.length === 7));
const knowledgeExportResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=knowledge-export&page=2&limit=50&since=2026-11-01T00:00:00Z'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      return { bind(...values) {
        calls.push({ sql, values });
        return {
          async first() { return { total: 125 }; },
          async all() {
            assert.ok(sql.includes('AS tmdbId'));
            assert.ok(sql.includes('AS directors'));
            assert.ok(sql.includes('AS creators'));
            return { results: [{
              tmdbId: 789, type: 'tv', title: 'Original Series', titleAr: 'مسلسل أصلي',
              overview: 'وصف كتالوجي', releaseDate: '2025-01-01', year: 2025,
              runtime: 48, status: 'Returning Series', rating: 8.1, votes: 500,
              popularity: 20, originalLanguage: 'en', updatedAt: '2026-11-10 00:00:00',
              genres: 'دراما | خيال', cast: 'ممثل أ | ممثل ب',
              directors: 'مخرج أ', creators: 'مبدع أ'
            }] };
          }
        };
      } };
    }
  } }
});
assert.equal(knowledgeExportResponse.status, 200);
const knowledgeExport = await knowledgeExportResponse.json();
assert.equal(knowledgeExport.total, 125);
assert.equal(knowledgeExport.pages, 3);
assert.equal(knowledgeExport.items[0].tmdbId, 789);
assert.equal(knowledgeExport.items[0].genres, 'دراما | خيال');
assert.equal(knowledgeExport.items[0].directors, 'مخرج أ');
assert.ok(calls.some(call => call.sql.includes('datetime(t.updated_at) > datetime(?)') && call.values.includes('2026-11-01T00:00:00Z')));
const invalidKnowledgeCursor = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=knowledge-export&since=not-a-date'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidKnowledgeCursor.status, 400);

const cachedResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-cache&tmdb_id=123&type=movie'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      assert.ok(sql.includes('FROM editorial_cache'));
      return { bind(...values) {
        assert.deepEqual(values, [123, 'movie']);
        return { async first() { return { payload: JSON.stringify({ title: 'عمل محفوظ', genres: ['دراما'] }), cached_at: '2026-11-14T00:00:00Z' }; } };
      } };
    }
  } }
});
assert.equal(cachedResponse.status, 200);
const cachedPayload = await cachedResponse.json();
assert.equal(cachedPayload.available, true);
assert.equal(cachedPayload.payload.title, 'عمل محفوظ');
const cacheMissResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-cache&tmdb_id=999&type=movie'),
  env: { ENTERTAINMENT_DB: { prepare() { return { bind() { return { async first() { return null; } }; } }; } } }
});
assert.equal((await cacheMissResponse.json()).available, false);
const invalidCache = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-cache&tmdb_id=x&type=movie'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidCache.status, 400);

const sourceCacheResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=source-cache&cache_key=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      assert.ok(sql.includes('FROM source_cache'));
      return { bind(...values) {
        assert.deepEqual(values, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
        return { async first() { return { payload: JSON.stringify({ results: [{ id: 77 }] }), source: 'TMDB', cached_at: '2026-11-14T00:00:00Z' }; } };
      } };
    }
  } }
});
assert.equal(sourceCacheResponse.status, 200);
const sourceCachePayload = await sourceCacheResponse.json();
assert.equal(sourceCachePayload.available, true);
assert.equal(sourceCachePayload.payload.results[0].id, 77);
const invalidSourceCache = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=source-cache&cache_key=bad-key'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidSourceCache.status, 400);

const libraryResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-library&type=movie'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      if (sql.includes("work_type='all'")) {
        return { async all() { return { results: [{ slug: 'evidence-before-opinion', title: 'من المعلومة إلى الحجة', work_type: 'all', prompt_excerpt: 'اربط الحقيقة بالتفسير والأثر.' }] }; } };
      }
      assert.ok(sql.includes('LIMIT 6'));
      return { bind(...values) {
        assert.deepEqual(values, ['movie']);
        return { async all() { return { results: [
          { slug: 'screenplay-causality', title: 'السيناريو', work_type: 'movie', prompt_excerpt: 'اختبر السببية.' },
          { slug: 'sound-design-and-mix', title: 'الصوت والموسيقى', work_type: 'movie', prompt_excerpt: 'حلّل الصوت.' },
          { slug: 'editing-rhythm-and-continuity', title: 'المونتاج', work_type: 'movie', prompt_excerpt: 'حلّل القطع.' },
          { slug: 'production-design-and-space', title: 'التصميم الفني', work_type: 'movie', prompt_excerpt: 'حلّل المكان.' },
          { slug: 'documentary-evidence-and-ethics', title: 'النقد الوثائقي', work_type: 'movie', prompt_excerpt: 'اختبر الدليل.' },
          { slug: 'visual-direction', title: 'الإخراج', work_type: 'movie', prompt_excerpt: 'حلّل الصورة.' }
        ] }; } };
      } };
    }
  } }
});
assert.equal(libraryResponse.status, 200);
const libraryPayload = await libraryResponse.json();
assert.equal(libraryPayload.available, true);
assert.equal(libraryPayload.articles.length, 7);
assert.deepEqual(libraryPayload.articles.slice(1).map(article => article.slug), [
  'screenplay-causality', 'sound-design-and-mix', 'editing-rhythm-and-continuity',
  'production-design-and-space', 'documentary-evidence-and-ethics', 'visual-direction'
]);
assert.equal(libraryPayload.articles[0].work_type, 'all');
assert.equal(libraryPayload.articles[1].work_type, 'movie');

const libraryArticleResponse = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-library&type=movie&slug=screenplay-causality'),
  env: { ENTERTAINMENT_DB: {
    prepare(sql) {
      assert.ok(sql.includes('SELECT slug,title,work_type,topic,summary,body'));
      return { bind(...values) {
        assert.deepEqual(values, ['screenplay-causality']);
        return { async first() { return { slug: 'screenplay-causality', title: 'السيناريو', work_type: 'movie', body: 'مقال مرجعي كامل' }; } };
      } };
    }
  } }
});
assert.equal(libraryArticleResponse.status, 200);
assert.equal((await libraryArticleResponse.json()).article.body, 'مقال مرجعي كامل');

const invalidLibrary = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-library&type=unknown'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidLibrary.status, 400);

const invalidContext = await onRequestGet({
  request: new Request('https://vibecritic.pages.dev/api/catalog?mode=editorial-context&tmdb_id=x&type=movie'),
  env: { ENTERTAINMENT_DB: db }
});
assert.equal(invalidContext.status, 400);

console.log('Catalog API tests passed.');
