import { EDITORIAL_MANIFESTO } from './editorial-reasoning.mjs';

const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const countMatches = (text, pattern) => [...String(text).matchAll(pattern)].length;

const PROMOTIONAL_PATTERNS = [
  /تجربة\s+لا\s+مثيل\s+لها/gu,
  /رحلة\s+لا\s+تنسى/gu,
  /تحفة\s+فنية/gu,
  /الأفضل\s+على\s+الإطلاق/gu,
  /تجربة\s+استثنائية/gu,
  /masterpiece/giu,
  /once[- ]in[- ]a[- ]lifetime/giu
];
const POPULARITY_PATTERNS = [
  /(?:الشعبية|الضجة|الانتشار|المبيعات|الترند).{0,45}(?:تثبت|تؤكد|تعني).{0,35}(?:الجودة|التميز|التفوق)/giu,
  /(?:الجودة|التميز).{0,35}(?:بسبب|لأن).{0,35}(?:الشعبية|المبيعات|الضجة)/giu,
  /popularity.{0,30}(?:proves|confirms).{0,25}quality/giu
];
const FIRST_HAND_PATTERNS = [
  /(?:لقد\s+)?(?:لعبت|شاهدت|جربت|اختبرت)\s+(?:هذه\s+)?(?:اللعبة|الفيلم|المسلسل|العمل|التجربة)/gu,
  /\bI\s+(?:played|watched|tested|experienced)\s+(?:this\s+)?(?:game|film|movie|series|show)\b/giu
];
const LIMITATION_PATTERNS = [
  /لا\s+(?:يمكن|يُمكن)\s+(?:الجزم|الحكم)/gu,
  /لا\s+تتوفر\s+(?:بيانات|معلومات|أدلة)/gu,
  /لم\s+يكشف\s+(?:المصدر|الفريق|المطور|العمل)/gu,
  /لا\s+تكفي\s+(?:المعلومات|البيانات|الأدلة)/gu,
  /ما\s+زال\s+غير\s+معلوم/gu,
  /لا\s+يمكن\s+تأكيد/gu,
  /not enough evidence/giu,
  /remains unknown/giu
];

function hasAny(text, patterns) {
  return patterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function uniqueWords(value) {
  return [...new Set(clean(value).toLocaleLowerCase('ar')
    .replace(/[ًٌٍَُِّْـ]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter(word => word.length > 2))];
}

export function buildPersonalityEvolutionGuidance(previousProfiles = []) {
  const history = list(previousProfiles).filter(profile => profile && profile.coreVersion === 1).slice(-12);
  const driftValues = history.map(profile => Number(profile.driftScore)).filter(Number.isFinite);
  const averageDrift = driftValues.length
    ? Number((driftValues.reduce((sum, value) => sum + value, 0) / driftValues.length).toFixed(1))
    : null;
  const recentAngles = [...new Set(history.map(profile => clean(profile.angleId)).filter(Boolean))];
  return [
    'اختبار تطور شخصية VibeCritic (النواة ثابتة والتعبير قابل للتطور):',
    'الهوية الثابتة: ' + EDITORIAL_MANIFESTO.identity,
    ...EDITORIAL_MANIFESTO.principles.map((principle, index) => (index + 1) + '. ' + principle),
    'لا تقلّد مراجعة سابقة ولا تكرر صياغاتها. طوّر زاوية العمل وإيقاعه وصوته بما يلائم موضوعه، مع الحفاظ على الصدق والاستقلال والتوازن.',
    'لا تدّع مشاهدة أو لعباً أو اختباراً شخصياً. لا تجعل الشعبية أو المبيعات دليلاً على الجودة. لا تكتب مديحاً تسويقياً ولا تفرض عيباً لمجرد صناعة توازن.',
    'إذا كانت الذاكرة تحتوي على ' + history.length + ' ملفاً شخصياً سابقاً، فمتوسط انحراف النواة المسجل هو ' + (averageDrift === null ? 'غير متاح بعد' : averageDrift + '/100') + '، وعدد الزوايا المختلفة المرصودة ' + recentAngles.length + '. هذه مؤشرات تشخيصية وليست هدفاً رقمياً أو سبباً لتغيير رأيك.',
    'الأولوية للأدلة والحكم المسبب؛ لا تحسّن المؤشرات بإضافة عبارات اعتذارية أو تحفظات شكلية لا تخدم القارئ.'
  ].join('\n');
}

export function assessPersonalityEvolution(item, review, reasoning, criticalQuestions, repetitionReport, previousProfiles = []) {
  const body = [
    review?.headline, review?.hook, review?.summary, review?.verdict, review?.review,
    ...list(review?.pros), ...list(review?.cons)
  ].map(clean).join(' ');
  const words = uniqueWords(body);
  const anchorValues = list(reasoning?.selected?.anchors).map(clean).filter(value => value.length >= 3);
  const anchorHits = anchorValues.filter(anchor => body.toLocaleLowerCase('ar').includes(anchor.toLocaleLowerCase('ar'))).length;
  const anchorRate = anchorValues.length ? anchorHits / anchorValues.length : 0;
  const promoHits = PROMOTIONAL_PATTERNS.reduce((sum, pattern) => sum + countMatches(body, pattern), 0);
  const popularityClaims = POPULARITY_PATTERNS.reduce((sum, pattern) => sum + countMatches(body, pattern), 0);
  const firstHandClaims = FIRST_HAND_PATTERNS.reduce((sum, pattern) => sum + countMatches(body, pattern), 0);
  const hasLimitations = hasAny(body, LIMITATION_PATTERNS);
  const unanswered = Math.max(0, Number(criticalQuestions?.unanswered) || 0);
  const prosCount = list(review?.pros).filter(value => clean(value)).length;
  const consCount = list(review?.cons).filter(value => clean(value)).length;
  const sectionCount = (String(review?.review || '').match(/^###\s+/gmu) || []).length;
  const wordCount = String(review?.review || '').split(/\s+/u).filter(Boolean).length;
  const penalties = {
    falseFirstHandClaim: firstHandClaims ? 30 : 0,
    promotionalLanguage: Math.min(25, promoHits * 12),
    popularityAsQuality: popularityClaims ? 30 : 0,
    imbalance: prosCount < 3 || consCount < 2 ? 10 : 0,
    weakEvidenceAnchoring: anchorValues.length && anchorRate < 0.15 ? 10 : 0,
    ignoredKnowledgeLimits: unanswered > 0 && !hasLimitations ? 15 : 0,
    repeatedThinking: repetitionReport?.status === 'high-repetition-risk' ? 10 : 0
  };
  const driftScore = Math.min(100, Object.values(penalties).reduce((sum, value) => sum + value, 0));
  const violations = Object.entries(penalties).filter(([, value]) => value > 0).map(([key]) => key);
  const previous = list(previousProfiles).filter(profile => profile && profile.workType === item?.type && profile.coreVersion === 1).slice(-12);
  const previousDrift = previous.map(profile => Number(profile.driftScore)).filter(Number.isFinite);
  const averagePreviousDrift = previousDrift.length
    ? Number((previousDrift.reduce((sum, value) => sum + value, 0) / previousDrift.length).toFixed(1))
    : null;
  const trend = averagePreviousDrift === null ? 'baseline'
    : driftScore <= averagePreviousDrift - 5 ? 'improving'
      : driftScore >= averagePreviousDrift + 5 ? 'needs-attention' : 'stable';
  const angleId = clean(reasoning?.selected?.id);
  const angleHistory = [...previous.map(profile => clean(profile.angleId)).filter(Boolean), angleId].filter(Boolean);
  const distinctAngles = [...new Set(angleHistory)].length;
  const status = driftScore >= 45 ? 'identity-drift-risk' : driftScore >= 25 ? 'minor-drift' : 'core-aligned';

  return {
    coreVersion: 1,
    workId: clean(item?.type) + ':' + clean(item?.id),
    workType: clean(item?.type),
    angleId,
    assessedAt: new Date().toISOString(),
    status,
    driftScore,
    trend,
    violations,
    principles: {
      independence: popularityClaims === 0 && promoHits === 0,
      evidenceHumility: firstHandClaims === 0 && (unanswered === 0 || hasLimitations),
      balancedJudgment: prosCount >= 3 && consCount >= 2,
      specificity: anchorValues.length === 0 || anchorRate >= 0.15,
      originality: repetitionReport?.status !== 'high-repetition-risk'
    },
    metrics: {
      wordCount, sectionCount, prosCount, consCount,
      anchorHits, anchorCount: anchorValues.length,
      promotionalPhraseHits: promoHits,
      popularityQualityClaims: popularityClaims,
      falseFirstHandClaims: firstHandClaims,
      unansweredQuestions: unanswered,
      limitationDisclosure: hasLimitations
    },
    evolution: {
      comparedProfiles: previous.length,
      averagePreviousDrift,
      distinctAnglesInWindow: distinctAngles,
      trend
    },
    scope: 'تقييم آلي لمؤشرات الالتزام بالهوية التحريرية، لا يفهم السخرية والسياق اللغوي دائماً ولا يثبت جودة النقد أو صحة الوقائع.'
  };
}

export function formatPersonalityEvolutionReport(report) {
  if (!report) return '';
  const labels = {
    falseFirstHandClaim: 'ادعاء تجربة شخصية غير مثبتة',
    promotionalLanguage: 'لغة ترويجية عامة',
    popularityAsQuality: 'ربط الشعبية بالجودة',
    imbalance: 'اختلال التوازن بين الإيجابيات والتحفظات',
    weakEvidenceAnchoring: 'ضعف الارتكاز على تفاصيل الأدلة',
    ignoredKnowledgeLimits: 'عدم التصريح بحدود المعرفة',
    repeatedThinking: 'ارتفاع خطر تكرار الحجة'
  };
  const issues = report.violations.map(key => '- ' + (labels[key] || key));
  return [
    'تقرير تطور الشخصية التحريرية V1:',
    'الحالة: ' + report.status + '؛ مؤشر الانحراف عن النواة: ' + report.driftScore + '/100؛ الاتجاه: ' + report.trend + '.',
    'المبادئ الثابتة: استقلال عن الضجة ' + (report.principles.independence ? 'محفوظ' : 'يحتاج مراجعة') +
      '؛ تواضع معرفي ' + (report.principles.evidenceHumility ? 'محفوظ' : 'يحتاج مراجعة') +
      '؛ توازن ' + (report.principles.balancedJudgment ? 'محفوظ' : 'يحتاج مراجعة') +
      '؛ خصوصية الأدلة ' + (report.principles.specificity ? 'محفوظة' : 'تحتاج مراجعة') + '.',
    ...(issues.length ? ['مؤشرات تحتاج انتباهاً:', ...issues] : ['لم يرصد الفحص مؤشرات انحراف واضحة عن النواة التحريرية.']),
    'هذا تشخيص لا يغيّر الحكم تلقائياً. لا تُضف عيوباً أو تحفظات مصطنعة لخفض المؤشر؛ صحّح الادعاء أو الأسلوب فقط إذا كان فعلاً غير منضبط.',
    'التطور المطلوب هو تنويع الأسئلة والزوايا والإيقاع مع ثبات النزاهة والاستقلال والتوازن، لا تغيير شخصية الناقد كل مرة.'
  ].join('\n');
}
