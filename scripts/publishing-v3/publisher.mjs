import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateArticle } from "./core.mjs";
import { normalizeFinalRating, normalizeBodyFinalRating } from "./writer.mjs";
const quote = value => JSON.stringify(String(value ?? ""));
const slug = value => String(value||"").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"").slice(0,55) || "review";
export function articleFilePath(article, root="src/content/reviews") {
  const file = article.type+"-"+slug(article.title)+"-"+String(article.sourceId.split(":").pop()).replace(/[^\w-]/g,"")+".md";
  return path.join(root,file).replace(/\\/g,"/");
}
export function renderMarkdown(article) {
  const reviewMode = article.reviewMode || "review";
  const isPreview = reviewMode === "preview";
  const hasScore = reviewMode === "review";
  if (reviewMode === "limited") throw new Error("Refusing to publish a limited-evidence article on VibeCritic");
  validateArticle(article, reviewMode !== "review" ? { minWords:650, minCharacters:3200 } : { minWords:1000, minCharacters:5200 });
  if (!/^[A-Za-z0-9_-]{11}$/.test(article.youtubeVideoId || "")) throw new Error("V3 article requires a verified YouTube video ID");
  const list = values => (values||[]).map(x=>"  - "+quote(x)).join("\n") || " []";
  const finalVerdict = hasScore
    ? normalizeFinalRating(article.verdict, article.score)
    : String(article.verdict || "هذه معاينة استباقية قبل الإصدار، ولا تتضمن حكماً نهائياً أو درجة.");
  const finalBody = hasScore ? normalizeBodyFinalRating(article.body, article.score) : String(article.body || "");
  const scoreFields = !hasScore ? [] : [
    "score: "+Number(article.score).toFixed(2),
    "storyScore: "+Number(article.scores.story).toFixed(2),
    "visualsScore: "+Number(article.scores.visuals).toFixed(2),
    "soundScore: "+Number(article.scores.sound).toFixed(2),
    "pacingScore: "+Number(article.scores.pacing).toFixed(2)
  ];
  const editorialNote = isPreview
    ? "> معاينة استباقية قبل الإصدار، وليست مراجعة نهائية ولا تتضمن تقييماً رقمياً."
    : "> مراجعة تحريرية نهائية مبنية على مصادر موثوقة ومواد رسمية متاحة. لا تدّعي تجربة لعب أو مشاهدة مباشرة لم ينفذها المحرر.";
  const fm = [
    "---",
    "title: "+quote(article.title),
    "headline: "+quote(article.headline||article.title),
    "hook: "+quote(article.summary||finalVerdict),
    "summary: "+quote(article.summary||finalVerdict),
    "verdict: "+quote(finalVerdict),
    "reviewVersion: 7",
    "reviewMode: "+reviewMode,
    ...scoreFields,
    "date: "+new Date().toISOString().slice(0,10),
    "publishedAt: "+quote(new Date().toISOString()),
    "releaseDate: "+quote(article.releaseDate||""),
    "type: "+article.type,
    "sourceName: "+quote(article.sourceName),
    "sourceId: "+quote(article.sourceId),
    "sourceUrl: "+quote(article.sourceUrl),
    "aiGenerated: true",
    "editorialWorkflow: automated",
    "poster: "+quote(article.poster),
    "backdrop: "+quote(article.backdrop),
    "youtubeVideoId: "+quote(article.youtubeVideoId),
    "youtubeVideoTitle: "+quote(article.youtubeVideoTitle||("Official trailer — "+article.title)),
    "genres:\n"+list(article.genres),
    "platforms:\n"+list(article.platforms),
    "cast:\n"+list(article.cast),
    "crew:\n"+list(article.crew),
    "pros:\n"+list(article.pros),
    "cons:\n"+list(article.cons),
    "tags:\n"+list(article.tags),
    "---",
    "",
    finalBody,
    "",
    editorialNote,
    "",
    "### المصادر والمراجع",
    "",
    ...(article.sources||[]).map(s=>"- ["+s.name+"]("+s.url+")")
  ];
  return fm.join("\n")+"\n";
}
export async function publishArticle(article, root="src/content/reviews") {
  const isLimited = article.reviewMode === "preview" || article.reviewMode === "limited";
  if (article.reviewMode === "limited") throw new Error("Refusing to publish a limited-evidence article on VibeCritic");
  validateArticle(article,isLimited ? {minWords:650,minCharacters:3200} : {minWords:1000,minCharacters:5200});
  await fs.mkdir(root,{recursive:true});
  const target = articleFilePath(article,root);
  const temp = target+".tmp-"+randomUUID();
  try {
    await fs.writeFile(temp,renderMarkdown(article),{flag:"wx",encoding:"utf8"});
    await fs.link(temp,target);
    return target;
  } finally {
    await fs.rm(temp,{force:true}).catch(()=>{});
  }
}
