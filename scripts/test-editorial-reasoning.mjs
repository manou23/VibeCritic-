import assert from 'node:assert/strict';
import { buildEditorialReasoning, evaluateEditorialReview, formatEditorialReasoningContext } from './editorial-reasoning.mjs';

const game = {
  id: 'gta6', type: 'game', name: 'Grand Theft Auto VI',
  description: 'An open-world action adventure set in a fictional state inspired by Florida, featuring two protagonists and a large modern city.',
  genres: ['Action', 'Adventure'], platforms: ['PlayStation 5', 'Xbox Series X'], developers: ['Rockstar Games'],
  metadata: { gameModes: ['Single-player'], perspectives: ['Third-person'] }
};
const gameReasoning = buildEditorialReasoning(game);
assert.equal(gameReasoning.eligible, true);
assert.equal(gameReasoning.selected.id, 'interactive-product-context');
assert.ok(gameReasoning.selected.evidenceGroups >= 2);
assert.match(formatEditorialReasoningContext(gameReasoning), /Rockstar Games/);
assert.match(formatEditorialReasoningContext(gameReasoning), /لا يساير الضجة/);

const film = {
  id: 'film-1', type: 'movie', name: 'A Specific Film',
  description: 'A sufficiently detailed source synopsis describing the premise, setting, central conflict, and the central dramatic situation of this particular film.',
  genres: ['Drama', 'Mystery'],
  metadata: { directors: ['Nadia Director'], cast: ['Actor One بدور Lead', 'Actor Two بدور Friend', 'Actor Three بدور Rival'] }
};
const first = buildEditorialReasoning(film, { previousHeadlines: ['A completely unrelated headline'] });
const second = buildEditorialReasoning(film, { previousHeadlines: ['A completely unrelated headline'] });
assert.equal(first.selected.id, second.selected.id);
assert.equal(first.selected.score, second.selected.score);
assert.equal(first.eligible, true);

const catalogFilm = {
  ...film,
  metadata: {
    ...film.metadata,
    catalogContext: {
      source: 'VibeCritic D1 entertainment catalog',
      relatedWorks: [{
        title: 'Another Mystery Film', year: 2020,
        sharedGenreCount: 2, sharedPersonCount: 1,
        sharedGenres: 'Drama, Mystery', sharedPeople: 'Nadia Director'
      }]
    }
  }
};
const catalogReasoning = buildEditorialReasoning(catalogFilm);
assert.ok(catalogReasoning.candidates.some(entry => entry.id === 'catalog-comparative-context'));
assert.match(formatEditorialReasoningContext(catalogReasoning), /لا يثبت التشابه الفني/);

const sparse = buildEditorialReasoning({ id: 'x', type: 'movie', name: 'Unknown', description: 'A short description only.' });
assert.equal(sparse.eligible, false);
assert.equal(sparse.selected, null);
assert.match(sparse.summary, /تأجيل التوليد/);

const review = {
  headline: 'A Specific Film and Its Mystery',
  hook: 'Nadia Director leads a distinct dramatic approach.',
  review: ('Nadia Director and Actor One examine the Mystery and Drama premise. ').repeat(110) +
    '\n### Section One\n' + ('A detailed point. ').repeat(80) +
    '\n### Section Two\n' + ('Another detailed point. ').repeat(80) +
    '\n### Section Three\n' + ('A third detailed point. ').repeat(80) +
    '\n### Section Four\n' + ('A fourth detailed point. ').repeat(80) +
    '\n### Section Five\n' + ('A fifth detailed point. ').repeat(80)
};
const evaluation = evaluateEditorialReview(film, review, first, ['A previous unrelated review']);
assert.ok(evaluation.score >= 0 && evaluation.score <= 100);
assert.equal(evaluation.sourceTruthVerified, false);
assert.ok(evaluation.metrics.sectionCount >= 5);
assert.ok(evaluation.metrics.wordCount >= 750);
assert.equal(evaluation.metrics.structureScore, 100);
assert.equal(evaluation.status, 'structural-pass');
console.log('Editorial reasoning tests passed.');
