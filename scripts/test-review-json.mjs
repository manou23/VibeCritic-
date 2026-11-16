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

assert.match(REVIEW_OUTPUT_CONTRACT, /scores, pros, cons, review/);
assert.match(REVIEW_OUTPUT_CONTRACT, /220 إلى 280 كلمة/);
console.log('Review JSON parser and output-contract tests passed.');
