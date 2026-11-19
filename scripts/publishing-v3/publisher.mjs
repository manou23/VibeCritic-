import fs from "node:fs/promises";
import path from "node:path";
import { validateArticle } from "./core.mjs";
const quote = value => JSON.stringify(String(value ?? ""));
const slug = value => String(value||"").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"").slice(0,55) || "review";
export function renderMarkdown(article) {
  validateArticle(article);
  const list = values => (values||[]).map(x=>"  - "+quote(x)).join("\n") || " []";
  const fm = [
    "---","title: "+quote(article.title),"headline: "+quote(article.headline||article.title),
    "summary: "+quote(article.summary||article.verdict),"verdict: "+quote(article.verdict),
    "date: "+new Date().toISOString().slice(0,10),"publishedAt: "+quote(new Date().toISOString()),
    "releaseDate: "+quote(article.releaseDate||""),"type: "+article.type,
    "score: "+article.score,"storyScore: "+article.scores.story,"visualsScore: "+article.scores.visuals,
    "soundScore: "+article.scores.sound,"pacingScore: "+article.scores.pacing,
    "sourceName: "+quote(article.sourceName),"sourceId: "+quote(article.sourceId),"sourceUrl: "+quote(article.sourceUrl),
    "aiGenerated: true","editorialWorkflow: automated","poster: "+quote(article.poster),"backdrop: "+quote(article.backdrop),
    "genres:\n"+list(article.genres),"platforms:\n"+list(article.platforms),"pros:\n"+list(article.pros),"cons:\n"+list(article.cons),
    "---","",article.body,"","### المصادر والمراجع","",...(article.sources||[]).map(s=>"- ["+s.name+"]("+s.url+")")
  ];
  return fm.join("\n")+"\n";
}
export async function publishArticle(article, root="src/content/reviews") {
  validateArticle(article);
  await fs.mkdir(root,{recursive:true});
  const file = article.type+"-"+slug(article.title)+"-"+String(article.sourceId.split(":").pop()).replace(/[^\w-]/g,"")+".md";
  const target = path.join(root,file);
  await fs.writeFile(target,renderMarkdown(article),{flag:"wx",encoding:"utf8"});
  return target.replace(/\\/g,"/");
}
