import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordKnowledge } from './knowledge-graph.mjs';

const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const splitNames = value => [...new Set(String(value ?? '').split('|').map(clean).filter(Boolean))];
const algiersDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

export function mapCatalogRecord(row, endpoint, observedAt = new Date().toISOString()) {
  const tmdbId = String(row?.tmdbId ?? '').trim();
  const sourceType = String(row?.type ?? '');
  if (!/^\d{1,10}$/.test(tmdbId) || !['movie', 'tv'].includes(sourceType)) return null;
  const type = sourceType === 'tv' ? 'series' : 'movie';
  const endpointUrl = new URL(endpoint);
  const sourceUrl = endpointUrl.origin + endpointUrl.pathname;
  const sourceObservedAt = row.updatedAt && Number.isFinite(Date.parse(row.updatedAt))
    ? new Date(row.updatedAt).toISOString()
    : observedAt;
  const genres = splitNames(row.genres);
  const cast = splitNames(row.cast);
  const directors = splitNames(row.directors);
  const creators = splitNames(row.creators);
  const base = {
    tmdbId: Number(tmdbId), type: sourceType,
    title: clean(row.titleAr || row.title), originalTitle: clean(row.title),
    overview: clean(row.overview), releaseDate: clean(row.releaseDate) || null,
    year: Number(row.year) || null, runtime: Number(row.runtime) || null,
    status: clean(row.status) || null,
    rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
    votes: Number(row.votes) || 0,
    popularity: Number.isFinite(Number(row.popularity)) ? Number(row.popularity) : null,
    originalLanguage: clean(row.originalLanguage) || null,
    genres, cast, directors, creators, updatedAt: clean(row.updatedAt) || null
  };
  return {
    id: tmdbId, type, name: base.title || base.originalTitle,
    originalTitle: base.originalTitle, date: base.releaseDate,
    description: base.overview, source: 'VIBECRITIC_D1', sourceUrl, genres,
    metadata: {
      genres, cast, directors, creators, runtime: base.runtime,
      catalogContext: {
        source: 'VibeCritic D1 entertainment catalog',
        sourceUrl, observedAt: sourceObservedAt, base, relatedWorks: []
      }
    }
  };
}

async function readState(statePath) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    return {
      version: 1,
      lastUpdatedAt: clean(state.lastUpdatedAt) || null,
      items: state.items && typeof state.items === 'object' ? state.items : {}
    };
  } catch {
    return { version: 1, lastUpdatedAt: null, items: {} };
  }
}

export async function syncCatalogKnowledge({
  endpoint = process.env.VIBECRITIC_CATALOG_API_URL || 'https://vibecritic.pages.dev/api/catalog',
  statePath = 'data/d1-catalog-sync.json',
  fetchImpl = fetch,
  record = recordKnowledge,
  pageSize = 100
} = {}) {
  const state = await readState(statePath);
  const endpointUrl = new URL(endpoint);
  const sourceUrl = endpointUrl.origin + endpointUrl.pathname;
  let page = 1, pages = 1, scanned = 0, indexed = 0, unchanged = 0;
  let maxUpdatedAt = state.lastUpdatedAt;

  while (page <= pages) {
    const url = new URL(endpoint);
    url.searchParams.set('mode', 'knowledge-export');
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(Math.max(1, Math.min(100, pageSize))));
    if (state.lastUpdatedAt) url.searchParams.set('since', state.lastUpdatedAt);

    let response, lastError;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
        if (response.ok) break;
        lastError = new Error('D1 knowledge export HTTP ' + response.status);
      } catch (error) { lastError = error; }
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!response?.ok) throw lastError || new Error('D1 knowledge export failed.');
    const payload = await response.json();
    if (payload?.available !== true || !Array.isArray(payload.items) || !Number.isFinite(Number(payload.pages))) {
      throw new Error('D1 knowledge export returned an invalid response.');
    }
    pages = Math.max(0, Number(payload.pages));
    for (const row of payload.items) {
      scanned++;
      const key = (row.type === 'tv' ? 'series' : 'movie') + ':' + String(row.tmdbId);
      const updatedAt = clean(row.updatedAt) || 'unknown';
      if (state.items[key] === updatedAt) { unchanged++; continue; }
      const item = mapCatalogRecord(row, sourceUrl);
      if (!item) { unchanged++; continue; }
      await record(item, { today: algiersDate() });
      state.items[key] = updatedAt;
      indexed++;
      if (updatedAt !== 'unknown' && (!maxUpdatedAt || Date.parse(updatedAt) > Date.parse(maxUpdatedAt))) {
        maxUpdatedAt = updatedAt;
      }
    }
    if (!payload.items.length) break;
    page++;
  }

  state.version = 1;
  state.lastUpdatedAt = maxUpdatedAt;
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const temporary = statePath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, statePath);
  const summary = { scanned, indexed, unchanged, pages: Math.max(0, page - 1), cursor: state.lastUpdatedAt, sourceUrl };
  console.log('D1 knowledge sync: ' + indexed + ' indexed, ' + unchanged + ' unchanged, ' + scanned + ' scanned across ' + summary.pages + ' pages.');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncCatalogKnowledge().catch(error => {
    console.error('D1 knowledge sync failed:', error?.message || error);
    process.exitCode = 1;
  });
}
