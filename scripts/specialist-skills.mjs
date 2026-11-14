const clean = value => String(value ?? '').replace(/[\\r\\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const names = value => list(value).map(value => typeof value === 'string' ? clean(value) : clean(value?.name)).filter(Boolean);
const unique = values => [...new Set(values.filter(Boolean))];

export const SPECIALIST_SKILLS = Object.freeze([
  {
    id: 'game-systems',
    types: ['game'],
    title: 'تصميم أنظمة اللعب',
    requires: ['genres'],
    questions: ['ما الحلقة الأساسية للعب التي تثبتها المصادر؟', 'كيف ترتبط الأنظمة المعلنة بهدف اللاعب وقراراته؟', 'هل يوجد دليل على العمق أو التوازن أم أن ذلك ما زال مجهولاً؟'],
    method: 'حلّل علاقة الأنظمة الموثقة ببعضها وبنوع اللعبة، وافصل وصف الميزة عن الحكم على جودة تنفيذها.',
    limits: 'لا تستنتج سلاسة التحكم أو عمق الأنظمة أو التوازن أو المتعة من التصنيفات والوصف التسويقي.'
  },
  {
    id: 'game-technical',
    types: ['game'],
    title: 'الأداء والهندسة التقنية للألعاب',
    requires: ['platforms'],
    questions: ['ما المنصات والإصدارات التي تتوفر عنها قياسات فعلية؟', 'هل توجد بيانات مستقلة عن الدقة ومعدل الإطارات والثبات؟', 'هل تختلف النتائج بين المنصات أو أوضاع الأداء؟'],
    method: 'لا يصدر حكم أداء إلا عند وجود قياسات موثقة مرتبطة بمنصة وإصدار محددين، مع ذكر ظروف الاختبار.',
    limits: 'اسم المنصة أو المحرك أو المطور لا يثبت الأداء أو جودة التحسين أو خلو اللعبة من الأخطاء.'
  },
  {
    id: 'game-world-level-design',
    types: ['game'],
    title: 'تصميم العالم والمراحل',
    requires: ['description', 'genres'],
    questions: ['هل العالم مفتوح أم خطي وفق مصدر موثوق؟', 'كيف ترتبط بنية العالم بتنوع الأنشطة ومسارات اللاعب؟', 'ما الذي لا يمكن استنتاجه من الخريطة أو الوصف وحدهما؟'],
    method: 'اربط بنية العالم المعلنة بنوع التجربة، ولا تحكم على الاستكشاف أو تصميم المراحل دون وصف موثق أو تحليل مستقل.',
    limits: 'لا تخترع حجم الخريطة أو كثافة الأنشطة أو حرية الاختيار أو جودة المهمات.'
  },
  {
    id: 'film-direction-cinematography',
    types: ['movie', 'series'],
    title: 'الإخراج واللغة السينمائية',
    requires: ['directors'],
    questions: ['ما القرارات البصرية أو الإخراجية التي وصفتها مصادر موثوقة؟', 'كيف تخدم حركة الكاميرا والتكوين والإضاءة المعنى؟', 'هل يوجد أساس لتحليل أسلوب المخرج في هذا العمل تحديداً؟'],
    method: 'حلّل القرار البصري المحدد ووظيفته الدرامية، وميّز بين بيانات الطاقم وبين الدليل على التنفيذ.',
    limits: 'وجود اسم مخرج أو شركة إنتاج لا يثبت جودة الصورة أو التكوين أو الإخراج.'
  },
  {
    id: 'screenwriting-narrative',
    types: ['movie', 'series'],
    title: 'السيناريو والبناء السردي',
    requires: ['description'],
    questions: ['ما الصراع أو الفكرة التي يثبتها الوصف الرسمي؟', 'هل تتوفر معلومات موثوقة عن بنية السرد أو كتابة الحلقات؟', 'كيف يمكن تحليل الفكرة دون اختلاق أحداث أو حرق؟'],
    method: 'حلّل الفرضية والصراع المعلن والإيقاع البنائي فقط عندما تدعمها بيانات كافية، ولا تستبدل غياب النص بتخمين.',
    limits: 'الملخص لا يثبت جودة الحوار أو تماسك الحبكة أو تطور الشخصيات أو نهاية العمل.'
  },
  {
    id: 'acting-character',
    types: ['movie', 'series'],
    title: 'الأداء وبناء الشخصيات',
    requires: ['cast'],
    questions: ['من أفراد الطاقم المثبتون؟', 'هل توجد مادة موثوقة تصف أداءً أو علاقة بين الشخصيات؟', 'ما الفرق بين تحليل التشكيلة والحكم على التمثيل؟'],
    method: 'استخدم أسماء الممثلين لفهم التشكيلة فقط؛ لا تصف الأداء إلا استناداً إلى مراجعات مستقلة أو معلومات موثوقة محددة.',
    limits: 'أسماء الممثلين أو أدوارهم لا تثبت جودة الأداء أو الكيمياء أو عمق الشخصيات.'
  },
  {
    id: 'series-structure',
    types: ['series'],
    title: 'بناء المسلسل وإيقاع الحلقات',
    requires: ['format'],
    questions: ['ما عدد المواسم والحلقات أو مددها المؤكدة؟', 'هل توجد أدلة على بنية الموسم وتطور خطوطه؟', 'هل يخدم الامتداد السردي الفكرة أم يكررها؟'],
    method: 'استخدم بيانات الحلقات والمواسم كسياق، ولا تستنتج الإيقاع أو الحشو دون شواهد عن الحلقات نفسها.',
    limits: 'عدد الحلقات أو مدة الحلقة لا يثبتان جودة الإيقاع أو تماسك الموسم.'
  },
  {
    id: 'sound-music',
    types: ['movie', 'series', 'game'],
    title: 'الموسيقى والتصميم الصوتي',
    requires: ['soundCredits'],
    questions: ['من الملحن أو مصمم الصوت إذا ورد اسمه في مصدر موثوق؟', 'هل تتوفر أمثلة أو مراجعات تصف وظيفة الصوت؟', 'هل يخدم الصوت التوتر أو الإيقاع أو وضوح اللعب؟'],
    method: 'اربط المعلومات الموثقة عن فريق الصوت أو أمثلة الاستخدام بوظيفتها، ولا تمنح حكماً سمعياً دون مادة داعمة.',
    limits: 'وجود اسم ملحن أو اعتماد تقني لا يثبت جودة الموسيقى أو المزج أو المؤثرات.'
  }
]);

function evidenceFor(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const description = clean(item?.description || item?.summary || '');
  const directors = unique([...names(metadata.directors), ...names(metadata.creators)]);
  const cast = unique(names(metadata.cast));
  const platforms = unique([...names(metadata.platforms), ...names(item?.platforms)]);
  const genres = unique([...names(item?.genres), ...names(metadata.genres)]);
  const soundCredits = unique([...names(metadata.composers), ...names(metadata.soundDesigners), ...names(metadata.musicBy)]);
  const format = unique([
    Number(metadata.seasons) > 0 ? 'seasons:' + Number(metadata.seasons) : '',
    Number(metadata.episodes) > 0 ? 'episodes:' + Number(metadata.episodes) : '',
    Number(metadata.runtime) > 0 ? 'runtime:' + Number(metadata.runtime) : '',
    ...list(metadata.episodeRuntime).map(Number).filter(value => value > 0).map(value => 'episodeRuntime:' + value)
  ]);
  return { description, directors, cast, platforms, genres, soundCredits, format };
}

function readiness(skill, evidence) {
  const checks = skill.requires.map(key => {
    if (key === 'description') return evidence.description.length >= 140;
    return evidence[key]?.length > 0;
  });
  return { ready: checks.every(Boolean), satisfied: checks.filter(Boolean).length, required: checks.length };
}

export function buildSpecialistSkillContext(item, options = {}) {
  const type = ['game', 'movie', 'series'].includes(item?.type) ? item.type : 'unknown';
  const evidence = evidenceFor(item);
  const pool = SPECIALIST_SKILLS
    .filter(skill => skill.types.includes(type))
    .map(skill => ({ skill, ...readiness(skill, evidence) }))
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.satisfied - a.satisfied || a.skill.id.localeCompare(b.skill.id));
  const limit = Math.max(1, Math.min(3, Number(options.limit) || 3));
  const selected = pool.filter(entry => entry.ready).slice(0, limit);
  const availableEvidence = {
    genres: evidence.genres,
    platforms: evidence.platforms,
    directors: evidence.directors,
    cast: evidence.cast.slice(0, 8),
    soundCredits: evidence.soundCredits,
    format: evidence.format
  };
  return {
    version: 1,
    workType: type,
    selected: selected.map(entry => ({ id: entry.skill.id, title: entry.skill.title, requires: entry.skill.requires })),
    deferred: pool.filter(entry => !entry.ready).map(entry => ({ id: entry.skill.id, title: entry.skill.title, missing: entry.skill.requires.filter(key => key === 'description' ? evidence.description.length < 140 : !evidence[key]?.length) })),
    availableEvidence,
    context: selected.length ? [
      'مكتبة المهارات التخصصية V1: اخترنا مهارات بناءً على نوع العمل والبيانات المتاحة، لا على ادعاء امتلاك تجربة مباشرة.',
      ...selected.flatMap(entry => [
        'المهارة: ' + entry.skill.title + ' (' + entry.skill.id + ').',
        'أسئلة التحليل: ' + entry.skill.questions.join('؛ '),
        'منهج العمل: ' + entry.skill.method,
        'حدود الحكم: ' + entry.skill.limits
      ]),
      'الأدلة التعريفية المتاحة: ' + JSON.stringify(availableEvidence),
      'لا تعرض الأسئلة كأنها حقائق. إذا لم تتوفر إجابة موثقة، صرّح بحدود المعرفة وتجنب ملء الفراغ.'
    ].join('\\n') : 'لم تتوفر بيانات كافية لتفعيل مهارة تخصصية؛ لا تختلق تحليلاً فنياً لإخفاء هذا النقص.'
  };
}
