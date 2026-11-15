import assert from 'node:assert/strict';
import { parseJsonResponse, REVIEW_OUTPUT_CONTRACT } from './review-json.mjs';

assert.deepEqual(
  parseJsonResponse('```json\n{"headline":"عنوان","sections":[{"heading":"الأول","body":"نص {داخل اقتباس}"}]}\n```'),
  { headline: 'عنوان', sections: [{ heading: 'الأول', body: 'نص {داخل اقتباس}' }] }
);

assert.throws(
  () => parseJsonResponse('{"sections":[{"heading":"الأول"},"heading":"الثاني"}]}'),
  /JSON مشوهاً|غير مكتمل/
);
assert.throws(
  () => parseJsonResponse('{"headline":"عنوان","review":"نص بدون إغلاق'),
  /غير مكتمل/
);
assert.throws(
  () => parseJsonResponse('[{"headline":"ليس كائناً جذرياً"}]'),
  /يبدأ بالقوس الافتتاحي/
);

assert.match(REVIEW_OUTPUT_CONTRACT, /hook, headline, summary, scores, pros, cons, tags, verdict, review/);
assert.match(REVIEW_OUTPUT_CONTRACT, /لا تستخدم مخطط title أو lead أو sections أو conclusion/);
console.log('Review JSON parser and output-contract tests passed.');
