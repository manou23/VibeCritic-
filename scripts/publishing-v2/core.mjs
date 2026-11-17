// Deterministic core for VibeCritic Publishing Engine v2. No network calls.
export const ENGINE_VERSION=2;
export const ACTIVE=new Set(["queued","researching","writing","waiting","quality-check","ready"]);
export const TERMINAL=new Set(["published","rejected","abandoned"]);
const time=v=>typeof v==="number"?v:(Date.parse(v||"")||0);
const iso=n=>new Date(n).toISOString();
function registrableDomain(hostname){
 const labels=String(hostname||"").toLowerCase().replace(/^www\\./,"").split(".").filter(Boolean);
 if(labels.length<=2)return labels.join(".");
 const twoLevelSuffixes=new Set(["co.uk","org.uk","ac.uk","com.au","net.au","org.au","co.nz","com.br","com.cn","com.sg","co.jp","co.za"]);
 const suffix=labels.slice(-2).join(".");
 return twoLevelSuffixes.has(suffix)?labels.slice(-3).join("."):labels.slice(-2).join(".");
}

export function createState(){return {version:2,updatedAt:new Date(0).toISOString(),jobs:{},providerUsage:{},providerCooldowns:{}};}
export function validateState(s){
 if(!s||s.version!==2||!s.jobs||typeof s.jobs!=="object"||Array.isArray(s.jobs))throw Error("Invalid publisher state/version");
 for(const [key,j] of Object.entries(s.jobs)){
  if(!j||j.key!==key||(!ACTIVE.has(j.status)&&!TERMINAL.has(j.status))||!Number.isInteger(j.stage)||j.stage<0||j.stage>3)throw Error("Invalid job: "+key);
 }
 return s;
}
// Oldest active draft owns the queue, including while cooling down. Never hop to newer work.
export function selectActiveJob(jobs={}){return Object.values(jobs).filter(j=>j&&ACTIVE.has(j.status)).sort((a,b)=>time(a.createdAt)-time(b.createdAt)||a.key.localeCompare(b.key))[0]||null;}
export function cycleDecision(state,now=Date.now()){
 validateState(state);const job=selectActiveJob(state.jobs);if(!job)return {action:"discover",job:null};
 const retry=time(job.nextAttemptAt);if(job.status==="waiting"&&retry>now)return {action:"wait",job,retryAt:retry};
 if(job.status==="waiting")return {action:"resume",job};if(job.status==="ready")return {action:"publish",job};
 if(job.status==="quality-check")return {action:"validate",job};return {action:"advance",job};
}
export function enqueue(state,item,now=Date.now()){
 validateState(state);if(!item||!["game","movie","series"].includes(item.type)||!String(item.id||"").trim())throw Error("Invalid source item");
 const key=item.type+":"+item.id;if(state.jobs[key])return {job:state.jobs[key],created:false};
 if(selectActiveJob(state.jobs))throw Error("Only one active draft is allowed");
 const job={key,item,status:"queued",stage:0,parts:[],evidence:null,attempts:0,createdAt:iso(now),updatedAt:iso(now),nextAttemptAt:null,lastError:null};
 state.jobs[key]=job;state.updatedAt=iso(now);return {job,created:true};
}
const RULES={
 "research-started":[["queued"],"researching"],"research-saved":[["researching"],"writing"],
 "part-saved":[["writing"],"writing"],"provider-deferred":[["writing","researching"],"waiting"],
 "resumed":[["waiting"],"writing"],"quality-started":[["writing"],"quality-check"],
 "quality-passed":[["quality-check"],"ready"],"quality-failed":[["quality-check"],"waiting"],
 "published":[["ready"],"published"],"rejected":[["queued","researching","writing","waiting","quality-check"],"rejected"],
 "abandoned":[["queued","researching","writing","waiting","quality-check","ready"],"abandoned"]
};
export function transition(job,event,patch={},now=Date.now()){
 const rule=RULES[event];if(!rule||!rule[0].includes(job.status))throw Error("Illegal transition: "+job.status+" / "+event);
 const next={...job,...patch,status:rule[1],updatedAt:iso(now)};
 if(event==="part-saved"){
  if(!patch.part||typeof patch.part.text!=="string"||!patch.part.text.trim()||job.stage>=3)throw Error("Invalid or excess article stage");
  next.parts=[...(job.parts||[]),{stage:job.stage+1,text:patch.part.text.trim(),savedAt:iso(now)}];next.stage=job.stage+1;next.attempts=0;delete next.part;
  if(next.stage===3)next.status="quality-check";
 }
 if(event==="provider-deferred"||event==="quality-failed"){
  const countsAsFailure=patch.countAttempt!==false;
  next.attempts=Number(job.attempts||0)+(countsAsFailure?1:0);delete next.countAttempt;
  next.lastError=String(patch.lastError||"Temporary failure").slice(0,1200);
  const exponential=Math.min(24*60*60*1000,60000*Math.pow(2,Math.min(next.attempts,10)));
  next.nextAttemptAt=Math.max(now+(countsAsFailure?exponential:3600000),time(patch.nextAttemptAt));
 }
 if(event==="resumed"){next.status=patch.resumeTo||"writing";next.nextAttemptAt=null;next.lastError=null;delete next.resumeTo;}
 if(event==="published"){next.publishedAt=iso(now);next.nextAttemptAt=null;next.lastError=null;}
 return next;
}
export function chooseFreeProvider(providers,usage={},now=Date.now()){
 return (providers||[]).filter(p=>{
  if(!p||p.enabled!==true||p.free!==true||time(p.cooldownUntil)>now)return false;
  const u=usage[p.id]||{};if(time(u.cooldownUntil)>now)return false;return !(Number.isFinite(p.dailyRequestLimit)&&Number(u.requests||0)>=p.dailyRequestLimit)&&!(Number.isFinite(p.dailyTokenLimit)&&Number(u.tokens||0)>=p.dailyTokenLimit);
 }).sort((a,b)=>Number(a.priority||100)-Number(b.priority||100)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function recordUsage(usage,id,{requests=1,tokens=0,success=false}={}){
 const u=usage[id]||{requests:0,tokens:0,successes:0,failures:0};
 usage[id]={requests:u.requests+requests,tokens:u.tokens+tokens,successes:u.successes+(success?1:0),failures:u.failures+(success?0:1)};return usage;
}
export function countWords(s){return (String(s||"").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;}
const SECTION_STOP_WORDS=new Set([
 "هذا","هذه","ذلك","تلك","الذي","التي","على","في","من","إلى","عن","مع","بين","كما","لكن","كان","كانت","يكون","تكون","هو","هي","ما","لا","لم","لن","قد","كل","بعد","قبل","حتى","عند","ضمن","عبر","أو","وهو","وهي","لذلك","أيضا","أحياناً","بعض","يمكن","حيث","أكثر","أقل","يتم","هناك","أول","ثاني","ثالث","تجربة","العمل",
 "the","and","for","with","that","this","from","into","its","are","was","were","has","have","had","not","but","can","may","all","more","less","one","two","three","when","where","which","who","what","why","how"
]);
function sectionTokens(value,ignored){
 return (String(value||"").normalize("NFKC").toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,"").match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(token=>!SECTION_STOP_WORDS.has(token)&&!ignored.has(token));
}
function fiveWordShingles(tokens){
 const out=new Set();
 for(let i=0;i<=tokens.length-5;i++)out.add(tokens.slice(i,i+5).join(" "));
 return out;
}
function inspectEditorialSections(body,title){
 const source=String(body||"");
 const matches=[...source.matchAll(/^##\s+(.+)$/gm)];
 const sections=matches.map((match,index)=>({
  title:match[1].trim(),
  text:source.slice(match.index+match[0].length,matches[index+1]?.index??source.length).trim()
 })).filter(section=>! /^(المصادر|المراجع|sources|references)\b/i.test(section.title));
 const errors=[];
 let retryFromStage=null;
 if(sections.length<3){
  errors.push("Article must contain at least three distinct analysis sections (found "+sections.length+").");
  retryFromStage=Math.min(3,sections.length+1);
 }
 const ignored=new Set(sectionTokens(title,new Set()));
 const tokenSets=sections.map((section,index)=>{
  const words=countWords(section.text);
  if(words<150){
   errors.push("Analysis section "+(index+1)+" is too short: "+words+"/150 words.");
   retryFromStage=Math.min(retryFromStage??3,Math.min(3,index+1));
  }
  return fiveWordShingles(sectionTokens(section.text,ignored));
 });
 for(let i=0;i<tokenSets.length;i++)for(let j=i+1;j<tokenSets.length;j++){
  const left=tokenSets[i],right=tokenSets[j];
  if(!left.size||!right.size)continue;
  let shared=0;
  for(const phrase of left)if(right.has(phrase))shared++;
  const overlap=shared/new Set([...left,...right]).size;
  if(overlap>0.12){
   errors.push("Analysis sections "+(i+1)+" and "+(j+1)+" are repetitive ("+Math.round(overlap*100)+"% five-word overlap).");
   retryFromStage=Math.min(retryFromStage??3,Math.min(3,j+1));
  }
 }
 return {errors,retryFromStage};
}
export function validateArticle(a,{minWords=600,minCharacters=3200}={}){
 const errors=[],body=String(a?.body||"").trim(),words=countWords(body);
 if(words<minWords)errors.push("Article below minimum word count: "+words+"/"+minWords);
 if(body.length<minCharacters)errors.push("Article below minimum character count: "+body.length+"/"+minCharacters);
 for(const f of ["title","headline","summary","verdict","sourceId"])if(!String(a?.[f]||"").trim())errors.push("Missing field: "+f);
 if(!["game","movie","series"].includes(a?.type))errors.push("Invalid content type");
 const dims=["storyScore","visualsScore","soundScore","pacingScore"];
 for(const f of dims)if(!Number.isFinite(Number(a?.[f]))||Number(a[f])<0||Number(a[f])>10)errors.push("Invalid score: "+f);
 if(!Number.isFinite(Number(a?.score))||Number(a.score)<=0||Number(a.score)>10)errors.push("Invalid final score");
 if(dims.every(f=>Number.isFinite(Number(a?.[f])))){
  const expected=Math.round((a.storyScore*.30+a.visualsScore*.25+a.soundScore*.20+a.pacingScore*.25)*10)/10;
  if(Math.abs(expected-Number(a.score))>.05)errors.push("Final score does not match VibeCritic weighted rubric");
 }
 if(!Array.isArray(a?.pros)||a.pros.length<3)errors.push("At least three strengths are required");
 if(!Array.isArray(a?.cons)||a.cons.length<2)errors.push("At least two critical limitations are required");
 const sources=(a?.sources||[]).filter(s=>{try{return new URL(s.url).protocol==="https:"&&String(s.name||"").trim()}catch{return false}});
 if(new Set(sources.map(s=>registrableDomain(new URL(s.url).hostname))).size<2)errors.push("At least two independent HTTPS source domains are required");
 if(!String(a?.poster||a?.backdrop||"").startsWith("https://"))errors.push("A verified poster or backdrop is required");
 if(a?.youtubeVideoId&&!/^[A-Za-z0-9_-]{11}$/.test(a.youtubeVideoId))errors.push("Invalid YouTube video id");
 const sectionCheck=inspectEditorialSections(body,a?.title);
 errors.push(...sectionCheck.errors);
 return {valid:errors.length===0,errors,words,characters:body.length,...(sectionCheck.retryFromStage?{retryFromStage:sectionCheck.retryFromStage}:{})};
}

export function validateEvidence(evidence){
 const sources=(evidence?.sources||[]).filter(s=>{try{return new URL(s.url).protocol==="https:"&&String(s.name||"").trim()}catch{return false}});
 const domains=new Set(sources.map(s=>registrableDomain(new URL(s.url).hostname)));
 return {valid:domains.size>=2,domains:[...domains],sources:sources.length,errors:domains.size>=2?[]:["Evidence requires at least two independent HTTPS source domains."]};
}
