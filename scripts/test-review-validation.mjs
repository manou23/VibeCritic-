import assert from 'node:assert/strict';
import { validateGeneratedReview } from './generate-reviews.mjs';

function words(count) {
  return Array.from({ length: count }, (_, index) => 'تفصيل' + (index + 1)).join(' ');
}
function candidate(review) {
  return {
    scores: { story: 7.5, visuals: 7, sound: 6.5, pacing: 7 },
    pros: ['قوة محددة أولى', 'قوة محددة ثانية', 'قوة محددة ثالثة'],
    cons: ['تحفظ نقدي أول', 'تحفظ نقدي ثان'],
    review
  };
}

const valid = candidate(words(180));
assert.equal(validateGeneratedReview(valid).review, words(180));

assert.throws(() => validateGeneratedReview(candidate(words(100))), /150 كلمة و650 حرف/);
assert.throws(() => validateGeneratedReview(candidate(words(260))), /250 كلمة/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(180)), pros: ['نقطة واحدة'] }), /3 عناصر على الأقل/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(180)), cons: ['تحفظ واحد'] }), /عنصران على الأقل/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(180)), scores: { story: 7.55, visuals: 7, sound: 6.5, pacing: 7 } }), /بخطوة عشرية واحدة/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(180)), review: '### محور\\n' + words(180) }), /بلا محاور/);
console.log('Review validation tests passed: long staged sections, score calibration, pros and cons are enforced.');
