import assert from 'node:assert/strict';
import { parseJsonResponse } from './review-json.mjs';

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

console.log('Review JSON parser tests passed.');
