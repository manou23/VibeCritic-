import { generateJson } from "./providers.mjs";
import { reviewArticle } from "./editorial-reviewer.mjs";
import { validateArticle } from "./core.mjs";
import { calculateWeightedReviewScore, SCORE_SCALE_PROMPT } from "../scoring-rubric.mjs";

export function normalizeFinalRating(text, score) {
  const canonical = Number(score).toFixed(1) + "/10";
  return String(text || "").replace(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*10|من\s*10)/g, canonical);
}

export function normalizeBodyFinalRating(text, score) {
  const canonical = Number(score).toFixed(1) + "/10";
  return String(text || "").replace(/(\*{0,2}(?:التقييم النهائي|التقييم العام|الدرجة النهائية|Final score|Overall score)\s*[:：]?\s*)(\d+(?:[.,]\d+)?\s*(?:\/\s*10|من\s*10))(\*{0,2})/gi, (_, label, rating, emphasis) => label + canonical + emphasis);
}

export function assemble(value, evidence) {
  const reviewMode = evidence.reviewReadiness === "review" ? "review" : evidence.reviewReadiness === "audience" ? "audience" : evidence.reviewReadiness === "preview" ? "preview" : "limited";
  if (reviewMode === "limited") throw new Error("Publishing blocked: VibeCritic publishes scored reviews or explicitly pre-release previews only");
  const article = {
    ...value,
    title:evidence.title,
    type:evidence.type,
    sourceId:evidence.sourceId,
    sourceName:evidence.sourceName,
    sourceUrl:evidence.sourceUrl,
    sourceRating:evidence.rating ?? null,
    sourceRatingScale:evidence.ratingScale ?? null,
    sourceVoteCount:evidence.votes ?? 0,
    audienceScore:Number.isFinite(Number(evidence.rating)) && Number(evidence.ratingScale) > 0 ? Math.round(Number(evidence.rating) / Number(evidence.ratingScale) * 100) / 10 : null,
    releaseDate:evidence.releaseDate||"",
    poster:evidence.poster||"",
    backdrop:evidence.backdrop||evidence.poster||"",
    genres:evidence.genres||[],
    platforms:evidence.platforms||[],
    cast:evidence.cast||[],
    crew:evidence.crew||[],
    tags:evidence.genres||[],
    sources:evidence.sources,
    youtubeVideoId:evidence.youtubeVideoId,
    youtubeVideoTitle:evidence.youtubeVideoTitle,
    reviewMode
  };
  if (!/^[A-Za-z0-9_-]{11}$/.test(article.youtubeVideoId || "")) {
    throw new Error("A verified official YouTube trailer is required for a V3 article");
  }

  if (reviewMode === "review") {
    article.score = calculateWeightedReviewScore({ story:article.scores?.story, visuals:article.scores?.visuals, sound:article.scores?.sound, pacing:article.scores?.pacing });
    article.verdict = normalizeFinalRating(article.verdict, article.score);
    article.body = normalizeBodyFinalRating(article.body, article.score);
    const quality = validateArticle(article, { minWords:1000, minCharacters:5200 });
    if (String(article.verdict||"").trim().length < 90) throw new Error("Final verdict is too short");
    if (String(article.summary||"").trim().length < 90) throw new Error("Review summary is too short");
    return { article, quality };
  }

  if (reviewMode === "audience") {
    delete article.score;
    delete article.scores;
    if (!Number.isFinite(article.audienceScore) || !Number.isInteger(article.sourceVoteCount) || article.sourceVoteCount < 100 || !Number.isFinite(article.sourceRating) || !Number.isFinite(article.sourceRatingScale) || article.sourceRatingScale <= 0) throw new Error("Audience rating is missing or below the minimum of 100 votes");
    const quality = validateArticle(article, { minWords:650, minCharacters:3200 });
    if (String(article.verdict||"").trim().length < 90 || String(article.summary||"").trim().length < 90) throw new Error("Audience review summary and verdict must each contain at least 90 characters");
    return { article, quality };
  }

  // Fail closed: catalog, encyclopedia and promotional material must never become a scored review.
  delete article.score;
  delete article.scores;
  article.verdict = String(article.verdict || "هذه قراءة معلوماتية محدودة، ولا تتضمن حكماً نهائياً على جودة التنفيذ.");
  const publicText = [article.headline,article.summary,article.verdict,article.body].join("\n").replace(/https?:\/\/[^\s)\]>]+/gi,"");
  if (/(?<![0-9])\d{1,2}(?:[.,]\d+)?\s*(?:\/\s*10|من\s*10)(?![0-9])/i.test(publicText)) {
    throw new Error("Limited-evidence article must not contain a numeric final rating");
  }
  const quality = validateArticle(article, { minWords:650, minCharacters:3200 });
  if (String(article.verdict).trim().length < 90) throw new Error("Limited-evidence conclusion is too short");
  if (String(article.summary||"").trim().length < 90) throw new Error("Limited-evidence summary is too short");
  return { article, quality };
}
export function buildPrompt(evidence) {
  const isPreview = evidence.reviewReadiness === "preview";
  const isAudience = evidence.reviewReadiness === "audience";
  const isLimited = !isPreview && !isAudience && evidence.reviewReadiness !== "review";
  const prompt = (isAudience ? [
    "اكتب مراجعة تحليلية عربية لموقع VibeCritic تعتمد على تقييم الجمهور الموثق، لأن الأدلة المستقلة على التجربة المباشرة غير كافية.",
    "التقييم الظاهر هو متوسط تقييم المستخدمين في " + String(evidence.sourceName) + "، وليس تقييماً تحريرياً من VibeCritic. المتوسط الأصلي " + String(evidence.rating) + "/" + String(evidence.ratingScale) + " من " + String(evidence.votes) + " صوتاً؛ لا تغير هذه الحقائق ولا تنسبها إلى المحررين.",
    "اكتب 650 إلى 850 كلمة عربية مفيدة، وحلل المعلومات المؤكدة عن العمل وتوجهات الجمهور بحذر. لا تدّع أنك شاهدت أو لعبت العمل، ولا تخترع انطباعات أو تفاصيل فنية. لا تمنح درجات فرعية للقصة أو الصورة أو الصوت أو الإيقاع.",
    "يجب أن يوضح العنوان والخلاصة والمتن أن هذا تقييم جمهور المصدر المذكور، وأن متوسطه ليس ضماناً للجودة أو رأياً مستقلاً لـ VibeCritic. فرّق بين بيانات المنصة والحقائق الأخرى، ولا تقدم رأي الجمهور كإجماع عالمي.",
    "استخدم ثلاثة عناوين تحليلية على الأقل. pros وcons تتناول معلومات مثبتة وملاحظات من البيانات المتاحة، ولا تختلق عيوباً فنية. summary وverdict لا يقل كل منهما عن 90 كلمة.",
    "أخرج JSON صالحاً فقط بالمفاتيح headline, summary, verdict, body, pros, cons. لا تضف scores أو score ولا تعِد حساب تقييم الجمهور.",
    "ملف الأدلة: " + JSON.stringify(evidence)
  ] : isPreview ? [
    "اكتب معاينة استباقية عربية احترافية لعمل لم يصدر بعد لموقع VibeCritic اعتماداً حصراً على الأدلة.",
    "هذه معاينة قبل الإصدار وليست مراجعة نهائية. اذكر موعد الإصدار المستقبلي، ولا تمنح درجة أو حكماً نهائياً ولا تدّع تجربة مباشرة. افصل الحقائق عن التوقعات.",
    "اكتب 650 إلى 850 كلمة عربية مفيدة، مع عرض الفكرة والمعلومات الرسمية وما ننتظره عند الإصدار دون اختلاق تفاصيل أو جودة فنية.",
    "أخرج JSON صالحاً فقط بالمفاتيح headline, summary, verdict, body, pros, cons. لا تضف scores أو score. summary وverdict لا يقل كل منهما عن 90 كلمة.",
    "ملف الأدلة: " + JSON.stringify(evidence)
  ] : isLimited ? [
    "اكتب قراءة معلوماتية عربية محدودة الأدلة لموقع VibeCritic اعتماداً حصراً على ملف الأدلة أدناه.",
    "المصادر المتاحة وصف قاعدة بيانات، ومادة موسوعية، وإعلان ترويجي. هذه المصادر تثبت بعض المعلومات الأساسية فقط، ولا تثبت جودة التنفيذ أو تجربة مشاهدة/لعب. لا تقدّم النص بوصفه مراجعة مشاهدة أو مراجعة نهائية، ولا تدّع تجربة شخصية.",
    "ممنوع وضع أي درجة رقمية أو تقييم من 10 أو ترتيب جودة. لا تملأ محاور الإخراج أو الصورة أو الصوت أو الإيقاع بتخمينات. اذكر بوضوح ما نعرفه وما لا تسمح الأدلة بحسمه.",
    "اكتب متن body بين 650 و850 كلمة عربية فعلية، دون حشو أو تكرار. استخدم فقط أقساماً تناسب الأدلة: ## ما الذي نعرفه عن العمل؟؛ ## القصة أو الفكرة المعلنة؛ ## معلومات الإنتاج والطاقم؛ ## ما الذي يمكن تأكيده؟؛ ## ما الذي لا نعرفه بعد؟؛ ## لمن قد يهم هذا العمل؟؛ ## خلاصة حدود الأدلة. احذف أي قسم لا تتوفر له معلومات موثقة.",
    "لا تصف الإعلان كما لو أنك شاهدت كل مشاهده. لا تستنتج من الملصق جودة الصورة، ولا من أسماء الممثلين جودة الأداء، ولا من التصنيف جودة السرد. لا تخلط بين تقييم الجمهور أو وصف الناشر وبين حكم تحريري مستقل.",
    "اجعل pros ثلاث نقاط من المعلومات أو العناصر المؤكدة فقط، لا مديحاً لجودة غير مثبتة. واجعل cons نقطتين على الأقل من الأسئلة أو الجوانب غير المحسومة، لا عيوباً فنية مختلقة.",
    "verdict خلاصة صريحة من 90 كلمة على الأقل تقول إن هذه قراءة محدودة ولا تمنح حكماً نهائياً. summary لا يقل عن 90 كلمة ويصف العمل مع بيان حدود المعلومات.",
    "أخرج JSON صالحاً فقط بالمفاتيح: headline, summary, verdict, body, pros, cons. لا تضف scores أو score.",
    "سبب تصنيف الأدلة: " + String(evidence.reviewReadinessReason || "لم تتوفر أدلة مستقلة كافية لتقييم التنفيذ."),
    "ملف الأدلة والمصادر: " + JSON.stringify(evidence)
  ] : [
    "اكتب مراجعة نقدية عربية نهائية كاملة واحترافية لموقع VibeCritic اعتماداً حصراً على ملف الأدلة أدناه.",
    "هذه مراجعة نهائية تحريرية للعمل بعد صدوره، وليست معاينة استباقية ولا مسودة ولا قراءة محدودة. يجب إصدار حكم نقدي واضح ودرجة نهائية مبررة. لا تدّع أنك لعبت اللعبة أو شاهدت الفيلم/المسلسل بنفسك؛ قدّمها بأمانة بوصفها مراجعة تحريرية نهائية مبنية على معلومات موثقة ومواد رسمية ومصادر مستقلة كافية، وافصل بوضوح بين الحقائق والاستنتاجات.",
    "اكتب متن body بين 1000 و1200 كلمة عربية فعلية على الأقل. لا تحتسب العناوين والقوائم والملخص ضمن العدد. لا تختصر التحليل ولا تكرر الفكرة بصيغ مختلفة.",
    "استخدم الأقسام التالية بعناوين Markdown واضحة ومترابطة: ## مقدمة وسياق العمل؛ ## الفكرة والقصة أو التجربة؛ ## السرد والشخصيات أو تصميم اللعب؛ ## الإخراج والجوانب الفنية؛ ## الصورة والهوية البصرية؛ ## الصوت والموسيقى والأداء؛ ## الإيقاع والبناء وتنوع المحتوى؛ ## نقاط القوة؛ ## نقاط الضعف؛ ## لمن يناسب هذا العمل؟؛ ## الحكم النهائي. خصّص لكل جانب مساحة تناسب طبيعة العمل ونوعه، ولا تفرض تحليلاً لا تسمح أدلته بذلك.",
    "قدّم تفاصيل محددة لا كلاماً إنشائياً عاماً. لا تخترع أحداثاً أو مشاهد أو آليات لعب أو أداءً أو مشكلات تقنية أو انطباعات تجربة مباشرة. إذا لم تتوفر أدلة كافية على عنصر بعينه، لا تملأ الفراغ بالتخمين.",
    "قيّم العمل ككل بميزان نقدي متزن، واشرح سبب الدرجة النهائية ولمن توصي بالعمل. لا تضع رقماً نهائياً في verdict أو body من عندك؛ سيُحتسب الرقم آلياً من درجات المحاور.",
    "أخرج JSON كاملاً صالحاً فقط بالمفاتيح: headline, summary, verdict, body, scores, pros, cons.",
    "scores كائن يحوي story وvisuals وsound وpacing بأرقام من 0 إلى 10. معيار المعايرة: " + SCORE_SCALE_PROMPT + ". يجب أن تكون كل درجة مدعومة بأدلة فعلية عن العنصر الذي تقيسه.",
    "pros أربع نقاط محددة على الأقل، وcons ثلاث نقاط محددة على الأقل. verdict حكم نهائي معلل لا يقل عن 90 كلمة. summary لا يقل عن 90 كلمة.",
    "بيانات الفيديو الرسمية الموثقة: " + JSON.stringify({youtubeVideoId:evidence.youtubeVideoId,youtubeVideoTitle:evidence.youtubeVideoTitle,youtubeChannel:evidence.youtubeChannel}),
    "الأدلة والمصادر: " + JSON.stringify(evidence)
  ]).join("\n\n");
  return prompt;
}
export async function writeArticle(evidence) {
  const today = new Date().toISOString().slice(0,10);
  if (evidence.releaseDate && evidence.releaseDate > today && evidence.reviewReadiness !== "preview") throw new Error("Candidate release date is still in the future");
  const isPreview = evidence.reviewReadiness === "preview";
  const isLimited = !isPreview && evidence.reviewReadiness !== "review";
  const prompt = buildPrompt(evidence);

  const first = await generateJson(prompt, { maxTokens:10000 });
  let result;
  let generation = first;
  try {
    result = assemble(first.value,evidence);
  } catch (qualityError) {
    const retry = await generateJson(prompt + "\n\nفشلت المسودة السابقة في فحص الجودة: " + String(qualityError.message).slice(0,300) + (isLimited || isPreview ? ". أعد النص وفق نوعه بلا درجة رقمية، وتأكد من أن المتن لا يقل عن 650 كلمة وأن الخلاصة والملخص مستوفيان للحد الأدنى." : ". أعد المراجعة النهائية كاملة، وتأكد من أن المتن لا يقل عن 1000 كلمة وأن الحكم والملخص مستوفيان للحد الأدنى."), { skipProviderId:first.provider, maxTokens:10000 });
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
