import fs from 'node:fs/promises';
import path from 'node:path';

const dist=path.resolve('dist');
const site=new URL(process.env.PUBLIC_SITE_URL||'https://vibecritic.pages.dev');
const required=['index.html','robots.txt','sitemap-index.xml'];
for(const file of required){
 try{await fs.access(path.join(dist,file));}
 catch{throw new Error('ملف البناء المطلوب غير موجود: dist/'+file);}
}
const read=file=>fs.readFile(path.join(dist,file),'utf8');
const locs=xml=>[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].trim());
const indexXml=await read('sitemap-index.xml');
if(!/<sitemapindex\b/i.test(indexXml))throw new Error('جذر ملف sitemap-index.xml ليس sitemapindex صالحاً.');
const sitemapUrls=locs(indexXml);
if(!sitemapUrls.length)throw new Error('ملف sitemap-index.xml لا يحتوي على روابط خرائط فرعية.');
const seen=new Set();
let pageCount=0;
for(const raw of sitemapUrls){
 const url=new URL(raw);
 if(url.origin!==site.origin)throw new Error('نطاق غير متوقع في فهرس Sitemap: '+url.origin);
 const relative=decodeURIComponent(url.pathname.replace(/^\/+/,'')); 
 const file=path.join(dist,relative);
 const child=await fs.readFile(file,'utf8').catch(()=>{throw new Error('خريطة فرعية غير موجودة: '+relative)});
 if(!/<urlset\b/i.test(child))throw new Error('جذر خريطة الصفحات غير صالح: '+relative);
 const pages=locs(child);
 if(!pages.length)throw new Error('خريطة فرعية فارغة: '+relative);
 for(const page of pages){
  const parsed=new URL(page);
  if(parsed.origin!==site.origin)throw new Error('رابط صفحة في Sitemap يستخدم نطاقاً غير متوقع: '+parsed.origin);
  if(seen.has(parsed.href))throw new Error('رابط مكرر في Sitemap: '+parsed.href);
  let decodedPath;
  try{decodedPath=decodeURIComponent(parsed.pathname);}
  catch{throw new Error('رابط صفحة يحتوي ترميز URL غير صالح: '+page);}
  const relativePage=decodedPath.replace(/^\/+/, '');
  const outputRelative=relativePage.endsWith('/')?path.join(relativePage,'index.html'):(path.extname(relativePage)?relativePage:path.join(relativePage,'index.html'));
  const outputFile=path.resolve(dist,outputRelative);
  if(outputFile!==dist&&!outputFile.startsWith(dist+path.sep))throw new Error('مسار صفحة خارج مجلد البناء: '+page);
  try{await fs.access(outputFile);}
  catch{throw new Error('رابط Sitemap لا يقابله ملف HTML منشور: '+page+' (المتوقع dist/'+outputRelative+')');}
  seen.add(parsed.href);pageCount++;
 }
}
const robots=await read('robots.txt');
if(!robots.includes(new URL('sitemap-index.xml',site).href))throw new Error('robots.txt لا يشير إلى Sitemap الصحيح للموقع.');
const home=await read('index.html');
const canonical=[...home.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi)];
if(canonical.length!==1)throw new Error('يجب أن يحتوي الصفحة الرئيسية على رابط canonical واحد فقط.');
if(new URL(canonical[0][1]).origin!==site.origin)throw new Error('نطاق canonical للصفحة الرئيسية لا يطابق نطاق الإنتاج.');
if(!/<meta\s+name=["']description["']\s+content=["'][^"']{30,}["'][^>]*>/i.test(home))throw new Error('وصف Meta للصفحة الرئيسية مفقود أو قصير جداً.');

const pilotReviews = [
  { slug: 'game-minecraft-135400', arabic: 'game-minecraft-135400', score: '8.7' },
  { slug: 'movie-model-citizen-1792170', arabic: 'movie-model-citizen-1792170', score: '7.0' },
  { slug: 'series-the-body-291507', arabic: 'series-the-body-291507', score: '5.5' },
];
for (const locale of ['en', 'fr']) {
  for (const review of pilotReviews) {
    const relative = path.join(locale, 'reviews', review.slug, 'index.html');
    const html = await fs.readFile(path.join(dist, relative), 'utf8').catch(() => {
      throw new Error('Localized pilot review is missing: dist/' + relative);
    });
    if (!html.includes('<html lang="' + locale + '" dir="ltr">')) {
      throw new Error('Incorrect language metadata in ' + relative);
    }
    if (!/<html[^>]*dir=["']ltr["']/i.test(html)) {
      throw new Error('Localized review must use LTR direction: ' + relative);
    }
    const canonicalUrl = site.origin + '/' + locale + '/reviews/' + review.slug + '/';
    if (!html.includes('rel="canonical" href="' + canonicalUrl + '"')) {
      throw new Error('Missing or incorrect canonical URL in ' + relative);
    }
    if (!html.includes('hreflang="ar"') || !html.includes('hreflang="' + (locale === 'en' ? 'fr' : 'en') + '"')) {
      throw new Error('Missing reciprocal language alternates in ' + relative);
    }
    if (!html.includes(review.score)) {
      throw new Error('Expected preserved score not found in ' + relative);
    }
  }
}
for (const review of pilotReviews) {
  const relative = path.join('reviews', review.arabic, 'index.html');
  const html = await fs.readFile(path.join(dist, relative), 'utf8').catch(() => {
    throw new Error('Arabic source review is missing: dist/' + relative);
  });
  if (!html.includes('hreflang="ar"') || !html.includes('hreflang="en"') || !html.includes('hreflang="fr"')) {
    throw new Error('Arabic source review is missing reciprocal hreflang links: ' + relative);
  }
}
console.log('Build validation passed: '+sitemapUrls.length+' sitemap file(s), '+pageCount+' unique page URL(s), robots.txt and homepage SEO metadata verified for '+site.origin+'.');
