import fs from 'node:fs/promises';
import path from 'node:path';

const reviewsDir = 'src/content/reviews';
const files = (await fs.readdir(reviewsDir)).filter(name => name.endsWith('.md'));
const records = [];

for (const file of files) {
  const source = await fs.readFile(path.join(reviewsDir, file), 'utf8');
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);
  const meta = frontmatter?.[1] || '';
  const ai = /^aiGenerated:\s*true\s*$/m.test(meta);
  const explicitlyManual = /^aiGenerated:\s*false\s*$/m.test(meta) || /(?:^|[-_])manual(?:[-_.]|$)/i.test(file);
  const publishedAt = meta.match(/^publishedAt:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() || '';
  const validDate = publishedAt && Number.isFinite(Date.parse(publishedAt));
  const verifiedAI = ai && validDate;
  records.push({ file, verifiedAI, declaredAI: ai, explicitlyManual, publishedAt: validDate ? publishedAt : null });
}

const total = records.length;
const aiCount = records.filter(x => x.verifiedAI).length;
const aiUnverified = records.filter(x => x.declaredAI && !x.verifiedAI).length;
const manualCount = records.filter(x => x.explicitlyManual && !x.declaredAI).length;
const unverified = total - aiCount - aiUnverified - manualCount;

const newReviewsPath = 'data/new-reviews.json';
let runItems = [];
try { runItems = JSON.parse(await fs.readFile(newReviewsPath, 'utf8')); } catch {}
if (!Array.isArray(runItems)) runItems = [];
const newlyGenerated = runItems.filter(x => x && !x.upgradedFromPreview).length;
const upgraded = runItems.filter(x => x?.upgradedFromPreview).length;

const summary = [
  '## VibeCritic — تقرير مصدر المقالات',
  '',
  '| المؤشر | العدد |',
  '|---|---:|',
  '| إجمالي ملفات المراجعات | ' + total + ' |',
  '| مقالات AI موثقة (aiGenerated + publishedAt صالح) | ' + aiCount + ' |',
  '| مقالات AI معلنة لكن ينقصها إثبات تاريخ النشر | ' + aiUnverified + ' |',
  '| مقالات يدوية معلّمة صراحة/اسمها manual | ' + manualCount + ' |',
  '| مقالات غير مصنفة بعد | ' + unverified + ' |',
  '| مراجعات AI جديدة في هذا التشغيل | ' + newlyGenerated + ' |',
  '| ترقيات من قراءة استباقية إلى مراجعة | ' + upgraded + ' |',
  '',
  'ملاحظة: لا يُحتسب المقال ضمن AI الموثق إلا إذا احتوى frontmatter على aiGenerated: true وpublishedAt صالح. الملفات القديمة غير الموسومة تبقى «غير مصنفة» ولا تُنسب آلياً أو يدوياً دون دليل.'
].join('\n');

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}
