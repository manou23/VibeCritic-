const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=120, stale-while-revalidate=300' : 'no-store', 'x-content-type-options': 'nosniff' }
});
const SORTS = { popular: 't.popularity DESC, t.votes DESC, t.id DESC', rating: 't.rating DESC, t.votes DESC, t.id DESC', newest: 't.release_date DESC, t.popularity DESC, t.id DESC', title: "COALESCE(NULLIF(t.title_ar, ''), t.title) COLLATE NOCASE ASC" };
function searchExpression(value) {
  const tokens = String(value || '').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(tokens)].slice(0, 8).map(token => '"' + token.replaceAll('"', '""') + '"*').join(' AND ');
}
async function getGenres(db) {
  const result = await db.prepare('SELECT id, name_ar, name_en FROM genres ORDER BY COALESCE(name_ar, name_en)').all();
  return result.results || [];
}
export async function onRequestGet({ request, env }) {
  const db = env.ENTERTAINMENT_DB;
  if (!db) return json({ error: 'كتالوج الترفيه غير مهيأ على الخادم.' }, 503);
  try {
    const params = new URL(request.url).searchParams;
    if (params.get('mode') === 'genres') return json({ genres: await getGenres(db) });
    const id = params.get('id');
    if (id !== null) {
      if (!/^\d{1,10}$/.test(id)) return json({ error: 'معرّف العمل غير صالح.' }, 400);
      const title = await db.prepare("SELECT t.id,t.tmdb_id,t.type,t.title,t.title_ar,t.overview_ar,t.release_date,t.year,t.runtime,t.status,t.rating,t.votes,t.popularity,t.poster_path,t.backdrop_path,(SELECT GROUP_CONCAT(COALESCE(g.name_ar,g.name_en),'،') FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id=t.id) AS genres FROM titles t WHERE t.id=? LIMIT 1").bind(Number(id)).first();
      if (!title) return json({ error: 'لم نعثر على هذا العمل.' }, 404);
      const credits = await db.prepare("SELECT p.name,p.profile_path,c.kind,c.character,c.job FROM credits c JOIN people p ON p.id=c.person_id WHERE c.title_id=? ORDER BY CASE WHEN c.kind='cast' THEN 0 ELSE 1 END,c.sort_order LIMIT 20").bind(Number(id)).all();
      return json({ title, credits: credits.results || [] });
    }
    const page = Math.max(1, Math.min(1000, Number.parseInt(params.get('page') || '1', 10) || 1));
    const limit = Math.max(1, Math.min(24, Number.parseInt(params.get('limit') || '18', 10) || 18));
    const values = [], conditions = [];
    const type = params.get('type');
    if (type && ['movie', 'tv'].includes(type)) { conditions.push('t.type = ?'); values.push(type); }
    const year = params.get('year');
    if (year && /^\d{4}$/.test(year)) { conditions.push('t.year = ?'); values.push(Number(year)); }
    const genre = params.get('genre');
    if (genre && /^\d{1,8}$/.test(genre)) { conditions.push('EXISTS (SELECT 1 FROM title_genres tg WHERE tg.title_id=t.id AND tg.genre_id=?)'); values.push(Number(genre)); }
    const expression = searchExpression(params.get('q'));
    if (expression) { conditions.push('t.id IN (SELECT rowid FROM titles_fts WHERE titles_fts MATCH ?)'); values.push(expression); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const order = SORTS[params.get('sort')] || SORTS.popular;
    const count = await db.prepare('SELECT COUNT(*) AS total FROM titles t ' + where).bind(...values).first();
    const sql = "SELECT t.id,t.tmdb_id,t.type,t.title,t.title_ar,t.overview_ar,t.release_date,t.year,t.runtime,t.rating,t.votes,t.popularity,t.poster_path,t.backdrop_path,(SELECT GROUP_CONCAT(COALESCE(g.name_ar,g.name_en),'،') FROM title_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.title_id=t.id) AS genres FROM titles t " + where + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?';
    const rows = await db.prepare(sql).bind(...values, limit, (page - 1) * limit).all();
    const total = Number(count?.total) || 0;
    return json({ items: rows.results || [], page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Catalog API error:', error?.message || error);
    return json({ error: 'تعذر تحميل الكتالوج حالياً. حاول مرة أخرى.' }, 500);
  }
}
