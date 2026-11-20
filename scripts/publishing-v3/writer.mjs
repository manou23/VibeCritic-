import { generateJson } from "./providers.mjs";
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
    "لا تدّع أنك شاهدت الفيلم أو المسلسل أو لعبت اللعبة. ميّز بين الحقائق والاستنتاجات، واذكر حدود الأدلة بوضوح. يجب أن يكون واضحاً أنها مراجعة تحريرية محدودة مبنية على المصادر وليست تجربة مباشرة.",
    "شرط الطول أساسي: اكتب متن body من 900 إلى 1000 كلمة عربية فعلية، والحد الأدنى المطلق 850 كلمة. لا تحتسب العناوين أو القوائم أو الملخص ضمن العدد. لا تبدأ الخاتمة قبل استكمال حجم الأقسام. لا تختصر أي قسم ولا تستبدل التحليل بعبارات عامة.",
    "استخدم هذا المخطط المحدد مع خمسة عناوين تحليلية على الأقل، والتزم بحجم كل جزء: مقدمة وسياق 90-110 كلمات؛ ## الفكرة والسياق 130-150؛ ## السرد والبناء 150-170؛ ## الجوانب الفنية والتصميم 150-170؛ ## الصوت والإيقاع 130-150؛ ## نقاط القوة والقيود 140-160؛ ## الحكم النهائي 90-110. اجعل الانتقالات طبيعية ولا تكرر الأفكار بين الأقسام.",
    "تناول ما تسمح به الأدلة فقط: لا تخترع أحداثاً أو مشاهد أو آليات لعب أو أداءً فنياً غير موثق. إذا لم تكف الأدلة لتقييم جانب ما، صرّح بذلك وفسّر أثره على الحكم. تجنب حرق الأحداث.",
    "قبل إخراج JSON، راجع طول body داخلياً: إذا كان أقل من 850 كلمة فأكمل التحليل بمعلومات مستندة إلى الأدلة ثم أعد فحصه. أخرج JSON كاملاً صالحاً فقط بالمفاتيح: headline, summary, verdict, body, scores, pros, cons.",
    "scores كائن يحوي story وvisuals وsound وpacing بأرقام من 0 إلى 10. معيار المعايرة: "+SCORE_SCALE_PROMPT+". استخدم درجات متحفظة إذا كانت الأدلة محدودة.",
    "pros ثلاث نقاط محددة على الأقل، وcons نقطتان محددتان على الأقل. verdict حكم عربي معلل من 45 كلمة على الأقل. summary لا يقل عن 50 كلمة.",
    "الأدلة: " + JSON.stringify(evidence)
  ].join("\n\n");
  const first = await generateJson(prompt, { maxTokens:9000 });
  try {
    const result = assemble(first.value,evidence);
    return { ...result, provider:first.provider, tokens:first.tokens, requests:first.requests };
  } catch (qualityError) {
    let retry;
    try { retry = await generateJson(prompt + "\n\nفشلت المسودة السابقة في فحص الجودة: " + String(qualityError.message).slice(0,250) + ". أعد إنشاء المقال كاملاً من البداية، والتزم بتوزيع الكلمات المحدد لكل قسم. لا ترسل مقالاً أقصر من 850 كلمة فعلية. افحص طول body قبل إخراج JSON.", { skipProviderId:first.provider, maxTokens:9000 }); }
    catch (error) { error.requests = (Number(error.requests)||0) + (Number(first.requests)||1); throw error; }
    let result;
    try { result = assemble(retry.value,evidence); }
    catch (error) { error.requests = (Number(first.requests)||1) + (Number(retry.requests)||1); throw error; }
    return { ...result, provider:retry.provider, tokens:first.tokens+retry.tokens, requests:first.requests+retry.requests };
  }
}
