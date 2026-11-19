import fs from "node:fs/promises";
const ROOT = "src/content/reviews";
const env = process.env;
const clean = value => String(value ?? "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
async function get(url) {
  const response = await fetch(url, { headers: { "user-agent":"VibeCriticPublisher/3.0", accept:"application/json" }, signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Source HTTP " + response.status + " (" + new URL(url).hostname + ")");
  return response.json();
}
const tmdb = (endpoint, params={}) => {
  const url = new URL("https://api.themoviedb.org/3/" + endpoint);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  url.searchParams.set("language","en-US");
  for (const [key,value] of Object.entries(params)) if (value != null) url.searchParams.set(key,String(value));
  return url.toString();
};
async function publishedKeys() {
  const keys = new Set();
  for (const file of await fs.readdir(ROOT).catch(()=>[])) {
    if (!file.endsWith(".md")) continue;
    const text = await fs.readFile(ROOT + "/" + file,"utf8");
    const id = text.match(/^sourceId:\s*["']?([^"'\n]+)["']?/m)?.[1];
    const title = text.match(/^title:\s*["']?([^"'\n]+)["']?/m)?.[1];
    if (id) keys.add(id.trim());
    if (title) keys.add("title:" + title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""));
  }
  return keys;
}
async function wikiEvidence(title) {
  const search = await get("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=" + encodeURIComponent(title) + "&srlimit=5");
  const normalize = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const target = normalize(title);
  const hit = (search.query?.search || []).find(x => normalize(x.title) === target);
  if (!hit) throw new Error("No exact independent encyclopedia match for " + title);
  const page = await get("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(hit.title.replace(/ /g,"_")));
  if (normalize(page.title) !== target) throw new Error("Independent source title mismatch");
  const extract = clean(page.extract);
  if (extract.length < 100) throw new Error("Independent source is too thin");
  return { name:"Wikipedia", url:page.content_urls?.desktop?.page || "https://en.wikipedia.org/wiki/" + encodeURIComponent(hit.title.replace(/ /g,"_")), extract };
}
async function publishedTypeCounts() {
  const counts = { game:0, movie:0, series:0 };
  for (const file of await fs.readdir(ROOT).catch(()=>[])) {
    if (!file.endsWith(".md")) continue;
    const text = await fs.readFile(ROOT + "/" + file,"utf8");
    const type = text.match(/^type:\s*(game|movie|series)\s*$/m)?.[1];
    if (type) counts[type]++;
  }
  return counts;
}
export async function discoverCandidate(state) {
  const [used,counts] = await Promise.all([publishedKeys(),publishedTypeCounts()]);
  const candidates = [];
  if (env.TMDB_API_KEY) {
    const [movies,series] = await Promise.all([
      get(tmdb("trending/movie/week")).catch(()=>({results:[]})),
      get(tmdb("trending/tv/week")).catch(()=>({results:[]}))
    ]);
    for (const x of movies.results || []) candidates.push({ type:"movie", id:String(x.id), name:x.title, date:x.release_date || "", popularity:Number(x.popularity)||0, source:"TMDB" });
    for (const x of series.results || []) candidates.push({ type:"series", id:String(x.id), name:x.name, date:x.first_air_date || "", popularity:Number(x.popularity)||0, source:"TMDB" });
  }
  if (env.RAWG_API_KEY) {
    const data = await get("https://api.rawg.io/api/games?key=" + encodeURIComponent(env.RAWG_API_KEY) + "&ordering=-added&page_size=30").catch(()=>({results:[]}));
    for (const x of data.results || []) candidates.push({ type:"game", id:String(x.id), name:x.name, date:x.released || "", popularity:Number(x.added)||0, source:"RAWG" });
  }
  const now = new Date().toISOString().slice(0,10);
  const eligible = candidates.filter(x => x.id && x.name && (!x.date || x.date <= now) && !used.has(x.type + ":" + x.id) && !used.has("title:" + x.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")) && !state.jobs[x.type + ":" + x.id]);
  if (!eligible.length) return null;
  eligible.sort((a,b) => counts[a.type]-counts[b.type] || b.popularity-a.popularity);
  return eligible[0];
}
export async function collectEvidence(candidate) {
  let primary;
  let metadata = {};
  if (candidate.type === "game") {
    const data = await get("https://api.rawg.io/api/games/" + encodeURIComponent(candidate.id) + "?key=" + encodeURIComponent(env.RAWG_API_KEY));
    primary = { name:"RAWG", url:data.slug ? "https://rawg.io/games/" + data.slug : "https://rawg.io", extract:clean(data.description_raw || data.description) };
    metadata = { releaseDate:data.released || "", genres:(data.genres||[]).map(x=>x.name), platforms:(data.platforms||[]).map(x=>x.platform?.name).filter(Boolean), developers:(data.developers||[]).map(x=>x.name), rating:data.rating||null, votes:data.ratings_count||0, poster:data.background_image||"" };
  } else {
    const kind = candidate.type === "series" ? "tv" : "movie";
    const [data,credits] = await Promise.all([
      get(tmdb(kind + "/" + candidate.id)),
      get(tmdb(kind + "/" + candidate.id + "/credits")).catch(()=>({cast:[],crew:[]}))
    ]);
    primary = { name:"TMDB", url:"https://www.themoviedb.org/" + kind + "/" + candidate.id, extract:clean(data.overview) };
    metadata = { releaseDate:data.release_date || data.first_air_date || "", genres:(data.genres||[]).map(x=>x.name), platforms:[], cast:(credits.cast||[]).slice(0,8).map(x=>x.name), crew:(credits.crew||[]).filter(x=>["Director","Creator","Writer"].includes(x.job)).slice(0,8).map(x=>x.name), rating:data.vote_average||null, votes:data.vote_count||0, poster:data.poster_path ? "https://image.tmdb.org/t/p/w780"+data.poster_path : "", backdrop:data.backdrop_path ? "https://image.tmdb.org/t/p/w1280"+data.backdrop_path : "" };
  }
  if (primary.extract.length < 80) throw new Error("Primary catalog description is too thin");
  const independent = await wikiEvidence(candidate.name);
  return { title:candidate.name, type:candidate.type, sourceId:candidate.type+":"+candidate.id, sourceName:primary.name, sourceUrl:primary.url, overview:primary.extract, sources:[primary,independent], ...metadata };
}
