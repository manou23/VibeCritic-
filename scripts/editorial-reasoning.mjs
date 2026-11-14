const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const names = value => list(value).map(entry => typeof entry === 'string' ? clean(entry) : clean(entry?.name)).filter(Boolean);
const unique = values => [...new Set(values.map(clean).filter(value => value.length >= 2))];
const words = value => new Set(clean(value).toLocaleLowerCase('ar').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u).filter(word => word.length > 2));

export const EDITORIAL_MANIFESTO = Object.freeze({
  version: 1,
  identity: 'ناقد مستقل وصريح، لا يساير الضجة ولا يتحول إلى إعلان.',
  principles: [
    'افصل الحقائق المنقولة من المصدر عن القراءة النقدية والاستنتاج.',
    'اربط كل حكم بتفصيل محدد، ولا تملأ نقص البيانات بالتخمين.',
    'وازن بين نقاط القوة والتحفظات، ولا تصنع عيباً أو مديحاً لإكمال القائمة.',
    'اختر زاوية تخص هذا العمل، ولا تقلّد صياغة المراجعات السابقة أو قالب مزود الذكاء الاصطناعي.',
    'اعتبر الشعبية مؤشراً على الاهتمام لا دليلاً على الجودة.',
    'اعترف بحدود الأدلة، وتجاوز أي ادعاء لا يمكن إسناده.'
  ]
});

function similarity(left, right) {
  const a = words(left), b = words(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap++;
  return overlap / (a.size + b.size - overlap);
}

function buildEvidence(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const cast = names(metadata.cast).map(value => value.split(' بدور ')[0].trim());
  const leaders = unique([...names(metadata.directors), ...names(metadata.creators)]);
  const genres = unique([...names(item?.genres), ...names(metadata.genres)]);
  const platforms = unique([...names(metadata.platforms), ...names(item?.platforms)]);
  const developers = unique([...names(metadata.developers), ...names(item?.developers)]);
  const modes = unique([...names(metadata.gameModes), ...names(item?.gameModes), ...names(metadata.perspectives), ...names(item?.perspectives)]);
  const description = clean(item?.description || item?.summary || '');
  const format = [];
  if (Number(metadata.runtime) > 0) format.push('مدة الفيلم: ' + Number(metadata.runtime) + ' دقيقة');
  if (Number(metadata.seasons) > 0) format.push('عدد المواسم: ' + Number(metadata.seasons));
  if (Number(metadata.episodes) > 0) format.push('عدد الحلقات: ' + Number(metadata.episodes));
  const episodeRuntime = list(metadata.episodeRuntime).map(Number).filter(value => value > 0);
  if (episodeRuntime.length) format.push('مدة الحلقة المسجلة: ' + episodeRuntime.join('، ') + ' دقيقة');
  return { cast, leaders, genres, platforms, developers, modes, description, format };
}

function makeCandidate(id, label, question, instruction, groups, relevance, previousHeadlines) {
  const evidence = groups.map(group => ({ field: group.field, label: group.label, values: unique(group.values).slice(0, 8) })).filter(group => group.values.length);
  const anchors = unique(evidence.flatMap(group => group.values)).slice(0, 12);
  const groupCount = evidence.length, anchorCount = anchors.length;
  const supportability = Math.min(96, 42 + groupCount * 15 + anchorCount * 3);
  const specificity = Math.min(96, 28 + anchorCount * 9 + Math.min(18, Math.floor(anchors.join(' ').length / 35)));
  const maxSimilarity = Math.max(0, ...previousHeadlines.map(headline => similarity(label, headline)));
  const novelty = Math.round((1 - maxSimilarity) * 100);
  const score = Math.round(supportability * 0.35 + specificity * 0.25 + novelty * 0.25 + relevance * 0.15);
  return {
    id, label, question, instruction, evidence, anchors, evidenceGroups: groupCount,
    scores: { supportability, specificity, novelty, relevance },
    score, confidence: score >= 78 ? 'high' : score >= 62 ? 'medium' : 'limited',
    eligible: groupCount >= 2 && anchorCount >= 2 && score >= 48
  };
}

export function buildEditorialReasoning(item, options = {}) {
  const data = buildEvidence(item);
  const previousHeadlines = list(options.previousHeadlines).map(clean).filter(Boolean).slice(-80);
  const isGame = item?.type === 'game';
  const candidates = [];

  if (data.leaders.length && data.genres.length) candidates.push(makeCandidate(
    'creative-authorship', 'القيادة الإبداعية وهوية النوع',
    'كيف تتقاطع أسماء القيادة الإبداعية والتصنيفات المعلنة في تشكيل هوية هذا العمل؟',
    'حلّل ما يمكن قوله عن القيادة الإبداعية والنوع انطلاقاً من الأسماء والتصنيفات المثبتة. لا تنسب للمخرج أو المبدع أسلوباً أو نية أو تاريخاً فنياً غير موثق.',
    [{ field: 'directors_creators', label: 'القيادة الإبداعية', values: data.leaders }, { field: 'genres', label: 'التصنيفات', values: data.genres }],
    92, previousHeadlines
  ));

  if (data.cast.length >= 3 && data.genres.length) candidates.push(makeCandidate(
    'ensemble-and-characters', 'الطاقم وبنية الشخصيات',
    'ما الذي تسمح بيانات الطاقم والتصنيف بمناقشته عن الرهان التمثيلي والشخصيات؟',
    'اجعل الطاقم مدخلاً لتحليل التشكيلة والشخصيات فقط. لا تخترع أداءً أو كيمياء بين الممثلين أو تطوراً درامياً غير موثق؛ ميّز بين أسماء الطاقم وما يمكن الحكم عليه فعلاً.',
    [{ field: 'cast', label: 'أسماء الطاقم', values: data.cast }, { field: 'genres', label: 'التصنيفات', values: data.genres }],
    88, previousHeadlines
  ));

  if (isGame && data.platforms.length && data.developers.length) candidates.push(makeCandidate(
    'interactive-product-context', 'هوية اللعبة وسياقها التفاعلي',
    'كيف تحدد بيانات المطور والمنصات حدود ما يمكن تحليله عن هوية اللعبة وتجربتها؟',
    'اربط المطور والمنصات والتصنيفات بما هو معلوم فقط. لا تستنتج معدل الإطارات أو جودة الأداء أو آليات اللعب أو المحتوى من اسم المنصة أو المطور؛ اذكر بوضوح ما لا تكشفه البيانات.',
    [
      { field: 'developers', label: 'المطورون', values: data.developers },
      { field: 'platforms', label: 'المنصات', values: data.platforms },
      { field: 'genres', label: 'التصنيفات', values: data.genres },
      { field: 'game_modes', label: 'أنماط اللعب والمنظور', values: data.modes }
    ],
    96, previousHeadlines
  ));

  if (data.description.length >= 140 && data.genres.length) candidates.push(makeCandidate(
    'premise-and-genre', 'الفكرة وحدود النوع',
    'كيف تضع الفكرة المعلنة هذا العمل داخل نوعه، وما الذي لا تكشفه النبذة وحدها؟',
    'استخدم الوصف والتصنيفات لتحديد الفكرة المعلنة وتوقعات النوع، ثم افصل ذلك عن جودة التنفيذ التي لا تثبتها النبذة. لا تعِد صياغة الوصف ولا تتعامل معه كدليل على نجاح العمل.',
    [{ field: 'source_description', label: 'الوصف المصدر', values: [data.description.slice(0, 240)] }, { field: 'genres', label: 'التصنيفات', values: data.genres }],
    84, previousHeadlines
  ));

  if (data.format.length && (data.leaders.length || data.cast.length >= 3)) candidates.push(makeCandidate(
    'format-and-structure', 'البنية والشكل',
    'ما الذي تسمح به بيانات مدة العمل أو عدد مواسمه وحلقاته لمناقشة بنائه؟',
    'ناقش الشكل والمدة أو حجم الموسم كما وردت في البيانات فقط. لا تستنتج جودة الإيقاع أو تماسك السرد من المدة وحدها؛ استخدمها كسياق لا كحكم.',
    [{ field: 'format', label: 'بيانات الشكل والمدة', values: data.format }, { field: 'creative_team', label: 'الطاقم الإبداعي أو التمثيلي', values: [...data.leaders, ...data.cast].slice(0, 8) }],
    80, previousHeadlines
  ));

  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected = candidates[0] || null;
  return {
    version: 1, eligible: Boolean(selected?.eligible), selected, candidates: candidates.slice(0, 6),
    evidenceCount: selected?.anchors.length || 0,
    summary: selected
      ? 'تم اختيار زاوية "' + selected.label + '" بدرجة ' + selected.score + '/100 اعتماداً على ' + selected.evidenceGroups + ' مجموعات بيانات موثقة.'
      : 'لا توجد مجموعتان مستقلتان على الأقل من الأدلة تسمحان باختيار زاوية نقدية آمنة؛ يجب تأجيل التوليد بدلاً من اختلاق مادة تحليلية.'
  };
}

export function formatEditorialReasoningContext(reasoning) {
  if (!reasoning?.eligible || !reasoning.selected) return 'لا توجد زاوية نقدية مدعومة؛ لا تكتب المراجعة.';
  const selected = reasoning.selected;
  const evidenceLines = selected.evidence.map(group => '- ' + group.label + ' (' + group.field + '): ' + group.values.join('، '));
  const alternatives = reasoning.candidates.filter(entry => entry.id !== selected.id).slice(0, 3)
    .map(entry => '- زاوية بديلة: ' + entry.label + ' — ' + entry.score + '/100');
  return [
    'محرك التفكير التحريري الحتمي V1 (اختيار زاوية، وليس إثباتاً للحقيقة):',
    'الزاوية المختارة: ' + selected.label + ' — ' + selected.score + '/100 (' + selected.confidence + ').',
    'السؤال النقدي المركزي: ' + selected.question,
    'تعليمات التنفيذ: ' + selected.instruction,
    'مرتكزات هذه الزاوية من البيانات:', ...evidenceLines,
    'مقارنة الزوايا البديلة:', ...(alternatives.length ? alternatives : ['- لا توجد زاوية بديلة مدعومة بالقدر نفسه.']),
    'شخصية VibeCritic، إصدار ' + EDITORIAL_MANIFESTO.version + ': ' + EDITORIAL_MANIFESTO.identity,
    ...EDITORIAL_MANIFESTO.principles.map(principle => '- ' + principle),
    'لا تحوّل هذه المرتكزات إلى ادعاءات عن جودة أو أداء لم تذكره المصادر؛ كل استنتاج يحتاج تفسيراً وأساساً مستقلاً.'
  ].join('\n');
}

export function evaluateEditorialReview(item, review, reasoning, previousHeadlines = []) {
  const body = String(review?.review ?? '').trim(), headline = clean(review?.headline);
  const combined = (headline + ' ' + clean(review?.hook) + ' ' + body).toLocaleLowerCase('ar');
  const wordCount = body.split(/\s+/u).filter(Boolean).length;
  const sectionCount = (body.match(/^###\s+/gmu) || []).length;
  const charCount = body.length;
  const anchors = reasoning?.selected?.anchors || [];
  const anchorHits = anchors.filter(anchor => {
    const value = clean(anchor).toLocaleLowerCase('ar');
    return value.length >= 3 && combined.includes(value);
  }).length;
  const maxHeadlineSimilarity = Math.max(0, ...list(previousHeadlines).map(value => similarity(headline, value)));
  const structureScore = Math.round((
    Math.min(1, wordCount / 750) * 0.45 +
    Math.min(1, charCount / 3200) * 0.25 +
    Math.min(1, sectionCount / 5) * 0.30
  ) * 100);
  const evidenceAlignmentScore = Math.min(100, Math.round(35 + anchorHits * 10 + (reasoning?.selected?.evidenceGroups || 0) * 8));
  const noveltyScore = Math.round((1 - maxHeadlineSimilarity) * 100);
  const reasoningScore = Number(reasoning?.selected?.score) || 0;
  const score = Math.round(structureScore * 0.30 + evidenceAlignmentScore * 0.30 + noveltyScore * 0.20 + reasoningScore * 0.20);
  const flags = [];
  if (anchorHits === 0) flags.push('لم يعثر الفحص النصي على مرتكزات حرفية من بيانات المصدر؛ قد تكون الأسماء مترجمة، لذا يلزم تدقيق بشري.');
  if (maxHeadlineSimilarity >= 0.45) flags.push('العنوان قريب من صياغة سابقة ويحتاج مراجعة للتأكد من اختلاف الزاوية.');
  if (wordCount < 750 || charCount < 3200 || sectionCount < 5) flags.push('البنية لا تحقق أحد الحدود التحريرية الأساسية.');
  return {
    version: 1, score,
    status: structureScore >= 100 && noveltyScore >= 28 && reasoningScore >= 48 ? 'structural-pass' : 'review-required',
    metrics: { wordCount, charCount, sectionCount, anchorHits, anchorCount: anchors.length, maxHeadlineSimilarity: Number(maxHeadlineSimilarity.toFixed(3)), structureScore, evidenceAlignmentScore, noveltyScore, reasoningScore },
    flags,
    scope: 'فحص آلي للبنية والارتباط النصي بالبيانات والتميّز؛ لا يثبت صحة الوقائع ولا يغني عن التحقق من المصادر أو التقييم البشري.',
    sourceTruthVerified: false
  };
}
