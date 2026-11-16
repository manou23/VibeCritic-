export function parseJsonResponse(input) {
  const raw = String(input ?? '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const start = 0;
  if (!raw.startsWith('{')) {
    throw new Error('لم يرجع النموذج كائناً JSON يبدأ بالقوس الافتتاحي دون نص أو مصفوفة قبله');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth < 0) break;
      if (depth === 0) {
        const candidate = raw.slice(start, index + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('الجذر JSON يجب أن يكون كائناً وليس مصفوفة أو قيمة مفردة');
          }
          return parsed;
        } catch (error) {
          throw new Error('رد النموذج يحتوي JSON مشوهاً؛ رُفض الكائن كاملاً دون التقاط كائن داخلي: ' + error.message);
        }
      }
    }
  }

  throw new Error('رد النموذج JSON غير مكتمل أو ينقصه قوس إغلاق');
}

export const REVIEW_OUTPUT_CONTRACT = [
  'عقد الإخراج النهائي: أعد كائن JSON واحداً فقط بلا مقدمة أو شرح أو مفاتيح إضافية.',
  'المفاتيح المطلوبة حصراً: scores, pros, cons, review.',
  'scores يحتوي story وvisuals وsound وpacing، وكل قيمة رقم من 0 إلى 10 بمنزلة عشرية واحدة كحد أقصى.',
  'pros ثلاثة عناصر قصيرة محددة على الأقل، وcons تحفظان نقديان على الأقل دون اختلاق.',
  'review رأي نقدي عربي من 90 إلى 140 كلمة، فقرة أو فقرتان، بلا ملخص أو معلومات إصدار أو عناوين فرعية.',
  'شكل البنية: {"scores":{"story":5.0,"visuals":5.0,"sound":5.0,"pacing":5.0},"pros":["...","...","..."],"cons":["...","..."],"review":"..."}'
].join('\\n');
