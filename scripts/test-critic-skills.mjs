import assert from 'node:assert/strict';
import { assessSpecialistSkills, formatSpecialistSkillContext } from './critic-skills.mjs';

const game = assessSpecialistSkills({
  type: 'game', platforms: ['PC', 'PlayStation 5'], developers: ['Studio A'],
  metadata: { gameModes: ['single-player'], sourceTags: ['open world'] }
});
assert.equal(game.skills.length, 5);
assert.ok(game.skills.find(skill => skill.id === 'technical-performance').status === 'contextual');
assert.ok(game.skills.find(skill => skill.id === 'technical-performance').limits.includes('لا يثبتان الأداء'));
assert.ok(game.skills.find(skill => skill.id === 'progression-and-balance').status === 'contextual');
assert.ok(game.skills.every(skill => skill.evidenceCeiling === 'catalog-context-only'));
assert.match(formatSpecialistSkillContext(game), /لا تحول سؤال المهارة إلى ادعاء/);

const emptyGame = assessSpecialistSkills({ type: 'game', name: 'Unknown game' });
assert.equal(emptyGame.contextualCount, 0);
assert.equal(emptyGame.notAssessableCount, 5);
assert.match(formatSpecialistSkillContext(emptyGame), /غير قابل للتقييم/);

const series = assessSpecialistSkills({
  type: 'series', metadata: { creators: ['Creator'], seasons: 2, episodes: 16, cast: ['Actor A', 'Actor B'] },
  description: 'A series about a family and their changing relationships.'
});
assert.equal(series.skills.length, 5);
assert.ok(series.contextualCount >= 3);
assert.ok(series.skills.find(skill => skill.id === 'season-architecture').status === 'contextual');

const film = assessSpecialistSkills({ type: 'movie', metadata: { directors: ['Director'], runtime: 110, cast: ['Actor'] } });
assert.equal(film.skills.length, 5);
assert.ok(film.skills.find(skill => skill.id === 'screenplay-structure').status === 'not-assessable');

console.log('Specialist critic skills tests passed.');
