import { generateJson } from "./providers.mjs";
import { validateArticle } from "./core.mjs";
import { calculateWeightedReviewScore, SCORE_SCALE_PROMPT } from "../scoring-rubric.mjs";

function assemble(value, evidence) {
  const article = { ...value, title:evidence.title, type:evidence.type, sourceId:evidence.sourceId, sourceName:evidence.sourceName, sourceUrl:evidence.sourceUrl, releaseDate:evidence.releaseDate||"", poster:evidence.poster||"", backdrop:evidence.backdrop||evidence.poster||"", genres:evidence.genres||[], platforms:evidence.platforms||[], cast:evidence.cast||[], crew:evidence.crew||[], tags:evidence.genres||[], sources:evidence.sources };
  article.score = calculateWeightedReviewScore({ story:article.scores?.story, visuals:article.scores?.visuals, sound:article.scores?.sound, pacing:article.scores?.pacing });
  validateArticle(article, { minWords:650, minCharacters:3200 });
  if (String(article.verdict||"").trim().length < 45) throw new Error("Verdict is too short");
  if (String(article.summary||"").trim().length < 50) throw new Error("Summary is too short");
  return article;
}
export async function writeArticle(evidence) {
  const today = new Date().toISOString().slice(0,10);
  if (evidence.releaseDate && evidence.releaseDate > today) throw new Error("Candidate release date is still in the future");
  const prompt = [
    "اكتب مراجعة نقدية عربية أصلية لموقع VibeCritic اعتماداً حصراً على ملف الأدلة أدناه.",
    "لا تدّع أنك شاهدت الفيلم أو المسلسل أو لعبت اللعبة. ميّز بين الحقائق والاستنتاجات، واذكر حدود الأدلة بوضوح. يجب أن يكون واضحاً أنها مراجعة تحريرية محدودة مبنية على المصادر وليست تجربة مباشرة.",
    "اكتب body لا يقل عن 700 كلمة عربية فعلية، موزعة على أربعة عناوين تحليلية على الأقل، بلا حشو أو تكرار. تناول البناء السردي، العناصر الفنية/التصميمية، الإيقاع، نقاط القوة والقيود، ثم خلاصة نقدية. تجنب حرق الأحداث.",
    "أعد JSON فقط بالمفاتيح: headline, summary, verdict, body, scores, pros, cons.",
    "scores كائن يحوي story وvisuals وsound وpacing بأرقام من 0 إلى 10. معيار المعايرة: "+SCORE_SCALE_PROMPT+". استخدم درجات متحفظة إذا كانت الأدلة محدودة.",
    "pros ثلاث نقاط محددة على الأقل، وcons نقطتان محددتان على الأقل. verdict حكم عربي معلل من 45 كلمة على الأقل.",
    "لا تستنتج تفاصيل فنية غير موجودة في الأدلة. عندما لا تكفي الأدلة لتقييم عنصر، قل ذلك صراحة واجعل الدرجة متحفظة. لا تستخدم عبارات عامة أو مدحاً قالبياً.",
    "الأدلة: " + JSON.stringify(evidence)
  ].join("\n\n");
  const first = await generateJson(prompt);
  try {
    return { article:assemble(first.value,evidence), provider:first.provider, tokens:first.tokens, requests:first.requests };
  } catch (qualityError) {
    const retry = await generateJson(prompt + "\n\nمراجعة تصحيح إلزامية. أخفقت المسودة السابقة في بوابة الجودة: " + String(qualityError.message).slice(0,250) + ". أعد كتابة المقال كاملاً مع إصلاح الخطأ، ولا تختصر body عن 700 كلمة، وأكمل كل الحقول المطلوبة.");
    return { article:assemble(retry.value,evidence), provider:retry.provider, tokens:first.tokens+retry.tokens, requests:first.requests+retry.requests };
  }
}
