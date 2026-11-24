import assert from "node:assert/strict";
import { createState, enqueue, transition, chooseJob, validateEvidence, validateArticle, isDuplicate, redirectedToDifferentPath } from "./core.mjs";
import { withRunLock } from "./lock.mjs";
import { publishArticle, articleFilePath, renderMarkdown } from "./publisher.mjs";
import { loadState, saveState } from "./store.mjs";
import { normalizeFinalRating, normalizeBodyFinalRating, assemble, buildPrompt } from "./writer.mjs";
import { publishedIdentityKeys, isEligibleReleaseDate, selectEligibleCandidate } from "./sources.mjs";
import { DAILY_ARTICLE_LIMIT } from "./policy.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const state = createState();
const a = enqueue(state, { type: "game", id: "42", name: "Test Game" }, 1000);
assert.equal(a.created, true);
assert.equal(enqueue(state, { type: "game", id: "42", name: "Test Game" }, 2000).created, false);

assert.equal(chooseJob(state, 3000).key, "game:42");

// Fair queue: an older job that was just retried must not starve a less-recently-touched job.
const fairState = createState();
const oldButRecentlyRetried = enqueue(fairState, { type:"movie", id:"101", name:"Old retry" }, 1000).job;
const newerButStale = enqueue(fairState, { type:"movie", id:"102", name:"Stale job" }, 2000).job;
transition(oldButRecentlyRetried, "researching", {}, 8000);
transition(oldButRecentlyRetried, "waiting", { resumeStatus:"queued", nextAttemptAt:new Date(0).toISOString() }, 9000);
transition(newerButStale, "researching", {}, 2500);
transition(newerButStale, "waiting", { resumeStatus:"queued", nextAttemptAt:new Date(0).toISOString() }, 3000);
assert.equal(chooseJob(fairState, 10000).key, "movie:102");
transition(newerButStale, "queued", {}, 11000);
transition(newerButStale, "researching", {}, 12000);
transition(newerButStale, "waiting", { resumeStatus:"queued", nextAttemptAt:new Date(0).toISOString() }, 13000);
assert.equal(chooseJob(fairState, 14000).key, "movie:101");
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
assert.equal(redirectedToDifferentPath({redirected:true,url:"https://vibecritic.pages.dev/reviews/old/"}, "https://vibecritic.pages.dev/reviews/new/"), true);
assert.equal(redirectedToDifferentPath({redirected:true,url:"https://vibecritic.pages.dev/reviews/new/"}, "https://vibecritic.pages.dev/reviews/new/"), false);
assert.equal(redirectedToDifferentPath({redirected:false,url:"https://vibecritic.pages.dev/reviews/old/"}, "https://vibecritic.pages.dev/reviews/new/"), false);
assert.equal(isEligibleReleaseDate("2023-12-31","2026-11-22"),false);
assert.equal(isEligibleReleaseDate("2024-01-01","2026-11-22"),true);
assert.equal(isEligibleReleaseDate("2026-11-22","2026-11-22"),true);
assert.equal(isEligibleReleaseDate("2026-11-23","2026-11-22",false),false);
assert.equal(isEligibleReleaseDate("2026-11-23","2026-11-22",true),true);
assert.equal(isEligibleReleaseDate("2013-09-17","2026-11-22"),false);
assert.equal(isEligibleReleaseDate("","2026-11-22"),false);
assert.equal(isEligibleReleaseDate("unknown","2026-11-22"),false);
assert.equal(isEligibleReleaseDate("2024-02-30","2026-11-22"),false);
assert.equal(DAILY_ARTICLE_LIMIT,13);
// Candidate discovery moves past rejected/used candidates without relaxing release-date rules.
const discoveryCandidates = [
  {type:"movie",id:"791523",name:"Rejected title",date:"2026-10-19",popularity:100},
  {type:"movie",id:"2024",name:"Already published",date:"2026-05-01",popularity:90},
  {type:"movie",id:"2025",name:"Too old",date:"2023-12-31",popularity:80},
  {type:"movie",id:"3030",name:"Alternative title",date:"2026-09-10",popularity:70},
  {type:"series",id:"4040",name:"Series alternative",date:"2026-08-10",popularity:60}
];
const fallbackCandidate = selectEligibleCandidate(discoveryCandidates,{
  used:new Set(["movie:2024"]),
  jobs:{"movie:791523":{status:"rejected"}},
  counts:{movie:0,series:1,game:0},
  today:"2026-11-22"
});
assert.equal(fallbackCandidate.id,"3030");
// Candidates repeated across trending, popular and paginated discovery results are deduplicated,
// while the strongest catalog popularity signal is retained.
const paginatedCandidate = selectEligibleCandidate([
  {type:"movie",id:"5050",name:"Paged Release",date:"2025-06-01",popularity:12,source:"TMDB"},
  {type:"movie",id:"5050",name:"Paged Release",date:"2025-06-01",popularity:42,source:"TMDB"},
  {type:"series",id:"6060",name:"Series Page Two",date:"2024-09-01",popularity:30,source:"TMDB"}
],{today:"2026-11-24"});
assert.equal(paginatedCandidate.id,"5050");
assert.equal(paginatedCandidate.popularity,42);
assert.equal(selectEligibleCandidate(discoveryCandidates,{
  used:new Set(["movie:2024","movie:3030","series:4040"]),
  jobs:{"movie:791523":{status:"rejected"}},
  counts:{movie:0,series:0,game:0},
  today:"2026-11-22"
}),null);

assert.ok(publishedIdentityKeys("series","279246","الإمبراطورة المتزوجة مجدداً").includes("series:279246"));
assert.ok(publishedIdentityKeys("series","series:279246","The Remarried Empress").includes("series:279246"));
const body = ["## تحليل السرد والبناء\n\n"+("تحليل نقدي مفصل يشرح البناء الفني والسردي ويوازن بين نقاط القوة والقيود في هذا القسم. ").repeat(45),"## قراءة العناصر الفنية\n\n"+("تفصيل نقدي يربط الخيارات الفنية بالأثر الدرامي ويشرح حدود الأدلة المتاحة للقارئ. ").repeat(45),"## الإيقاع والحكم النهائي\n\n"+("تقييم متوازن يوضح عناصر النجاح ومواطن القصور دون تكرار أو ادعاء تجربة مباشرة. ").repeat(45)].join("\n\n");
const article = { title:"x", sourceId:"game:42", type:"game", body, verdict:"حكم نقدي", pros:["a","b","c"], cons:["a","b"], scores:{story:7,visuals:7,sound:7,pacing:7}, score:7, sources:evidence.sources, youtubeVideoId:"AbCdEfGhI_1", youtubeVideoTitle:"Official Test Trailer" };
assert.ok(validateArticle(article).words >= 650);

// Metadata + encyclopedia + promotional evidence must produce a limited article without a numeric rating.
const limitedEvidence = {
  ...evidence,
  title:"Limited Evidence Test",
  type:"game",
  sourceId:"game:42",
  sourceName:"RAWG",
  sourceUrl:"https://one.example/a",
  youtubeVideoId:"AbCdEfGhI_1",
  youtubeVideoTitle:"Official Test Trailer",
  reviewReadiness:"limited",
  reviewReadinessReason:"No independently verifiable hands-on evidence was collected."
};
const limitedDraft = {
  ...article,
  headline:"قراءة معلوماتية محدودة لا تمنح حكماً نهائياً على العمل",
  summary:"هذه قراءة تعريفية تجمع المعلومات المتاحة عن العمل ومصادره الأساسية، وتوضح ما يمكن تأكيده وما لا تسمح الأدلة الحالية بالحكم عليه. لا تمثل تجربة لعب مباشرة ولا مراجعة نقدية مكتملة، لذلك لا تتضمن درجة رقمية أو حكماً نهائياً على جودة التنفيذ.",
  verdict:"تظل هذه الصفحة قراءة معلوماتية محدودة لأن المصادر المتاحة تصف العمل وتقدم معلومات عامة ومواد ترويجية، لكنها لا توفر شواهد كافية على تجربة اللعب أو جودة التنفيذ. لذلك نعرض الحقائق المؤكدة ونوضح الأسئلة التي لا تزال مفتوحة، ولا نحول نقص المعلومات إلى عيوب مختلقة أو درجة رقمية قد تضلل القارئ.",
  reviewMode:undefined
};
const limitedResult = assemble(limitedDraft,limitedEvidence);
assert.equal(limitedResult.article.reviewMode,"limited");
assert.equal(limitedResult.article.score,undefined);
assert.equal(limitedResult.article.scores,undefined);
assert.ok(validateArticle(limitedResult.article,{minWords:650,minCharacters:3200}).words >= 650);
const limitedMarkdown = renderMarkdown(limitedResult.article);
assert.match(limitedMarkdown,/reviewMode: limited/);
assert.doesNotMatch(limitedMarkdown,/^score:/m);
assert.match(limitedMarkdown,/قراءة معلوماتية محدودة/);
assert.doesNotMatch(limitedMarkdown,/قيد التقييم/);
const limitedPrompt = buildPrompt(limitedEvidence);
assert.match(limitedPrompt,/قراءة معلوماتية عربية محدودة الأدلة/);
assert.match(limitedPrompt,/لا تضف scores أو score/);
assert.match(limitedPrompt,/ما الذي لا نعرفه بعد/);
const previewEvidence = { ...limitedEvidence, releaseDate:"2099-01-01", reviewReadiness:"preview" };
const previewDraft = { ...limitedDraft, headline:"معاينة استباقية قبل الإصدار", summary:"هذه معاينة استباقية للعمل قبل صدوره، تستعرض المعلومات الرسمية المتاحة وتفصل الحقائق عن التوقعات، ولا تمثل مراجعة نهائية ولا تمنح درجة رقمية أو حكماً على جودة التجربة.", verdict:"هذه معاينة استباقية قبل الإصدار، وليست مراجعة نهائية. نستعرض المعلومات المؤكدة وما يمكن توقعه بحذر، ونترك الحكم على الجودة والتقييم الرقمي إلى ما بعد صدور العمل وتوفر أدلة نقدية كافية.", reviewMode:undefined };
const previewResult = assemble(previewDraft,previewEvidence);
assert.equal(previewResult.article.reviewMode,"preview");
assert.equal(previewResult.article.score,undefined);
assert.equal(previewResult.article.scores,undefined);
assert.ok(validateArticle(previewResult.article,{minWords:650,minCharacters:3200}).words >= 650);
assert.match(renderMarkdown(previewResult.article),/معاينة استباقية قبل الإصدار/);

const audienceEvidence = { ...limitedEvidence, rating:4.2, ratingScale:5, votes:1200, reviewReadiness:"audience", reviewReadinessReason:"RAWG audience average backed by 1200 votes." };
const audienceDraft = { ...limitedDraft, headline:"تحليل العمل وفق تقييم الجمهور ومؤشرات المنصة", summary:"يعرض هذا التحليل متوسط تقييم جمهور RAWG بوصفه مؤشراً جماهيرياً لا حكماً تحريرياً من VibeCritic. نوضح عدد الأصوات ومصدر البيانات ونحلل المعلومات المتاحة عن العمل دون ادعاء تجربة مباشرة أو اختلاق درجات فرعية.", verdict:"يعتمد هذا المقال على متوسط تقييم المستخدمين في RAWG، حيث بلغ التقييم الأصلي 4.2 من 5 استناداً إلى 1200 صوت. هذا المتوسط يعكس آراء المستخدمين المشاركين في المنصة ولا يمثل تقييماً تحريرياً مستقلاً من VibeCritic أو إجماعاً لجميع اللاعبين. يظل التحليل مقيداً بالمعلومات والمصادر المتاحة، ولا يدعي تجربة لعب مباشرة أو يختلق أحكاماً على عناصر فنية لا تدعمها الأدلة.", reviewMode:undefined };
const audienceResult = assemble(audienceDraft,audienceEvidence);
assert.equal(audienceResult.article.reviewMode,"review");
assert.equal(audienceResult.article.audienceScore,8.4);
assert.equal(audienceResult.article.score,7);
assert.deepEqual(audienceResult.article.scores,{story:7,visuals:7,sound:7,pacing:7});
assert.equal(audienceResult.article.sourceVoteCount,1200);
assert.ok(validateArticle(audienceResult.article,{minWords:1000,minCharacters:5200}).words>=1000);
const audienceMarkdown=renderMarkdown(audienceResult.article);
assert.match(audienceMarkdown,/reviewMode: review/);
assert.match(audienceMarkdown,/^score: 7\.00$/m);
assert.match(audienceMarkdown,/^storyScore: 7\.00$/m);
assert.match(audienceMarkdown,/مراجعة تحريرية نهائية/);
assert.doesNotMatch(audienceMarkdown,/reviewMode: audience/);
assert.equal(assemble(audienceDraft,{...audienceEvidence,votes:99}).article.reviewMode,"review");
const audiencePrompt = buildPrompt(audienceEvidence);
assert.equal(typeof audiencePrompt,"string");
assert.match(audiencePrompt,/4\.2/);
assert.match(audiencePrompt,/1200/);
assert.match(audiencePrompt,/مؤشراً جماهيرياً ثانوياً/);
assert.match(audiencePrompt,/scores كائن يحوي story وvisuals وsound وpacing/);
assert.doesNotMatch(audiencePrompt,/لا تمنح درجات فرعية/);

assert.throws(() => validateArticle({ ...article, scores:{...article.scores,story:11} }), /Invalid score/);
assert.equal(normalizeFinalRating("الحكم النهائي: 6/10",5.3),"الحكم النهائي: 5.3/10");
assert.equal(normalizeFinalRating("التقييم النهائي 8 من 10",7.4),"التقييم النهائي 7.4/10");
assert.equal(normalizeBodyFinalRating("**التقييم النهائي: 6/10**\nالقصة: 8.5/10",5.3),"**التقييم النهائي: 5.3/10**\nالقصة: 8.5/10");
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
const renderedPreview = renderMarkdown({ ...article, verdict:"The final rating is 6/10.", body:body+"\n\n**التقييم النهائي: 6/10**" });
assert.ok(renderedPreview.includes('verdict: "The final rating is 7.0/10."'));
assert.ok(renderedPreview.includes("**التقييم النهائي: 7.0/10**"));
assert.match(renderedPreview,/reviewMode: review/);
assert.match(renderedPreview,/score: 7.00/);
assert.match(renderedPreview,/youtubeVideoId: "AbCdEfGhI_1"/);
assert.match(renderedPreview,/مراجعة تحريرية نهائية/);
assert.match(renderedPreview,/^storyScore: 7.00$/m);
assert.match(renderedPreview,/^visualsScore: 7.00$/m);
assert.match(renderedPreview,/^soundScore: 7.00$/m);
assert.match(renderedPreview,/^pacingScore: 7.00$/m);
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
  assert.equal(requestBody.max_output_tokens,10000);
  assert.equal(typeof requestBody.input[0].content[0].text,"string");
  assert.equal(typeof requestBody.input[1].content[0].text,"string");
  assert.equal(requestBody.input[1].content[0].text,openAIFetchCalls === 1 ? "test" : "retry");
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

// Gemini editorial reviewer contract: strict approval schema, rejection threshold, and optional-key behavior.
process.env.GEMINI_API_KEY = "test-gemini-key";
const geminiReviewer = await import("./editorial-reviewer.mjs?gemini-review-test");
let geminiCalls = 0;
globalThis.fetch = async (url, options) => {
  geminiCalls++;
  assert.match(url,/generativelanguage.googleapis.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(options.headers["x-goog-api-key"],"test-gemini-key");
  return {
    ok:true,
    json:async()=>({
      candidates:[{content:{parts:[{text:JSON.stringify({approved:true,score:8.2,factualRisk:"low",repetition:"low",exaggeration:"low",issues:[],notes:"مقبول"})}]}}],
      usageMetadata:{promptTokenCount:100,candidatesTokenCount:20}
    })
  };
};
const acceptedReview = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
assert.equal(acceptedReview.provider,"gemini");
assert.equal(acceptedReview.requests,1);
assert.equal(acceptedReview.tokens,120);
assert.equal(geminiCalls,1);
let limitedReviewPrompt = "";
globalThis.fetch = async (url, options) => {
  const request = JSON.parse(options.body);
  limitedReviewPrompt = request.contents[0].parts[0].text;
  return {
    ok:true,
    json:async()=>({
      candidates:[{content:{parts:[{text:JSON.stringify({approved:true,score:8.1,factualRisk:"low",repetition:"low",exaggeration:"low",issues:[],notes:"قراءة معلوماتية دقيقة"})}]}}],
      usageMetadata:{promptTokenCount:100,candidatesTokenCount:20}
    })
  };
};
const checkedLimited = await geminiReviewer.reviewArticle({title:"Test",body:"مقال",reviewMode:"limited"}, {title:"Test",sources:[]});
assert.equal(checkedLimited.skipped,false);
assert.match(limitedReviewPrompt,/قراءة معلوماتية محدودة الأدلة/);
assert.match(limitedReviewPrompt,/لا ترفض لمجرد أن الأدلة لا تسمح بتحليل الجودة الفنية/);
globalThis.fetch = async () => { throw new DOMException("simulated Gemini timeout","TimeoutError"); };
const timeoutReview = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
assert.equal(timeoutReview.skipped,true);
assert.match(timeoutReview.reason,/timed out/);
assert.equal(timeoutReview.requests,1);
globalThis.fetch = async () => ({ ok:false, status:503, text:async()=>"temporarily unavailable" });
const unavailableReview = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
assert.equal(unavailableReview.skipped,true);
assert.match(unavailableReview.reason,/HTTP 503/);

assert.equal(unavailableReview.requests,1);
for (const status of [404,429]) {
  globalThis.fetch = async () => ({ ok:false, status, text:async()=>status === 404 ? "model not found" : "quota exceeded" });
  const skippedReview = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
  assert.equal(skippedReview.skipped,true);
  assert.equal(skippedReview.requests,1);
  assert.match(skippedReview.reason,new RegExp("HTTP " + status));
}
globalThis.fetch = async () => ({
  ok:true,
  json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({approved:false,score:5,factualRisk:"high",repetition:"low",exaggeration:"medium",issues:["ادعاء غير مدعوم"],notes:"مرفوض"})}]}}]})
});
await assert.rejects(geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]}),/Gemini editorial review rejected article/);

// A malformed/truncated Gemini response gets exactly one fresh review attempt; it never bypasses approval.
let repairCalls = 0;
globalThis.fetch = async () => {
  repairCalls++;
  return { ok:true, json:async()=>({candidates:[{finishReason: repairCalls === 1 ? "MAX_TOKENS" : "STOP",content:{parts:[{text:repairCalls === 1 ? '{"approved":true,"notes":"truncated' : JSON.stringify({approved:true,score:8.1,factualRisk:"low",repetition:"low",exaggeration:"low",issues:[],notes:"مقبول بعد إعادة المحاولة"})}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}}) };
};
const repairedReview = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
assert.equal(repairedReview.skipped,false);
assert.equal(repairedReview.requests,2);
assert.equal(repairedReview.tokens,30);
assert.equal(repairCalls,2);

// If both responses are malformed, the quality gate fails closed.
let malformedCalls = 0;
globalThis.fetch = async () => {
  malformedCalls++;
  return { ok:true, json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:'{"approved":true,"notes":"unfinished'}]}}]}) };
};
await assert.rejects(geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]}),/invalid or incomplete JSON after retry/);
assert.equal(malformedCalls,2);

// A syntactically valid but structurally invalid response is retried, not approved.
let schemaCalls = 0;
globalThis.fetch = async () => {
  schemaCalls++;
  const review = schemaCalls === 1
    ? {approved:true,score:8,factualRisk:"unknown",repetition:"low",exaggeration:"low",issues:[],notes:""}
    : {approved:true,score:8,factualRisk:"low",repetition:"low",exaggeration:"low",issues:[],notes:"مقبول"};
  return {ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(review)}]}}]})};
};
const schemaRetry = await geminiReviewer.reviewArticle({title:"Test",body:"مقال"}, {title:"Test",sources:[]});
assert.equal(schemaRetry.requests,2);
assert.equal(schemaCalls,2);

process.env.GEMINI_API_KEY = "";
const optionalReviewer = await geminiReviewer.reviewArticle({title:"Test"}, {});
assert.equal(optionalReviewer.skipped,true);
globalThis.fetch = originalFetch;

const after = await withRunLock(async () => "lock-released", lock);
assert.equal(after, "lock-released");
await fs.rm(dir, { recursive:true, force:true });
console.log("Publishing V3 core tests passed (OpenAI generation + optional Gemini editorial review).");
