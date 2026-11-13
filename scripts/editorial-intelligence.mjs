import fs from 'node:fs/promises';
import path from 'node:path';

const memoryPath = 'data/editorial-intelligence.json';
const MAX_CANDIDATES = 120;
const MAX_APPROVED = 80;
const MAX_CONTEXT_EXAMPLES = 3;

const clean = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
const words = value => [...new Set(
  clean(value).toLocaleLowerCase('ar')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter(word => word.length > 2)
)];

function emptyMemory() {
  return {
    version: 1,
    updatedAt: null,
    stats: { candidates: 0, approved: 0, rejected: 0 },
    candidates: [],
    approvedExamples: [],
    principles: []
  };
}

async function loadMemory() {
  try {
    const parsed = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
    if (parsed?.version === 1) return { ...emptyMemory(), ...parsed };
  } catch {}
  return emptyMemory();
}

async function saveMemory(memory) {
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  memory.updatedAt = new Date().toISOString();
  const temporary = memoryPath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(memory, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, memoryPath);
}

function makeCandidate(item, review) {
  const body = clean(review.review);
  const fingerprint = words([item.type, item.name, review.headline, body.slice(0, 1800)].join(' ')).sort().join('|');
  return {
    id: String(item.type) + ':' + String(item.id),
    fingerprint,
    status: 'pending',
    type: clean(item.type),
    title: clean(item.name),
    headline: clean(review.headline),
    thesis: clean(review.hook),
    summary: clean(review.summary),
    verdict: clean(review.verdict),
    score: Number(review.score) || 0,
    subScores: review.scores || {},
    strengths: Array.isArray(review.pros) ? review.pros.slice(0, 4).map(clean) : [],
    limitations: Array.isArray(review.cons) ? review.cons.slice(0, 4).map(clean) : [],
    sectionHeadings: [...body.matchAll(/^###\s+(.+)$/gmu)].map(match => clean(match[1])).slice(0, 8),
    excerpt: body.slice(0, 1800),
    wordCount: body.split(/\s+/u).filter(Boolean).length,
    capturedAt: new Date().toISOString(),
    humanRating: null,
    reviewerNotes: ''
  };
}

export async function recordEditorialCandidate(item, review) {
  const memory = await loadMemory();
  const candidate = makeCandidate(item, review);
  if (memory.candidates.some(entry => entry.id === candidate.id) ||
      memory.approvedExamples.some(entry => entry.id === candidate.id)) return false;

  memory.candidates.unshift(candidate);
  memory.candidates = memory.candidates.slice(0, MAX_CANDIDATES);
  memory.stats.candidates = (Number(memory.stats.candidates) || 0) + 1;
  await saveMemory(memory);
  console.log('حُفظت المراجعة كعينة تدريب مرشحة، ولم تُعتمد تلقائياً:', candidate.id);
  return true;
}

export async function buildEditorialTrainingContext(item) {
  const memory = await loadMemory();
  const approved = memory.approvedExamples.filter(example => example.type === item.type);
  const examples = approved.slice(0, MAX_CONTEXT_EXAMPLES);
  const principles = memory.principles
    .filter(entry => entry.status === 'active')
    .slice(0, 8)
    .map(entry => '- ' + entry.text);

  if (!examples.length && !principles.length) {
    return 'ذاكرة التدريب التحريري المستقلة: لا توجد أمثلة بشرية معتمدة بعد. لا تعتبر اجتياز بوابة الجودة تدريباً ناجحاً؛ اكتب وفق الأدلة ومعايير VibeCritic فقط.';
  }

  const exampleNotes = examples.map((example, index) =>
    (index + 1) + ') مثال معتمد بعنوان «' + example.headline + '»: أطروحته «' +
    example.thesis + '». تقييم المحرر: ' + example.humanRating + '/5. استخلص منه وضوح الحجة وتماسكها فقط؛ لا تنقل عباراته أو بنيته.'
  );
  return [
    'ذاكرة التدريب التحريري المعتمدة بشرياً (ليست نصوصاً للتقليد):',
    ...principles,
    ...exampleNotes,
    'استفد من المبادئ والأمثلة لفهم جودة الحجة، لكن أنشئ زاوية مستقلة وتكويناً جديداً يناسب العمل الحالي. لا تستنسخ العناوين أو الجمل أو ترتيب الفقرات.'
  ].join('\n');
}

export async function assessEditorialCandidate(id, decision, rating = 0, notes = '') {
  if (!['approve', 'reject'].includes(decision)) throw new Error('القرار يجب أن يكون approve أو reject.');
  if (decision === 'approve' && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('اعتماد العينة يتطلب تقييماً بشرياً صحيحاً من 1 إلى 5.');
  }

  const memory = await loadMemory();
  const index = memory.candidates.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('لم يتم العثور على عينة مرشحة: ' + id);
  const [candidate] = memory.candidates.splice(index, 1);
  candidate.status = decision === 'approve' ? 'approved' : 'rejected';
  candidate.humanRating = decision === 'approve' ? rating : null;
  candidate.reviewerNotes = clean(notes).slice(0, 1200);
  candidate.reviewedAt = new Date().toISOString();

  if (decision === 'approve') {
    memory.approvedExamples.unshift(candidate);
    memory.approvedExamples = memory.approvedExamples.slice(0, MAX_APPROVED);
    memory.stats.approved = (Number(memory.stats.approved) || 0) + 1;
  } else {
    memory.stats.rejected = (Number(memory.stats.rejected) || 0) + 1;
  }
  await saveMemory(memory);
  return candidate;
}

export async function listEditorialCandidates() {
  const memory = await loadMemory();
  return memory.candidates.map(({ id, type, title, headline, score, wordCount, capturedAt }) =>
    ({ id, type, title, headline, score, wordCount, capturedAt })
  );
}

export async function addEditorialPrinciple(textValue) {
  const text = clean(textValue);
  if (text.length < 20) throw new Error('المبدأ التحريري قصير جداً.');
  const memory = await loadMemory();
  const key = words(text).sort().join('|');
  if (memory.principles.some(entry => entry.key === key)) return false;
  memory.principles.unshift({ key, text, status: 'active', createdAt: new Date().toISOString() });
  memory.principles = memory.principles.slice(0, 80);
  await saveMemory(memory);
  return true;
}
