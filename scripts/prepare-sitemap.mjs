import fs from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const indexPath = path.join(dist, 'sitemap-index.xml');
const indexXml = await fs.readFile(indexPath, 'utf8');
const sitemapPaths = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(match[1].trim()));

if (!/<sitemapindex\b/i.test(indexXml) || sitemapPaths.length !== 1) {
  throw new Error(
    'Expected exactly one generated child sitemap before creating the flat sitemap.xml compatibility file.',
  );
}

const childUrl = sitemapPaths[0];
const expectedOrigin = new URL(process.env.PUBLIC_SITE_URL || 'https://vibecritic.pages.dev').origin;
if (childUrl.origin !== expectedOrigin) {
  throw new Error('Generated child sitemap uses an unexpected origin: ' + childUrl.origin);
}

const childPath = decodeURIComponent(childUrl.pathname.replace(/^\/+/, ''));
const childFile = path.resolve(dist, childPath);
if (!childFile.startsWith(dist + path.sep)) {
  throw new Error('Generated child sitemap resolves outside the dist directory.');
}

const childXml = await fs.readFile(childFile, 'utf8');
if (!/<urlset\b/i.test(childXml) || !/<loc>[^<]+<\/loc>/.test(childXml)) {
  throw new Error('Generated child sitemap is not a non-empty URL set.');
}

await fs.writeFile(path.join(dist, 'sitemap.xml'), childXml, 'utf8');
console.log('Created flat sitemap.xml from ' + path.basename(childFile) + '.');
