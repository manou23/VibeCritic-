import fs from "node:fs/promises";
import { withRunLock } from "./lock.mjs";
import { loadState, saveState } from "./store.mjs";
import { enqueue, transition, chooseJob, validateEvidence } from "./core.mjs";
import { discoverCandidate, collectEvidence } from "./sources.mjs";
import { writeArticle } from "./writer.mjs";
import { publishArticle } from "./publisher.mjs";

const result = await withRunLock(async () => {
  const state = await loadState();
  let job = null;
  try {
    job = chooseJob(state);
    if (!job) {
      const candidate = await discoverCandidate(state);
      if (!candidate) return { action:"no-candidate" };
      job = enqueue(state,candidate).job;
      await saveState(state);
    }
    if (job.status === "waiting") {
      const resume = job.resumeStatus || "queued";
      transition(job,resume,{nextAttemptAt:null,resumeStatus:null});
    }
    if (job.status === "verifying") {
      const response = await fetch(job.verifiedUrl,{signal:AbortSignal.timeout(15000)});
      if (response.status === 404) {
        try { await fs.access(job.articlePath); }
        catch { transition(job,"ready"); await saveState(state); return { action:"ready-after-build-rollback", key:job.key }; }
      }
      if (!response.ok) throw new Error("Live verification returned HTTP " + response.status);
      const html = await response.text();
      if (!html.includes(job.title)) throw new Error("Live page does not contain the expected article title");
      transition(job,"published",{publishedAt:new Date().toISOString()});
      await saveState(state);
      return { action:"published", key:job.key, articlePath:job.articlePath, url:job.verifiedUrl, provider:job.provider };
    }
    if (job.status === "queued") {
      transition(job,"researching");
      job.evidence = await collectEvidence(job.item);
      validateEvidence(job.evidence);
      transition(job,"writing");
      await saveState(state);
      const generated = await writeArticle(job.evidence);
      job.article = generated.article;
      job.provider = generated.provider;
      job.tokens = generated.tokens;
      transition(job,"reviewing");
      await saveState(state);
      transition(job,"ready");
    }
    if (job.status === "ready") {
      transition(job,"publishing");
      try {
        job.articlePath = await publishArticle(job.article);
      } catch (error) {
        if (error?.code === "EEXIST") {
          transition(job,"rejected",{lastError:"Refusing to overwrite an existing article file."});
          await saveState(state);
          return { action:"rejected", key:job.key, reason:job.lastError };
        }
        throw error;
      }
      const slug = job.articlePath.split("/").pop().replace(/\.md$/,"");
      job.verifiedUrl = "https://vibecritic.pages.dev/reviews/" + encodeURIComponent(slug) + "/";
      transition(job,"verifying");
      await saveState(state);
      return { action:"article-created-awaiting-deploy", key:job.key, articlePath:job.articlePath, url:job.verifiedUrl, provider:job.provider };
    }
    await saveState(state);
    return { action:job.status, key:job.key };
  } catch (error) {
    if (job && !["published","rejected"].includes(job.status)) {
      const resumeStatus = job.status;
      job.attempts = (job.attempts||0)+1;
      job.lastError = String(error.message||error).slice(0,800);
      transition(job,"waiting",{resumeStatus,nextAttemptAt:new Date(Date.now()+Math.min(24,Math.pow(2,job.attempts-1))*60*60*1000).toISOString()});
    }
    await saveState(state);
    throw error;
  }
});
console.log("VibeCritic Publishing V3:",JSON.stringify(result));
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,"## VibeCritic Publishing V3\n- Result: "+result.action+"\n- Article: "+(result.url||"—")+"\n");
}
