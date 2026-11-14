const REGISTRY = Object.freeze({
  VIBECRITIC_D1: {
    domains: ['vibecritic.pages.dev'],
    sourceClass: 'derived-catalog-context',
    scope: 'روابط مقارنة مستنتجة من تقاطع التصنيفات وأسماء الطاقم داخل كتالوج VibeCritic المبني على بيانات TMDB.',
    limits: 'لا تثبت التشابه الفني أو الاقتباس أو التأثير أو الجودة؛ هي علاقات فهرسية أولية تحتاج إلى أدلة مستقلة.'
  },
  TMDB: {
    domains: ['themoviedb.org'],
    sourceClass: 'catalog-database',
    scope: 'بيانات تعريف الأفلام والمسلسلات والطاقم والتصنيفات وتواريخ الإصدار المدرجة في TMDB.',
    limits: 'لا يثبت وحده جودة العمل أو أثره الفني أو صحة كل معلومة خارج نطاق بيانات الكتالوج.'
  },
  IGDB: {
    domains: ['igdb.com'],
    sourceClass: 'game-database',
    scope: 'بيانات تعريف الألعاب والمنصات والشركات والتصنيفات المدرجة في IGDB.',
    limits: 'لا يثبت وحده جودة تجربة اللعب أو الأداء الفعلي أو المبيعات.'
  },
  RAWG: {
    domains: ['rawg.io'],
    sourceClass: 'game-database',
    scope: 'بيانات تعريف الألعاب والمنصات والمطورين ومؤشرات النشاط التي يعرضها RAWG.',
    limits: 'مؤشرات الإضافة والشعبية ليست مبيعات ولا دليلاً على الجودة.'
  }
});

function clean(value) {
  return String(value ?? '').trim();
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

export function resolveSourceEvidence(input = {}) {
  const source = clean(input.source).toUpperCase();
  const field = clean(input.field);
  const definition = REGISTRY[source];
  if (!definition || !field) return null;

  let url = null;
  const candidate = clean(input.url);
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' || !definition.domains.some(domain => domainMatches(parsed.hostname.toLowerCase(), domain))) return null;
      url = parsed.toString();
    } catch {
      return null;
    }
  }

  const observedAt = clean(input.observedAt) || new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) return null;

  return {
    source,
    field,
    url,
    observedAt,
    sourceClass: definition.sourceClass,
    sourceScope: definition.scope,
    sourceLimitations: definition.limits
  };
}

export function getSourceRegistrySummary() {
  return Object.entries(REGISTRY).map(([id, entry]) => ({
    id, sourceClass: entry.sourceClass, domains: [...entry.domains],
    scope: entry.scope, limitations: entry.limits
  }));
}
