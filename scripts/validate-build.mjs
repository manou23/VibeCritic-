import fs from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const site = new URL(process.env.PUBLIC_SITE_URL || 'https://vibecritic.pages.dev');
const required = ['index.html', 'robots.txt', 'sitemap-index.xml', 'sitemap.xml'];
for (const file of required) {
  try {
    await fs.access(path.join(dist, file));
  } catch {
    throw new Error('ملف البناء المطلوب غير موجود: dist/' + file);
  }
}
const read = (file) => fs.readFile(path.join(dist, file), 'utf8');
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());

const indexXml = await read('sitemap-index.xml');
if (!/<sitemapindex\b/i.test(indexXml)) throw new Error('جذر ملف sitemap-index.xml ليس sitemapindex صالحاً.');
const sitemapUrls = locs(indexXml);
if (!sitemapUrls.length) throw new Error('ملف sitemap-index.xml لا يحتوي على روابط خرائط فرعية.');

const flatXml = await read('sitemap.xml');
if (!/<urlset\b/i.test(flatXml)) throw new Error('جذر ملف sitemap.xml ليس urlset صالحاً.');
const flatPages = locs(flatXml);
if (!flatPages.length) throw new Error('ملف sitemap.xml فارغ.');

const seen = new Set();
let pageCount = 0;
for (const raw of sitemapUrls) {
  const url = new URL(raw);
  if (url.origin !== site.origin) throw new Error('نطاق غير متوقع في فهرس Sitemap: ' + url.origin);
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const file = path.join(dist, relative);
  const child = await fs.readFile(file, 'utf8').catch(() => {
    throw new Error('خريطة فرعية غير موجودة: ' + relative);
  });
  if (!/<urlset\b/i.test(child)) throw new Error('جذر خريطة الصفحات غير صالح: ' + relative);
  const pages = locs(child);
  if (!pages.length) throw new Error('خريطة فرعية فارغة: ' + relative);

  for (const page of pages) {
    const parsed = new URL(page);
    if (parsed.origin !== site.origin) throw new Error('رابط صفحة في Sitemap يستخدم نطاقاً غير متوقع: ' + parsed.origin);
    if (seen.has(parsed.href)) throw new Error('رابط مكرر في Sitemap: ' + parsed.href);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(parsed.pathname);
    } catch {
      throw new Error('رابط صفحة يحتوي ترميز URL غير صالح: ' + page);
    }
    const relativePage = decodedPath.replace(/^\/+/, '');
    const outputRelative = relativePage.endsWith('/')
      ? path.join(relativePage, 'index.html')
      : (path.extname(relativePage) ? relativePage : path.join(relativePage, 'index.html'));
    const outputFile = path.resolve(dist, outputRelative);
    if (outputFile !== dist && !outputFile.startsWith(dist + path.sep)) {
      throw new Error('مسار صفحة خارج مجلد البناء: ' + page);
    }
    try {
      await fs.access(outputFile);
    } catch {
      throw new Error('رابط Sitemap لا يقابله ملف HTML منشور: ' + page + ' (المتوقع dist/' + outputRelative + ')');
    }
    seen.add(parsed.href);
    pageCount++;
  }
}

const flatSet = new Set(flatPages);
if (flatPages.length !== pageCount || flatSet.size !== flatPages.length) {
  throw new Error('sitemap.xml لا يحتوي العدد نفسه من الروابط الفريدة الموجودة في الخرائط الأصلية.');
}
for (const page of seen) {
  if (!flatSet.has(page)) throw new Error('رابط مفقود من sitemap.xml: ' + page);
}
for (const page of flatSet) {
  if (!seen.has(page)) throw new Error('رابط زائد أو غير متطابق في sitemap.xml: ' + page);
}

const robots = await read('robots.txt');
if (!robots.includes(new URL('sitemap.xml', site).href)) {
  throw new Error('robots.txt لا يشير إلى ملف sitemap.xml المباشر.');
}

// The duplicate English article is consolidated into the already indexed Arabic URL.
const redirects = await read('_redirects');
const duplicatePath = '/reviews/series-the-remarried-empress-279246/';
const canonicalPath = '/reviews/series-%D8%A7%D9%84%D8%A7-%D9%85%D8%A8%D8%B1%D8%A7%D8%B7%D9%88%D8%B1%D8%A9-%D8%A7%D9%84%D9%85%D8%AA%D8%B2%D9%88%D8%AC%D8%A9-%D9%85%D8%AC%D8%AF%D8%AF%D8%A7-279246/';
const redirectRule = duplicatePath + ' ' + canonicalPath + ' 301';
if (!redirects.split(/\r?\n/).some(line => line.trim() === redirectRule)) {
  throw new Error('Permanent redirect for the duplicate Remarried Empress URL is missing.');
}
if (seen.has(new URL(duplicatePath, site).href)) {
  throw new Error('The duplicate Remarried Empress URL must not remain in the sitemap.');
}
if (!seen.has(new URL(canonicalPath, site).href)) {
  throw new Error('The canonical indexed Remarried Empress URL is missing from the sitemap.');
}

// Every review must ship its own share metadata and structured review/article data.
const reviewOutput = path.join(dist, 'reviews');
const reviewHtmlPaths = await fs.readdir(reviewOutput, { recursive: true }).catch(() => []);
const reviewPages = reviewHtmlPaths.filter(file => String(file).endsWith('index.html'));
if (!reviewPages.length) throw new Error('لم يتم العثور على صفحات مراجعات HTML لفحص SEO.');
for (const relative of reviewPages) {
  const html = await fs.readFile(path.join(reviewOutput, relative), 'utf8');
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const metaTag = (attribute, value) => metaTags.find(tag => tag.toLowerCase().includes(attribute.toLowerCase() + '="' + value.toLowerCase() + '"')) || '';
  const metaContent = (attribute, value) => {
    const tag = metaTag(attribute, value);
    const match = tag.match(/\bcontent="([^"]*)"/i);
    return match?.[1] ?? '';
  };
  const ogTitle = metaContent('property', 'og:title');
  const ogDescription = metaContent('property', 'og:description');
  const ogUrl = metaContent('property', 'og:url');
  const twitterCard = metaContent('name', 'twitter:card');
  const publishedTime = metaContent('property', 'article:published_time');
  const jsonLdTag = html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let structuredType = '';
  try {
    const structured = JSON.parse(jsonLdTag?.[1] || 'null');
    const schemaNodes = Array.isArray(structured?.['@graph'])
      ? structured['@graph']
      : [structured];
    const reviewNode = schemaNodes.find((node) => {
      const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
      return types.some((type) => ['Review', 'Article'].includes(type));
    });
    const reviewTypes = Array.isArray(reviewNode?.['@type'])
      ? reviewNode['@type']
      : [reviewNode?.['@type']];
    structuredType = reviewTypes.find((type) => ['Review', 'Article'].includes(type)) || '';
  } catch {}
  const failedMeta = [];
  if (ogTitle.length < 8) failedMeta.push('og:title');
  if (ogDescription.length < 30) failedMeta.push('og:description');
  if (!ogUrl.startsWith('https://')) failedMeta.push('og:url');
  if (!['summary_large_image', 'summary'].includes(twitterCard)) failedMeta.push('twitter:card');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(publishedTime)) failedMeta.push('article:published_time');
  if (!['Review', 'Article'].includes(structuredType)) failedMeta.push('JSON-LD Review/Article');
  if (failedMeta.length) {
    throw new Error('وسوم SEO غير مكتملة في صفحة ' + relative + '؛ العناصر: ' + failedMeta.join(', '));
  }
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) || []).find(tag => /\brel="canonical"/i.test(tag));
  const pageCanonical = canonicalTag?.match(/\bhref="([^"]+)"/i)?.[1];
  if (!pageCanonical || !pageCanonical.startsWith('https://')) {
    throw new Error('رابط canonical مفقود أو غير مطلق في صفحة ' + relative);
  }
}

// Review-content integrity checks must inspect the actual score field, not every
// occurrence of "0.0" in source metadata (for example, a Japanese title).
const reviewRoot = path.resolve('src/content/reviews');
const reviewFiles = (await fs.readdir(reviewRoot)).filter(name => name.endsWith('.md'));
const reviewFailures = [];
for (const file of reviewFiles) {
  const source = await fs.readFile(path.join(reviewRoot, file), 'utf8');
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  const body = source.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const manualArticle = frontmatter.includes('mediaVerified: true');
  if (manualArticle) {
    const field = (key) => {
      const line = frontmatter.split(/\r?\n/).find(item => item.startsWith(key + ':'));
      return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : '';
    };
    const poster = field('poster');
    const backdrop = field('backdrop');
    const videoId = field('youtubeVideoId');
    const videoTitle = field('youtubeVideoTitle');
    if (!poster.startsWith('https://')) reviewFailures.push(file + ': manual article poster must be an HTTPS image URL');
    if (!backdrop.startsWith('https://')) reviewFailures.push(file + ': manual article backdrop must be an HTTPS image URL');
    if (poster && poster === backdrop) reviewFailures.push(file + ': manual article poster and backdrop must be distinct images');
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) reviewFailures.push(file + ': manual article must include a valid embedded official YouTube video ID');
    if (!videoTitle) reviewFailures.push(file + ': manual article must include a video title');
    const pagePath = path.join(dist, 'reviews', file.slice(0, -3), 'index.html');
    const html = await fs.readFile(pagePath, 'utf8').catch(() => '');
    if (!html.includes('class="article-backdrop"') || !html.includes('class="article-poster"')) reviewFailures.push(file + ': built page must render both backdrop and poster images');
    if (!html.includes('data-youtube-facade') || !html.includes('data-video-id="' + videoId + '"')) reviewFailures.push(file + ': built page must render the embedded official video');
    const containsRenderedUrl = (url) => html.includes(url) || html.includes(url.replace(/&/g, '&amp;'));
    if (poster && !containsRenderedUrl(poster)) reviewFailures.push(file + ': poster URL is missing from the built page');
    if (backdrop && !containsRenderedUrl(backdrop)) reviewFailures.push(file + ': backdrop URL is missing from the built page');
  }
  const modeMatch = frontmatter.match(/^reviewMode:\s*(review|audience|preview|limited)\s*$/m);
  const reviewMode = modeMatch?.[1] || 'review';
  if (frontmatter.match(/^reviewMode:/m) && !modeMatch) reviewFailures.push(file + ': invalid reviewMode');
  const scoreMatch = frontmatter.match(/^score:\s*["']?(-?\d+(?:\.\d+)?)["']?\s*$/m);
  const scoreFields = ['score', 'storyScore', 'visualsScore', 'soundScore', 'pacingScore'];
  if (reviewMode === 'review') {
    if (!scoreMatch) {
      reviewFailures.push(file + ': full review is missing a numeric score field');
    } else {
      const score = Number(scoreMatch[1]);
      if (!Number.isFinite(score) || score <= 0 || score > 10) {
        reviewFailures.push(file + ': score must be greater than 0 and at most 10 (' + scoreMatch[1] + ')');
      }
    }
  } else if (reviewMode === 'audience') {
    const readField = (key) => {
      const line = frontmatter.split(/\r?\n/).find(item => item.startsWith(key + ':'));
      return line ? line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const sourceRating = Number(readField('sourceRating'));
    const sourceRatingScale = Number(readField('sourceRatingScale'));
    const sourceVoteCount = Number(readField('sourceVoteCount'));
    const sourceName = readField('sourceName');
    const retainedScores = scoreFields.filter(field => frontmatter.split(/\r?\n/).some(line => line.startsWith(field + ':')));
    if (retainedScores.length) reviewFailures.push(file + ': audience review must not store VibeCritic editorial score metadata (' + retainedScores.join(', ') + ')');
    if (!Number.isFinite(sourceRating) || sourceRating <= 0 || !Number.isFinite(sourceRatingScale) || sourceRatingScale <= 0 || sourceRatingScale > 10 || sourceRating > sourceRatingScale) reviewFailures.push(file + ': audience review requires a valid sourceRating within sourceRatingScale (maximum scale 10)');
    if (!Number.isInteger(sourceVoteCount) || sourceVoteCount < 100) reviewFailures.push(file + ': audience review requires at least 100 verified source votes');
    if (!sourceName) reviewFailures.push(file + ': audience review requires a named rating source');
    if (!body.includes('ليست درجة تحريرية صادرة عن VibeCritic')) reviewFailures.push(file + ': audience review must clearly attribute its rating to the source, not VibeCritic');
  } else {
    const retainedScores = scoreFields.filter(field => new RegExp('^' + field + ':\\\\s*', 'm').test(frontmatter));
    if (retainedScores.length) reviewFailures.push(file + ': preview/limited review must not store score metadata (' + retainedScores.join(', ') + ')');
    const prematureRating = /(?<![0-9])\d{1,2}(?:[.,]\d+)?\s*(?:\/\s*10|من\s*10)(?![0-9])/i;
    // Ignore URL paths: dates such as /2026/06/10 in cited source links are not review scores.
    const ratingText = (frontmatter + '\n' + body).replace(/https?:\/\/[^\s)\]>]+/gi, '');
    if (prematureRating.test(ratingText)) reviewFailures.push(file + ': preview/limited review must not publish a numeric final rating');
  }  // Scores are at most 10; limiting the integer part to two digits avoids matching dates such as 2026/10.
  for (const match of body.matchAll(/(?<!\d)(\d{1,2}(?:[.,]\d+)?)\s*\/\s*10/g)) {
    const value = Number(match[1].replace(',', '.'));
    if (value <= 0 || value > 10) reviewFailures.push(file + ': invalid body score (' + match[0] + ')');
  }
  if (/^\s*\d+(?:[.,]\d+)?\s*$/m.test(body)) reviewFailures.push(file + ': contains a standalone number without context');
}
if (reviewFailures.length) throw new Error('Post-build review integrity failed:\n' + reviewFailures.map(item => ' - ' + item).join('\n'));

const home = await read('index.html');
const canonical = [...home.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi)];
if (canonical.length !== 1) throw new Error('يجب أن يحتوي الصفحة الرئيسية على رابط canonical واحد فقط.');
if (new URL(canonical[0][1]).origin !== site.origin) throw new Error('نطاق canonical للصفحة الرئيسية لا يطابق نطاق الإنتاج.');
if (!/<meta\s+name=["']description["']\s+content=["'][^"']{30,}["'][^>]*>/i.test(home)) {
  throw new Error('وصف Meta للصفحة الرئيسية مفقود أو قصير جداً.');
}
console.log('Build validation passed: ' + sitemapUrls.length + ' indexed sitemap file(s), ' + pageCount + ' unique page URL(s), flat sitemap parity, robots.txt, homepage SEO and dynamic metadata for ' + reviewPages.length + ' review pages verified for ' + site.origin + '.');
