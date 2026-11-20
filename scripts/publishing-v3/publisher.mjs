import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateArticle } from "./core.mjs";
const quote = value => JSON.stringify(String(value ?? ""));
const slug = value => String(value||"").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"").slice(0,55) || "review";
export function articleFilePath(article, root="src/content/reviews") {
  const file = article.type+"-"+slug(article.title)+"-"+String(article.sourceId.split(":").pop()).replace(/[^\w-]/g,"")+".md";
  return path.join(root,file).replace(/\\/g,"/");
}
export function renderMarkdown(article) {
  validateArticle(article);
  const list = values => (values||[]).map(x=>"  - "+quote(x)).join("\n") || " []";
  const fm = [
    "---","title: "+quote(article.title),"headline: "+quote(article.headline||article.title),
    "hook: "+quote(article.summary||article.verdict),"summary: "+quote(article.summary||article.verdict),"verdict: "+quote(article.verdict),
    "reviewVersion: 5","reviewMode: limited",
    "date: "+new Date().toISOString().slice(0,10),"publishedAt: "+quote(new Date().toISOString()),
    "releaseDate: "+quote(article.releaseDate||""),"type: "+article.type,
    "sourceName: "+quote(article.sourceName),"sourceId: "+quote(article.sourceId),"sourceUrl: "+quote(article.sourceUrl),
    "aiGenerated: true","editorialWorkflow: automated","poster: "+quote(article.poster),"backdrop: "+quote(article.backdrop),
    "genres:\n"+list(article.genres),"platforms:\n"+list(article.platforms),"cast:\n"+list(article.cast),"crew:\n"+list(article.crew),"pros:\n"+list(article.pros),"cons:\n"+list(article.cons),"tags:\n"+list(article.tags),
    "---","",article.body,"","> مراجعة تحريرية محدودة مبنية على المصادر المذكورة، ولا تدّعي تجربة مباشرة للعب أو المشاهدة.","","### المصادر والمراجع","",...(article.sources||[]).map(s=>"- ["+s.name+"]("+s.url+")")
  ];
  return fm.join("\n")+"\n";
}
export async function publishArticle(article, root="src/content/reviews") {
  validateArticle(article);
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
