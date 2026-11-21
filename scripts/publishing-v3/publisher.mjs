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
  const isLimited = reviewMode !== "review";
  validateArticle(article, isLimited ? { minWords:650, minCharacters:3200 } : { minWords:1000, minCharacters:5200 });
  if (!/^[A-Za-z0-9_-]{11}$/.test(article.youtubeVideoId || "")) throw new Error("V3 article requires a verified YouTube video ID");
  const list = values => (values||[]).map(x=>"  - "+quote(x)).join("\n") || " []";
  const finalVerdict = isLimited
    ? String(article.verdict || "هذه قراءة معلوماتية محدودة، ولا تتضمن حكماً نهائياً على جودة التنفيذ.")
    : normalizeFinalRating(article.verdict, article.score);
  const finalBody = isLimited ? String(article.body || "") : normalizeBodyFinalRating(article.body, article.score);
  const scoreFields = isLimited ? [] : [
    "score: "+Number(article.score).toFixed(2),
    "storyScore: "+Number(article.scores.story).toFixed(2),
    "visualsScore: "+Number(article.scores.visuals).toFixed(2),
    "soundScore: "+Number(article.scores.sound).toFixed(2),
    "pacingScore: "+Number(article.scores.pacing).toFixed(2)
  ];
  const editorialNote = isLimited
    ? "> قراءة معلوماتية محدودة مبنية على بيانات العمل ومصادر تعريفية ومواد ترويجية. لا تمثل مراجعة مشاهدة أو لعب، ولا تمنح درجة نهائية."
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
  validateArticle(article,{minWords:1000,minCharacters:5200});
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
