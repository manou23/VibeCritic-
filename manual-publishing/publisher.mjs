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
function numeric(raw, key) {
  const value = scalar(raw, key);
  return value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}
function validateArticle(file, markdown) {
  const slug = file.replace(/\.md$/i, '');
  if (!SLUG.test(slug)) throw new Error(file + ': filename must be a lowercase kebab-case slug.');
  const { raw, body } = frontmatterOf(markdown);
  const required = ['title', 'headline', 'summary', 'type', 'date', 'sourceId', 'sourceUrl', 'poster', 'backdrop'];
  for (const key of required) if (!scalar(raw, key)) throw new Error(file + ': missing required field ' + key + '.');
  if (!['movie', 'series', 'game'].includes(scalar(raw, 'type'))) throw new Error(file + ': type must be movie, series, or game.');
  if (scalar(raw, 'aiGenerated') !== 'false') throw new Error(file + ': manual articles must set aiGenerated: false.');
  if (scalar(raw, 'editorialWorkflow') !== 'manual-assisted') throw new Error(file + ': manual articles must set editorialWorkflow: manual-assisted.');
  if (scalar(raw, 'reviewMode') !== 'review') throw new Error(file + ': only completed reviews can enter the manual publisher.');
  for (const key of ['sourceUrl', 'poster', 'backdrop']) {
    const value = scalar(raw, key);
    if (!HTTPS.test(value || '')) throw new Error(file + ': ' + key + ' must be an HTTPS URL.');
  }
  const videoId = scalar(raw, 'youtubeVideoId');
  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error(file + ': youtubeVideoId is not a valid 11-character YouTube ID.');
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
  if ((body.match(/\b[\p{L}\p{N}]+\b/gu) || []).length < 600) throw new Error(file + ': article body must contain at least 600 words.');
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
export async function publishManualInbox({ root = process.cwd(), now = () => new Date() } = {}) {
  const inbox = path.join(root, 'manual-publishing/inbox');
  const archive = path.join(root, 'manual-publishing/archive');
  const reviews = path.join(root, 'src/content/reviews');
  const statePath = path.join(root, 'data/manual-publisher-state.json');
  const inboxFiles = (await markdownFiles(inbox)).sort();
  if (inboxFiles.length === 0) {
    await writeGithubOutput('published=false');
    return { published: false, reason: 'empty-inbox' };
  }
  if (inboxFiles.length !== 1) throw new Error('Manual publisher accepts exactly one article per release. Leave one .md file in manual-publishing/inbox.');
  const file = inboxFiles[0];
  const article = validateArticle(path.basename(file), await fs.readFile(file, 'utf8'));
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
