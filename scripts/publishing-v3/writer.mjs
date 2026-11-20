import { generateJson } from "./providers.mjs";
import { reviewArticle } from "./editorial-reviewer.mjs";
import { validateArticle } from "./core.mjs";
import { calculateWeightedReviewScore, SCORE_SCALE_PROMPT } from "../scoring-rubric.mjs";

export function normalizeFinalRating(text, score) {
  const canonical = Number(score).toFixed(1) + "/10";
  return String(text || "").replace(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*10|من\s*10)/g, canonical);
}

function assemble(value, evidence) {
  const article = { ...value, title:evidence.title, type:evidence.type, sourceId:evidence.sourceId, sourceName:evidence.sourceName, sourceUrl:evidence.sourceUrl, releaseDate:evidence.releaseDate||"", poster:evidence.poster||"", backdrop:evidence.backdrop||evidence.poster||"", genres:evidence.genres||[], platforms:evidence.platforms||[], cast:evidence.cast||[], crew:evidence.crew||[], tags:evidence.genres||[], sources:evidence.sources, youtubeVideoId:evidence.youtubeVideoId, youtubeVideoTitle:evidence.youtubeVideoTitle };
  if (!/^[A-Za-z0-9_-]{11}$/.test(article.youtubeVideoId || "")) throw new Error("A verified official YouTube trailer is required for a final review");
  article.score = calculateWeightedReviewScore({ story:article.scores?.story, visuals:article.scores?.visuals, sound:article.scores?.sound, pacing:article.scores?.pacing });
  article.verdict = normalizeFinalRating(article.verdict, article.score);
  article.body = normalizeFinalRating(article.body, article.score);
  const quality = validateArticle(article, { minWords:1000, minCharacters:5200 });
  if (String(article.verdict||"").trim().length < 90) throw new Error("Final verdict is too short");
  if (String(article.summary||"").trim().length < 90) throw new Error("Review summary is too short");
  return { article, quality };
}
export async function writeArticle(evidence) {
  const today = new Date().toISOString().slice(0,10);
  if (evidence.releaseDate && evidence.releaseDate > today) throw new Error("Candidate release date is still in the future");
  const prompt = [
    "اكتب مراجعة نقدية عربية نهائية كاملة واحترافية لموقع VibeCritic اعتماداً حصراً على ملف الأدلة أدناه.",
    "هذه مراجعة نهائية تحريرية للعمل بعد صدوره، وليست معاينة استباقية ولا مسودة ولا قراءة محدودة ولا صفحة قيد التقييم. يجب إصدار حكم نقدي واضح ودرجة نهائية مبررة. لا تدّع أنك لعبت اللعبة أو شاهدت الفيلم/المسلسل بنفسك؛ قدّمها بأمانة بوصفها مراجعة تحريرية نهائية مبنية على المعلومات الموثقة والمواد الرسمية والمصادر المتاحة، وافصل بوضوح بين الحقائق والاستنتاجات.",
    "اكتب متن body بين 1000 و1200 كلمة عربية فعلية على الأقل. لا تحتسب العناوين والقوائم والملخص ضمن العدد. لا تختصر التحليل ولا تكرر الفكرة بصيغ مختلفة.",
    "استخدم الأقسام التالية بعناوين Markdown واضحة ومترابطة: ## مقدمة وسياق العمل؛ ## الفكرة والقصة أو التجربة؛ ## السرد والشخصيات أو تصميم اللعب؛ ## الإخراج والجوانب الفنية؛ ## الصورة والهوية البصرية؛ ## الصوت والموسيقى والأداء؛ ## الإيقاع والبناء وتنوع المحتوى؛ ## نقاط القوة؛ ## نقاط الضعف؛ ## لمن يناسب هذا العمل؟؛ ## الحكم النهائي. خصّص لكل جانب مساحة تناسب طبيعة العمل ونوعه، ولا تفرض تحليل الصوت/القصة على لعبة أو عمل لا تسمح أدلته بذلك.",
    "قدّم تفاصيل محددة لا كلاماً إنشائياً عاماً. ناقش عناصر العمل التي تدعمها الأدلة فقط. لا تخترع أحداثاً أو مشاهد أو آليات لعب أو أداءً أو مشكلات تقنية أو انطباعات تجربة مباشرة. إذا لم تتوفر أدلة كافية على عنصر بعينه، قل ذلك بوضوح ولا تملأ الفراغ بالتخمين. لا تحرق أحداثاً محورية.",
    "قيّم العمل ككل بميزان نقدي متزن: لا تمنح درجات مرتفعة تلقائياً، ولا تخلط شعبية العمل بجودته، ولا تعتبر تقييمات الجمهور دليلاً على كل جوانب الجودة. اشرح في الحكم النهائي سبب الدرجة، ولمن توصي بالعمل، وما أبرز تحفظ يجب معرفته قبل اختياره. لا تضع رقماً نهائياً في verdict أو body من عندك؛ سيُحتسب الرقم النهائي آلياً من درجات المحاور ويُوحّد تلقائياً في مواضع التقييم النهائي.",
    "أخرج JSON كاملاً صالحاً فقط بالمفاتيح: headline, summary, verdict, body, scores, pros, cons.",
    "scores كائن يحوي story وvisuals وsound وpacing بأرقام من 0 إلى 10. معيار المعايرة: "+SCORE_SCALE_PROMPT+". إذا كان أحد المحاور غير قابل للتقييم من الأدلة، استخدم درجة متحفظة واشرح حدودها داخل المقال بدلاً من اختلاق معلومات.",
    "pros أربع نقاط محددة على الأقل، وcons ثلاث نقاط محددة على الأقل، ما لم تكن الأدلة لا تثبت ذلك؛ عندها اذكر تحفظات موثقة لا عيوباً مختلقة. verdict حكم نهائي معلل لا يقل عن 90 كلمة. summary لا يقل عن 90 كلمة.",
    "بيانات الفيديو الرسمية الموثقة: "+JSON.stringify({youtubeVideoId:evidence.youtubeVideoId,youtubeVideoTitle:evidence.youtubeVideoTitle,youtubeChannel:evidence.youtubeChannel}),
    "الأدلة والمصادر: "+JSON.stringify(evidence)
  ].join("\n\n");

  const first = await generateJson(prompt, { maxTokens:10000 });
  let result;
  let generation = first;
  try {
    result = assemble(first.value,evidence);
  } catch (qualityError) {
    const retry = await generateJson(prompt + "\n\nفشلت المسودة السابقة في فحص الجودة: " + String(qualityError.message).slice(0,300) + ". أعد إنشاء المراجعة النهائية كاملة، وتأكد من أن المتن لا يقل عن 1000 كلمة عربية فعلية وأن الحكم النهائي والملخص مستوفيان للحد الأدنى.", { skipProviderId:first.provider, maxTokens:10000 });
    try { result = assemble(retry.value,evidence); }
    catch (error) { error.requests = (Number(first.requests)||1) + (Number(retry.requests)||1); throw error; }
    generation = { provider:retry.provider, tokens:(Number(first.tokens)||0)+(Number(retry.tokens)||0), requests:(Number(first.requests)||1)+(Number(retry.requests)||1) };
  }

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
