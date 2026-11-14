import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildKnowledgeContext } from './knowledge-graph.mjs';

// This smoke test reads the persisted production knowledge graph and invokes only
// the local deterministic retrieval function. It makes no AI or network request.
const graph = JSON.parse(await fs.readFile('data/knowledge-graph.json', 'utf8'));
assert.equal(graph.version, 2, 'The persisted knowledge graph must use schema v2.');

const works = (graph.entities || []).filter(entity => entity.kind === 'work');
const d1Observations = (graph.observations || []).filter(entry => entry.source === 'VIBECRITIC_D1');
assert.ok(works.length > 0, 'The knowledge graph must contain imported works.');
assert.ok(d1Observations.length > 0, 'The knowledge graph must contain D1-sourced observations.');

const knownWork = works.find(entity => entity.externalId === '155' && entity.workType === 'movie');
assert.ok(knownWork, 'The D1 import must include the known movie fixture (TMDB 155).');

const context = await buildKnowledgeContext({
  id: knownWork.externalId,
  type: knownWork.workType,
  name: knownWork.aliases?.[0] || knownWork.name
});

assert.ok(context.length > 0, 'Local retrieval must return a non-empty context.');
assert.match(context, /The Dark Knight/, 'Retrieved context must include the known D1 original title.');
assert.match(context, /catalog_original_title/, 'Retrieved context must expose the stored catalog field.');
assert.match(context, /VIBECRITIC_D1/, 'Retrieved context must preserve source provenance.');
assert.match(context, /حدوده:/, 'Retrieved context must disclose source limitations.');

console.log(
  'Local knowledge retrieval passed without AI: ' +
  works.length + ' works, ' + d1Observations.length + ' D1 observations, ' +
  (graph.editorialReviews || []).length + ' editorial reviews; retrieved The Dark Knight with provenance.'
);
