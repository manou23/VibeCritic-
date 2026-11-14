const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const STOP = new Set([
  'هذا','هذه','ذلك','تلك','الذي','التي','على','في','من','إلى','عن','مع','بين','كما','لكن','كان','كانت','يكون','تكون','هو','هي','ما','لا','لم','لن','قد','كل','بعد','قبل','حتى','عند','ضمن','عبر','أو','ثم','أن','إن','وهو','وهي','هذاك',
  'the','and','for','with','that','this','from','into','its','are','was','were','has','have','had','but','not','you','your','their','they','them','his','her'
]);
const tokens = value => [...new Set(
  clean(value).toLocaleLowerCase('ar')
    .replace(/[ًٌٍَُِّْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter(word => word.length > 2 && !STOP.has(word))
)];
const overlap = (left, right) => {
  const a = new Set(list(left)), b = new Set(list(right));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / (a.size + b.size - common);
};
const unique = values => [...new Set(list(values).map(clean).filter(Boolean))];

function currentPattern(item, reasoning, criticalQuestions, review = {}) {
  const selected = reasoning?.selected || {};
  const questionIds = unique(list(criticalQuestions?.questions).map(question => question?.id));
  const genres = unique(list(item?.genres).map(value => typeof value === 'string' ? value : value?.name));
  const argumentText = [
    selected.question, selected.instruction,
    review?.hook, review?.summary, review?.verdict,
    ...list(review?.pros), ...list(review?.cons),
    item?.description, item?.summary
  ].join(' ');
  const evidenceFields = unique(list(selected.evidence).map(entry => entry?.field));
  return {
    version: 1,
    workId: clean(item?.type) + ':' + clean(item?.id),
    workType: clean(item?.type),
    angleId: clean(selected.id),
    questionIds,
    genres,
    evidenceFields,
    argumentTokens: tokens(argumentText).slice(0, 80)
  };
}

function legacyPattern(candidate) {
  const saved = candidate?.intellectualPattern;
  if (saved && typeof saved === 'object') return saved;
  return {
    workId: clean(candidate?.id),
    workType: clean(candidate?.type),
    angleId: clean(candidate?.reasoning?.selectedAngleId),
    questionIds: unique(list(candidate?.criticalQuestions?.questions).map(question => question?.id)),
    genres: [],
    evidenceFields: [],
    argumentTokens: tokens([
      candidate?.thesis, candidate?.summary, candidate?.verdict,
      ...list(candidate?.strengths), ...list(candidate?.limitations)
    ].join(' ')).slice(0, 80)
  };
}

function comparePatterns(current, previous) {
  const angle = current.angleId && previous.angleId && current.angleId === previous.angleId ? 1 : 0;
  const questions = overlap(current.questionIds, previous.questionIds);
  const argument = overlap(current.argumentTokens, previous.argumentTokens);
  const genre = overlap(current.genres, previous.genres);
  const evidence = overlap(current.evidenceFields, previous.evidenceFields);
  const score = Math.round((angle * 0.30 + questions * 0.25 + argument * 0.30 + genre * 0.10 + evidence * 0.05) * 100);
  return {
    score,
    components: {
      sameAngle: angle,
      questionOverlap: Number(questions.toFixed(3)),
      argumentOverlap: Number(argument.toFixed(3)),
      genreOverlap: Number(genre.toFixed(3)),
      evidenceOverlap: Number(evidence.toFixed(3))
    }
  };
}

export function buildIntellectualRepetitionReport(item, reasoning, criticalQuestions, previousPatterns = []) {
  const pattern = currentPattern(item, reasoning, criticalQuestions);
  const matches = list(previousPatterns)
    .filter(candidate => candidate && candidate.id !== pattern.workId && candidate.type === pattern.workType)
    .map(candidate => {
      const previous = legacyPattern(candidate);
      return {
        id: clean(candidate.id),
        title: clean(candidate.title || candidate.headline),
        ...comparePatterns(pattern, previous)
      };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const topScore = matches[0]?.score || 0;
  const status = topScore >= 78 ? 'high-repetition-risk' : topScore >= 58 ? 'moderate-overlap' : 'distinct-thinking';
  return {
    version: 1,
    status,
    topScore,
    comparedCount: list(previousPatterns).filter(candidate => candidate?.type === pattern.workType && candidate?.id !== pattern.workId).length,
    matches,
    pattern
  };
}

export function formatIntellectualRepetitionContext(report) {
  if (!report) return '';
  const matches = list(report.matches).slice(0, 3).map(match =>
    '- مراجعة سابقة: ' + (match.title || match.id) + '؛ التشابه الفكري ' + match.score + '/100؛ زاوية متطابقة: ' + (match.components.sameAngle ? 'نعم' : 'لا') + '؛ تداخل الأسئلة: ' + Math.round(match.components.questionOverlap * 100) + '%.'
  );
  const instruction = report.status === 'high-repetition-risk'
    ? 'هناك احتمال قوي لتكرار المنهج أو الحجة. غيّر السؤال المركزي أو زاوية التحليل فعلياً، واستخرج دليلاً مختلفاً خاصاً بالعمل الحالي. لا تكتفِ بتبديل الكلمات أو العنوان. إذا لم تسمح الأدلة بزاوية مختلفة، صرّح بذلك ولا تختلق جدة.'
    : report.status === 'moderate-overlap'
      ? 'توجد نقاط تشابه مع مراجعات سابقة. ميّز هذه المراجعة عبر تفاصيل العمل وأدلته وسؤال نقدي مناسب، ولا تكرر الاستنتاج السابق تلقائياً.'
      : 'لم يظهر تكرار فكري مرتفع في الذاكرة المتاحة. لا يعني ذلك ضمان الجدة؛ حافظ على خصوصية الحجة والأدلة.';
  return [
    'كاشف التكرار الفكري V1 (يقيس تشابه الزاوية والأسئلة والحجة، لا تشابه العنوان فقط):',
    'الحالة: ' + report.status + '؛ أعلى تشابه: ' + report.topScore + '/100؛ مقارنات من الذاكرة: ' + report.comparedCount + '.',
    ...(matches.length ? ['أقرب أنماط سابقة:', ...matches] : ['لا توجد مراجعات سابقة من النوع نفسه للمقارنة.']),
    instruction,
    'لا تتعمد الاختلاف الشكلي إذا كانت الحجة نفسها مناسبة ومدعومة؛ الأولوية للصدق والأدلة، ثم للجدة الحقيقية.'
  ].join('\n');
}

export function buildIntellectualPatternRecord(item, reasoning, criticalQuestions, review = {}) {
  return currentPattern(item, reasoning, criticalQuestions, review);
}
