import fs from "node:fs/promises";
import { withRunLock } from "./lock.mjs";
import { loadState, saveState } from "./store.mjs";
import { enqueue, transition, chooseJob, validateEvidence } from "./core.mjs";
import { discoverCandidate, collectEvidence } from "./sources.mjs";
import { writeArticle } from "./writer.mjs";
import { publishArticle, articleFilePath } from "./publisher.mjs";

const result = await withRunLock(async () => {
  const state = await loadState();
  state.usage ||= {};
  const day = new Date().toISOString().slice(0,10);
  const daily = state.usage[day] ||= { articles:0, requests:0, tokens:0 };
  const dailyLimit = 6; // Hard ceiling: never exceed six AI-generated articles per UTC day; manual articles are not counted.
  const tomorrow = () => new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()+1,0,5)).toISOString();
  let job = null;
  try {
    job = chooseJob(state);
    if (!job && (daily.articles >= dailyLimit)) return { action:"daily-free-budget-reached", ...daily };
    if (job?.status === "waiting") {
      const resume = job.resumeStatus || "queued";
      if (["queued","researching","writing"].includes(resume) && (daily.articles >= dailyLimit)) {
        job.nextAttemptAt = tomorrow();
        await saveState(state);
        return { action:"daily-free-budget-reached", key:job.key, ...daily };
      }
      transition(job,resume,{nextAttemptAt:null,resumeStatus:null});
    }
    if (!job) {
      const candidate = await discoverCandidate(state);
      if (!candidate) return { action:"no-candidate" };
      job = enqueue(state,candidate).job;
      await saveState(state);
    }
    if (["researching","writing"].includes(job.status)) transition(job,"queued");
    if (job.status === "reviewing") transition(job,"ready");
    if (job.status === "publishing") {
      job.articlePath ||= articleFilePath(job.article);
      try { await fs.access(job.articlePath); transition(job,"verifying"); }
      catch { transition(job,"ready"); }
    }
    if (job.status === "verifying") {
      const response = await fetch(job.verifiedUrl,{signal:AbortSignal.timeout(15000),headers:{"cache-control":"no-cache"}});
      let articleFileMissing = false;
      if (response.status === 404) {
        try { await fs.access(job.articlePath); }
        catch {
          transition(job,"ready");
          await saveState(state);
          articleFileMissing = true;
        }
        if (!articleFileMissing) {
          job.attempts = (job.attempts || 0) + 1;
          const retryAt = new Date(Date.now() + 60 * 1000).toISOString();
          transition(job,"waiting",{resumeStatus:"verifying",nextAttemptAt:retryAt,lastError:"Article file exists, but the live site still returns HTTP 404; deployment verification will retry."});
          await saveState(state);
          return { action:"deployment-pending", key:job.key, url:job.verifiedUrl, retryAt };
        }
      }
      if (!articleFileMissing) {
        if (!response.ok) throw new Error("Live verification returned HTTP " + response.status);
        const html = await response.text();
        if (!html.includes(job.title)) throw new Error("Live page does not contain the expected article title");
        const completedKey = job.key;
        const completedPath = job.articlePath;
        const completedUrl = job.verifiedUrl;
        const completedProvider = job.provider;
        transition(job,"published",{publishedAt:new Date().toISOString(),article:null,evidence:null});
        await saveState(state);
        job = chooseJob(state);
        if (!job) {
          const candidate = await discoverCandidate(state);
          if (!candidate) return { action:"published", key:completedKey, articlePath:completedPath, url:completedUrl, provider:completedProvider };
          job = enqueue(state,candidate).job;
          await saveState(state);
        }
      }
    }
    if (job.status === "queued") {
      if (daily.articles >= dailyLimit) {
        transition(job,"waiting",{resumeStatus:"queued",nextAttemptAt:tomorrow()});
        await saveState(state);
        return { action:"daily-free-budget-reached", key:job.key, ...daily };
      }
      let evidenceReady = false;
      for (let candidateAttempt = 0; candidateAttempt < 5; candidateAttempt++) {
        transition(job,"researching");
        try {
          job.evidence = await collectEvidence(job.item);
          validateEvidence(job.evidence);
          evidenceReady = true;
          break;
        } catch (error) {
          const message = String(error?.message || error);
          const candidateSpecific = /(Candidate release date is still in the future|Primary catalog description is too thin|Independent source is too thin|No exact independent encyclopedia match|Independent source title mismatch|At least two independent HTTPS source domains (?:are )?required|Evidence overview is too thin|No verified official YouTube trailer found)/.test(message);
          if (!candidateSpecific) throw error;
          transition(job,"rejected",{lastError:message});
          await saveState(state);
          const next = await discoverCandidate(state);
          if (!next) return { action:"candidate-rejected-no-alternative", key:job.key, reason:message };
          job = enqueue(state,next).job;
          await saveState(state);
        }
      }
      if (!evidenceReady) return { action:"candidate-scan-limit-reached", attempts:5 };
      transition(job,"writing");
      await saveState(state);
      const generated = await writeArticle(job.evidence);
      daily.articles += 1;
      daily.requests += Number(generated.requests)||1;
      daily.tokens += Number(generated.tokens)||0;
      job.article = generated.article;
      job.provider = generated.provider;
      job.tokens = generated.tokens;
      transition(job,"reviewing");
      await saveState(state);
      transition(job,"ready");
    }
    if (job.status === "ready") {
      job.articlePath = articleFilePath(job.article);
      const slug = job.articlePath.split("/").pop().replace(/\.md$/,"");
      job.verifiedUrl = "https://vibecritic.pages.dev/reviews/" + encodeURIComponent(slug) + "/";
      transition(job,"publishing");
      await saveState(state);
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
      transition(job,"verifying");
      await saveState(state);
      return { action:"article-created-awaiting-deploy", key:job.key, articlePath:job.articlePath, url:job.verifiedUrl, provider:job.provider, daily };
    }
    await saveState(state);
    return { action:job.status, key:job.key };
  } catch (error) {
    if (Number(error?.requests)>0) daily.requests += Number(error.requests);
    if (job && !["published","rejected"].includes(job.status)) {
      const message = String(error.message||error).slice(0,800);
      if (/Candidate release date is still in the future|Primary catalog description is too thin|Independent source is too thin|No exact independent encyclopedia match|Independent source title mismatch|At least two independent HTTPS source domains|No verified official YouTube trailer found/.test(message)) {
        transition(job,"rejected",{lastError:message});
      } else {
        const resumeStatus = ["researching","writing"].includes(job.status) ? "queued" : job.status === "reviewing" ? "ready" : job.status === "publishing" ? "ready" : job.status;
        job.attempts = (job.attempts||0)+1;
        job.lastError = message;
        const retryDelay = resumeStatus === "verifying" ? 10*60*1000 : Math.min(24,Math.pow(2,job.attempts-1))*60*60*1000;
        transition(job,"waiting",{resumeStatus,nextAttemptAt:new Date(Date.now()+retryDelay).toISOString()});
      }
    }
    await saveState(state);
    throw error;
  }
});
console.log("VibeCritic Publishing V3:",JSON.stringify(result));
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,"## VibeCritic Publishing V3\n- Result: "+result.action+"\n- Article: "+(result.url||"—")+"\n");
}
