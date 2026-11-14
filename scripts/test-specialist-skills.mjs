import assert from 'node:assert/strict';
import { SPECIALIST_SKILLS, buildSpecialistSkillContext } from './specialist-skills.mjs';

const game = buildSpecialistSkillContext({
  id: 'g1', type: 'game', name: 'Example Game',
  description: 'A detailed official description that is sufficiently long to support analysis of the premise and broad genre context without making claims about the actual quality of its gameplay systems.',
  genres: ['Action', 'Adventure'], platforms: ['PC', 'PS5'],
  metadata: { developers: ['Studio'], platforms: ['PC', 'PS5'], genres: ['Action'] }
});
assert.ok(game.selected.some(skill => skill.id === 'game-systems'));
assert.ok(game.selected.some(skill => skill.id === 'game-technical'));
assert.ok(!game.selected.some(skill => skill.id === 'film-direction-cinematography'));
assert.ok(game.deferred.some(skill => skill.id === 'game-technical') === false);
assert.match(game.context, /لا يثبت الأداء/);

const film = buildSpecialistSkillContext({
  id: 'f1', type: 'movie',
  description: 'A detailed synopsis that provides the official premise and enough context for a cautious discussion of the story setup, while not proving the actual quality of the screenplay or its execution.',
  genres: ['Drama'],
  metadata: { directors: ['Director One'], cast: ['Actor One', 'Actor Two', 'Actor Three'], runtime: 115 }
});
assert.ok(film.selected.some(skill => skill.id === 'film-direction-cinematography'));
assert.ok(film.selected.some(skill => skill.id === 'screenwriting-narrative'));
assert.ok(film.selected.some(skill => skill.id === 'acting-character'));
assert.ok(!film.selected.some(skill => skill.id === 'game-systems'));

const series = buildSpecialistSkillContext({
  id: 's1', type: 'series',
  description: 'A sufficiently long official series synopsis that describes the premise and setting for an initial structural analysis without pretending to know the quality of its episodes.',
  genres: ['Crime'],
  metadata: { creators: ['Creator'], seasons: 2, episodes: 16 }
});
assert.ok(series.selected.some(skill => skill.id === 'series-structure'));

const sparse = buildSpecialistSkillContext({ id: 'x', type: 'game', description: 'Short' });
assert.equal(sparse.selected.length, 0);
assert.ok(sparse.deferred.length > 0);
assert.match(sparse.context, /لم تتوفر بيانات كافية/);
assert.ok(SPECIALIST_SKILLS.length >= 7);

console.log('Specialist skill library tests passed.');
