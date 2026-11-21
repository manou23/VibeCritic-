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
export function publishedIdentityKeys(type, sourceId, title) {
  const keys = [];
  const id = String(sourceId || "").trim();
  if (id) {
    keys.push(id);
    const typed = id.match(/^(game|movie|series):(.+)$/);
    if (typed) keys.push(typed[1] + ":" + typed[2]);
    else if (/^\d+$/.test(id) && ["game","movie","series"].includes(type)) keys.push(type + ":" + id);
  }
  const normalizedTitle = String(title || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  if (normalizedTitle) keys.push("title:" + normalizedTitle);
  return [...new Set(keys)];
}
async function publishedKeys() {
  const keys = new Set();
  for (const file of await fs.readdir(ROOT).catch(()=>[])) {
    if (!file.endsWith(".md")) continue;
    const text = await fs.readFile(ROOT + "/" + file,"utf8");
    const id = text.match(/^sourceId:\s*["']?([^"'\n]+)["']?/m)?.[1];
    const type = text.match(/^type:\s*(game|movie|series)\s*$/m)?.[1];
    const title = text.match(/^title:\s*["']?([^"'\n]+)["']?/m)?.[1];
    for (const key of publishedIdentityKeys(type, id, title)) keys.add(key);
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
  let extract = clean(page.extract);
  if (extract.length < 100) {
    const full = await get("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&format=json&redirects=1&titles=" + encodeURIComponent(hit.title));
    const pages = Object.values(full.query?.pages || {});
    const fallback = clean(pages[0]?.extract);
    if (fallback.length > extract.length) extract = fallback;
  }
  if (extract.length < 100) throw new Error("Independent source is too thin after full lead-section fallback");
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
function normalizeWords(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").split(/[^a-z0-9]+/).filter(word=>word.length>2);
}
async function findOfficialYoutubeTrailer(title,type) {
  const key = String(env.YOUTUBE_API_KEY || "").trim();
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured; refusing to publish a final review without a verified video");
  const kind = type === "game" ? "game official trailer" : type === "series" ? "official TV series trailer" : "official movie trailer";
  const query = title + " " + kind;
  const params = new URLSearchParams({
    part:"snippet", q:query, type:"video", maxResults:"20", order:"relevance",
    videoEmbeddable:"true", videoSyndicated:"true", regionCode:"US", relevanceLanguage:"en", key
  });
  const search = await get("https://www.googleapis.com/youtube/v3/search?" + params);
  const candidates = (search.items || []).filter(item=>item.id?.videoId && item.snippet?.title);
  if (!candidates.length) throw new Error("No verified official YouTube trailer found for " + title);
  const ids = candidates.map(item=>item.id.videoId).join(",");
  const details = await get("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({part:"snippet,status",id:ids,key}));
  const byId = new Map((details.items || []).map(item=>[item.id,item]));
  const trustedChannel = /official|pictures|studios|films|hbo|netflix|prime video|disney|warner|paramount|sony|universal|20th century|lionsgate|bandai|capcom|nintendo|playstation|xbox|ubisoft|electronic arts|ea games|rockstar|bethesda|square enix|konami|sega|riot games|blizzard|activision|cd projekt|fromsoftware/i;
  const tokens = [...new Set(normalizeWords(title))];
  const ranked = candidates.map(candidate=>{
    const video = byId.get(candidate.id.videoId);
    if (!video || video.status?.privacyStatus !== "public" || video.status?.embeddable !== true) return null;
    const videoTitle = video.snippet?.title || candidate.snippet.title || "";
    const channel = video.snippet?.channelTitle || candidate.snippet.channelTitle || "";
    if (/fan.?made|concept trailer|reaction|review|parody|trailer breakdown|gameplay walkthrough|compilation|edit/i.test(videoTitle)) return null;
    if (!/\b(trailer|teaser)\b/i.test(videoTitle)) return null;
    if (!/\bofficial\b/i.test(videoTitle + " " + channel) && !trustedChannel.test(channel)) return null;
    const words = normalizeWords(videoTitle);
    const overlap = tokens.filter(token=>words.includes(token)).length;
    if (!overlap || overlap < Math.min(2,tokens.length)) return null;
    return {
      id:candidate.id.videoId,
      title:videoTitle,
      channel,
      publishedAt:video.snippet?.publishedAt || "",
      score:overlap + (trustedChannel.test(channel)?3:0) + (/\bofficial\b/i.test(videoTitle + " " + channel)?2:0) + (/\btrailer\b/i.test(videoTitle)?1:0)
    };
  }).filter(Boolean).sort((a,b)=>b.score-a.score || String(b.publishedAt).localeCompare(String(a.publishedAt)));
  if (!ranked.length) throw new Error("No verified official YouTube trailer found for " + title);
  return ranked[0];
}
export async function discoverCandidate(state) {
  const [used,counts] = await Promise.all([publishedKeys(),publishedTypeCounts()]);
  const candidates = [];
  if (env.TMDB_API_KEY) {
    const [movies,series] = await Promise.all([
      get(tmdb("trending/movie/week")).catch(()=>({results:[]})),
      get(tmdb("trending/tv/week")).catch(()=>({results:[]}))
    ]);
    for (const x of movies.results || []) candidates.push({ type:"movie", id:String(x.id), name:x.title, date:x.release_date || "", preview:Boolean(x.release_date && x.release_date > new Date().toISOString().slice(0,10) && x.release_date <= new Date(Date.now()+120*86400000).toISOString().slice(0,10)), popularity:Number(x.popularity)||0, source:"TMDB" });
    for (const x of series.results || []) candidates.push({ type:"series", id:String(x.id), name:x.name, date:x.first_air_date || "", preview:Boolean(x.first_air_date && x.first_air_date > new Date().toISOString().slice(0,10) && x.first_air_date <= new Date(Date.now()+120*86400000).toISOString().slice(0,10)), popularity:Number(x.popularity)||0, source:"TMDB" });
  }
  if (env.RAWG_API_KEY) {
    const data = await get("https://api.rawg.io/api/games?key=" + encodeURIComponent(env.RAWG_API_KEY) + "&ordering=-added&page_size=30").catch(()=>({results:[]}));
    for (const x of data.results || []) candidates.push({ type:"game", id:String(x.id), name:x.name, date:x.released || "", popularity:Number(x.added)||0, source:"RAWG" });
  }
  const now = new Date().toISOString().slice(0,10);
  const eligible = candidates.filter(x => x.id && x.name && (!x.date || x.date <= now || x.preview === true) && !used.has(x.type + ":" + x.id) && !used.has("title:" + x.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"")) && !state.jobs[x.type + ":" + x.id]);
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
    metadata = { releaseDate:data.released || "", genres:(data.genres||[]).map(x=>x.name), platforms:(data.platforms||[]).map(x=>x.platform?.name).filter(Boolean), developers:(data.developers||[]).map(x=>x.name), rating:data.rating||null, ratingScale:5, votes:data.ratings_count||0, poster:data.background_image||"" };
  } else {
    const kind = candidate.type === "series" ? "tv" : "movie";
    const [data,credits] = await Promise.all([
      get(tmdb(kind + "/" + candidate.id)),
      get(tmdb(kind + "/" + candidate.id + "/credits")).catch(()=>({cast:[],crew:[]}))
    ]);
    primary = { name:"TMDB", url:"https://www.themoviedb.org/" + kind + "/" + candidate.id, extract:clean(data.overview) };
    metadata = { releaseDate:data.release_date || data.first_air_date || "", genres:(data.genres||[]).map(x=>x.name), platforms:[], cast:(credits.cast||[]).slice(0,8).map(x=>x.name), crew:(credits.crew||[]).filter(x=>["Director","Creator","Writer"].includes(x.job)).slice(0,8).map(x=>x.name), rating:data.vote_average||null, ratingScale:10, votes:data.vote_count||0, poster:data.poster_path ? "https://image.tmdb.org/t/p/w780"+data.poster_path : "", backdrop:data.backdrop_path ? "https://image.tmdb.org/t/p/w1280"+data.backdrop_path : "" };
  }
  if (primary.extract.length < 80) throw new Error("Primary catalog description is too thin");
  const [independent, youtubeTrailer] = await Promise.all([
    wikiEvidence(candidate.name),
    findOfficialYoutubeTrailer(candidate.name,candidate.type)
  ]);
  const sources = [
    { ...primary, kind:"catalog-metadata" },
    { ...independent, kind:"encyclopedia" },
    { name:"YouTube — "+youtubeTrailer.channel, url:"https://www.youtube.com/watch?v="+youtubeTrailer.id, extract:"Verified public, embeddable promotional trailer: "+youtubeTrailer.title, kind:"promotional" }
  ];
  return {
    title:candidate.name,
    type:candidate.type,
    collectedAt:new Date().toISOString(),
    sourceId:candidate.type+":"+candidate.id,
    sourceName:primary.name,
    sourceUrl:primary.url,
    overview:primary.extract,
    sources,
    // Catalog metadata, an encyclopedia entry and a promotional trailer support an informative profile,
    // but do not establish episode-level or hands-on evidence for a scored critical review.
    reviewReadiness: candidate.preview === true && metadata.releaseDate > new Date().toISOString().slice(0,10) ? "preview" : Number(metadata.votes) >= 100 && Number(metadata.rating) > 0 ? "audience" : "limited",
    reviewReadinessReason: candidate.preview === true && metadata.releaseDate > new Date().toISOString().slice(0,10) ? "Verified pre-release item; preview only, no final rating." : Number(metadata.votes) >= 100 && Number(metadata.rating) > 0 ? "A source-backed audience average is available from " + primary.name + " with " + metadata.votes + " votes; this is not an independent VibeCritic score." : "Available evidence does not include a sufficiently supported audience rating (minimum 100 votes) or independent hands-on evidence.",
    youtubeVideoId:youtubeTrailer.id,
    youtubeVideoTitle:youtubeTrailer.title,
    youtubeChannel:youtubeTrailer.channel,
    ...metadata
  };
}
