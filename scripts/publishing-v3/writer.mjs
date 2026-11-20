import { generateJson } from "./providers.mjs";
import { reviewArticle } from "./editorial-reviewer.mjs";
import { validateArticle } from "./core.mjs";
import { calculateWeightedReviewScore, SCORE_SCALE_PROMPT } from "../scoring-rubric.mjs";

function assemble(value, evidence) {
  const article = { ...value, title:evidence.title, type:evidence.type, sourceId:evidence.sourceId, sourceName:evidence.sourceName, sourceUrl:evidence.sourceUrl, releaseDate:evidence.releaseDate||"", poster:evidence.poster||"", backdrop:evidence.backdrop||evidence.poster||"", genres:evidence.genres||[], platforms:evidence.platforms||[], cast:evidence.cast||[], crew:evidence.crew||[], tags:evidence.genres||[], sources:evidence.sources };
  article.score = calculateWeightedReviewScore({ story:article.scores?.story, visuals:article.scores?.visuals, sound:article.scores?.sound, pacing:article.scores?.pacing });
  const quality = validateArticle(article, { minWords:650, minCharacters:3200 });
  if (String(article.verdict||"").trim().length < 45) throw new Error("Verdict is too short");
  if (String(article.summary||"").trim().length < 50) throw new Error("Summary is too short");
  return { article, quality };
}
export async function writeArticle(evidence) {
  const today = new Date().toISOString().slice(0,10);
  if (evidence.releaseDate && evidence.releaseDate > today) throw new Error("Candidate release date is still in the future");
  const prompt = [
    "اكتب مراجعة نقدية عربية أصلية لموقع VibeCritic اعتماداً حصراً على ملف الأدلة أدناه.",
    "لا تدّع أنك شاهدت الفيلم أو المسلسل أو لعبت اللعبة. ميّز بين الحقائق والاستنتاجات، واذكر حدود الأدلة بوضوح. يجب أن يكون واضحاً أنها مراجعة تحريرية محدودة مبنية على المصادر وليست تجربة مباشرة. لا تذكر أي تقييم رقمي نهائي أو صيغة مثل 8/10 في verdict أو body أو summary؛ هذه معاينة محدودة وليست مراجعة نهائية.",
    "شرط الطول: اكتب متن body بين 650 و720 كلمة عربية فعلية. لا تحتسب العناوين أو القوائم أو الملخص ضمن العدد. أكمل التحليل ولا تختصره بعبارات عامة.",
    "استخدم سبعة أقسام متوازنة: مقدمة وسياق 70-80 كلمة؛ ## الفكرة والسياق 90-100؛ ## السرد والبناء 100-110؛ ## الجوانب الفنية والتصميم 100-110؛ ## الصوت والإيقاع 80-90؛ ## نقاط القوة والقيود 100-110؛ ## الحكم النهائي 80-90. اجعل الانتقالات طبيعية ولا تكرر الأفكار.",
    "تناول ما تسمح به الأدلة فقط: لا تخترع أحداثاً أو مشاهد أو آليات لعب أو أداءً فنياً غير موثق. إذا لم تكف الأدلة لتقييم جانب ما، صرّح بذلك وفسّر أثره على الحكم. تجنب حرق الأحداث.",
    "أخرج JSON كاملاً صالحاً فقط بالمفاتيح: headline, summary, verdict, body, scores, pros, cons.",
    "scores كائن يحوي story وvisuals وsound وpacing بأرقام من 0 إلى 10. معيار المعايرة: "+SCORE_SCALE_PROMPT+". استخدم درجات متحفظة إذا كانت الأدلة محدودة.",
    "pros ثلاث نقاط محددة على الأقل، وcons نقطتان محددتان على الأقل. verdict حكم عربي معلل من 45 كلمة على الأقل. summary لا يقل عن 50 كلمة.",
    "الأدلة: " + JSON.stringify(evidence)
  ].join("\n\n");

  const first = await generateJson(prompt, { maxTokens:10000 });
  let result;
  let generation = first;
  try {
    result = assemble(first.value,evidence);
  } catch (qualityError) {
    const retry = await generateJson(prompt + "\n\nفشلت المسودة السابقة في فحص الجودة: " + String(qualityError.message).slice(0,250) + ". أعد إنشاء المقال كاملاً مع الالتزام بنطاق 650 إلى 720 كلمة فعلية، وافحص اكتمال JSON.", { skipProviderId:first.provider, maxTokens:10000 });
    try { result = assemble(retry.value,evidence); }
    catch (error) { error.requests = (Number(first.requests)||1) + (Number(retry.requests)||1); throw error; }
    generation = { provider:retry.provider, tokens:(Number(first.tokens)||0)+(Number(retry.tokens)||0), requests:(Number(first.requests)||1)+(Number(retry.requests)||1) };
  }

  // Gemini acts as an independent pre-publication editor when its key is configured.
  // A configured reviewer failure blocks publication; a missing optional key never blocks it.
  let editorial;
  try {
    editorial = await reviewArticle(result.article,evidence);
  } catch (error) {
    error.requests = (Number(generation.requests)||1) + Math.max(1,Number(error.requests)||0);
    throw error;
  }
  return {
    ...result,
    provider:generation.provider,
    tokens:(Number(generation.tokens)||0)+(Number(editorial.tokens)||0),
    requests:(Number(generation.requests)||1)+(Number(editorial.requests)||0),
    editorialReview:editorial.skipped ? { skipped:true, reason:editorial.reason } : editorial.review
  };
}
