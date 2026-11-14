import assert from 'node:assert/strict';
import { validateGeneratedReview } from './generate-reviews.mjs';

function reviewWithSections(lengths) {
  return lengths.map((length, index) => {
    const words = Array.from({ length }, (_, word) => 'تحليل' + (index + 1) + 'تفصيل' + (word + 1));
    return '### المحور ' + (index + 1) + '\n' + words.join(' ');
  }).join('\n\n');
}
function candidate(review) {
  return {
    headline: 'عنوان نقدي محدد',
    summary: 'ملخص يصف العمل وموضوعه.',
    verdict: 'حكم نقدي متوازن يستند إلى التحليل.',
    scores: { story: 7.5, visuals: 7, sound: 6.5, pacing: 7 },
    pros: ['قوة محددة أولى', 'قوة محددة ثانية', 'قوة محددة ثالثة'],
    cons: ['تحفظ نقدي أول', 'تحفظ نقدي ثان'],
    review
  };
}

const valid = candidate(reviewWithSections([160, 160, 160, 160, 160]));
assert.ok(validateGeneratedReview(valid).review.length >= 3200);

assert.throws(
  () => validateGeneratedReview(candidate(reviewWithSections([147, 147, 147, 147, 147]))),
  /750 كلمة/
);
assert.throws(
  () => validateGeneratedReview(candidate(reviewWithSections([54, 180, 180, 180, 180]))),
  /55 كلمة لكل محور/
);
assert.throws(
  () => validateGeneratedReview(candidate(reviewWithSections([200, 200, 200, 200]))),
  /المحاور النقدية الخمسة/
);
console.log('Review validation tests passed: word count, section count, and per-section minimum are enforced.');
