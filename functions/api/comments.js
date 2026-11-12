const MAX_BODY_BYTES = 5000;
const MAX_NAME_LENGTH = 32;
const MAX_COMMENT_LENGTH = 700;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function cleanText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("Host");
  } catch {
    return false;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.COMMENTS_DB) return json({ error: "خدمة التعليقات غير مهيأة بعد." }, 503);
  const slug = cleanText(new URL(request.url).searchParams.get("slug"), 180);
  if (!slug || slug.includes("..")) return json({ error: "معرّف المقال غير صالح." }, 400);

  try {
    const result = await env.COMMENTS_DB.prepare(
      "SELECT id, nickname, body, created_at FROM comments WHERE review_slug = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50"
    ).bind(slug).all();
    return json({ comments: result.results || [] });
  } catch (error) {
    console.error("Comments read failed:", error);
    return json({ error: "تعذر تحميل التعليقات حالياً." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!validOrigin(request)) return json({ error: "مصدر الطلب غير مسموح." }, 403);
  if (!env.COMMENTS_DB) return json({ error: "خدمة التعليقات غير مهيأة بعد." }, 503);

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "حجم الطلب أكبر من المسموح." }, 413);
    const input = JSON.parse(raw);

    // Honeypot: silently accept automated submissions without storing them.
    if (cleanText(input.website, 120)) return json({ ok: true, pending: true });
    const nickname = cleanText(input.nickname, MAX_NAME_LENGTH);
    const body = cleanText(input.body, MAX_COMMENT_LENGTH);
    const slug = cleanText(input.slug, 180);

    if (!slug || slug.includes("..")) return json({ error: "المقال المحدد غير صالح." }, 400);
    if (nickname.length < 2) return json({ error: "اكتب اسماً مستعاراً من حرفين على الأقل." }, 400);
    if (body.length < 8) return json({ error: "اكتب تعليقاً أطول قليلاً (8 أحرف على الأقل)." }, 400);
    if (body.length > MAX_COMMENT_LENGTH) return json({ error: "التعليق طويل جداً." }, 400);

    await env.COMMENTS_DB.prepare(
      "INSERT INTO comments (review_slug, nickname, body, status) VALUES (?, ?, ?, 'pending')"
    ).bind(slug, nickname, body).run();

    return json({ ok: true, pending: true }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "بيانات الطلب غير صالحة." }, 400);
    console.error("Comments submission failed:", error);
    return json({ error: "تعذر إرسال التعليق حالياً. حاول لاحقاً." }, 500);
  }
}
