import { generateJson } from "./providers.mjs";
import { validateArticle } from "./core.mjs";
import { calculateWeightedReviewScore, SCORE_SCALE_PROMPT } from "../scoring-rubric.mjs";
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
  let result;
  try { result = await generateJson(prompt); }
  catch (first) {
    result = await generateJson(prompt + "\n\nأعد المحاولة مرة واحدة فقط: أخرج JSON كاملاً، body أطول من 700 كلمة، أربعة عناوين تحليلية على الأقل، وكل الحقول والدرجات والقوائم المطلوبة. الخطأ السابق: " + String(first.message).slice(0,200));
  }
  const article = { ...result.value, title:evidence.title, type:evidence.type, sourceId:evidence.sourceId, sourceName:evidence.sourceName, sourceUrl:evidence.sourceUrl, releaseDate:evidence.releaseDate||"", poster:evidence.poster||"", backdrop:evidence.backdrop||evidence.poster||"", genres:evidence.genres||[], platforms:evidence.platforms||[], cast:evidence.cast||[], crew:evidence.crew||[], tags:evidence.genres||[], sources:evidence.sources };
  article.score = calculateWeightedReviewScore({ story:article.scores?.story, visuals:article.scores?.visuals, sound:article.scores?.sound, pacing:article.scores?.pacing });
  validateArticle(article, { minWords:650, minCharacters:3200 });
  if (String(article.verdict).trim().length < 45) throw new Error("Verdict is too short");
  if (String(article.summary||"").trim().length < 50) throw new Error("Summary is too short");
  return { article, provider:result.provider, tokens:result.tokens };
}
