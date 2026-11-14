import fs from 'node:fs/promises';
import path from 'node:path';
import { hasCompleteRawgMetadata, selectExactRawgMatch } from './rawg-catalog-utils.mjs';

const apiKey = String(process.env.RAWG_API_KEY || '').trim();
if (!apiKey) {
  console.warn('RAWG_API_KEY is not configured; game platform backfill was skipped.');
  process.exit(0);
}

const root = path.resolve('src/content/reviews');
const files = (await fs.readdir(root)).filter(file => file.endsWith('.md') && file.startsWith('game-')).sort();
function readScalar(frontmatter, key) {
  const line = frontmatter.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  if (!line) return '';
  const raw = line[1].trim();
  try { return JSON.parse(raw); } catch { return raw.replace(/^['"]|['"]$/g, ''); }
}

function replaceBlock(frontmatter, key, replacementLines) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(key + ':'));
  if (start < 0) return [...lines, ...replacementLines].join('\n');
  let end = start + 1;
  while (end < lines.length && (/^\s/.test(lines[end]) || lines[end].trim() === '')) end++;
  lines.splice(start, end - start, ...replacementLines);
  return lines.join('\n');
}

async function rawgDetail(id) {
  const query = new URLSearchParams({ key: apiKey });
  const response = await fetch('https://api.rawg.io/api/games/' + id + '?' + query, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('RAWG detail HTTP ' + response.status);
  return response.json();
}

async function findRawgMatch(title, year) {
  if (!title) return null;
  const query = new URLSearchParams({ key: apiKey, search: String(title), page_size: '10' });
  const response = await fetch('https://api.rawg.io/api/games?' + query, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('RAWG search HTTP ' + response.status);
  const results = (await response.json()).results || [];
  return selectExactRawgMatch(results, title, year);
}

let updated = 0;
let skipped = 0;
for (const file of files) {
  const fullPath = path.join(root, file);
  const content = await fs.readFile(fullPath, 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  const frontmatter = match[1];
  const sourceName = String(readScalar(frontmatter, 'sourceName') || '');
  const sourceId = String(readScalar(frontmatter, 'sourceId') || '');
  const title = readScalar(frontmatter, 'title');
  const originalTitle = readScalar(frontmatter, 'originalTitle');
  const releaseDate = readScalar(frontmatter, 'releaseDate');

  try {
    if (hasCompleteRawgMetadata(frontmatter)) {
      skipped++;
      console.log('RAWG metadata already indexed; avoiding repeat API calls: ' + file);
      continue;
    }
    let detail;
    const savedRawgId = String(readScalar(frontmatter, 'rawgSourceId') || '');
    const knownRawgId = /^\d+$/.test(savedRawgId) ? savedRawgId
      : sourceName === 'RAWG' && /^\d+$/.test(sourceId) ? sourceId : '';
    if (knownRawgId) {
      detail = await rawgDetail(knownRawgId);
    } else {
      const matchByTitle = await findRawgMatch(originalTitle || title, releaseDate);
      if (!matchByTitle) { skipped++; console.log('No unique exact RAWG title/year match; leaving metadata unchanged: ' + file); continue; }
      detail = await rawgDetail(matchByTitle.id);
    }

    const platforms = [...new Set((detail.platforms || []).map(item => item.platform?.name).filter(Boolean))];
    const genres = [...new Set((detail.genres || []).map(item => item.name).filter(Boolean))];
    const developers = [...new Set((detail.developers || []).map(item => item.name).filter(Boolean))];
    const rawgSourceUrl = detail.slug ? 'https://rawg.io/games/' + encodeURIComponent(detail.slug) : '';
    if (!rawgSourceUrl || !Number.isFinite(Number(detail.id))) {
      skipped++;
      console.log('RAWG response missing a stable ID or canonical slug; leaving metadata unchanged: ' + file);
      continue;
    }
    const stores = [...new Map((detail.stores || []).map(item => {
      const name = item.store?.name || item.name || '';
      return [name, { name, url: item.url || '' }];
    }).filter(([name]) => name)).values()];

    const platformLines = platforms.length ? ['platforms:', ...platforms.map(value => '  - ' + JSON.stringify(value))] : ['platforms: []'];
    const storeLines = stores.length ? ['gameStores:', ...stores.flatMap(store => [
      '  - name: ' + JSON.stringify(store.name),
      ...(store.url ? ['    url: ' + JSON.stringify(store.url)] : []),
    ])] : ['gameStores: []'];

    const rawgFields = [
      ['rawgSourceId', [String(detail.id)]],
      ['rawgSourceUrl', [JSON.stringify(rawgSourceUrl)]],
      ['rawgReleaseDate', [JSON.stringify(detail.released || '')]],
      ['rawgGenres', genres.length ? genres.map(value => '  - ' + JSON.stringify(value)) : ['[]']],
      ['rawgPlatforms', platforms.length ? platforms.map(value => '  - ' + JSON.stringify(value)) : ['[]']],
      ['rawgDevelopers', developers.length ? developers.map(value => '  - ' + JSON.stringify(value)) : ['[]']]
    ];
    let nextFrontmatter = frontmatter;
    for (const [key, values] of rawgFields) {
      const lines = values.length === 1 && values[0] === '[]' ? [key + ': []']
        : values.length === 1 && !values[0].startsWith('  - ') ? [key + ': ' + values[0]]
        : [key + ':', ...values];
      nextFrontmatter = replaceBlock(nextFrontmatter, key, lines);
    }
    nextFrontmatter = replaceBlock(nextFrontmatter, 'gameStores', storeLines);
    if (nextFrontmatter === frontmatter) { skipped++; continue; }
    await fs.writeFile(fullPath, content.replace(match[0], '---\n' + nextFrontmatter + '\n---'), 'utf8');
    updated++;
    console.log('Updated separate RAWG catalog source metadata and game stores: ' + file);
  } catch (error) {
    console.warn('Game platform backfill skipped for ' + file + ': ' + error.message);
  }
}
console.log('RAWG catalog backfill complete: ' + updated + ' updated, ' + skipped + ' skipped.');
