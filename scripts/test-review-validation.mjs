import assert from 'node:assert/strict';
import { validateGeneratedReview, validateCompletedArticle, calculateContentRetryAt, shouldRetryShortSection, shouldUseCloudflareGateway } from './generate-reviews.mjs';

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

const validSection = candidate(words(230));
assert.equal(validateGeneratedReview(validSection).review, words(230));

const interimSection = { ...candidate(words(230)), pros: [], cons: [] };
assert.equal(validateGeneratedReview(interimSection, { stage: 0 }).pros.length, 0);
assert.equal(validateGeneratedReview(interimSection, { stage: 1 }).cons.length, 0);
assert.throws(() => validateGeneratedReview(interimSection, { stage: 2 }), /3 عناصر على الأقل/);
assert.throws(() => validateGeneratedReview({ ...interimSection, pros: undefined }, { stage: 0 }), /مصفوفتين/);

assert.equal(shouldRetryShortSection(new Error('جزء المقال أقصر من الحد الأدنى'), false), true);
assert.equal(shouldRetryShortSection(new Error('جزء المقال أقصر من الحد الأدنى'), true), false);
assert.equal(shouldRetryShortSection(new Error('JSON مشوه'), false), false);
assert.equal(shouldUseCloudflareGateway({ accountId: 'account', gatewayId: 'gateway', authToken: '' }), false);
assert.equal(shouldUseCloudflareGateway({ accountId: 'account', gatewayId: 'gateway', authToken: 'masked-token' }), true);

const retryNow = 1_000_000;
assert.equal(
  calculateContentRetryAt({ availableProviderCount: 2, blockedUntil: [retryNow + 10_000], now: retryNow }),
  retryNow + 60 * 60 * 1000
);
assert.equal(
  calculateContentRetryAt({ availableProviderCount: 0, blockedUntil: [retryNow + 30_000, retryNow + 60_000], now: retryNow }),
  retryNow + 30_000
);
assert.equal(
  calculateContentRetryAt({ availableProviderCount: 0, blockedUntil: [], now: retryNow }),
  retryNow + 60 * 60 * 1000
);

assert.throws(() => validateGeneratedReview(candidate(words(219))), /220 كلمة و900 حرف/);
assert.throws(() => validateGeneratedReview(candidate(words(281))), /280 كلمة/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(230)), pros: ['نقطة واحدة'] }), /3 عناصر على الأقل/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(230)), cons: ['تحفظ واحد'] }), /عنصران على الأقل/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(230)), scores: { story: 7.55, visuals: 7, sound: 6.5, pacing: 7 } }), /بخطوة عشرية واحدة/);
assert.throws(() => validateGeneratedReview({ ...candidate(words(230)), review: '### محور\\n' + words(230) }), /بلا محاور/);

const completeArticle = '### المحور الأول\\n\\n' + words(650);
assert.equal(validateCompletedArticle(completeArticle), completeArticle);
assert.throws(() => validateCompletedArticle(words(649)), /650 كلمة و3200 حرف/);
assert.throws(() => validateCompletedArticle('قصير جداً'), /650 كلمة و3200 حرف/);

console.log('Review validation tests passed: 220–280 word sections and a 650-word/3200-character final article are enforced.');
