import assert from 'node:assert/strict';
import { SCORE_BANDS, scoreBandFor, calculateWeightedReviewScore } from './scoring-rubric.mjs';
assert.equal(SCORE_BANDS.length,9);
for (const [score,label] of [[10,'استثنائي ونادر'],[9.2,'ممتاز جداً'],[8.7,'ممتاز'],[8.2,'جيد جداً'],[7.4,'جيد'],[6.3,'متوسط'],[5.4,'دون المتوسط'],[4.5,'ضعيف'],[3.8,'ضعيف جداً']]) assert.equal(scoreBandFor(score).label,label);
for (const score of [0,10.1,NaN,-1]) assert.equal(scoreBandFor(score),null);
assert.equal(calculateWeightedReviewScore({ story:9, visuals:9, sound:8, pacing:8 }),8.6,'8.55 must round up consistently instead of floating-point rounding down');
assert.equal(calculateWeightedReviewScore({ story:8.7, visuals:8.7, sound:8.2, pacing:8.4 }),8.5,'8.525 must round to one decimal using standard rounding');
console.log('VibeCritic scoring rubric tests passed.');
