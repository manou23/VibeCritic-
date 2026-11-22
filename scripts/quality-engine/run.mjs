import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const root = path.resolve(arg('--root') || 'src/content/reviews');
const outDir = path.resolve(arg('--out') || 'quality-engine-report');
const clean = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
const words = value => clean(value).split(/\s+/u).filter(Boolean);
const normalize = value => clean(value).toLocaleLowerCase('ar')
  .replace(/[ًٌٍَُِّْـ]/gu, '')
  .replace(/[أإآ]/gu, 'ا').replace(/ى/gu, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/gu, ' ').trim();
const tokens = value => new Set(normalize(value).split(' ').filter(word => word.length > 2));
const similarity = (left, right) => {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common / (a.size + b.size - common);
};
const extractField = (frontmatter, key) => {
  const match = frontmatter.match(new RegExp('^' + key + ':\\s*(.*?)\\s*$', 'm'));
  return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
};
const parseArticle = (content, file) => {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!match) return { file, malformed: true };
  const frontmatter = match[1], body = match[2] || '';
  const mode = extractField(frontmatter, 'reviewMode') || 'review';
  return {
    file, mode, body, frontmatter,
    title: extractField(frontmatter, 'title') || file,
    score: extractField(frontmatter, 'score'),
    sourceRating: extractField(frontmatter, 'sourceRating'),
    sourceVoteCount: extractField(frontmatter, 'sourceVoteCount')
  };
};
const splitParagraphs = body => body.split(/\n\s*\n/u)
  .map(part => part.replace(/^#{1,6}\s+.*$/gmu, '').trim())
  .filter(part => words(part).length >= 35);
const splitSentences = body => body.replace(/^#{1,6}\s+.*$/gmu, '')
  .split(/[.!?؟。]+/u).map(clean).filter(sentence => words(sentence).length >= 12);
const analyze = article => {
  const body = article.body;
  const paragraphs = splitParagraphs(body);
  const sentences = splitSentences(body);
  const headings = [...body.matchAll(/^#{2,4}\s+(.+)$/gmu)].map(match => clean(match[1]));
  const urls = [...body.matchAll(/https?:\/\/[^\s)\]]+/giu)].map(match => match[0]);
  const links = [...body.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/giu)].map(match => match[1]);
  const sourceLinkCount = new Set([...urls, ...links]).size;
  const flags = [];
  const repeatedParagraphs = [];
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      const score = similarity(paragraphs[i], paragraphs[j]);
      if (score >= 0.72) repeatedParagraphs.push({ first: i + 1, second: j + 1, similarity: Math.round(score * 100) });
    }
  }
  const sentenceCounts = new Map();
  for (const sentence of sentences) {
    const key = normalize(sentence);
    sentenceCounts.set(key, (sentenceCounts.get(key) || 0) + 1);
  }
  const repeatedSentences = [...sentenceCounts.entries()].filter(([, count]) => count > 1);
  if (repeatedParagraphs.length) flags.push({
    level: 'high', code: 'repeated-paragraphs',
    detail: 'توجد فقرات متقاربة جداً في الفكرة والصياغة؛ راجعها لتحديد ما إذا كانت تكراراً لا يضيف تحليلاً.',
    evidence: repeatedParagraphs.slice(0, 4).map(item => 'فقرتان ' + item.first + ' و' + item.second + ' (تشابه نصي ' + item.similarity + '%)')
  });
  if (repeatedSentences.length) flags.push({
    level: 'medium', code: 'repeated-sentences',
    detail: 'توجد جمل طويلة مكررة حرفياً أو شبه حرفياً.',
    evidence: repeatedSentences.slice(0, 3).map(([sentence, count]) => 'تكررت ' + count + ' مرات: «' + sentence.slice(0, 180) + '»')
  });
  if (headings.length < 2) flags.push({
    level: 'medium', code: 'low-section-structure',
    detail: 'عدد العناوين الفرعية قليل؛ تحقق من أن المقال يقدّم محاور نقدية واضحة بدلاً من كتلة نصية واحدة.',
    evidence: ['العناوين الفرعية المكتشفة: ' + headings.length]
  });
  if (sourceLinkCount < 2) flags.push({
    level: 'high', code: 'few-visible-sources',
    detail: 'عدد الروابط المصدرية الظاهرة منخفض. هذا لا يثبت غياب المصادر، لكنه يستدعي التحقق من إسناد الادعاءات الأساسية.',
    evidence: ['روابط URL المكتشفة: ' + sourceLinkCount]
  });
  const wordCount = words(body).length;
  if (wordCount < 180) flags.push({
    level: 'medium', code: 'short-review',
    detail: 'المقال قصير نسبياً؛ افحص هل يقدم حكماً نقدياً وأسباباً كافية، ولا تطل النص لمجرد بلوغ عدد كلمات.',
    evidence: ['عدد الكلمات التقريبي: ' + wordCount]
  });
  if (wordCount > 2600) flags.push({
    level: 'low', code: 'long-review',
    detail: 'المقال طويل؛ راجع وجود فقرات تمهيدية أو تفسيرية يمكن اختصارها دون خسارة معلومة أو حجة.',
    evidence: ['عدد الكلمات التقريبي: ' + wordCount]
  });
  return {
    file: article.file, title: article.title, mode: article.mode, wordCount,
    headingCount: headings.length, visibleSourceLinks: sourceLinkCount,
    flags, status: flags.some(flag => flag.level === 'high') ? 'needs-attention' : flags.length ? 'human-check' : 'no-structural-alerts'
  };
};

await fs.mkdir(root, { recursive: false }).catch(error => {
  if (error.code !== 'EEXIST') throw error;
});
const files = (await fs.readdir(root)).filter(name => name.endsWith('.md')).sort();
const reports = [];
const skipped = [];
for (const file of files) {
  const article = parseArticle(await fs.readFile(path.join(root, file), 'utf8'), file);
  if (article.malformed) {
    reports.push({ file, title: file, status: 'needs-attention', flags: [{ level: 'high', code: 'malformed-frontmatter', detail: 'تعذر قراءة frontmatter؛ يلزم فحص الملف يدوياً.', evidence: [] }] });
    continue;
  }
  if (article.mode !== 'review') {
    skipped.push({ file, mode: article.mode });
    continue;
  }
  reports.push(analyze(article));
}
const counts = {
  scanned: reports.length,
  skippedNonReview: skipped.length,
  needsAttention: reports.filter(item => item.status === 'needs-attention').length,
  humanCheck: reports.filter(item => item.status === 'human-check').length,
  noStructuralAlerts: reports.filter(item => item.status === 'no-structural-alerts').length
};
const date = new Date().toISOString();
const lines = [
  '# VibeCritic Quality Engine — تقرير فحص بنيوي',
  '',
  '- وقت الفحص: ' + date,
  '- المقالات المفحوصة: ' + counts.scanned,
  '- المقالات المستثناة (ليست review): ' + counts.skippedNonReview,
  '- تحتاج انتباهاً: ' + counts.needsAttention,
  '- تحتاج مراجعة بشرية: ' + counts.humanCheck,
  '- لا توجد إشارات بنيوية: ' + counts.noStructuralAlerts,
  '',
  '> هذا فحص آلي بنيوي فقط، وليس حكماً على جودة العمل أو صحة الوقائع أو كفاية الأدلة. لا يمنح درجة جودة ولا يغير المقالات أو تقييماتها أو بيانات الجمهور. غياب التنبيه لا يعني أن المقال ممتاز.',
  ''
];
for (const item of reports) {
  lines.push('## ' + item.title, '', '- الملف: `' + item.file + '`', '- الحالة: ' + item.status,
    '- الكلمات: ' + (item.wordCount ?? 'غير متاح'),
    '- العناوين الفرعية: ' + (item.headingCount ?? 'غير متاح'),
    '- روابط المصادر الظاهرة: ' + (item.visibleSourceLinks ?? 'غير متاح'), '');
  for (const flag of item.flags || []) {
    lines.push('### ' + flag.level.toUpperCase() + ' — ' + flag.code, '', flag.detail);
    for (const evidence of flag.evidence || []) lines.push('- ' + evidence);
    lines.push('');
  }
  if (!item.flags?.length) lines.push('لم يرصد الفحص البنيوي إشارات ضمن قواعده المحدودة. يلزم التقييم التحريري المعتاد.', '');
}
if (skipped.length) {
  lines.push('## ملفات مستثناة', '');
  for (const item of skipped) lines.push('- ' + item.file + ' (reviewMode: ' + item.mode + ')');
}
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'quality-report.md'), lines.join('\n') + '\n', 'utf8');
await fs.writeFile(path.join(outDir, 'quality-report.json'), JSON.stringify({ generatedAt: date, counts, reports, skipped }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(counts));
