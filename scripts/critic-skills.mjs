const clean = value => String(value ?? '').replace(/[\\r\\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const names = value => list(value).map(entry => typeof entry === 'string' ? clean(entry) : clean(entry?.name)).filter(Boolean);
const unique = values => [...new Set(values.map(clean).filter(Boolean))];

const SKILLS = Object.freeze({
  movie: [
    { id: 'screenplay-structure', name: 'السيناريو والبناء الدرامي', evidence: ['description', 'genres'], questions: ['هل تتطور الفكرة إلى صراع واضح أم تظل النبذة مجرد فرضية؟', 'هل توجد أدلة موثقة على السببية وتطور الشخصيات؟'], limits: 'الملخص والتصنيف لا يثبتان جودة الحوار أو تماسك السيناريو؛ لا تحكم عليهما دون مادة تحليلية موثوقة.' },
    { id: 'directing-visual-language', name: 'الإخراج واللغة البصرية', evidence: ['directors', 'productionCompanies'], questions: ['ما القرارات الإخراجية التي يمكن إثباتها من مصادر موثوقة؟', 'كيف تخدم الصورة المعنى لا الزينة؟'], limits: 'اسم المخرج وشركة الإنتاج لا يثبتان أسلوب الصورة أو جودة التنفيذ.' },
    { id: 'acting-performance', name: 'الأداء وبناء الشخصيات', evidence: ['cast'], questions: ['ما الذي نعرفه عن توزيع الأدوار والشخصيات من المصدر؟', 'هل توجد مراجعات مستقلة موثوقة تصف الأداء بأمثلة محددة؟'], limits: 'قائمة الممثلين لا تثبت جودة الأداء أو الكيمياء أو تطور الشخصية.' },
    { id: 'sound-and-score', name: 'الموسيقى والتصميم الصوتي', evidence: ['description'], questions: ['هل تتوفر أدلة موثوقة عن الموسيقى أو التصميم الصوتي؟', 'كيف يؤثر الصوت في الإيقاع والمزاج عند وجود تحليل موثق؟'], limits: 'لا توجد بيانات كتالوج كافية للحكم على جودة الصوت؛ لا تخترع موسيقى أو مشاهد.' },
    { id: 'cinematic-pacing', name: 'الإيقاع والتماسك السينمائي', evidence: ['runtime', 'description'], questions: ['ما علاقة المدة بالبناء المعلن؟', 'هل توجد شواهد مستقلة على التكرار أو الترهل أو التكثيف؟'], limits: 'المدة وحدها ليست دليلاً على الإيقاع أو التماسك.' }
  ],
  series: [
    { id: 'season-architecture', name: 'هندسة الموسم والقوس الدرامي', evidence: ['seasons', 'episodes', 'description'], questions: ['هل يتضح قوس موسمي أم بنية حلقات مستقلة؟', 'ما الذي يمكن إثباته عن التصاعد والاستمرارية؟'], limits: 'عدد المواسم والحلقات لا يثبت جودة القوس الدرامي أو النهاية.' },
    { id: 'episode-rhythm', name: 'إيقاع الحلقات وبنيتها', evidence: ['episodeRuntime', 'episodes'], questions: ['هل توجد بيانات موثوقة عن تفاوت مدد الحلقات أو بنائها؟', 'هل تخدم بنية الحلقة التقدم الدرامي؟'], limits: 'المدة وعدد الحلقات لا يثبتان جودة الإيقاع.' },
    { id: 'character-arcs', name: 'تطور الشخصيات والعلاقات', evidence: ['cast', 'creators', 'description'], questions: ['ما العلاقات أو الشخصيات المثبتة في المصادر؟', 'هل توجد أدلة مستقلة على تطور الشخصيات عبر الحلقات؟'], limits: 'أسماء الطاقم والنبذة لا تثبت عمق الشخصيات أو جودة تطورها.' },
    { id: 'series-authorship', name: 'هوية الصنّاع والكتابة', evidence: ['creators', 'productionCompanies'], questions: ['من صانع المسلسل والجهات المنتجة كما تسجلها المصادر؟', 'هل توجد كتابة أو مقابلات موثقة تدعم قراءة اختياراته؟'], limits: 'الاسم أو سجل الأعمال لا يثبت نية فنية أو جودة كتابة هذا المسلسل.' },
    { id: 'series-audiovisual', name: 'الإخراج والصوت والصورة', evidence: ['directors', 'productionCompanies'], questions: ['ما الذي تثبته بيانات الإخراج والاعتمادات؟', 'هل توجد مراجعات مستقلة بأمثلة بصرية أو صوتية محددة؟'], limits: 'الاعتمادات لا تثبت الجودة التقنية أو الجمالية.' }
  ],
  game: [
    { id: 'gameplay-systems', name: 'أنظمة اللعب والميكانيكيات', evidence: ['gameModes', 'perspectives', 'sourceTags'], questions: ['ما الأنظمة التي وثقتها مصادر مباشرة أو مواد لعب موثوقة؟', 'كيف تتفاعل الأنظمة وما أثرها على قرارات اللاعب؟'], limits: 'النوع والمنظور لا يثبتان الميكانيكيات أو عمقها؛ لا تخترع أنظمة لعب.' },
    { id: 'world-and-level-design', name: 'تصميم العالم والمراحل', evidence: ['description', 'gameModes'], questions: ['ما بنية العالم أو المراحل التي تثبتها مواد موثوقة؟', 'كيف يؤثر التصميم في الاستكشاف والاختيار؟'], limits: 'الوصف التسويقي لا يثبت حرية العالم أو جودة تصميم المراحل.' },
    { id: 'technical-performance', name: 'الأداء التقني والمنصات', evidence: ['platforms', 'engines'], questions: ['ما المنصات والمحركات المعلنة؟', 'هل توجد اختبارات مستقلة لكل منصة تقيس الدقة والإطارات والثبات؟'], limits: 'المنصة أو المحرك لا يثبتان الأداء؛ لا تنشر أرقاماً دون اختبارات منشورة.' },
    { id: 'progression-and-balance', name: 'التقدم والتوازن والاقتصاد', evidence: ['description', 'gameModes'], questions: ['هل توجد بيانات موثوقة عن أنظمة التقدم أو الاقتصاد؟', 'هل تتوفر أدلة على التوازن أو منحنى الصعوبة؟'], limits: 'النبذة لا تثبت التوازن أو الاقتصاد أو منحنى الصعوبة.' },
    { id: 'game-narrative-and-audio', name: 'السرد والصوت داخل اللعبة', evidence: ['description', 'developers'], questions: ['ما عناصر السرد والشخصيات المثبتة؟', 'هل توجد أدلة موثوقة عن الأداء الصوتي أو الموسيقى؟'], limits: 'المطور والنبذة لا يثبتان جودة السرد أو التمثيل الصوتي.' }
  ]
});

function evidenceFor(skill, item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const values = {
    description: [item?.description || item?.summary],
    genres: [item?.genres, metadata.genres],
    directors: [metadata.directors],
    creators: [metadata.creators],
    cast: [metadata.cast],
    runtime: [metadata.runtime],
    episodeRuntime: [metadata.episodeRuntime],
    seasons: [metadata.seasons],
    episodes: [metadata.episodes],
    productionCompanies: [metadata.productionCompanies],
    platforms: [item?.platforms, metadata.platforms],
    developers: [item?.developers, metadata.developers],
    engines: [item?.engines, metadata.engines],
    gameModes: [item?.gameModes, metadata.gameModes],
    perspectives: [item?.perspectives, metadata.perspectives],
    sourceTags: [metadata.sourceTags]
  };
  return unique(skill.evidence.flatMap(key => (values[key] || []).flatMap(value => Array.isArray(value) ? names(value) : value == null || value === '' ? [] : [String(value)])));
}

export function assessSpecialistSkills(item) {
  const type = ['movie', 'series', 'game'].includes(item?.type) ? item.type : null;
  const skills = (type ? SKILLS[type] : []).map(skill => {
    const anchors = evidenceFor(skill, item);
    return {
      id: skill.id, name: skill.name, status: anchors.length ? 'contextual' : 'not-assessable',
      evidence: anchors.slice(0, 8), questions: skill.questions, limits: skill.limits,
      evidenceCeiling: 'catalog-context-only'
    };
  });
  return {
    version: 1, workType: type || 'unknown',
    skills, contextualCount: skills.filter(skill => skill.status === 'contextual').length,
    notAssessableCount: skills.filter(skill => skill.status === 'not-assessable').length,
    principle: 'المهارة تحدد طريقة السؤال والتحليل، ولا تمنح الناقد دليلاً غير موجود ولا تسمح بالحكم على جودة لا تثبتها البيانات.'
  };
}

export function formatSpecialistSkillContext(profile) {
  if (!profile?.skills?.length) return 'مكتبة المهارات المتخصصة: نوع العمل غير معروف؛ لا تفرض إطاراً نقدياً تخصصياً.';
  const lines = profile.skills.map(skill => {
    if (skill.status !== 'contextual') return '- ' + skill.name + ': غير قابل للتقييم من البيانات الحالية؛ لا تصدر حكماً فيه.';
    return [
      '- ' + skill.name + ' (سياق متاح فقط: ' + skill.evidence.join('، ') + '):',
      ...skill.questions.map(question => '  سؤال: ' + question),
      '  حد الاستدلال: ' + skill.limits
    ].join('\\n');
  });
  return [
    'مكتبة المهارات النقدية المتخصصة V1 — إطار عمل وليس مصدراً للحقائق:',
    'نوع العمل: ' + profile.workType + '؛ مهارات لها سياق بيانات: ' + profile.contextualCount + '؛ مهارات لا تسمح البيانات بتقييمها: ' + profile.notAssessableCount + '.',
    ...lines,
    profile.principle,
    'لا تدّع مشاهدة أو لعباً مباشراً. لا تحول سؤال المهارة إلى ادعاء. إذا لم تتوفر مادة مستقلة موثوقة، صرّح بحدود الحكم وتجاوز التقييم التفصيلي.'
  ].join('\\n');
}
