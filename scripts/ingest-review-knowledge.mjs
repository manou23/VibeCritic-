import fs from 'node:fs/promises';
import path from 'node:path';
import { recordEditorialReview } from './knowledge-graph.mjs';

const directory = 'src/content/reviews';
const clean = value => String(value ?? '').replace(/[\\r\\n]+/g, ' ').trim();

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\\d+(?:\\.\\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch {}
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value.replace(/\\s+#.*$/, '').trim();
}

export function parseReviewMarkdown(markdown, filename = '') {
  const match = String(markdown).match(/^---\\s*\\r?\\n([\\s\\S]*?)\\r?\\n---\\s*(?:\\r?\\n|$)([\\s\\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  const lines = match[1].split(/\\r?\\n/);
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i].match(/^([A-Za-z][A-Za-z0-9_-]*):\\s*(.*)$/);
    if (!field) continue;
    const key = field[1];
    const raw = field[2];
    if (raw.trim()) {
      frontmatter[key] = parseScalar(raw);
      continue;
    }
    const values = [];
    while (i + 1 < lines.length && /^\\s+-\\s+/.test(lines[i + 1])) {
      values.push(parseScalar(lines[++i].replace(/^\\s+-\\s+/, '')));
    }
    if (values.length) frontmatter[key] = values;
  }
  const type = frontmatter.type === 'tv' ? 'series' : frontmatter.type;
  if (!['game', 'movie', 'series'].includes(type)) return null;
  const body = match[2].replace(/^\\s+/, '').replace(/^>.*$/gm, '').replace(/^#{1,6}\\s+/gm, '').replace(/\\s+/g, ' ').trim();
  const title = clean(frontmatter.title || frontmatter.originalTitle || path.basename(filename, '.md'));
  const sourceId = clean(frontmatter.sourceId || '');
  const scores = {
    storyScore: frontmatter.storyScore,
    visualsScore: frontmatter.visualsScore,
    soundScore: frontmatter.soundScore,
    pacingScore: frontmatter.pacingScore
  };
  return {
    key: type + ':' + (sourceId || path.basename(filename, '.md')),
    sourceId,
    type,
    title,
    originalTitle: frontmatter.originalTitle,
    headline: frontmatter.headline,
    summary: frontmatter.summary,
    verdict: frontmatter.verdict,
    score: frontmatter.score,
    scores,
    tags: frontmatter.tags,
    pros: frontmatter.pros,
    cons: frontmatter.cons,
    creator: frontmatter.creator,
    aiGenerated: frontmatter.aiGenerated,
    releaseDate: frontmatter.releaseDate || frontmatter.date,
    sourceName: frontmatter.sourceName,
    sourceUrl: frontmatter.sourceUrl,
    sourcePath: filename,
    excerpt: body.slice(0, 1800)
  };
}

const files = (await fs.readdir(directory)).filter(name => name.endsWith('.md')).sort();
let indexed = 0;
let skipped = 0;
for (const file of files) {
  const sourcePath = path.join(directory, file);
  const review = parseReviewMarkdown(await fs.readFile(sourcePath, 'utf8'), file);
  if (!review) { skipped++; continue; }
  if (await recordEditorialReview(review)) indexed++;
}
console.log('Editorial review knowledge index: ' + indexed + ' changed, ' + (files.length - skipped - indexed) + ' unchanged, ' + skipped + ' skipped; scanned ' + files.length + ' files.');
