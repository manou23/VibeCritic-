import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.themoviedb.org/3';
const OUTPUT_DIR = resolve('sync-batches');
const DEFAULT_PAGES = 3;
const MAX_PAGES = 20;
const STATEMENTS_PER_BATCH = 60;

export function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return "'" + String(value).replaceAll("'", "''") + "'";
}

export function chunkStatements(statements, size = STATEMENTS_PER_BATCH) {
  if (!Number.isInteger(size) || size < 1) throw new Error('Batch size must be a positive integer.');
  const batches = [];
  for (let i = 0; i < statements.length; i += size) batches.push(statements.slice(i, i + size));
  return batches;
}

const numeric = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clean = value => typeof value === 'string' && value.trim() ? value.trim() : null;

export function buildTitleStatements(data, type, now = new Date().toISOString()) {
  if (!data || !Number.isInteger(data.id) || !['movie', 'tv'].includes(type)) {
    throw new Error('Invalid TMDB title or media type.');
  }

  const date = clean(data.release_date) || clean(data.first_air_date);
  const originalTitle = clean(data.original_title) || clean(data.original_name) || clean(data.title) || clean(data.name);
  const localizedTitle = clean(data.title) || clean(data.name) || originalTitle;
  if (!originalTitle) throw new Error('TMDB title is missing its name.');

  const runtime = numeric(data.runtime) ?? numeric(data.episode_run_time?.[0]);
  const statements = [
    `INSERT INTO titles (tmdb_id,type,title,title_ar,overview_ar,release_date,year,runtime,status,rating,votes,popularity,poster_path,backdrop_path,original_language,updated_at) VALUES (${[
      data.id, type, originalTitle, localizedTitle, clean(data.overview), date,
      date ? Number(date.slice(0, 4)) : null, runtime, clean(data.status),
      numeric(data.vote_average), numeric(data.vote_count), numeric(data.popularity),
      clean(data.poster_path), clean(data.backdrop_path), clean(data.original_language), now
    ].map(sqlValue).join(',')})
    ON CONFLICT(tmdb_id,type) DO UPDATE SET
      title=excluded.title,title_ar=excluded.title_ar,overview_ar=excluded.overview_ar,
      release_date=excluded.release_date,year=excluded.year,runtime=excluded.runtime,
      status=excluded.status,rating=excluded.rating,votes=excluded.votes,
      popularity=excluded.popularity,poster_path=excluded.poster_path,
      backdrop_path=excluded.backdrop_path,original_language=excluded.original_language,
      updated_at=excluded.updated_at;`,
    `DELETE FROM title_genres WHERE title_id=(SELECT id FROM titles WHERE tmdb_id=${data.id} AND type=${sqlValue(type)});`
  ];

  for (const genre of Array.isArray(data.genres) ? data.genres : []) {
    if (!Number.isInteger(genre.id)) continue;
    statements.push(
      `INSERT INTO genres (id,name_ar) VALUES (${genre.id},${sqlValue(clean(genre.name))})
       ON CONFLICT(id) DO UPDATE SET name_ar=excluded.name_ar;`,
      `INSERT OR IGNORE INTO title_genres (title_id,genre_id)
       SELECT id,${genre.id} FROM titles WHERE tmdb_id=${data.id} AND type=${sqlValue(type)};`
    );
  }

  statements.push(
    `DELETE FROM credits WHERE title_id=(SELECT id FROM titles WHERE tmdb_id=${data.id} AND type=${sqlValue(type)});`
  );

  const cast = (Array.isArray(data.credits?.cast) ? data.credits.cast : [])
    .slice(0, 15)
    .map((person, index) => ({ ...person, kind: 'cast', sortOrder: numeric(person.order) ?? index }));
  const directors = (Array.isArray(data.credits?.crew) ? data.credits.crew : [])
    .filter(person => person.job === 'Director')
    .map((person, index) => ({ ...person, kind: 'crew', sortOrder: index }));
  const creators = (type === 'tv' && Array.isArray(data.created_by) ? data.created_by : [])
    .map((person, index) => ({ ...person, job: 'Creator', character: null, kind: 'crew', sortOrder: index }));
  const seen = new Set();

  for (const person of [...cast, ...directors, ...creators]) {
    if (!Number.isInteger(person.id) || !clean(person.name)) continue;
    const character = clean(person.character);
    const job = clean(person.job);
    const identity = [person.id, person.kind, character, job].join('|');
    if (seen.has(identity)) continue;
    seen.add(identity);

    statements.push(
      `INSERT INTO people (tmdb_id,name,profile_path) VALUES (${person.id},${sqlValue(clean(person.name))},${sqlValue(clean(person.profile_path))})
       ON CONFLICT(tmdb_id) DO UPDATE SET name=excluded.name,profile_path=excluded.profile_path;`,
      `INSERT OR IGNORE INTO credits (title_id,person_id,kind,character,job,sort_order)
       SELECT t.id,p.id,${sqlValue(person.kind)},${sqlValue(character)},${sqlValue(job)},${sqlValue(person.sortOrder)}
       FROM titles t JOIN people p ON p.tmdb_id=${person.id}
       WHERE t.tmdb_id=${data.id} AND t.type=${sqlValue(type)};`
    );
  }

  return statements;
}

async function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

async function get(path, params = {}) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) throw new Error('Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret.');

  const query = new URLSearchParams({ language: 'ar', ...params });
  let lastError;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${API}${path}?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(25000)
      });
      if (response.ok) return await response.json();

      const retryable = response.status === 429 || response.status >= 500;
      const retryAfter = Number(response.headers.get('retry-after'));
      lastError = new Error(`TMDB ${response.status} for ${path}`);
      if (!retryable || attempt === 3) throw lastError;
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15000)
        : 800 * (2 ** attempt));
    } catch (error) {
      lastError = error;
      if (attempt === 3 || String(error.message).startsWith('TMDB 4')) throw error;
      await sleep(800 * (2 ** attempt));
    }
  }
  throw lastError || new Error(`TMDB request failed: ${path}`);
}

async function main() {
  const pages = Number(process.env.PAGES || DEFAULT_PAGES);
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) {
    throw new Error("PAGES must be an integer from 1 to ${MAX_PAGES}.");
  }
  if (!process.env.TMDB_READ_ACCESS_TOKEN) {
    throw new Error('Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret.');
  }

  const now = new Date().toISOString();
  const statements = [];
  let processed = 0;

  for (const type of ['movie', 'tv']) {
    const ids = new Set();
    for (let page = 1; page <= pages; page++) {
      const listing = await get(`/discover/${type}`, {
        sort_by: 'popularity.desc',
        'vote_count.gte': '100',
        page: String(page)
      });
      for (const item of listing.results || []) ids.add(item.id);
    }

    for (const id of ids) {
      const detail = await get(`/${type}/${id}`, { append_to_response: 'credits' });
      statements.push(...buildTitleStatements(detail, type, now));
      processed++;
      if (processed % 10 === 0) console.log(`Prepared ${processed} titles...`);
      await sleep(80);
    }
  }

  if (!statements.length) throw new Error('TMDB returned no title records; refusing to write an empty sync.');

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const batches = chunkStatements(statements);
  for (let index = 0; index < batches.length; index++) {
    const name = `batch-${String(index + 1).padStart(4, '0')}.sql`;
    await writeFile(resolve(OUTPUT_DIR, name), batches[index].join('\n') + '\n', 'utf8');
  }

  console.log(`Prepared ${processed} titles in ${batches.length} SQL batches (${statements.length} statements).`);
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});