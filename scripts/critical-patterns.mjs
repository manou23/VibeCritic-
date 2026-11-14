const ALLOWED_RELATIONS = new Set([
  'has_genre', 'directed_by', 'created_by', 'developed_by',
  'produced_by', 'features'
]);
const LABELS = {
  has_genre: 'تكرار تصنيف',
  directed_by: 'تكرار مخرج',
  created_by: 'تكرار مبتكر',
  developed_by: 'تكرار مطوّر',
  produced_by: 'تكرار شركة إنتاج',
  features: 'تكرار عضو طاقم'
};
const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * Detects recurring catalog-level metadata only. It deliberately does not
 * infer artistic style, quality, influence, or causation from shared credits.
 */
export function deriveCriticalPatterns(graph, currentWorkId, options = {}) {
  const minimumWorks = Math.max(3, Number(options.minimumWorks) || 3);
  const entities = new Map((Array.isArray(graph?.entities) ? graph.entities : []).map(item => [item.id, item]));
  const relations = Array.isArray(graph?.relations) ? graph.relations : [];
  const currentWork = entities.get(currentWorkId);
  if (!currentWork || currentWork.kind !== 'work') return [];

  const groups = new Map();
  for (const edge of relations) {
    if (!ALLOWED_RELATIONS.has(edge.type) || !Array.isArray(edge.evidence) || !edge.evidence.length) continue;
    const work = entities.get(edge.from);
    const feature = entities.get(edge.to);
    if (!work || work.kind !== 'work' || !feature) continue;
    const key = edge.type + '|' + edge.to;
    if (!groups.has(key)) groups.set(key, { relation: edge.type, feature, works: new Map(), sources: new Set() });
    const group = groups.get(key);
    group.works.set(work.id, work);
    for (const evidence of edge.evidence) {
      if (clean(evidence.source)) group.sources.add(clean(evidence.source));
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => group.works.has(currentWorkId) && group.works.size >= minimumWorks)
    .map(([key, group]) => {
      const works = [...group.works.values()].sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
      const count = works.length;
      return {
        id: key,
        kind: 'metadata-recurrence',
        label: LABELS[group.relation] || 'نمط بيانات متكرر',
        relation: group.relation,
        feature: group.feature.name,
        workCount: count,
        works: works.slice(0, 8).map(work => ({ id: work.id, name: work.name, type: work.workType || null })),
        sourceCount: group.sources.size,
        confidence: count >= 5 && group.sources.size >= 2 ? 'moderate' : 'limited',
        status: 'observed-not-interpreted',
        interpretation: 'تكرار موثق في بيانات الكتالوج فقط؛ لا يثبت أسلوباً فنياً أو جودة أو تأثيراً أو علاقة سببية.',
        limitations: [
          'الحد الأدنى ثلاثة أعمال مستقلة قبل إظهار النمط.',
          'غياب علاقة من الرسم لا يُعامل كدليل على غيابها.',
          'لا يُحوّل تكرار الاسم أو التصنيف إلى حكم نقدي دون مراجعة أدلة مستقلة لكل عمل.'
        ]
      };
    })
    .sort((a, b) => b.workCount - a.workCount || a.label.localeCompare(b.label))
    .slice(0, 12);
}

export function formatCriticalPatternsContext(patterns) {
  if (!Array.isArray(patterns) || !patterns.length) return '';
  return [
    'أنماط metadata متكررة اختُبرت عبر أعمال مستقلة (ليست استنتاجات فنية):',
    ...patterns.slice(0, 6).map(pattern =>
      '- ' + pattern.label + ' «' + pattern.feature + '» ظهر في ' + pattern.workCount +
      ' أعمال؛ مستوى الإشارة: ' + pattern.confidence + '؛ الأعمال: ' +
      pattern.works.map(work => work.name).join('، ') + '. الحالة: رصد غير مفسّر.'
    ),
    'قيود إلزامية: ' + patterns[0].limitations.join(' '),
    'لا تصف هذه الأنماط بأنها أسلوب أو تأثير أو جودة. استخدمها فقط لتوليد سؤال بحثي، ثم اطلب أدلة مستقلة من محتوى الأعمال ومصادرها.'
  ].join('\n');
}
