const env = process.env;

function parseReview(raw) {
  const cleaned = String(raw || "").trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  const value = JSON.parse(cleaned);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Gemini returned an invalid review object");
  return value;
}

function validateReview(review) {
  const allowed = ["low","medium","high"];
  if (typeof review.approved !== "boolean" || !Number.isFinite(Number(review.score)) ||
      Number(review.score) < 0 || Number(review.score) > 10 ||
      !allowed.includes(review.factualRisk) || !allowed.includes(review.repetition) ||
      !allowed.includes(review.exaggeration) || !Array.isArray(review.issues) ||
      !review.issues.every(issue => typeof issue === "string") ||
      (review.notes !== undefined && typeof review.notes !== "string")) {
    throw new Error("Gemini editorial review schema validation failed");
  }
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
    "افحص اختلاق التفاصيل، والخلط بين الحقائق والاستنتاجات، والادعاء الكاذب بتجربة مباشرة، والتكرار والحشو، وحدود الأدلة ودقة وصف المصادر.",
    isPreview
      ? "تحقق من أن تاريخ الإصدار مستقبلي وأن الحقائق منفصلة عن التوقعات، ولا تسمح بدرجة رقمية أو حكم نهائي."
      : isAudience
        ? "تحقق من تطابق متوسط الجمهور وعدد الأصوات واسم المنصة مع الأدلة، وانسب الدرجة للمصدر ولا تعرضها كتقييم VibeCritic أو تخترع درجات فرعية."
        : "تحقق من أن كل درجة ومحور نقدي مدعوم بأدلة فعلية كافية، وارفض أي محور لا تسمح الأدلة بتقييمه.",
    "أخرج JSON صالحاً فقط بهذه المفاتيح: approved (boolean), score (number 0..10), factualRisk (low|medium|high), repetition (low|medium|high), exaggeration (low|medium|high), issues (array of short Arabic strings), notes (short Arabic string). لا تضف Markdown أو نصاً خارج JSON.",
    isPreview
      ? "ارفض إذا كان تاريخ الإصدار غير مستقبلي، أو عرض المقال توقعات كحقائق، أو تضمن تقييماً نهائياً."
      : isAudience
        ? "ارفض إذا كان متوسط الجمهور أو عدد الأصوات غير مطابق للمصدر، أو نُسبت الدرجة إلى VibeCritic، أو اختُلقت آراء الجمهور أو تفاصيل التجربة."
        : "ارفض عند وجود خطر واقعي جوهري أو اختلاق واضح أو نقص شديد في اكتمال المراجعة أو حشو/تكرار شديد أو تضليل القارئ. لا تكن متساهلاً ولا متشدداً بلا سبب.",
    "ملف الأدلة: " + JSON.stringify(evidence),
    "المقال: " + JSON.stringify({title:article.title,summary:article.summary,verdict:article.verdict,body:article.body,pros:article.pros,cons:article.cons,sources:article.sources,youtubeVideoId:article.youtubeVideoId,youtubeVideoTitle:article.youtubeVideoTitle})
  ].join("\n\n");

  let totalTokens = 0;
  let lastFormatError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryInstruction = attempt === 2
      ? "\n\nهذه إعادة محاولة لأن الرد السابق لم يكن JSON كاملاً وصالحاً. أعد إجراء التدقيق نفسه من البداية، وأخرج كائن JSON واحداً مكتملاً مطابقاً للمفاتيح والأنواع المطلوبة. اختصر issues وnotes عند الحاجة، ولا تحذف أي مفتاح."
      : "";
    let response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
        method:"POST",
        headers:{ "content-type":"application/json", "x-goog-api-key":apiKey },
        body:JSON.stringify({
          contents:[{role:"user",parts:[{text:prompt + retryInstruction}]}],
          generationConfig:{temperature:0.1,responseMimeType:"application/json",maxOutputTokens:2400}
        }),
        signal:AbortSignal.timeout(25000)
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        if (attempt === 1) return { skipped:true, reason:"Gemini editorial review timed out; local article validation remains required", provider:"gemini", model, tokens:totalTokens, requests:attempt };
      }
      throw error;
    }
    if ([404,429,500,502,503,504].includes(response.status)) {
      const category = response.status === 404 ? "configured model is unavailable" : response.status === 429 ? "quota or rate limit reached" : "service temporarily unavailable";
      if (attempt === 1) return { skipped:true, reason:"Gemini editorial review skipped: " + category + " (HTTP " + response.status + "); local article validation remains required", provider:"gemini", model, tokens:totalTokens, requests:attempt };
      throw new Error("Gemini editorial review unavailable after retry (HTTP " + response.status + ")");
    }
    if (!response.ok) throw new Error("Gemini editorial review HTTP " + response.status + ": " + (await response.text()).slice(0,400));

    const data = await response.json();
    const usage = data.usageMetadata || {};
    totalTokens += (Number(usage.promptTokenCount)||0)+(Number(usage.candidatesTokenCount)||0);
    const candidate = data.candidates?.[0];
    const raw = (candidate?.content?.parts || []).map(part=>part.text || "").join("");
    try {
      if (!raw || candidate?.finishReason === "MAX_TOKENS") throw new Error(candidate?.finishReason === "MAX_TOKENS" ? "Gemini response was truncated (MAX_TOKENS)" : "Gemini editorial review returned no JSON");
      const review = parseReview(raw);
      validateReview(review);
      const rejected = !review.approved || Number(review.score) < 7 ||
        review.factualRisk === "high" || review.repetition === "high" || review.exaggeration === "high";
      if (rejected) {
        const reasons = (review.issues || []).slice(0,5).join("; ") || review.notes || "Editorial quality gate rejected the article";
        throw new Error("Gemini editorial review rejected article (score " + review.score + "/10): " + reasons);
      }
      return { skipped:false, provider:"gemini", model, review, tokens:totalTokens, requests:attempt };
    } catch (error) {
      if (String(error.message).startsWith("Gemini editorial review rejected article")) throw error;
      lastFormatError = error;
      if (attempt === 2) throw new Error("Gemini editorial review returned invalid or incomplete JSON after retry: " + error.message);
    }
  }
  throw new Error("Gemini editorial review failed: " + (lastFormatError?.message || "unknown error"));
}
