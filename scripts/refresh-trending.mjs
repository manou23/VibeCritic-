import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const TMDB_API = 'https://api.themoviedb.org/3';
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

async function request(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Trend source HTTP ' + response.status + ': ' + new URL(url).hostname);
  return response.json();
}

export function buildTrendingData({ tmdbItems = [], gameItems = [], now = new Date().toISOString() } = {}) {
  const movies = tmdbItems.filter(x => x.media_type === 'movie' && x.id && clean(x.title))
    .map(x => ({
      id: String(x.id), sourceId: String(x.id), type: 'movie', title: clean(x.title),
      poster: x.poster_path ? 'https://image.tmdb.org/t/p/w500' + x.poster_path : '',
      backdrop: x.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + x.backdrop_path : '',
      summary: clean(x.overview), sourceUrl: 'https://www.themoviedb.org/movie/' + x.id,
      source: 'TMDB', sourceRank: numeric(x.popularity), popularity: numeric(x.popularity),
      sourceMetricName: 'TMDB weekly trending popularity', sourceMetricValue: numeric(x.popularity),
      trendConfidence: 'مرتفع'
    })).filter(x => x.poster).sort((a,b) => b.popularity-a.popularity).slice(0,3);

  const series = tmdbItems.filter(x => x.media_type === 'tv' && x.id && clean(x.name))
    .map(x => ({
      id: String(x.id), sourceId: String(x.id), type: 'series', title: clean(x.name),
      poster: x.poster_path ? 'https://image.tmdb.org/t/p/w500' + x.poster_path : '',
      backdrop: x.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + x.backdrop_path : '',
      summary: clean(x.overview), sourceUrl: 'https://www.themoviedb.org/tv/' + x.id,
      source: 'TMDB', sourceRank: numeric(x.popularity), popularity: numeric(x.popularity),
      sourceMetricName: 'TMDB weekly trending popularity', sourceMetricValue: numeric(x.popularity),
      trendConfidence: 'مرتفع'
    })).filter(x => x.poster).sort((a,b) => b.popularity-a.popularity).slice(0,3);

  const games = gameItems.filter(x => x.id && clean(x.name))
    .map(x => ({
      id: String(x.id), sourceId: String(x.id), type: 'game', title: clean(x.name),
      poster: clean(x.background_image), backdrop: clean(x.background_image_additional) || clean(x.background_image),
      summary: clean(x.description) || 'تظهر اللعبة ضمن قائمة RAWG المرتبة حسب عدد الإضافات المسجل؛ هذا مؤشر تراكمي وليس عدد إضافات الأسبوع وحده.',
      sourceUrl: 'https://rawg.io/games/' + (clean(x.slug) || x.id),
      source: 'RAWG', sourceRank: numeric(x.added), popularity: numeric(x.added),
      sourceMetricName: 'RAWG added count (cumulative snapshot)', sourceMetricValue: numeric(x.added),
      trendConfidence: 'متوسط'
    })).filter(x => x.poster.startsWith('https://')).sort((a,b) => b.popularity-a.popularity).slice(0,3);

  const groups = [movies, series, games];
  const output = [];
  for (let position = 0; position < 3; position++) {
    for (const group of groups) if (group[position]) output.push({ ...group[position], trendRank: position + 1 });
  }
  if (movies.length !== 3 || series.length !== 3 || games.length !== 3 || output.length !== 9) {
    throw new Error('Weekly trend refresh refused: expected exactly 3 valid movies, 3 valid series, and 3 valid games; existing snapshot was not changed.');
  }
  return output.map((item, index) => ({
    ...item, updatedAt: now, snapshotWindow: 'weekly', rank: index + 1
  }));
}

async function main() {
  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
  const rawgKey = process.env.RAWG_API_KEY;
  if (!tmdbToken || !rawgKey) throw new Error('Missing TMDB_READ_ACCESS_TOKEN or RAWG_API_KEY; existing trend data was not changed.');

  const [tmdb, rawg] = await Promise.all([
    request(TMDB_API + '/trending/all/week?language=ar', { Authorization: 'Bearer ' + tmdbToken }),
    request('https://api.rawg.io/api/games?key=' + encodeURIComponent(rawgKey) + '&ordering=-added&page_size=40')
  ]);
  const data = buildTrendingData({ tmdbItems: Array.isArray(tmdb.results) ? tmdb.results : [], gameItems: Array.isArray(rawg.results) ? rawg.results : [] });
  const output = resolve('src/data/trending.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(output, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Updated weekly trend snapshot:', data.length, 'items');
  for (const type of ['movie', 'series', 'game']) console.log(type + ':', data.filter(x => x.type === type).length);
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => { console.error(error.message); process.exitCode = 1; });
