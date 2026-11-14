import assert from 'node:assert/strict';
import { SCORE_BANDS, scoreBandFor } from './scoring-rubric.mjs';
assert.equal(SCORE_BANDS.length,9);
for (const [score,label] of [[10,'استثنائي ونادر'],[9.2,'ممتاز جداً'],[8.7,'ممتاز'],[8.2,'جيد جداً'],[7.4,'جيد'],[6.3,'متوسط'],[5.4,'دون المتوسط'],[4.5,'ضعيف'],[3.8,'ضعيف جداً']]) assert.equal(scoreBandFor(score).label,label);
for (const score of [0,10.1,NaN,-1]) assert.equal(scoreBandFor(score),null);
console.log('VibeCritic scoring rubric tests passed.');
