import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS = /^https:\/\/\S+$/i;

function frontmatterOf(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('Missing YAML frontmatter.');
  return { raw: match[1], body: markdown.slice(match[0].length) };
}
function scalar(raw, key) {
  const match = raw.match(new RegExp('^' + key + ':\\s*(.*?)\\s*$', 'm'));
  if (!match) return null;
  return match[1].replace(/^(['"])(.*)\1$/, '$2').trim();
}
function listCount(raw, key) {
  const match = raw.match(new RegExp('^' + key + ':\\s*\\r?\\n((?:[ \\t]+-.*\\r?\\n?)+)', 'm'));
  return match ? (match[1].match(/^[ \t]+-\s*\S/gm) || []).length : 0;
}
function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function numeric(raw, key) {
  const value = scalar(raw, key);
  return value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}
function validateArticle(file, markdown) {
  const slug = file.replace(/\.md$/i, '');
  if (!SLUG.test(slug)) throw new Error(file + ': filename must be a lowercase kebab-case slug.');
  const { raw, body } = frontmatterOf(markdown);
  const required = ['title', 'headline', 'summary', 'type', 'date', 'sourceId', 'sourceUrl', 'poster', 'backdrop', 'youtubeVideoId', 'youtubeVideoTitle', 'mediaVerified'];
  for (const key of required) if (!scalar(raw, key)) throw new Error(file + ': missing required field ' + key + '.');
  if (!['movie', 'series', 'game'].includes(scalar(raw, 'type'))) throw new Error(file + ': type must be movie, series, or game.');
  if (scalar(raw, 'aiGenerated') !== 'false') throw new Error(file + ': manual articles must set aiGenerated: false.');
  if (scalar(raw, 'editorialWorkflow') !== 'manual-assisted') throw new Error(file + ': manual articles must set editorialWorkflow: manual-assisted.');
  if (scalar(raw, 'reviewMode') !== 'review') throw new Error(file + ': only completed reviews can enter the manual publisher.');
  for (const key of ['sourceUrl', 'poster', 'backdrop']) {
    const value = scalar(raw, key);
    if (!HTTPS.test(value || '')) throw new Error(file + ': ' + key + ' must be an HTTPS URL.');
  }
  if (scalar(raw, 'mediaVerified') !== 'true') throw new Error(file + ': mediaVerified: true is required after all media assets are checked.');
  const poster = scalar(raw, 'poster');
  const backdrop = scalar(raw, 'backdrop');
  if (poster === backdrop) throw new Error(file + ': poster and backdrop must be two distinct images.');
  const videoId = scalar(raw, 'youtubeVideoId');
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) throw new Error(file + ': youtubeVideoId must be a valid 11-character official video ID.');
  if (!scalar(raw, 'youtubeVideoTitle')) throw new Error(file + ': youtubeVideoTitle is required for the embedded video.');
  const scoreKeys = ['score', 'storyScore', 'visualsScore', 'soundScore', 'pacingScore'];
  for (const key of scoreKeys) {
    const value = numeric(raw, key);
    if (value === null || value < 0 || value > 10 || (key === 'score' && value === 0)) {
      throw new Error(file + ': ' + key + ' must be a valid score from 0 to 10 (overall score above 0).');
    }
  }
  if (listCount(raw, 'pros') < 3) throw new Error(file + ': at least three specific pros are required.');
  if (listCount(raw, 'cons') < 2) throw new Error(file + ': at least two genuine cons are required.');
  if (!/^## .+/m.test(body)) throw new Error(file + ': article body needs editorial section headings.');
  if (body.trim().split(/\s+/).filter(Boolean).length < 600) throw new Error(file + ': article body must contain at least 600 words.');
  if (!/https:\/\/\S+/i.test(body)) throw new Error(file + ': include source links in the article body.');
  return { slug, sourceId: scalar(raw, 'sourceId'), markdown, sha256: crypto.createHash('sha256').update(markdown).digest('hex') };
}
async function markdownFiles(directory) {
  const result = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) result.push(full);
    }
  }
  await walk(directory);
  return result;
}
function writeGithubOutput(value) {
  if (process.env.GITHUB_OUTPUT) {
    return fs.appendFile(process.env.GITHUB_OUTPUT, value + '\n');
  }
  return Promise.resolve();
}
export async function publishManualInbox({ root = process.cwd(), now = () => new Date(), sourceDirectory = process.env.MANUAL_PUBLISH_SOURCE_DIR || 'manual-publishing/inbox' } = {}) {
  const inbox = path.isAbsolute(sourceDirectory) ? sourceDirectory : path.join(root, sourceDirectory);
  const sourcePath = path.relative(root, inbox).split(path.sep).join('/');
  const isLegacyInbox = sourcePath === 'manual-publishing/inbox';
  const isEditorialLibrary = sourcePath === 'manual-publishing/library';
  const archive = path.join(root, 'manual-publishing/archive');
  const reviews = path.join(root, 'src/content/reviews');
  const statePath = path.join(root, 'data/manual-publisher-state.json');
  const inboxFiles = await markdownFiles(inbox);
  if (isEditorialLibrary) {
    // releaseDate is the work's original release date; date is the review publication date and must never control queue order.
    const datedFiles = [];
    for (const file of inboxFiles) {
      const markdown = await fs.readFile(file, 'utf8');
      const { raw } = frontmatterOf(markdown);
      const releaseDate = scalar(raw, 'releaseDate');
      if (!validCalendarDate(releaseDate)) {
        throw new Error('Editorial library article must have a valid original release date in YYYY-MM-DD format: ' + path.basename(file));
      }
      datedFiles.push({ file, releaseDate });
    }
    datedFiles.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || path.basename(a.file).localeCompare(path.basename(b.file)));
    inboxFiles.splice(0, inboxFiles.length, ...datedFiles.map(item => item.file));
  } else {
    inboxFiles.sort();
  }
  if (inboxFiles.length === 0) {
    await writeGithubOutput('published=false');
    return { published: false, reason: 'empty-inbox' };
  }
  if (isLegacyInbox && inboxFiles.length !== 1) throw new Error('Manual publisher accepts exactly one article per inbox release. Leave one .md file in manual-publishing/inbox.');
  // The editorial library is a FIFO queue: publish only its first eligible file per scheduled run.
  const file = inboxFiles[0];
  const fileName = path.basename(file);
  const article = validateArticle(fileName, await fs.readFile(file, 'utf8'));
  const destination = path.join(reviews, article.slug + '.md');
  const archived = path.join(archive, article.slug + '.md');
  for (const target of [destination, archived]) {
    try { await fs.access(target); throw new Error('Article already exists: ' + path.relative(root, target)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const existingFiles = await markdownFiles(reviews);
  for (const existing of existingFiles) {
    const existingText = await fs.readFile(existing, 'utf8');
    const existingFrontmatter = frontmatterOf(existingText).raw;
    if (scalar(existingFrontmatter, 'sourceId') === article.sourceId) {
      throw new Error('Duplicate sourceId already exists in public reviews: ' + article.sourceId);
    }
  }
  let state = { version: 1, published: {} };
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state.version !== 1 || !state.published || typeof state.published !== 'object') throw new Error('Manual publisher state is invalid; refusing to overwrite it.');
  if (state.published[article.slug]) throw new Error('This slug is already recorded as published.');
  await fs.mkdir(reviews, { recursive: true });
  await fs.mkdir(archive, { recursive: true });
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(destination, article.markdown, { flag: 'wx' });
  await fs.rename(file, archived);
  state.published[article.slug] = {
    sourceId: article.sourceId,
    sha256: article.sha256,
    articlePath: path.relative(root, destination).split(path.sep).join('/'),
    publishedAt: now().toISOString()
  };
  const temp = statePath + '.tmp';
  await fs.writeFile(temp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(temp, statePath);
  await writeGithubOutput('published=true');
  return { published: true, slug: article.slug, articlePath: path.relative(root, destination).split(path.sep).join('/') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = await publishManualInbox();
    console.log('Manual publisher:', JSON.stringify(result));
  } catch (error) {
    console.error('Manual publisher rejected the release:', error.message);
    process.exitCode = 1;
  }
}
