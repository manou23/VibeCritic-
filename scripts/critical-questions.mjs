const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const domainOf = value => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
};

const QUESTION_SETS = Object.freeze({
  game: [
    { id: 'core-loop', area: 'أنظمة اللعب', question: 'ما الحلقة الأساسية للعب، وكيف تتصل قرارات اللاعب ببعضها؟', why: 'وصف اللعبة أو تصنيفها لا يثبت عمق الأنظمة أو متعتها.', evidenceKey: 'gameplay_observations', required: 'تحليل مستقل موثق لآليات اللعب أو ملاحظات لعب قابلة للتحقق.' },
    { id: 'technical-performance', area: 'الأداء التقني', question: 'هل يظل الأداء مستقراً على كل منصة، وتحت أي إعدادات وظروف اختبار؟', why: 'قائمة المنصات لا تثبت الدقة أو معدل الإطارات أو الثبات.', evidenceKey: 'performance_tests', required: 'قياسات منشورة تحدد المنصة والإصدار والإعدادات وظروف الاختبار.' },
    { id: 'world-design', area: 'تصميم العالم والمراحل', question: 'هل يخدم تصميم العالم الاستكشاف والمهام، أم يكرر الأنشطة دون معنى؟', why: 'حجم العالم أو وصفه لا يثبت جودة تصميمه.', evidenceKey: 'level_design_analysis', required: 'تحليل موثق لتصميم المراحل أو العالم مع أمثلة محددة.' },
    { id: 'narrative-execution', area: 'السرد والشخصيات', question: 'هل تتطور الشخصيات والصراعات عبر أحداث متماسكة دون إضعاف إيقاع اللعب؟', why: 'النبذة وأسماء الطاقم لا تثبت جودة التنفيذ السردي.', evidenceKey: 'narrative_analysis', required: 'مراجعات أو تحليلات مستقلة تستند إلى تفاصيل العمل الصادر.' },
    { id: 'progression-balance', area: 'التقدم والتوازن', question: 'هل يكافئ نظام التقدم قرارات اللاعب، أم يفرض تكراراً مصطنعاً؟', why: 'بيانات الكتالوج لا تكشف اقتصاد التقدم أو التوازن.', evidenceKey: 'progression_analysis', required: 'تحليل موثق لأنظمة التقدم والتوازن مع أمثلة.' }
  ],
  movie: [
    { id: 'screenplay', area: 'السيناريو', question: 'هل يتطور الصراع منطقياً، وهل تخدم المشاهد الفكرة بدلاً من شرحها فقط؟', why: 'الملخص لا يثبت تماسك السيناريو أو جودة الحوار.', evidenceKey: 'script_analysis', required: 'تحليل مستقل يستند إلى بنية الفيلم ومشاهده دون حرق غير ضروري.' },
    { id: 'acting', area: 'الأداء والشخصيات', question: 'هل يمنح الأداء الشخصيات عمقاً يتجاوز ما تقوله الحبكة عنها؟', why: 'أسماء الممثلين لا تثبت جودة الأداء أو الكيمياء.', evidenceKey: 'acting_analysis', required: 'ملاحظات نقدية محددة عن الأداء أو مراجعات مستقلة موثوقة.' },
    { id: 'direction', area: 'الإخراج والصورة', question: 'كيف تخدم اختيارات الكاميرا والإضاءة والتكوين الحالة الدرامية؟', why: 'اسم المخرج أو شركة الإنتاج لا يثبت جودة التنفيذ البصري.', evidenceKey: 'direction_analysis', required: 'تحليل بصري موثق أو مراجعات تناقش قرارات إخراجية محددة.' },
    { id: 'sound', area: 'الصوت والموسيقى', question: 'هل يضيف الصوت والموسيقى معنى وتوتراً، أم يكتفيان بمرافقة الصورة؟', why: 'بيانات فريق الصوت لا تثبت جودة النتيجة.', evidenceKey: 'sound_analysis', required: 'تحليل صوتي أو مراجعات موثوقة تصف أمثلة محددة.' },
    { id: 'pacing', area: 'الإيقاع والبناء', question: 'هل يتناسب إيقاع الفيلم مع تطور فكرته وشخصياته؟', why: 'مدة الفيلم وحدها لا تثبت نجاح الإيقاع.', evidenceKey: 'structure_analysis', required: 'تحليل بنية الفيلم وتسلسل مشاهده من مصدر مستقل.' }
  ],
  series: [
    { id: 'season-arc', area: 'بناء الموسم', question: 'هل يبني الموسم قوساً درامياً متماسكاً أم يعتمد على حلقات منفصلة بلا تراكم؟', why: 'عدد الحلقات والمواسم لا يثبت تماسك البناء.', evidenceKey: 'season_structure_analysis', required: 'تحليل مستقل للحلقات وتطور خطوط الموسم.' },
    { id: 'episode-pacing', area: 'إيقاع الحلقات', question: 'هل تبرر كل حلقة زمنها وتضيف تطوراً فعلياً؟', why: 'مدة الحلقة لا تثبت وجود حشو أو غيابه.', evidenceKey: 'episode_pacing_analysis', required: 'مراجعات أو تحليل للحلقات مع أمثلة محددة.' },
    { id: 'screenplay', area: 'السيناريو', question: 'هل تتطور الصراعات والشخصيات باستمرار دون حلول سهلة أو تكرار؟', why: 'الوصف الرسمي لا يكشف جودة الكتابة الفعلية.', evidenceKey: 'script_analysis', required: 'تحليل مستقل يستند إلى أحداث الحلقات والحوار.' },
    { id: 'acting', area: 'الأداء والشخصيات', question: 'هل تحمل الشخصيات تطوراً مقنعاً عبر الحلقات؟', why: 'أسماء الطاقم لا تثبت جودة الأداء أو بناء الشخصيات.', evidenceKey: 'acting_analysis', required: 'ملاحظات نقدية محددة أو مراجعات مستقلة.' },
    { id: 'direction-sound', area: 'الإخراج والصوت', question: 'هل تحافظ اللغة البصرية والصوتية على هوية متماسكة وتخدم الدراما؟', why: 'أسماء المخرجين والملحنين لا تثبت جودة التنفيذ.', evidenceKey: 'direction_analysis', required: 'تحليل بصري/صوتي موثق أو مراجعات مستقلة.' }
  ]
});

function validatedEvidence(item, key) {
  return list(item?.criticalEvidence?.[key]).map(entry => {
    const source = clean(entry?.source);
    const url = clean(entry?.url);
    const domain = domainOf(url);
    const claim = clean(entry?.claim);
    const observedAt = clean(entry?.observedAt);
    if (!source || !claim || !domain || !/^https:\/\//i.test(url) || !Number.isFinite(Date.parse(observedAt))) return null;
    return { source, domain, claim: claim.slice(0, 420), url, observedAt };
  }).filter(Boolean).slice(0, 6);
}

export function assessCriticalQuestions(item, options = {}) {
  const type = ['game', 'movie', 'series'].includes(item?.type) ? item.type : 'unknown';
  const preview = options.preview === true;
  const set = QUESTION_SETS[type] || [];
  const questions = set.map(definition => {
    const evidence = preview ? [] : validatedEvidence(item, definition.evidenceKey);
    const domains = [...new Set(evidence.map(entry => entry.domain))];
    const status = domains.length >= 2 ? 'multi-domain' : evidence.length ? 'single-source' : 'unanswered';
    return {
      id: definition.id,
      area: definition.area,
      question: preview ? 'ما الذي أُعلن رسمياً بشأن: ' + definition.area + '، وما الذي لا يزال مجهولاً؟' : definition.question,
      why: definition.why,
      evidenceKey: definition.evidenceKey,
      requiredEvidence: definition.required,
      status,
      evidenceCount: evidence.length,
      distinctDomains: domains,
      evidence: evidence.map(({ source, domain, claim, url, observedAt }) => ({ source, domain, claim, url, observedAt }))
    };
  });
  const multiDomain = questions.filter(question => question.status === 'multi-domain').length;
  const singleSource = questions.filter(question => question.status === 'single-source').length;
  return {
    version: 1,
    workType: type,
    mode: preview ? 'preview' : 'review',
    questionCount: questions.length,
    multiDomain,
    singleSource,
    unanswered: questions.length - multi-domain - singleSource,
    questions,
    principle: 'السؤال النقدي ليس حقيقة. مصدر واحد لا يكفي للتعاضد؛ وغياب الدليل لا يثبت وجود عيب.'
  };
}

export function formatCriticalQuestionContext(report) {
  if (!report || !Array.isArray(report.questions)) return '';
  const lines = report.questions.map(question => {
    const evidence = question.evidence.length
      ? question.evidence.map(entry => entry.source + ' (' + entry.domain + '): ' + entry.claim).join(' | ')
      : 'لا يوجد دليل نقدي مباشر مسجل لهذا السؤال.';
    return [
      '- ' + question.area + ' [' + question.status + ']: ' + question.question,
      '  سبب السؤال: ' + question.why,
      '  الدليل المطلوب: ' + question.requiredEvidence,
      '  الأدلة المسجلة: ' + evidence
    ].join('\n');
  });
  return [
    'محرك الأسئلة النقدية V1:',
    'هذه أسئلة اختبار وليست استنتاجات أو أحكاماً جاهزة. عدد الأسئلة: ' + report.questionCount + '؛ مدعوم بنطاقين مختلفين: ' + report.multiDomain + '؛ مصدر واحد: ' + report.singleSource + '؛ بلا دليل مباشر: ' + report.unanswered + '.',
    ...lines,
    'لا تجب عن سؤال بلا دليل. المصدر الواحد يتيح الإشارة إلى معلومة منسوبة إليه فقط ولا يثبتها استقلالياً. لا تحوّل السؤال غير المحسوم إلى نقطة سلبية، ولا تخترع إجابة لسد فراغ المقال.',
    'إذا كانت المراجعة استباقية، ناقش ما أعلن رسمياً وما بقي مجهولاً فقط، ولا تصف تجربة لم تحدث.'
  ].join('\n');
}
