const list = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? '').trim();
const time = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const uniqueBy = (items, keyOf) => {
  const map = new Map();
  for (const item of list(items)) {
    if (!item || typeof item !== 'object') continue;
    const key = keyOf(item);
    if (!key) continue;
    const previous = map.get(key);
    if (!previous || time(item.updatedAt || item.lastObservedAt || item.assessedAt || item.capturedAt || item.reviewedAt) >=
        time(previous.updatedAt || previous.lastObservedAt || previous.assessedAt || previous.capturedAt || previous.reviewedAt)) {
      map.set(key, { ...(previous || {}), ...item });
    }
  }
  return [...map.values()];
};
const earliest = values => values.filter(Boolean).sort((a, b) => time(a) - time(b))[0] || null;
const latest = values => values.filter(Boolean).sort((a, b) => time(b) - time(a))[0] || null;

export function compactKnowledgeGraph(input = {}) {
  const graph = { ...input };
  const entities = new Map();
  for (const entity of list(graph.entities)) {
    if (!entity?.id) continue;
    const previous = entities.get(entity.id);
    if (!previous) {
      entities.set(entity.id, { ...entity, sources: [...new Set(list(entity.sources).filter(Boolean))] });
      continue;
    }
    const newest = time(entity.updatedAt) >= time(previous.updatedAt) ? entity : previous;
    const name = clean(entity.name).length > clean(previous.name).length ? entity.name : previous.name;
    entities.set(entity.id, {
      ...previous, ...entity, ...newest, name,
      sources: [...new Set([...list(previous.sources), ...list(entity.sources)].filter(Boolean))],
      firstSeenAt: earliest([previous.firstSeenAt, entity.firstSeenAt]),
      updatedAt: latest([previous.updatedAt, entity.updatedAt])
    });
  }

  const relations = new Map();
  for (const relation of list(graph.relations)) {
    if (!relation?.from || !relation?.type || !relation?.to) continue;
    const key = [relation.from, relation.type, relation.to].join('|');
    const previous = relations.get(key);
    const evidence = uniqueBy([...(previous?.evidence || []), ...list(relation.evidence)], entry =>
      [entry.source, entry.field, entry.url || '', entry.observedAt || ''].join('|')
    ).slice(-4);
    relations.set(key, { ...(previous || {}), ...relation, id: relation.id || previous?.id || key, evidence });
  }

  const observations = uniqueBy(graph.observations, entry =>
    [entry.workId, entry.field, entry.source, entry.normalizedValue].join('|')
  ).map(entry => {
    const duplicates = list(graph.observations).filter(candidate =>
      candidate?.workId === entry.workId && candidate?.field === entry.field &&
      candidate?.source === entry.source && candidate?.normalizedValue === entry.normalizedValue
    );
    return {
      ...entry,
      firstObservedAt: earliest(duplicates.map(value => value.firstObservedAt)) || entry.firstObservedAt,
      lastObservedAt: latest(duplicates.map(value => value.lastObservedAt)) || entry.lastObservedAt,
      observations: Math.max(1, ...duplicates.map(value => Number(value.observations) || 1))
    };
  });
  const sortedObservations = observations.sort((a, b) => time(a.lastObservedAt) - time(b.lastObservedAt));
  const perField = new Map();
  for (const observation of sortedObservations) {
    const key = [observation.workId, observation.field].join('|');
    perField.set(key, [...(perField.get(key) || []), observation]);
  }
  const boundedObservations = [...perField.values()].flatMap(group => group.slice(-12)).slice(-12000);

  const conflicts = uniqueBy(graph.conflicts, entry =>
    entry.id || [entry.workId, entry.field, ...list(entry.observationIds).slice().sort()].join('|')
  ).map(entry => {
    const duplicates = list(graph.conflicts).filter(candidate =>
      (candidate?.id || [candidate?.workId, candidate?.field, ...list(candidate?.observationIds).slice().sort()].join('|')) ===
      (entry.id || [entry.workId, entry.field, ...list(entry.observationIds).slice().sort()].join('|'))
    );
    return {
      ...entry,
      status: duplicates.some(value => value.status === 'unresolved') ? 'unresolved' : entry.status,
      detectedAt: earliest(duplicates.map(value => value.detectedAt)) || entry.detectedAt
    };
  }).slice(-2000);

  const gaps = uniqueBy(graph.knowledgeGaps, entry => entry.workKey || entry.workId)
    .map(entry => {
      const duplicates = list(graph.knowledgeGaps).filter(candidate =>
        (candidate?.workKey || candidate?.workId) === (entry.workKey || entry.workId)
      );
      return {
        ...entry,
        firstSeenAt: earliest(duplicates.map(value => value.firstSeenAt)) || entry.firstSeenAt,
        assessments: Math.max(1, ...duplicates.map(value => Number(value.assessments) || 1))
      };
    }).slice(-1200);

  graph.entities = [...entities.values()].slice(-2500);
  graph.relations = [...relations.values()].slice(-6000);
  graph.observations = boundedObservations;
  graph.conflicts = conflicts;
  graph.knowledgeGaps = gaps;
  graph.stats = {
    ...(graph.stats || {}),
    works: graph.entities.filter(entry => entry.kind === 'work').length,
    people: graph.entities.filter(entry => entry.kind === 'person').length,
    companies: graph.entities.filter(entry => entry.kind === 'company').length,
    concepts: graph.entities.filter(entry => entry.kind === 'concept').length,
    relations: graph.relations.length,
    observations: graph.observations.length,
    conflicts: graph.conflicts.filter(entry => entry.status === 'unresolved').length,
    knowledgeGaps: graph.knowledgeGaps.length
  };
  return graph;
}

export function compactEditorialMemory(input = {}) {
  const memory = { ...input };
  const candidates = uniqueBy(memory.candidates, entry => entry.id).sort((a, b) => time(b.capturedAt) - time(a.capturedAt));
  const approved = uniqueBy(memory.approvedExamples, entry => entry.id).sort((a, b) =>
    (Number(b.humanRating) || 0) - (Number(a.humanRating) || 0) || time(b.reviewedAt || b.capturedAt) - time(a.reviewedAt || a.capturedAt)
  );
  const approvedIds = new Set(approved.map(entry => entry.id));
  memory.candidates = candidates.filter(entry => !approvedIds.has(entry.id)).slice(0, 120);
  memory.approvedExamples = approved.slice(0, 80);
  memory.principles = uniqueBy(memory.principles, entry => entry.key || clean(entry.text).toLocaleLowerCase('ar'))
    .slice(0, 80);
  memory.stats = { candidates: Number(memory.stats?.candidates) || 0, approved: Number(memory.stats?.approved) || 0, rejected: Number(memory.stats?.rejected) || 0 };
  return memory;
}

export function compactLearningMemory(input = {}) {
  const memory = { ...input };
  const lessons = new Map();
  for (const lesson of list(memory.lessons)) {
    if (!lesson?.key) continue;
    const previous = lessons.get(lesson.key);
    lessons.set(lesson.key, {
      ...(previous || {}), ...lesson,
      count: Math.max(Number(previous?.count) || 0, Number(lesson.count) || 0)
    });
  }
  memory.lessons = [...lessons.values()].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)).slice(0, 12);
  memory.recentSuccesses = list(memory.recentSuccesses).slice(-10);
  memory.recentQuality = list(memory.recentQuality).slice(-30);
  memory.qualityByType = memory.qualityByType && typeof memory.qualityByType === 'object' ? memory.qualityByType : {};
  memory.stats = { successes: Number(memory.stats?.successes) || 0, failures: Number(memory.stats?.failures) || 0 };
  return memory;
}
