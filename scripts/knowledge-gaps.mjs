const clean = value => String(value ?? '').replace(/[\\r\\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const names = value => list(value).map(entry => typeof entry === 'string' ? clean(entry) : clean(entry?.name)).filter(Boolean);
const unique = values => [...new Set(values.map(clean).filter(Boolean))];

function dateOnly(value) {
  const date = clean(value).slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) ? date : '';
}

function fieldGap(id, label, question, severity = 'medium') {
  return { id, label, question, severity };
}

export function assessKnowledgeGaps(item, options = {}) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const type = ['game', 'series', 'movie'].includes(item?.type) ? item.type : 'unknown';
  const today = dateOnly(options.today) || new Date().toISOString().slice(0, 10);
  const releaseDate = dateOnly(item?.date);
  const isPreview = Boolean(releaseDate && releaseDate > today);
  const description = clean(item?.description || item?.summary || '');
  const genres = unique([...names(item?.genres), ...names(metadata.genres)]);
  const cast = unique(names(metadata.cast).map(value => value.split(' بدور ')[0].trim()));
  const directors = unique(names(metadata.directors));
  const creators = unique(names(metadata.creators));
  const leaders = unique([...directors, ...creators]);
  const platforms = unique([...names(metadata.platforms), ...names(item?.platforms)]);
  const developers = unique([...names(metadata.developers), ...names(item?.developers)]);
  const rating = Number(item?.rating ?? metadata.voteAverage ?? 0);
  const voteCount = Number(item?.sourceVoteCount ?? metadata.voteCount ?? metadata.ratingCount ?? 0);
  const metacritic = Number(metadata.metacritic ?? 0);
  const missingFields = [];

  if (!releaseDate) missingFields.push(fieldGap('release_date', 'تاريخ الإصدار', 'ما تاريخ الإصدار المؤكد من صفحة المصدر الرسمية؟', 'high'));
  if (description.length < 140) missingFields.push(fieldGap('source_description', 'وصف موثوق ومفصل', 'هل يوجد وصف رسمي أطول يوضح الفكرة والسياق دون استنتاجات؟', 'high'));
  if (!genres.length) missingFields.push(fieldGap('genres', 'التصنيفات', 'ما التصنيفات التي يسجلها مصدر موثوق لهذا العمل؟', 'medium'));

  if (type === 'game') {
    if (!platforms.length) missingFields.push(fieldGap('platforms', 'المنصات', 'ما المنصات المؤكدة رسمياً لهذا الإصدار؟', 'high'));
    if (!developers.length) missingFields.push(fieldGap('developers', 'المطور', 'من المطور المسجل في مصدر موثوق، وهل يختلف عن الناشر؟', 'high'));
    if (!isPreview && !(rating > 0 && voteCount >= 5) && metacritic < 60) {
      missingFields.push(fieldGap('reception_sample', 'عينة تقييمات كافية', 'هل توجد عينة تقييمات قابلة للتحقق أو مراجعات مستقلة كافية؟', 'medium'));
    }
  } else if (type === 'movie' || type === 'series') {
    if (cast.length < 3) missingFields.push(fieldGap('cast', 'طاقم تمثيل كافٍ', 'ما أسماء ثلاثة من أفراد الطاقم على الأقل كما يسجلها المصدر؟', 'medium'));
    if (!leaders.length) missingFields.push(fieldGap('creative_leadership', type === 'series' ? 'صنّاع المسلسل' : 'المخرج', 'من المخرج أو صانع العمل المسجل رسمياً؟', 'high'));
    const hasFormat = Number(metadata.runtime) > 0 || Number(metadata.seasons) > 0 || Number(metadata.episodes) > 0;
    if (!hasFormat) missingFields.push(fieldGap('format', 'بيانات الشكل والمدة', 'هل تتوفر مدة الفيلم أو عدد مواسم/حلقات المسلسل؟', 'low'));
    if (!isPreview && !(rating > 0 && voteCount >= 5)) {
      missingFields.push(fieldGap('reception_sample', 'عينة تقييمات كافية', 'هل توجد عينة تقييمات جمهور كافية ومصدرية لهذا العمل؟', 'medium'));
    }
  }

  const blindSpots = type === 'game'
    ? [
        { id: 'gameplay_systems', label: 'آليات اللعب وتصميم الأنظمة', why: 'بيانات الكتالوج لا تثبت كيف تعمل الأنظمة فعلياً أو مدى عمقها.' },
        { id: 'platform_performance', label: 'الأداء التقني لكل منصة', why: 'قائمة المنصات لا تثبت معدل الإطارات أو الدقة أو الثبات أو الأخطاء.' },
        { id: 'level_design', label: 'تصميم المراحل والعالم التفاعلي', why: 'التصنيفات والوصف لا تكشف جودة تصميم المراحل أو حرية اللاعب.' },
        { id: 'narrative_execution', label: 'تنفيذ القصة والشخصيات', why: 'النبذة وأسماء الطاقم لا تثبت جودة الكتابة أو الأداء الصوتي.' },
        { id: 'progression_balance', label: 'التقدم والتوازن', why: 'بيانات التعريف لا تثبت الإيقاع أو التوازن أو اقتصاد التقدم.' }
      ]
    : [
        { id: 'script_execution', label: 'تنفيذ السيناريو وبناء المشاهد', why: 'الملخص والتصنيفات لا يثبتان تماسك السيناريو أو جودة المشاهد.' },
        { id: 'acting_performance', label: 'الأداء التمثيلي الفعلي', why: 'أسماء الممثلين لا تثبت جودة الأداء أو الكيمياء بينهم.' },
        { id: 'direction_visual_language', label: 'الإخراج واللغة البصرية', why: 'اسم المخرج وبيانات الكتالوج لا تثبت القرارات البصرية أو تنفيذها.' },
        { id: 'sound_design', label: 'الموسيقى والتصميم الصوتي', why: 'بيانات الكتالوج لا تقدم دليلاً على جودة الصوت أو الموسيقى.' },
        { id: 'pacing_structure', label: 'الإيقاع والبناء', why: 'المدة وعدد الحلقات لا يثبتان تماسك الإيقاع أو بنية السرد.' }
      ];

  const unresolvedConflicts = list(options.unresolvedConflicts)
    .filter(entry => entry && entry.status !== 'resolved')
    .map(entry => ({ field: clean(entry.field) || 'unknown', note: clean(entry.note) }))
    .slice(0, 8);

  const availableCore = [
    Boolean(releaseDate), description.length >= 140, genres.length > 0,
    type === 'game' ? platforms.length > 0 : cast.length >= 3,
    type === 'game' ? developers.length > 0 : leaders.length > 0
  ].filter(Boolean).length;
  const totalCore = 5;
  const risk = missingFields.some(gap => gap.severity === 'high') || unresolvedConflicts.length ? 'high'
    : missingFields.length ? 'medium' : 'bounded';
  const status = missingFields.some(gap => gap.severity === 'high') || unresolvedConflicts.length
    ? 'evidence-incomplete' : missingFields.length ? 'partial' : 'metadata-covered';

  return {
    version: 1,
    workKey: type + ':' + clean(item?.id || item?.name || 'unknown'),
    workName: clean(item?.name || item?.title || 'عمل غير محدد'),
    workType: type,
    source: clean(item?.source || '') || null,
    sourceUrl: clean(item?.sourceUrl || '') || null,
    releaseMode: isPreview ? 'preview' : 'released-or-unknown',
    assessedAt: clean(options.assessedAt) || new Date().toISOString(),
    coverage: { availableCore, totalCore, ratio: Number((availableCore / totalCore).toFixed(2)) },
    missingFields,
    unresolvedConflicts,
    blindSpots,
    risk,
    status,
    principle: 'غياب الدليل ليس دليلاً على وجود عيب؛ لا تحوّل الثغرات إلى أحكام سلبية أو حقائق مختلقة.'
  };
}

export function formatKnowledgeGapContext(report) {
  if (!report) return '';
  const missing = list(report.missingFields).slice(0, 6).map(gap =>
    '- معلومة ناقصة (' + gap.label + '): ' + gap.question
  );
  const conflicts = list(report.unresolvedConflicts).slice(0, 5).map(entry =>
    '- تعارض غير محسوم في الحقل ' + entry.field + ': لا تعتمد قيمة واحدة قبل التحقق.'
  );
  const blindSpots = list(report.blindSpots).slice(0, 5).map(entry =>
    '- ' + entry.label + ': ' + entry.why
  );
  return [
    'خريطة الثغرات المعرفية V1 (تشخيص لما لا تثبته البيانات، وليست حكماً على العمل):',
    'حالة التغطية: ' + report.status + '؛ المخاطر المعرفية: ' + report.risk + '؛ اكتمال الحقول الأساسية: ' + report.coverage.availableCore + '/' + report.coverage.totalCore + '.',
    ...(missing.length ? ['معلومات ينبغي البحث عنها لاحقاً:', ...missing] : ['لم تُكتشف فجوات في الحقول التعريفية الأساسية وفق الفحص الحالي.']),
    ...(conflicts.length ? ['تعارضات تتطلب تحققاً:', ...conflicts] : []),
    'جوانب لا تثبتها بيانات الكتالوج وحدها:', ...blindSpots,
    report.principle,
    'لا تملأ هذه الفجوات بالاستنتاج الحر. لا تذكرها كلها كتحذير آلي في المقال؛ استخدم فقط ما يؤثر مباشرة في الزاوية المختارة، وميّز بين المعلومة الناقصة والعيب المثبت.'
  ].join('\\n');
}
