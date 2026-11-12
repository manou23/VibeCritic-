import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = String(process.env.TMDB_API_KEY || '').trim();
if (!apiKey) {
  console.warn('TMDB_API_KEY is not configured; Arabic title backfill was skipped.');
  process.exit(0);
}

const root = path.resolve('src/content/reviews');
const files = (await fs.readdir(root)).filter(file => file.endsWith('.md')).sort();
const isArabic = value => /[\u0600-\u06FF]/.test(String(value || ''));

function readScalar(frontmatter, key) {
  const line = frontmatter.match(new RegExp('^' + key + ':\\\\s*(.*)$', 'm'));
  if (!line) return '';
  const raw = line[1].trim();
  try { return JSON.parse(raw); } catch { return raw.replace(/^['"]|['"]$/g, ''); }
}

function writeScalar(frontmatter, key, value) {
  const line = key + ': ' + JSON.stringify(String(value || ''));
  const pattern = new RegExp('^' + key + ':.*$', 'm');
  if (pattern.test(frontmatter)) return frontmatter.replace(pattern, line);
  if (key === 'originalTitle') return frontmatter.replace(/^(title:.*)$/m, '$1\n' + line);
  return frontmatter;
}

let updated = 0;
let skipped = 0;
for (const file of files) {
  const fullPath = path.join(root, file);
  const content = await fs.readFile(fullPath, 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  const frontmatter = match[1];
  const type = readScalar(frontmatter, 'type');
  if (type !== 'movie' && type !== 'series') continue;
  const currentTitle = readScalar(frontmatter, 'title');
  const currentOriginal = readScalar(frontmatter, 'originalTitle');
  if (isArabic(currentTitle) && currentOriginal) { skipped++; continue; }
  const sourceId = readScalar(frontmatter, 'sourceId');
  if (!/^\d+$/.test(String(sourceId))) continue;

  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const query = new URLSearchParams({ api_key: apiKey, language: 'ar-SA' });
    const response = await fetch('https://api.themoviedb.org/3/' + endpoint + '/' + sourceId + '?' + query, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn('TMDb title lookup failed for ' + file + ': HTTP ' + response.status);
      continue;
    }
    const detail = await response.json();
    const localizedTitle = detail.title || detail.name || '';
    const originalTitle = detail.original_title || detail.original_name || currentOriginal;
    let nextFrontmatter = frontmatter;
    if (isArabic(localizedTitle)) nextFrontmatter = writeScalar(nextFrontmatter, 'title', localizedTitle);
    if (originalTitle) nextFrontmatter = writeScalar(nextFrontmatter, 'originalTitle', originalTitle);
    if (nextFrontmatter === frontmatter) { skipped++; continue; }
    const nextContent = content.replace(match[0], '---\n' + nextFrontmatter + '\\n---');
    await fs.writeFile(fullPath, nextContent, 'utf8');
    updated++;
    console.log('Updated localized title: ' + file);
  } catch (error) {
    console.warn('Arabic title backfill skipped for ' + file + ': ' + error.message);
  }
}
console.log('Arabic title backfill complete: ' + updated + ' updated, ' + skipped + ' already complete or unavailable.');
