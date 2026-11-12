import fs from 'node:fs/promises';
import path from 'node:path';

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

let updated = 0;
let skipped = 0;
for (const file of files) {
  const fullPath = path.join(root, file);
  const content = await fs.readFile(fullPath, 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  const frontmatter = match[1];
  if (readScalar(frontmatter, 'sourceName') !== 'RAWG') { skipped++; continue; }
  const sourceId = String(readScalar(frontmatter, 'sourceId') || '');
  if (!/^\d+$/.test(sourceId)) { skipped++; continue; }

  try {
    const query = new URLSearchParams({ key: apiKey });
    const response = await fetch('https://api.rawg.io/api/games/' + sourceId + '?' + query, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn('RAWG detail lookup failed for ' + file + ': HTTP ' + response.status);
      continue;
    }
    const detail = await response.json();
    const platforms = [...new Set((detail.platforms || []).map(item => item.platform?.name).filter(Boolean))];
    const stores = [...new Map((detail.stores || []).map(item => {
      const name = item.store?.name || item.name || '';
      return [name, { name, url: item.url || '' }];
    }).filter(([name]) => name)).values()];

    const platformLines = platforms.length ? ['platforms:', ...platforms.map(value => '  - ' + JSON.stringify(value))] : ['platforms: []'];
    const storeLines = stores.length ? ['gameStores:', ...stores.flatMap(store => [
      '  - name: ' + JSON.stringify(store.name),
      ...(store.url ? ['    url: ' + JSON.stringify(store.url)] : []),
    ])] : ['gameStores: []'];

    let nextFrontmatter = replaceBlock(frontmatter, 'platforms', platformLines);
    nextFrontmatter = replaceBlock(nextFrontmatter, 'gameStores', storeLines);
    if (nextFrontmatter === frontmatter) { skipped++; continue; }
    await fs.writeFile(fullPath, content.replace(match[0], '---\n' + nextFrontmatter + '\n---'), 'utf8');
    updated++;
    console.log('Updated RAWG platforms and stores: ' + file);
  } catch (error) {
    console.warn('Game platform backfill skipped for ' + file + ': ' + error.message);
  }
}
console.log('Game platform backfill complete: ' + updated + ' updated, ' + skipped + ' skipped.');
