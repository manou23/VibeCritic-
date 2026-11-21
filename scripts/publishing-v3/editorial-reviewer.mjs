const env = process.env;

function parseReview(raw) {
  const cleaned = String(raw || "").trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  const value = JSON.parse(cleaned);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Gemini returned an invalid review object");
  return value;
}

export async function reviewArticle(article, evidence) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { skipped:true, reason:"GEMINI_API_KEY is not configured", provider:null, tokens:0, requests:0 };

  const model = env.PUBLISHER_V3_GEMINI_REVIEW_MODEL || "gemini-3.8-flash";
  const isPreview = article.reviewMode === "preview";
  const isAudience = article.reviewMode === "audience";
  const prompt = [
    "أنت محرر تدقيق مستقل لموقع VibeCritic. راجع المقال العربي قبل النشر، ولا تعِد كتابته.",
    "نوع المقال: " + (isPreview ? "معاينة استباقية قبل الإصدار بلا درجة نهائية" : isAudience ? "تحليل مبني على تقييم الجمهور من مصدر موثق، وليس درجة تحريرية" : "مراجعة نقدية كاملة ذات درجة نهائية"),
    "قارن كل ادعاء واقعي في المقال بملف الأدلة المرفق. لا تعتبر وجود رابط مصدر دليلاً على أن كل ما في المقال صحيح.",
    "افحص: اختلاق التفاصيل، الخلط بين الحقائق والاستنتاجات، الادعاء الكاذب بتجربة مباشرة، التكرار والحشو، وضوح حدود الأدلة، ودقة وصف المصادر.",
    isPreview
      ? "لأن المقال معاينة قبل الإصدار، يجب ألا يحتوي على درجة رقمية أو حكم نهائي. تحقق من أن تاريخ الإصدار مستقبلي وأن الحقائق منفصلة عن التوقعات."
      : isAudience
        ? "تحقق من تطابق متوسط الجمهور وعدد الأصوات واسم المنصة مع الأدلة. يجب نسب الدرجة للمصدر بوضوح، وعدم عرضها كتقييم VibeCritic أو اختراع درجات فرعية."
        : "لأن المقال مراجعة كاملة، افحص أن كل درجة ومحور نقدي مدعوم بأدلة فعلية كافية، وارفض أي محور لا تسمح الأدلة بتقييمه.",
    "أخرج JSON فقط بهذه المفاتيح: approved (boolean), score (number 0..10), factualRisk (low|medium|high), repetition (low|medium|high), exaggeration (low|medium|high), issues (array of short Arabic strings), notes (short Arabic string).",
    isPreview
      ? "ارفض إذا كان تاريخ الإصدار غير مستقبلي، أو عرض المقال توقعات كحقائق، أو تضمن تقييماً نهائياً."
      : isAudience
        ? "ارفض إذا كان متوسط الجمهور أو عدد الأصوات غير مطابق للمصدر، أو نُسبت الدرجة إلى VibeCritic، أو اختُلقت آراء الجمهور أو تفاصيل التجربة."
        : "ارفض عند وجود خطر واقعي جوهري أو اختلاق واضح أو نقص شديد في اكتمال المراجعة أو حشو/تكرار شديد أو تضليل القارئ. لا تكن متساهلاً ولا متشدداً بلا سبب.",
    "ملف الأدلة: " + JSON.stringify(evidence),
    "المقال: " + JSON.stringify({title:article.title,summary:article.summary,verdict:article.verdict,body:article.body,pros:article.pros,cons:article.cons,sources:article.sources,youtubeVideoId:article.youtubeVideoId,youtubeVideoTitle:article.youtubeVideoTitle})
  ].join("\n\n");

  let response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method:"POST",
      headers:{ "content-type":"application/json", "x-goog-api-key":apiKey },
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{temperature:0.1,responseMimeType:"application/json",maxOutputTokens:1600}
      }),
      signal:AbortSignal.timeout(25000)
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return { skipped:true, reason:"Gemini editorial review timed out; local article validation remains required", provider:"gemini", model, tokens:0, requests:1 };
    }
    throw error;
  }
  if ([404,429,500,502,503,504].includes(response.status)) {
    const category = response.status === 404 ? "configured model is unavailable" : response.status === 429 ? "quota or rate limit reached" : "service temporarily unavailable";
    return { skipped:true, reason:"Gemini editorial review skipped: " + category + " (HTTP " + response.status + "); local article validation remains required", provider:"gemini", model, tokens:0, requests:1 };
  }
  if (!response.ok) throw new Error("Gemini editorial review HTTP " + response.status + ": " + (await response.text()).slice(0,400));
  const data = await response.json();
  const raw = (data.candidates?.[0]?.content?.parts || []).map(part=>part.text || "").join("");
  if (!raw) throw new Error("Gemini editorial review returned no JSON");
  let review;
  try { review = parseReview(raw); }
  catch (error) { throw new Error("Gemini editorial review returned invalid JSON: " + error.message); }

  const allowed = ["low","medium","high"];
  if (typeof review.approved !== "boolean" || !Number.isFinite(Number(review.score)) ||
      !allowed.includes(review.factualRisk) || !allowed.includes(review.repetition) ||
      !allowed.includes(review.exaggeration) || !Array.isArray(review.issues)) {
    throw new Error("Gemini editorial review schema validation failed");
  }
  const rejected = !review.approved || Number(review.score) < 7 ||
    review.factualRisk === "high" || review.repetition === "high" || review.exaggeration === "high";
  if (rejected) {
    const reasons = (review.issues || []).slice(0,5).join("; ") || review.notes || "Editorial quality gate rejected the article";
    throw new Error("Gemini editorial review rejected article (score " + review.score + "/10): " + reasons);
  }
  const usage = data.usageMetadata || {};
  return {
    skipped:false,
    provider:"gemini",
    model,
    review,
    tokens:(Number(usage.promptTokenCount)||0)+(Number(usage.candidatesTokenCount)||0),
    requests:1
  };
}
