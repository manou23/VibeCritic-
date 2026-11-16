import assert from 'node:assert/strict';
import * as reviewTools from './generate-reviews.mjs';
const { validateGeneratedReview, validateCompletedArticle, calculateContentRetryAt, shouldRetryShortSection, shouldUseCloudflareGateway } = reviewTools;

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
if (typeof reviewTools.normalizeInterimReviewLists === 'function' && typeof reviewTools.selectActiveDraftJob === 'function') {
  const normalizedInterim = reviewTools.normalizeInterimReviewLists({ ...interimSection, pros: undefined, cons: null }, 0);
  assert.deepEqual(normalizedInterim.pros, []);
  assert.deepEqual(normalizedInterim.cons, []);
  assert.equal(validateGeneratedReview(normalizedInterim, { stage: 0 }).pros.length, 0);
  assert.throws(() => validateGeneratedReview(reviewTools.normalizeInterimReviewLists({ ...interimSection, pros: 'ليست مصفوفة' }, 0), { stage: 0 }), /مصفوف/);

  const olderDraft = { key: 'series:old', status: 'waiting', createdAt: '2026-11-15T10:00:00Z', nextAttemptAt: 2_000_000, item: { id: 'old' }, draft: { stage: 2, sections: [{}, {}] } };
  const newerDraft = { key: 'movie:new', status: 'staged-writing', createdAt: '2026-11-16T10:00:00Z', nextAttemptAt: 0, item: { id: 'new' }, draft: { stage: 1, sections: [{}] } };
  assert.equal(reviewTools.selectActiveDraftJob([newerDraft, olderDraft]).key, 'series:old');
  assert.equal(reviewTools.selectActiveDraftJob([{ ...olderDraft, status: 'published' }]), null);
  const finalizationDraft = { ...newerDraft, status: 'quality-check', draft: { stage: 3, finalPart: { review: 'final' }, sections: [{}, {}, {}] } };
  assert.equal(reviewTools.selectActiveDraftJob([finalizationDraft]).key, 'movie:new');
} else {
  assert.throws(() => validateGeneratedReview({ ...interimSection, pros: undefined }, { stage: 0 }), /مصفوفتين/);
}

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
