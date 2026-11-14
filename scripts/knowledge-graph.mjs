import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSourceEvidence } from './source-evidence.mjs';
import { assessKnowledgeGaps, formatKnowledgeGapContext } from './knowledge-gaps.mjs';
import { compactKnowledgeGraph } from './memory-maintenance.mjs';
import { deriveCriticalPatterns, formatCriticalPatternsContext } from './critical-patterns.mjs';

const graphPath = 'data/knowledge-graph.json';
const MAX_ENTITIES = 2500;
const MAX_RELATIONS = 6000;
const MAX_EVIDENCE_PER_RELATION = 4;
const MAX_OBSERVATIONS = 12000;
const MAX_CONFLICTS = 2000;
const MAX_KNOWLEDGE_GAPS = 1200;
const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

function emptyGraph() {
  return { version: 2, entities: [], relations: [], observations: [], conflicts: [], knowledgeGaps: [], editorialReviews: [], editorialRelations: [], stats: { works: 0, people: 0, companies: 0, concepts: 0, relations: 0, observations: 0, conflicts: 0, knowledgeGaps: 0, editorialReviews: 0, editorialRelations: 0 }, updatedAt: null };
}

async function loadGraph() {
  try {
    const saved = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    if ((saved?.version === 1 || saved?.version === 2) && Array.isArray(saved.entities) && Array.isArray(saved.relations)) {
      return compactKnowledgeGraph({ ...emptyGraph(), ...saved, version: 2 });
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
    if (observation.lastObservedAt !== now) {
      observation.observations = (Number(observation.observations) || 1) + 1;
    }
    observation.lastObservedAt = now;
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
  const catalogBase = metadata.catalogContext?.base || {};
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
    ['episodes', metadata.episodes],
    ['catalog_original_title', catalogBase.originalTitle],
    ['catalog_overview', catalogBase.overview],
    ['catalog_release_date', catalogBase.releaseDate],
    ['catalog_year', catalogBase.year],
    ['catalog_runtime', catalogBase.runtime],
    ['catalog_status', catalogBase.status],
    ['catalog_original_language', catalogBase.originalLanguage],
    ['catalog_rating', catalogBase.rating],
    ['catalog_vote_count', catalogBase.votes],
    ['catalog_genres', catalogBase.genres],
    ['catalog_cast', catalogBase.cast],
    ['catalog_directors', catalogBase.directors],
    ['catalog_creators', catalogBase.creators],
    ['catalog_related_works', (metadata.catalogContext?.relatedWorks || []).slice(0, 6).map(entry =>
      clean(entry?.title) + (entry?.year ? ' (' + entry.year + ')' : '') +
      ' [genres:' + (Number(entry?.sharedGenreCount) || 0) + ', people:' + (Number(entry?.sharedPersonCount) || 0) + ']'
    ).filter(value => value.length > 2)]
  ];
  for (const [field, value] of fields) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const isCatalogFact = field.startsWith('catalog_') && Boolean(metadata.catalogContext?.sourceUrl);
    const fieldProvenance = isCatalogFact
      ? { source: 'VIBECRITIC_D1', url: metadata.catalogContext.sourceUrl, observedAt: metadata.catalogContext.observedAt }
      : item.fieldSources?.[field] && typeof item.fieldSources[field] === 'object'
        ? { ...provenanceBase, ...item.fieldSources[field] }
        : provenanceBase;
    recordObservation(graph, work.id, field, value, { ...fieldProvenance, field });
  }
}

function names(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => typeof entry === 'string' ? entry : entry?.name).filter(value => typeof value === 'string' && value.trim());
}

export async function recordKnowledge(item, options = {}) {
  if (!item?.id || !item?.type || !item?.name) return null;
  const graph = await loadGraph();
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const source = clean(item.source || '');
  const provenanceBase = { source, url: clean(item.sourceUrl || '') || null, observedAt: new Date().toISOString() };
  const existingWork = graph.entities.find(entry =>
    entry.kind === 'work' && entry.externalId === String(item.id) && entry.workType === item.type
  );
  const work = existingWork || upsertEntity(graph, 'work', item.type + ':' + item.id + ':' + item.name, source);
  if (!work) return null;
  work.aliases = [...new Set([...(Array.isArray(work.aliases) ? work.aliases : []), clean(item.name)])]
    .filter(name => name && name !== work.name).slice(-8);
  if (source && !work.sources.includes(source)) work.sources.push(source);
  work.externalId = String(item.id);
  work.workType = item.type;
  work.releaseDate = clean(item.date || '') || null;
  recordItemObservations(graph, work, item, provenanceBase);
  const unresolvedForWork = graph.conflicts.filter(entry => entry.workId === work.id && entry.status === 'unresolved');
  const gapReport = assessKnowledgeGaps(item, { today: options.today, assessedAt: options.assessedAt, unresolvedConflicts: unresolvedForWork });
  const previousGap = graph.knowledgeGaps.find(entry => entry.workKey === gapReport.workKey);
  const storedGap = { ...gapReport, firstSeenAt: previousGap?.firstSeenAt || gapReport.assessedAt, assessments: (Number(previousGap?.assessments) || 0) + 1 };
  graph.knowledgeGaps = [...graph.knowledgeGaps.filter(entry => entry.workKey !== gapReport.workKey), storedGap].slice(-MAX_KNOWLEDGE_GAPS);

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

  if (Array.isArray(metadata.catalogContext?.relatedWorks)) {
    const catalogSource = {
      source: 'VIBECRITIC_D1',
      url: clean(metadata.catalogContext.sourceUrl || ''),
      observedAt: clean(metadata.catalogContext.observedAt || '') || new Date().toISOString()
    };
    for (const related of metadata.catalogContext.relatedWorks.slice(0, 6)) {
      if (!related?.title) continue;
      const relatedWork = upsertEntity(graph, 'work', related.title, 'VIBECRITIC_D1');
      if (relatedWork) {
        relatedWork.externalId = clean(related.tmdbId || '') || relatedWork.externalId || null;
        relatedWork.workType = related.type || null;
        addRelation(graph, work.id, 'catalog_related_by_shared_metadata', relatedWork.id, {
          ...catalogSource,
          field: 'catalog.relatedWorks'
        });
      }
    }
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
    conflicts: graph.conflicts.filter(entry => entry.status === 'unresolved').length,
    knowledgeGaps: graph.knowledgeGaps.length,
    editorialReviews: (graph.editorialReviews || []).length,
    editorialRelations: (graph.editorialRelations || []).length
  };
  graph.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(graphPath), { recursive: true });
  const temporary = graphPath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, graphPath);
  return { entities: graph.entities.length, relations: graph.relations.length };
}

export async function recordEditorialReview(review) {
  if (!review?.key || !['game', 'movie', 'series'].includes(review.type) || !review.title) return false;
  const graph = await loadGraph();
  graph.editorialReviews = Array.isArray(graph.editorialReviews) ? graph.editorialReviews : [];
  graph.editorialRelations = Array.isArray(graph.editorialRelations) ? graph.editorialRelations : [];
  const record = {
    key: clean(review.key).slice(0, 180),
    sourceId: clean(review.sourceId).slice(0, 120) || null,
    type: review.type,
    title: clean(review.title).slice(0, 240),
    originalTitle: clean(review.originalTitle).slice(0, 240) || null,
    headline: clean(review.headline).slice(0, 300) || null,
    summary: clean(review.summary).slice(0, 700) || null,
    verdict: clean(review.verdict).slice(0, 1400) || null,
    score: Number.isFinite(Number(review.score)) ? Number(review.score) : null,
    scores: Object.fromEntries(['storyScore','visualsScore','soundScore','pacingScore'].filter(key => Number.isFinite(Number(review.scores?.[key]))).map(key => [key, Number(review.scores[key])])),
    tags: [...new Set((Array.isArray(review.tags) ? review.tags : []).map(clean).filter(Boolean))].slice(0, 16),
    pros: (Array.isArray(review.pros) ? review.pros : []).map(clean).filter(Boolean).slice(0, 5),
    cons: (Array.isArray(review.cons) ? review.cons : []).map(clean).filter(Boolean).slice(0, 5),
    creator: clean(review.creator).slice(0, 180) || null,
    genres: [...new Set((Array.isArray(review.genres) ? review.genres : []).map(clean).filter(Boolean))].slice(0, 12),
    platforms: [...new Set((Array.isArray(review.platforms) ? review.platforms : []).map(clean).filter(Boolean))].slice(0, 12),
    aiGenerated: typeof review.aiGenerated === 'boolean' ? review.aiGenerated : null,
    releaseDate: clean(review.releaseDate).slice(0, 40) || null,
    sourceName: clean(review.sourceName).slice(0, 80) || null,
    sourceUrl: clean(review.sourceUrl).slice(0, 500) || null,
    sourcePath: clean(review.sourcePath).slice(0, 300),
    excerpt: clean(review.excerpt).slice(0, 1800),
    knowledgeClass: 'editorial-opinion-not-verified-fact'
  };
  // Index the work identity for every medium, without promoting editorial opinions
  // into factual observations. This lets game/movie/series reviews share one retrieval path.
  let identityChanged = false;
  let indexedWorkId = null;
  if (record.sourceId) {
    const existingWork = graph.entities.find(entry =>
      entry.kind === 'work' &&
      entry.externalId === record.sourceId &&
      entry.workType === record.type &&
      (!record.sourceName || !entry.externalSource || entry.externalSource === record.sourceName)
    );
    const work = existingWork || upsertEntity(
      graph, 'work',
      record.type + ':' + record.sourceId + ':' + record.title,
      'VIBECRITIC_EDITORIAL_INDEX'
    );
    if (work) {
      indexedWorkId = work.id;
      const before = JSON.stringify({
        name: work.name, aliases: work.aliases, externalId: work.externalId,
        workType: work.workType, externalSource: work.externalSource,
        identitySource: work.identitySource, sources: work.sources
      });
      work.aliases = [...new Set([...(Array.isArray(work.aliases) ? work.aliases : []), record.title])]
        .filter(name => name && name !== work.name).slice(-8);
      work.externalId = record.sourceId;
      work.workType = record.type;
      if (record.sourceName) work.externalSource = record.sourceName;
      work.identitySource = 'VIBECRITIC_EDITORIAL_INDEX';
      if (!Array.isArray(work.sources)) work.sources = [];
      if (!work.sources.includes('VIBECRITIC_EDITORIAL_INDEX')) work.sources.push('VIBECRITIC_EDITORIAL_INDEX');
      identityChanged = before !== JSON.stringify({
        name: work.name, aliases: work.aliases, externalId: work.externalId,
        workType: work.workType, externalSource: work.externalSource,
        identitySource: work.identitySource, sources: work.sources
      });
    }
  }

  // Promote only narrowly scoped game catalog metadata when a registered source URL
  // proves the source identity. Editorial opinions themselves remain non-factual.
  if (record.type === 'game' && indexedWorkId) {
    const base = {
      source: record.sourceName,
      url: record.sourceUrl,
      observedAt: new Date().toISOString()
    };
    const facts = [
      ['release_date', record.releaseDate],
      ['genres', record.genres],
      ['platforms', record.platforms],
      ['developers', record.creator ? [record.creator] : []]
    ];
    for (const [field, value] of facts) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
      const provenance = resolveSourceEvidence({ ...base, field });
      if (!provenance) continue;
      recordObservation(graph, indexedWorkId, field, value, provenance);
      const relation = {
        genres: ['concept', 'has_genre'],
        platforms: ['concept', 'available_on'],
        developers: ['company', 'developed_by']
      }[field];
      if (relation) {
        for (const label of names(Array.isArray(value) ? value : [value]).slice(0, 20)) {
          const entity = upsertEntity(graph, relation[0], label, provenance.source);
          addRelation(graph, indexedWorkId, relation[1], entity?.id, provenance);
        }
      }
    }
    const verifiedSource = resolveSourceEvidence({ ...base, field: 'game_catalog_metadata' });
    const work = graph.entities.find(entry => entry.id === indexedWorkId);
    if (verifiedSource && work && !work.sources.includes(verifiedSource.source)) work.sources.push(verifiedSource.source);
  }

  const index = graph.editorialReviews.findIndex(entry => entry.key === record.key);
  const previous = index >= 0 ? graph.editorialReviews[index] : null;
  const reviewChanged = !previous || JSON.stringify(previous) !== JSON.stringify(record);
  if (!reviewChanged && !identityChanged) return false;
  if (reviewChanged) {
    if (index >= 0) graph.editorialReviews[index] = record;
    else graph.editorialReviews.push(record);
  }
  graph.editorialReviews = graph.editorialReviews.slice(-1200);

  const relations = [];
  for (let i = 0; i < graph.editorialReviews.length; i++) {
    const left = graph.editorialReviews[i];
    for (let j = i + 1; j < graph.editorialReviews.length; j++) {
      const right = graph.editorialReviews[j];
      const sharedTags = left.tags.filter(tag => right.tags.some(other => other.toLocaleLowerCase() === tag.toLocaleLowerCase())).slice(0, 4);
      const sameCreator = left.creator && right.creator && left.creator.toLocaleLowerCase() === right.creator.toLocaleLowerCase();
      if (sharedTags.length || sameCreator) relations.push({
        id: left.key + '|' + right.key,
        from: left.key,
        to: right.key,
        sharedTags,
        sameCreator: Boolean(sameCreator),
        relationClass: 'shared-editorial-metadata-not-influence-or-quality'
      });
      if (relations.length >= 3000) break;
    }
    if (relations.length >= 3000) break;
  }
  graph.editorialRelations = relations;
  graph.stats = {
    ...(graph.stats || {}),
    works: graph.entities.filter(entry => entry.kind === 'work').length,
    relations: graph.relations.length,
    observations: graph.observations.length,
    conflicts: graph.conflicts.filter(entry => entry.status === 'unresolved').length,
    editorialReviews: graph.editorialReviews.length,
    editorialRelations: graph.editorialRelations.length
  };
  graph.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(graphPath), { recursive: true });
  const temporary = graphPath + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  await fs.rename(temporary, graphPath);
  return true;
}

export async function buildKnowledgeContext(item) {
  if (!item?.id || !item?.type || !item?.name) return '';
  const graph = await loadGraph();
  const workId = graph.entities.find(entry =>
    entry.kind === 'work' && entry.externalId === String(item.id) && entry.workType === item.type
  )?.id || entityId('work', item.type + ':' + item.id + ':' + item.name);
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
  const gapReport = graph.knowledgeGaps.find(entry => entry.workKey === item.type + ':' + clean(item.id)) || null;
  const gapContext = formatKnowledgeGapContext(gapReport);
  const criticalPatterns = deriveCriticalPatterns(graph, workId);
  const patternContext = formatCriticalPatternsContext(criticalPatterns);
  const editorialMatch = (graph.editorialReviews || []).find(entry =>
    entry.type === item.type && entry.sourceId && entry.sourceId === String(item.id)
  );
  const editorialContext = editorialMatch ? [
    'ذاكرة المراجعات التحريرية السابقة (آراء تحريرية وليست حقائق مصدرية):',
    '- مراجعة سابقة: ' + editorialMatch.title + (editorialMatch.score !== null ? '؛ تقييم VibeCritic السابق: ' + editorialMatch.score + '/10' : ''),
    editorialMatch.verdict ? '- خلاصة الحكم السابق: ' + editorialMatch.verdict : '',
    editorialMatch.pros.length ? '- نقاط قوة رُصدت تحريرياً: ' + editorialMatch.pros.join('؛ ') : '',
    editorialMatch.cons.length ? '- تحفظات رُصدت تحريرياً: ' + editorialMatch.cons.join('؛ ') : '',
    '- نوع المصدر: ' + (editorialMatch.aiGenerated === false ? 'مراجعة يدوية' : editorialMatch.aiGenerated === true ? 'مراجعة مولدة بمساعدة AI' : 'غير محدد') + '؛ لا تعامل الرأي السابق كحقيقة مستقلة، ولا تكرر الحكم دون إعادة فحص الأدلة.'
  ].filter(Boolean).join('\n') : '';
  const relatedEditorial = editorialMatch ? (graph.editorialRelations || []).filter(edge => edge.from === editorialMatch.key || edge.to === editorialMatch.key).slice(0, 5).map(edge => {
    const key = edge.from === editorialMatch.key ? edge.to : edge.from;
    const related = (graph.editorialReviews || []).find(entry => entry.key === key);
    return related ? '- مراجعة ذات بيانات تحريرية مشتركة: ' + related.title + (edge.sharedTags?.length ? ' (وسوم مشتركة: ' + edge.sharedTags.join('، ') + ')' : '') + '. الاشتراك الفهرسي لا يثبت تشابهاً فنياً أو تأثيراً.' : '';
  }).filter(Boolean).join('\n') : '';
  if (!directLines.length && !relatedLines.length && !observationLines.length && !conflictLines.length && !gapContext && !patternContext && !editorialContext && !relatedEditorial) return '';
  return [
    'سياق الذاكرة المعرفية الموثق (استعمله للسياق فقط، ولا تستنتج تأثيراً أو اقتباساً دون دليل):',
    ...observationLines,
    ...conflictLines,
    ...directLines,
    ...relatedLines,
    ...(gapContext ? [gapContext] : []),
    ...(patternContext ? [patternContext] : []),
    ...(editorialContext ? [editorialContext] : []),
    ...(relatedEditorial ? [relatedEditorial] : []),
    'افصل دائماً بين علاقة المصدر المعلنة، والعنصر المشترك في البيانات، والاستنتاج النقدي الذي يحتاج دليلاً مستقلاً. درجات الثقة المصدرية مؤشرات إرشادية داخلية وليست احتمالاً إحصائياً لصحة كل معلومة.'
  ].join('\n');
}
