import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const originalDirectory = process.cwd();
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-knowledge-graph-'));

try {
  process.chdir(temporaryDirectory);
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/knowledge-graph.json', JSON.stringify({
    version: 1,
    entities: [{ id: 'concept:legacy', kind: 'concept', name: 'Legacy concept', sources: ['TMDB'] }],
    relations: [{ id: 'legacy-edge', from: 'work:legacy', type: 'has_genre', to: 'concept:legacy', evidence: [{ source: 'TMDB', field: 'genres', observedAt: '2026-01-01T00:00:00.000Z' }] }],
    stats: { works: 0, people: 0, companies: 0, concepts: 1, relations: 1 },
    updatedAt: '2026-01-01T00:00:00.000Z'
  }, null, 2));
  const moduleUrl = pathToFileURL(path.join(originalDirectory, 'scripts/knowledge-graph.mjs')).href;
  const { recordKnowledge, buildKnowledgeContext } = await import(moduleUrl);
  const { resolveSourceEvidence } = await import(pathToFileURL(path.join(originalDirectory, 'scripts/source-evidence.mjs')).href);

  const firstWork = {
    id: '101',
    type: 'movie',
    name: 'First Film',
    date: '2026-01-01',
    source: 'TMDB',
    sourceUrl: 'https://www.themoviedb.org/movie/101',
    genres: ['Science Fiction'],
    metadata: {
      directors: ['A. Director'],
      cast: ['B. Actor بدور Hero'],
      similar: [{ id: '102', title: 'Related Film' }]
    }
  };

  await recordKnowledge(firstWork);
  await recordKnowledge(firstWork);
  assert.equal(resolveSourceEvidence({ source: 'TMDB', field: 'genres', url: 'https://attacker.example/movie/101' }), null, 'A source cannot claim evidence from an unrelated domain.');
  assert.equal(resolveSourceEvidence({ source: 'UNKNOWN', field: 'genres', url: 'https://example.com/movie/101' }), null, 'Unknown sources must not be promoted to evidence.');
  assert.equal(resolveSourceEvidence({ source: 'TMDB', field: 'genres', url: 'http://www.themoviedb.org/movie/101' }), null, 'Evidence links must use HTTPS.');
  assert.ok(resolveSourceEvidence({ source: 'TMDB', field: 'genres', url: 'https://www.themoviedb.org/movie/101' }), 'A recognized source and matching HTTPS domain should be accepted.');

  const secondWork = {
    id: '201',
    type: 'movie',
    name: 'Second Film',
    source: 'TMDB',
    sourceUrl: 'https://www.themoviedb.org/movie/201',
    genres: ['Science Fiction'],
    metadata: { directors: ['A. Director'] }
  };
  await recordKnowledge(secondWork);

  const conflictingObservation = {
    ...firstWork,
    source: 'IGDB',
    sourceUrl: 'https://www.igdb.com/games/101',
    genres: ['Science Fiction', 'Adventure'],
    metadata: { directors: ['Different Director'], platforms: ['PC'] }
  };
  await recordKnowledge(conflictingObservation);

  const context = await buildKnowledgeContext(firstWork);
  assert.match(context, /Science Fiction/);
  assert.match(context, /Related Film/);
  assert.match(context, /Second Film/);
  assert.match(context, /ليس دليلاً على تأثير أو اقتباس/);
  assert.ok(context.includes('\n'), 'Knowledge context should use real line breaks.');

  const graph = JSON.parse(await fs.readFile('data/knowledge-graph.json', 'utf8'));
  assert.equal(graph.version, 2);
  assert.ok(Array.isArray(graph.knowledgeGaps) && graph.knowledgeGaps.length >= 3, 'Per-work knowledge gap assessments should persist in the graph.');
  assert.ok(graph.knowledgeGaps.some(entry => entry.workKey === 'movie:101' && entry.assessments >= 2), 'Repeated assessments should update the existing work record.');
  assert.equal(graph.stats.knowledgeGaps, graph.knowledgeGaps.length);
  assert.ok(graph.entities.some(entity => entity.id === 'concept:legacy'), 'Version 1 entities should survive migration.');
  assert.ok(graph.relations.some(edge => edge.id === 'legacy-edge'), 'Version 1 relations should survive migration.');
  assert.ok(graph.stats.works >= 3);
  assert.ok(graph.entities.some(entity => entity.id === 'work:movie-101-first-film'), 'Unicode-safe slug should produce a stable work id.');
  assert.ok(graph.relations.every(edge => Array.isArray(edge.evidence) && edge.evidence.length > 0));
  assert.ok(graph.relations.some(edge => edge.type === 'source_lists_as_similar' && edge.evidence[0].source === 'TMDB'));
  assert.ok(graph.observations.some(entry => entry.workId === 'work:movie-101-first-film' && entry.field === 'genres' && entry.source === 'TMDB'), 'Source observations should be retained with provenance.');
  assert.ok(graph.observations.some(entry => entry.workId === 'work:movie-101-first-film' && entry.field === 'genres' && entry.source === 'IGDB'), 'A second source should be retained separately.');
  assert.ok(graph.conflicts.some(entry => entry.workId === 'work:movie-101-first-film' && entry.field === 'genres' && entry.status === 'unresolved'), 'Different values from distinct sources should create an unresolved conflict.');
  assert.match(context, /تعارض غير محسوم/, 'Knowledge context should warn about unresolved source conflicts.');
  assert.match(context, /نطاقه:/, 'Knowledge context should describe the source scope.');
  assert.match(context, /حدوده:/, 'Knowledge context should disclose source limitations.');
  assert.match(context, /خريطة الثغرات المعرفية/, 'The critic should receive an explicit knowledge-gap map.');
  assert.match(context, /لا تحوّل الثغرات إلى أحكام سلبية/, 'The critic must not turn missing evidence into negative claims.');
  assert.ok(graph.observations.every(entry => entry.source && entry.source !== 'unknown' && entry.sourceScope && entry.sourceLimitations), 'Observations must retain verified source scope and limitations.');
  assert.equal(graph.stats.observations, graph.observations.length);
  assert.equal(graph.stats.conflicts, graph.conflicts.filter(entry => entry.status === 'unresolved').length);

  console.log('Knowledge graph tests passed.');
} finally {
  process.chdir(originalDirectory);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
