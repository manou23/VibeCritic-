import fs from 'node:fs/promises';
import path from 'node:path';

const HISTORY_PATH = 'data/judgment-history.json';
const MAX_WORK_VERSIONS = 8;
const MAX_WORKS = 500;
const clean = value => String(value ?? '').replace(/[\\r\\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];

function workKey(item) {
  return clean(item?.type) + ':' + clean(item?.id);
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function evidenceFingerprint(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const evidence = {
    source: clean(item?.source),
    sourceUrl: clean(item?.sourceUrl),
    date: clean(item?.date),
    description: clean(item?.description || item?.summary),
    genres: list(item?.genres),
    directors: list(metadata.directors),
    creators: list(metadata.creators),
    cast: list(metadata.cast).slice(0, 20),
    developers: list(metadata.developers),
    platforms: list(metadata.platforms || item?.platforms),
    runtime: Number(metadata.runtime) || null,
    seasons: Number(metadata.seasons) || null,
    episodes: Number(metadata.episodes) || null
  };
  const input = stable(evidence);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv1a-' + (hash >>> 0).toString(16).padStart(8, '0');
}

function tokens(value) {
  return new Set(clean(value).toLocaleLowerCase('ar')
    .replace(/[ًٌٍَُِّْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u).filter(word => word.length > 2));
}

function similarity(left, right) {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return common / (a.size + b.size - common);
}

function opposingClaims(previous, current) {
  const matches = [];
  for (const [oldSide, newSide, direction] of [
    ['pros', 'cons', 'positive-to-negative'],
    ['cons', 'pros', 'negative-to-positive']
  ]) {
    for (const oldClaim of list(previous?.[oldSide])) {
      for (const newClaim of list(current?.[newSide])) {
        const score = similarity(oldClaim, newClaim);
        if (score >= 0.55) matches.push({
          previousClaim: oldClaim,
          currentClaim: newClaim,
          direction,
          similarity: Number(score.toFixed(3))
        });
      }
    }
  }
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

export function createJudgmentSnapshot(item, review, options = {}) {
  const scores = Object.fromEntries(Object.entries(review?.scores || {})
    .map(([key, value]) => [key, Number(value)])
    .filter(([, value]) => Number.isFinite(value)));
  return {
    version: 1,
    workKey: workKey(item),
    workType: clean(item?.type),
    workId: clean(item?.id),
    title: clean(item?.name || item?.title),
    capturedAt: options.capturedAt || new Date().toISOString(),
    overallScore: Number.isFinite(Number(review?.score)) ? Number(review.score) : null,
    scores,
    verdict: clean(review?.verdict),
    summary: clean(review?.summary),
    pros: list(review?.pros).slice(0, 6),
    cons: list(review?.cons).slice(0, 6),
    evidenceFingerprint: evidenceFingerprint(item),
    evidenceSource: clean(item?.source),
    evidenceUrl: clean(item?.sourceUrl) || null
  };
}

export function assessJudgmentRevision(previous, current) {
  if (!previous || !current || previous.workKey !== current.workKey) {
    return { status: 'no-baseline', evidenceChanged: false, scoreDelta: null, opposingClaims: [] };
  }
  const scoreDelta = previous.overallScore === null || current.overallScore === null
    ? null : Number((current.overallScore - previous.overallScore).toFixed(1));
  const evidenceChanged = previous.evidenceFingerprint !== current.evidenceFingerprint;
  const opposing = opposingClaims(previous, current);
  const majorScoreShift = scoreDelta !== null && Math.abs(scoreDelta) >= 2;
  const status = opposing.length || majorScoreShift ? 'needs-review' : 'consistent';
  return {
    status,
    evidenceChanged,
    scoreDelta,
    majorScoreShift,
    opposingClaims: opposing,
    note: status === 'needs-review'
      ? 'رُصد اختلاف جوهري بين نسختين؛ يلزم تفسيره ومراجعة الأدلة قبل اعتماد الحكم الجديد.'
      : 'لم يُرصد انقلاب واضح في الادعاءات أو تغير كبير في الدرجة ضمن المقارنة الآلية.'
  };
}

export async function loadJudgmentHistory(filePath = HISTORY_PATH) {
  try {
    const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (saved?.version === 1 && Array.isArray(saved.works)) return saved;
  } catch {}
  return { version: 1, works: [], updatedAt: null };
}

export function buildJudgmentRevisionContext(item, history) {
  const key = workKey(item);
  const record = (history?.works || []).find(entry => entry.workKey === key);
  const previous = record?.versions?.at(-1);
  if (!previous) return '';
  const currentEvidence = evidenceFingerprint(item);
  const evidenceChanged = previous.evidenceFingerprint !== currentEvidence;
  return [
    'ذاكرة الأحكام السابقة لهذا العمل:',
    'آخر حكم محفوظ بتاريخ ' + previous.capturedAt + '، الدرجة ' + (previous.overallScore ?? 'غير مسجلة') + '/10، والخلاصة: ' + (previous.verdict || previous.summary || 'غير محفوظة') + '.',
    'بصمة الأدلة الحالية ' + (evidenceChanged ? 'تختلف' : 'لا تختلف') + ' عن النسخة السابقة.',
    'أعد فحص الحكم السابق على ضوء الأدلة المتاحة الآن. لا تتمسك به لمجرد الاتساق، ولا تغيّره لمجرد التنويع. إذا تغيّر الاستنتاج فاذكر الدليل المحدد الذي يبرر التغيير، وإذا لم تظهر أدلة جديدة فلا تصطنع تحولاً في الرأي.',
    'هذه الذاكرة تنبه إلى المراجعة ولا تفرض نتيجة أو درجة مسبقة.'
  ].join('\n');
}

export async function recordJudgmentVersion(item, review, options = {}) {
  const filePath = options.filePath || HISTORY_PATH;
  const history = await loadJudgmentHistory(filePath);
  const snapshot = createJudgmentSnapshot(item, review, options);
  if (!snapshot.workKey || snapshot.workKey.startsWith(':')) return { recorded: false, reason: 'invalid-work' };
  let record = history.works.find(entry => entry.workKey === snapshot.workKey);
  if (!record) {
    record = { workKey: snapshot.workKey, workType: snapshot.workType, workId: snapshot.workId, title: snapshot.title, versions: [] };
    history.works.push(record);
  }
  const previous = record.versions.at(-1) || null;
  const assessment = assessJudgmentRevision(previous, snapshot);
  const duplicate = previous &&
    previous.evidenceFingerprint === snapshot.evidenceFingerprint &&
    previous.overallScore === snapshot.overallScore &&
    stable(previous.scores) === stable(snapshot.scores) &&
    stable(previous.pros) === stable(snapshot.pros) &&
    stable(previous.cons) === stable(snapshot.cons) &&
    previous.verdict === snapshot.verdict;
  if (duplicate) return { recorded: false, duplicate: true, assessment };
  snapshot.revisionAssessment = assessment;
  record.versions.push(snapshot);
  record.versions = record.versions.slice(-MAX_WORK_VERSIONS);
  record.title = snapshot.title || record.title;
  history.works = history.works.slice(-MAX_WORKS);
  history.updatedAt = snapshot.capturedAt;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(history, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, filePath);
  return { recorded: true, assessment, versionCount: record.versions.length };
}

export { evidenceFingerprint };
