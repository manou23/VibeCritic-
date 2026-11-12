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

// Every review must ship its own share metadata and structured review/article data.
const reviewOutput = path.join(dist, 'reviews');
const reviewHtmlPaths = await fs.readdir(reviewOutput, { recursive: true }).catch(() => []);
const reviewPages = reviewHtmlPaths.filter(file => String(file).endsWith('index.html'));
if (!reviewPages.length) throw new Error('لم يتم العثور على صفحات مراجعات HTML لفحص SEO.');
for (const relative of reviewPages) {
  const html = await fs.readFile(path.join(reviewOutput, relative), 'utf8');
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const metaTag = (attribute, value) => metaTags.find(tag => new RegExp('\\b' + attribute + '=["\']' + value + '["\']', 'i').test(tag)) || '';
  const metaContent = (attribute, value) => {
    const tag = metaTag(attribute, value);
    const match = tag.match(/\bcontent="([^"]*)"|\bcontent='([^']*)'/i);
    return match?.[1] ?? match?.[2] ?? '';
  };
  const ogTitle = metaContent('property', 'og:title');
  const ogDescription = metaContent('property', 'og:description');
  const ogUrl = metaContent('property', 'og:url');
  const twitterCard = metaContent('name', 'twitter:card');
  const publishedTime = metaContent('property', 'article:published_time');
  const jsonLdTag = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  let structuredType = '';
  try {
    const structured = JSON.parse(jsonLdTag?.[1] || 'null');
    structuredType = structured?.['@type'] || '';
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
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) || []).find(tag => /\brel=["']canonical["']/i.test(tag));
  const pageCanonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
}
// Review-content integrity checks also run after the production build.
const reviewRoot = path.resolve('src/content/reviews');
const reviewFiles = (await fs.readdir(reviewRoot)).filter(name => name.endsWith('.md'));
const reviewFailures = [];
for (const file of reviewFiles) {
  const source = await fs.readFile(path.join(reviewRoot, file), 'utf8');
  const body = source.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  if (/(^|[^\d.])0\.0(?![\d.])/.test(source)) reviewFailures.push(file + ': contains forbidden 0.0 score');
  for (const match of body.matchAll(/(\d+(?:[.,]\d+)?)\s*\/\s*10/g)) {
    const value = Number(match[1].replace(',', '.'));
    if (value > 10) reviewFailures.push(file + ': score above 10 (' + match[0] + ')');
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
