import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSourceEvidence } from './source-evidence.mjs';

const graphPath = 'data/knowledge-graph.json';
const MAX_ENTITIES = 2500;
const MAX_RELATIONS = 6000;
const MAX_EVIDENCE_PER_RELATION = 4;
const MAX_OBSERVATIONS = 12000;
const MAX_CONFLICTS = 2000;
const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

function emptyGraph() {
  return { version: 2, entities: [], relations: [], observations: [], conflicts: [], stats: { works: 0, people: 0, companies: 0, concepts: 0, relations: 0, observations: 0, conflicts: 0 }, updatedAt: null };
}

async function loadGraph() {
  try {
    const saved = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    if ((saved?.version === 1 || saved?.version === 2) && Array.isArray(saved.entities) && Array.isArray(saved.relations)) {
      return { ...emptyGraph(), ...saved, version: 2, entities: saved.entities.slice(-MAX_ENTITIES), relations: saved.relations.slice(-MAX_RELATIONS), observations: Array.isArray(saved.observations) ? saved.observations.slice(-MAX_OBSERVATIONS) : [], conflicts: Array.isArray(saved.conflicts) ? saved.conflicts.slice(-MAX_CONFLICTS) : [] };
    }
  } catch {}
  return emptyGraph();
}

function slug(value) {
  return clean(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function entityId(kind, value) {
  const key = slug(value);
  return key ? kind + ':' + key : null;
}

function upsertEntity(graph, kind, name, source) {
  const label = clean(name);
  const id = entityId(kind, label);
  if (!id || label.length < 2) return null;
  let entity = graph.entities.find(entry => entry.id === id);
  if (!entity) {
    entity = { id, kind, name: label, sources: [], firstSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    graph.entities.push(entity);
  } else {
    entity.updatedAt = new Date().toISOString();
    if (label.length > entity.name.length && label.length < 140) entity.name = label;
  }
  if (source && !entity.sources.includes(source)) entity.sources.push(source);
  return entity;
}

function addRelation(graph, from, relation, to, provenance) {
  if (!from || !to || from === to) return;
  const verifiedProvenance = resolveSourceEvidence(provenance);
  if (!verifiedProvenance) return;
  provenance = verifiedProvenance;
  let edge = graph.relations.find(entry => entry.from === from && entry.type === relation && entry.to === to);
  if (!edge) {
    edge = { id: from + '|' + relation + '|' + to, from, type: relation, to, evidence: [] };
    graph.relations.push(edge);
  }
  const fingerprint = [provenance.source, provenance.field, provenance.url || ''].join('|');
  if (!edge.evidence.some(item => [item.source, item.field, item.url || ''].join('|') === fingerprint)) {
    edge.evidence.push(provenance);
    edge.evidence = edge.evidence.slice(-MAX_EVIDENCE_PER_RELATION);
  }
}

function normalizedValue(value) {
  if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))].sort().join(' | ');
  return clean(value);
}

function recordObservation(graph, workId, field, value, provenance) {
  const normalized = normalizedValue(value);
  const verifiedProvenance = resolveSourceEvidence({ ...provenance, field: provenance.field || field });
  if (!normalized || normalized.length > 1200 || !verifiedProvenance) return;
  provenance = verifiedProvenance;
  const now = provenance.observedAt;
  let observation = graph.observations.find(entry =>
    entry.workId === workId && entry.field === field &&
    entry.source === provenance.source && entry.normalizedValue === normalized
  );
  if (observation) {
    observation.lastObservedAt = now;
    observation.observations = (Number(observation.observations) || 1) + 1;
    if (provenance.url) observation.url = provenance.url;
  } else {
    observation = {
      id: workId + '|' + field + '|' + provenance.source + '|' + normalized.slice(0, 100),
      workId, field, value: Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, 30) : clean(value),
      normalizedValue: normalized, source: provenance.source, url: provenance.url || null,
      sourceClass: provenance.sourceClass, sourceScope: provenance.sourceScope, sourceLimitations: provenance.sourceLimitations,
      firstObservedAt: now, lastObservedAt: now, observations: 1
    };
    graph.observations.push(observation);
  }

  const peers = graph.observations.filter(entry =>
    entry.workId === workId && entry.field === field && entry.source !== provenance.source
  );
  for (const peer of peers) {
    if (peer.normalizedValue === normalized) continue;
    const pair = [peer.id, observation.id].sort();
    const existing = graph.conflicts.find(entry => entry.observationIds?.[0] === pair[0] && entry.observationIds?.[1] === pair[1]);
    if (!existing) graph.conflicts.push({
      id: pair.join('::'), workId, field, observationIds: pair,
      status: 'unresolved', detectedAt: now,
      note: 'مصدران يقدمان قيمتين مختلفتين؛ لا تُحسم المفاضلة دون فحص حداثة المصدر وسياقه.'
    });
  }
  const fieldHistory = graph.observations.filter(entry => entry.workId === workId && entry.field === field);
  if (fieldHistory.length > 12) {
    const keep = new Set(fieldHistory.slice(-12).map(entry => entry.id));
    graph.observations = graph.observations.filter(entry => entry.workId !== workId || entry.field !== field || keep.has(entry.id));
  }
  graph.observations = graph.observations.slice(-MAX_OBSERVATIONS);
  graph.conflicts = graph.conflicts.slice(-MAX_CONFLICTS);
}

function recordItemObservations(graph, work, item, provenanceBase) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const fields = [
    ['release_date', item.date],
    ['genres', item.genres || metadata.genres],
    ['platforms', metadata.platforms || item.platforms],
    ['developers', metadata.developers || item.developers],
    ['directors', metadata.directors],
    ['creators', metadata.creators],
    ['production_companies', metadata.productionCompanies],
    ['cast', metadata.cast],
    ['runtime', metadata.runtime],
    ['seasons', metadata.seasons],
    ['episodes', metadata.episodes]
  ];
  for (const [field, value] of fields) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const fieldProvenance = item.fieldSources?.[field] && typeof item.fieldSources[field] === 'object'
      ? { ...provenanceBase, ...item.fieldSources[field] }
      : provenanceBase;
    recordObservation(graph, work.id, field, value, { ...fieldProvenance, field });
  }
}

function names(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => typeof entry === 'string' ? entry : entry?.name).filter(value => typeof value === 'string' && value.trim());
}

export async function recordKnowledge(item) {
  if (!item?.id || !item?.type || !item?.name) return null;
  const graph = await loadGraph();
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const source = clean(item.source || '');
  const provenanceBase = { source, url: clean(item.sourceUrl || '') || null, observedAt: new Date().toISOString() };
  const work = upsertEntity(graph, 'work', item.type + ':' + item.id + ':' + item.name, source);
  if (!work) return null;
  work.externalId = String(item.id);
  work.workType = item.type;
  work.releaseDate = clean(item.date || '') || null;
  recordItemObservations(graph, work, item, provenanceBase);

  const addMany = (kind, relation, values, field) => {
    for (const name of names(values).slice(0, 30)) {
      const entity = upsertEntity(graph, kind, name, source);
      if (source) addRelation(graph, work.id, relation, entity?.id, { ...provenanceBase, field });
    }
  };

  addMany('concept', 'has_genre', item.genres || metadata.genres, 'genres');
  addMany('concept', 'available_on', metadata.platforms || item.platforms, 'platforms');
  addMany('company', 'developed_by', metadata.developers || item.developers, 'developers');
  addMany('person', 'directed_by', metadata.directors, 'directors');
  addMany('person', 'created_by', metadata.creators, 'creators');
  addMany('company', 'produced_by', metadata.productionCompanies, 'productionCompanies');

  for (const castEntry of names(metadata.cast).slice(0, 20)) {
    const actor = castEntry.split(' بدور ')[0].trim();
    const person = upsertEntity(graph, 'person', actor, source);
    if (source) addRelation(graph, work.id, 'features', person?.id, { ...provenanceBase, field: 'cast' });
  }

  if (Array.isArray(metadata.similar)) {
    for (const similar of metadata.similar.slice(0, 8)) {
      if (!similar?.id || !similar?.title) continue;
      const related = upsertEntity(graph, 'work', item.type + ':' + similar.id + ':' + similar.title, 'TMDB');
      if (related) {
        related.externalId = String(similar.id);
        related.workType = item.type;
        addRelation(graph, work.id, 'source_lists_as_similar', related.id, {
          source: 'TMDB',
          url: 'https://www.themoviedb.org/' + (item.type === 'movie' ? 'movie' : 'tv') + '/' + encodeURIComponent(String(item.id)),
          field: 'similar.results',
          observedAt: new Date().toISOString()
        });
      }
    }
  }

  graph.entities = graph.entities.slice(-MAX_ENTITIES);
  graph.relations = graph.relations.slice(-MAX_RELATIONS);
  graph.stats = {
    works: graph.entities.filter(entry => entry.kind === 'work').length,
    people: graph.entities.filter(entry => entry.kind === 'person').length,
    companies: graph.entities.filter(entry => entry.kind === 'company').length,
    concepts: graph.entities.filter(entry => entry.kind === 'concept').length,
    relations: graph.relations.length,
    observations: graph.observations.length,
    conflicts: graph.conflicts.filter(entry => entry.status === 'unresolved').length
  };
  graph.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(graphPath), { recursive: true });
  const temporary = graphPath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, graphPath);
  return { entities: graph.entities.length, relations: graph.relations.length };
}

export async function buildKnowledgeContext(item) {
  if (!item?.id || !item?.type || !item?.name) return '';
  const graph = await loadGraph();
  const workId = entityId('work', item.type + ':' + item.id + ':' + item.name);
  const byId = new Map(graph.entities.map(entity => [entity.id, entity]));
  const direct = graph.relations.filter(edge => edge.from === workId);
  const directLines = direct.slice(0, 12).map(edge => {
    const target = byId.get(edge.to);
    if (!target) return null;
    if (edge.type === 'source_lists_as_similar') return '- مصدر TMDB يصنف «' + target.name + '» كعمل مشابه؛ هذا تصنيف مصدر وليس دليلاً على تأثير أو اقتباس.';
    return '- ' + ({ has_genre: 'ينتمي إلى تصنيف', available_on: 'منصته', developed_by: 'طوّره', directed_by: 'أخرجه', created_by: 'ابتكره', produced_by: 'أنتجته', features: 'يضم ضمن طاقمه' }[edge.type] || edge.type) + ': ' + target.name + ' (مصدر: ' + (edge.evidence[0]?.source || 'غير محدد') + ').';
  }).filter(Boolean);

  const shared = new Map();
  for (const edge of direct) {
    if (!['has_genre', 'developed_by', 'directed_by', 'created_by'].includes(edge.type)) continue;
    for (const other of graph.relations) {
      if (other.from === workId || other.to !== edge.to || !['has_genre', 'developed_by', 'directed_by', 'created_by'].includes(other.type)) continue;
      const related = byId.get(other.from);
      if (!related || related.kind !== 'work') continue;
      if (!shared.has(related.id)) shared.set(related.id, { name: related.name, links: new Set() });
      shared.get(related.id).links.add(byId.get(edge.to)?.name || edge.to);
    }
  }
  const relatedLines = [...shared.values()].slice(0, 4).map(entry =>
    '- صلة مع «' + entry.name + '» عبر عنصر موثق مشترك: ' + [...entry.links].slice(0, 3).join('، ') + '. هذه صلة بيانات وليست حكماً بتشابه الجودة أو التأثير.'
  );

  const observations = graph.observations.filter(entry => entry.workId === workId);
  const observationLines = observations.slice(-12).map(entry => '- ' + entry.field + ': ' + (Array.isArray(entry.value) ? entry.value.join('، ') : entry.value) + ' (المصدر: ' + entry.source + '؛ نوع المصدر: ' + entry.sourceClass + '؛ نطاقه: ' + entry.sourceScope + '؛ حدوده: ' + entry.sourceLimitations + '؛ رُصد آخر مرة: ' + entry.lastObservedAt + ').');
  const unresolved = graph.conflicts.filter(entry => entry.workId === workId && entry.status === 'unresolved');
  const conflictLines = unresolved.slice(0, 6).map(entry => '- تعارض غير محسوم في ' + entry.field + ': توجد قيم من مصادر مختلفة. لا تعتمد أياً منها كحقيقة نهائية قبل التحقق.');
  if (!directLines.length && !relatedLines.length && !observationLines.length && !conflictLines.length) return '';
  return [
    'سياق الذاكرة المعرفية الموثق (استعمله للسياق فقط، ولا تستنتج تأثيراً أو اقتباساً دون دليل):',
    ...observationLines,
    ...conflictLines,
    ...directLines,
    ...relatedLines,
    'افصل دائماً بين علاقة المصدر المعلنة، والعنصر المشترك في البيانات، والاستنتاج النقدي الذي يحتاج دليلاً مستقلاً. درجات الثقة المصدرية مؤشرات إرشادية داخلية وليست احتمالاً إحصائياً لصحة كل معلومة.'
  ].join('\n');
}
