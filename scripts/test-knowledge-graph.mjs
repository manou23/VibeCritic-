import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const originalDirectory = process.cwd();
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vibecritic-knowledge-graph-'));

try {
  process.chdir(temporaryDirectory);
  const moduleUrl = pathToFileURL(path.join(originalDirectory, 'scripts/knowledge-graph.mjs')).href;
  const { recordKnowledge, buildKnowledgeContext } = await import(moduleUrl);

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

  const context = await buildKnowledgeContext(firstWork);
  assert.match(context, /Science Fiction/);
  assert.match(context, /Related Film/);
  assert.match(context, /Second Film/);
  assert.match(context, /ليست دليلاً على تأثير أو اقتباس/);
  assert.ok(context.includes('\n'), 'Knowledge context should use real line breaks.');

  const graph = JSON.parse(await fs.readFile('data/knowledge-graph.json', 'utf8'));
  assert.equal(graph.version, 1);
  assert.ok(graph.stats.works >= 3);
  assert.ok(graph.entities.some(entity => entity.id === 'work:movie-101-first-film'), 'Unicode-safe slug should produce a stable work id.');
  assert.ok(graph.relations.every(edge => Array.isArray(edge.evidence) && edge.evidence.length > 0));
  assert.ok(graph.relations.some(edge => edge.type === 'source_lists_as_similar' && edge.evidence[0].source === 'TMDB'));

  console.log('Knowledge graph tests passed.');
} finally {
  process.chdir(originalDirectory);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
