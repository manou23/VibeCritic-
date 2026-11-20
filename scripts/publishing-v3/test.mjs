import assert from "node:assert/strict";
import { createState, enqueue, transition, chooseJob, validateEvidence, validateArticle, isDuplicate } from "./core.mjs";
import { withRunLock } from "./lock.mjs";
import { publishArticle, articleFilePath } from "./publisher.mjs";
import { loadState, saveState } from "./store.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const state = createState();
const a = enqueue(state, { type: "game", id: "42", name: "Test Game" }, 1000);
assert.equal(a.created, true);
assert.equal(enqueue(state, { type: "game", id: "42", name: "Test Game" }, 2000).created, false);
assert.equal(chooseJob(state, 3000).key, "game:42");
transition(a.job, "researching", {}, 4000);
assert.throws(() => transition(a.job, "published"), /Illegal transition/);
transition(a.job, "writing", { stage: 1 }, 5000);
transition(a.job, "reviewing", {}, 6000);
transition(a.job, "ready", {}, 7000);
transition(a.job, "publishing", {}, 8000);
transition(a.job, "verifying", {}, 9000);
transition(a.job, "published", {}, 10000);
assert.equal(chooseJob(state, 11000), null);
assert.throws(() => validateEvidence({ title:"x", type:"game", overview:"short", sources:[] }), /two independent/);
const evidence = { title:"x", type:"game", overview:"A".repeat(100), sources:[{url:"https://one.example/a"},{url:"https://two.example/b"}] };
assert.equal(validateEvidence(evidence), true);
assert.equal(isDuplicate({type:"game",id:"42",name:"Test Game"}, new Set(["game:42"])), true);
const body = ["## تحليل السرد والبناء\n\n"+("تحليل نقدي مفصل يشرح البناء الفني والسردي ويوازن بين نقاط القوة والقيود في هذا القسم. ").repeat(24),"## قراءة العناصر الفنية\n\n"+("تفصيل نقدي يربط الخيارات الفنية بالأثر الدرامي ويشرح حدود الأدلة المتاحة للقارئ. ").repeat(24),"## الإيقاع والحكم النهائي\n\n"+("تقييم متوازن يوضح عناصر النجاح ومواطن القصور دون تكرار أو ادعاء تجربة مباشرة. ").repeat(24)].join("\n\n");
const article = { title:"x", sourceId:"game:42", type:"game", body, verdict:"حكم نقدي", pros:["a","b","c"], cons:["a","b"], scores:{story:7,visuals:7,sound:7,pacing:7}, score:7, sources:evidence.sources };
assert.ok(validateArticle(article).words >= 650);
assert.throws(() => validateArticle({ ...article, scores:{...article.scores,story:11} }), /Invalid score/);
const interrupted = enqueue(state,{type:"movie",id:"77",name:"Interrupted"}).job;
transition(interrupted,"researching");
transition(interrupted,"queued");
transition(interrupted,"researching");
transition(interrupted,"writing");
transition(interrupted,"reviewing");
transition(interrupted,"ready");
transition(interrupted,"publishing");
transition(interrupted,"verifying");
assert.equal(interrupted.status,"verifying");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibecritic-v3-"));
const lock = path.join(dir, "run.lock");
const reviewRoot = path.join(dir,"reviews");
const createdPath = await publishArticle(article,reviewRoot);
assert.equal(createdPath,articleFilePath(article,reviewRoot));
await assert.rejects(publishArticle(article,reviewRoot), error=>error.code==="EEXIST");
const nested = await withRunLock(async () => withRunLock(async () => "should-not-run", lock), lock);
assert.equal(nested.skipped, true);
await fs.writeFile(lock, JSON.stringify({ pid: 1, startedAt: new Date(Date.now()-31*60*1000).toISOString() }));
const staleTime = new Date(Date.now()-31*60*1000);
await fs.utimes(lock, staleTime, staleTime);
const recovered = await withRunLock(async () => "stale-lock-recovered", lock);
assert.equal(recovered, "stale-lock-recovered");
const stateFile = path.join(dir,"state.json");
await saveState(createState(),stateFile);
assert.equal((await loadState(stateFile)).version,3);

// OpenAI is the only configured provider; exercise its Responses API and bounded quality retry.
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.PUBLISHER_V3_OPENAI_ENABLED = "true";
delete process.env.PUBLISHER_V3_OPENAI_MODEL;
const openaiProvider = await import("./providers.mjs?openai-exclusive-test");
assert.deepEqual(openaiProvider.availableProviders().map(x=>x.id),["openai"]);
assert.equal(openaiProvider.availableProviders()[0].model,"gpt-6-luna");
const originalFetch = globalThis.fetch;
let openAIFetchCalls = 0;
globalThis.fetch = async (url, options) => {
  openAIFetchCalls++;
  assert.equal(url,"https://api.openai.com/v1/responses");
  assert.equal(options.headers.authorization,"Bearer test-openai-key");
  const requestBody = JSON.parse(options.body);
  assert.equal(requestBody.model,"gpt-6-luna");
  assert.equal(requestBody.max_output_tokens,7000);
  assert.deepEqual(requestBody.text,{format:{type:"json_object"}});
  return {
    ok:true,
    json:async()=>({
      status:"completed",
      output:[{type:"message",content:[{type:"output_text",text:'{"ok":true}'}]}],
      usage:{input_tokens:12,output_tokens:8,total_tokens:20}
    })
  };
};
assert.deepEqual((await openaiProvider.generateJson("test",{maxTokens:10000})).value,{ok:true});
assert.deepEqual((await openaiProvider.generateJson("retry",{skipProviderId:"openai"})).value,{ok:true});
await assert.rejects(openaiProvider.generateJson("third"),/per-run request limit reached/);
assert.equal(openAIFetchCalls,2);
globalThis.fetch = originalFetch;

process.env.OPENAI_API_KEY = "";
const missingKey = await import("./providers.mjs?openai-missing-key-test");
assert.equal(missingKey.availableProviders().length,0);
await assert.rejects(missingKey.generateJson("test"),/OpenAI is not configured/);
const after = await withRunLock(async () => "lock-released", lock);
assert.equal(after, "lock-released");
await fs.rm(dir, { recursive:true, force:true });
console.log("Publishing V3 core tests passed (OpenAI-only).");
