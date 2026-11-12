import { getCollection } from 'astro:content';

export const prerender = true;

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export async function GET({ site }: { site: URL }) {
  const reviews = (await getCollection('reviews'))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 100);
  const base = site.href.replace(/\/$/, '');
  const items = reviews.map((review) => {
    const link = new URL('/reviews/' + review.id + '/', base).href;
    const title = review.data.title + ' — مراجعة VibeCritic';
    const description = [review.data.headline, review.data.summary].filter(Boolean).join(' — ');
    return `<item><title>${escapeXml(title)}</title><link>${escapeXml(link)}</link><guid isPermaLink="true">${escapeXml(link)}</guid><description>${escapeXml(description)}</description><pubDate>${review.data.date.toUTCString()}</pubDate></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>VibeCritic — أحدث المراجعات</title><link>${escapeXml(base)}</link><description>آخر مراجعات الألعاب والأفلام والمسلسلات باللغة العربية.</description><language>ar</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
