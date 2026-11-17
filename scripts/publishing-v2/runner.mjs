import { enqueue, selectActiveJob, cycleDecision, transition, chooseFreeProvider, recordUsage, validateArticle, validateEvidence } from './core.mjs';
function candidate(items,state,counts={},now=Date.now()) { const used=new Set(Object.keys(state.jobs)); const today=new Date(now).toISOString().slice(0,10); const c={game:counts.game||0,movie:counts.movie||0,series:counts.series||0}; for(const j of Object.values(state.jobs)) if(j.status==='published') c[j.item.type]=(c[j.item.type]||0)+1; return (items||[]).filter(x=>x&&['game','movie','series'].includes(x.type)&&String(x.id||'').trim()&&(!x.date||String(x.date).slice(0,10)<=today)&&!used.has(x.type+':'+x.id)).sort((a,b)=>c[a.type]-c[b.type]||Number(b.editorialPriority||0)-Number(a.editorialPriority||0)||String(b.date||'').localeCompare(String(a.date||'')))[0]||null; }
// One bounded task per invocation; a durable five-hour cycle reserves its first three hours for work.
export async function runCycle({state,adapters,providers,now=Date.now(),persist=async()=>{},publishedCounts={},articleLimits={},researchSkips=0}) {
 if(!state||state.version!==2||!adapters) throw Error('Publisher v2 state and adapters are required.');
 const save=async()=>{state.updatedAt=new Date(now).toISOString();await persist(state);}; let job=selectActiveJob(state.jobs);
 // A code-level article assembly/validation fix should not leave a valid saved draft
 // sleeping for an hour; resume it immediately after the corrected build is deployed.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&/Article below minimum word count|Article below minimum character count/.test(String(job.lastError||''))){
  job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
 }
 // Clear legacy cooldowns caused by malformed/undersized model text; these are editorial
 // retries, not provider outages. Keep genuine HTTP/network cooldowns intact.
 for(const [providerId,cooldown] of Object.entries(state.providerCooldowns||{})){
  if(/Section word count rejected:|Stage 3 required fields missing:|رد النموذج JSON غير مكتمل|Invalid JSON/.test(String(cooldown?.lastError||'')))delete state.providerCooldowns[providerId];
 }
 // If a previous run deferred only because all providers were temporarily cooling down,
 // retry immediately once cleanup exposes an eligible free provider.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&job.lastError==='No free provider within configured daily budget.'){
  const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};
  const eligibility={...state.providerUsage[day]};
  for(const p0 of providers)eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns?.[p0.id]?.until||null};
  if(chooseFreeProvider(providers,eligibility,now)){job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();}
 }
 // A cycle is five hours: allow work for the first three hours, then rest for two.
 // The workflow ticks every 15 minutes; no long Sleep keeps a GitHub runner occupied.
 const FIVE_HOURS=5*60*60*1000, THREE_HOURS=3*60*60*1000;
 const previousCycle=state.cycle||{};
 if(!Number(previousCycle.nextStartAt)){
  state.cycle={startedAt:now,deadlineAt:now+THREE_HOURS,nextStartAt:now+FIVE_HOURS};
  await save();
 }else if(now>=Number(previousCycle.nextStartAt)){
  state.cycle={startedAt:now,deadlineAt:now+THREE_HOURS,nextStartAt:now+FIVE_HOURS};
  await save();
 }else if(now>=Number(previousCycle.deadlineAt||0)){
  return {action:'cycle-rest',retryAt:Number(previousCycle.nextStartAt),providerCalls:0};
 }
 // Never score or publish an unreleased movie/series/game as a completed review.
 const today=new Date(now).toISOString().slice(0,10);
 if(job&&job.item?.date&&String(job.item.date).slice(0,10)>today&&job.status!=='published'){
  state.jobs[job.key]=transition(job,'abandoned',{lastError:'Editorial rejection: release date is in the future; wait until release before reviewing.'},now);
  if(state.cycle?.articleKey===job.key)state.cycle.articleKey=null;
  await save();job=null;
 }
 // Avoid creating a duplicate review when an existing manual or assisted article covers this title.
 if(job&&!job.fileWritten&&job.status!=='ready'&&adapters.isAlreadyPublished&&await adapters.isAlreadyPublished(job.item)){
  state.jobs[job.key]=transition(job,'abandoned',{lastError:'Skipped: an existing review already covers this title.'},now);
  await save();job=null;
 }
 // A recovered draft owns this cycle only after duplicate detection; do not enqueue
 // another article after it publishes.
 if(job&&(['writing','quality-check','ready'].includes(job.status)||(job.status==='waiting'&&job.resumeTo==='writing'))){
  state.cycle.articleKey ||= job.key;
 }
 if(!job&&state.cycle.articleKey){
  return {action:'cycle-complete',key:state.cycle.articleKey,retryAt:Number(state.cycle.nextStartAt),providerCalls:0};
 }
 // Permanent evidence failures were previously deferred as generic research errors.
 // Retire those legacy checkpoints immediately so one unsupported title cannot block discovery.
 if(job?.status==='waiting'&&job.resumeTo==='researching'&&/^Evidence: /.test(String(job.lastError||''))&&/Independent source has insufficient detail|No sufficiently matching independent encyclopedia page|Primary source metadata is too thin|No HTTPS poster available/.test(String(job.lastError||''))){
  state.jobs[job.key]=transition(job,'abandoned',{lastError:'Evidence rejected: '+String(job.lastError).replace(/^Evidence: /,'')},now);
  await save();job=null;
 }
 // A short draft is a local quality rejection, not a provider outage. Clear stale cooldowns
 // left by older runs so the same free provider can retry after the short content retry window.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&/Section word count rejected:|Stage 3 required fields missing:|رد النموذج JSON غير مكتمل|Invalid JSON/.test(String(job.lastError||''))){
  const failedId=providers.find(p=>String(job.lastError||'').startsWith(p.id+': '))?.id;
  if(failedId){state.providerCooldowns||={};delete state.providerCooldowns[failedId];job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();}
 }
 // Migrate legacy waiting checkpoints: a provider cooldown must not freeze the whole draft queue.
 // On the next scheduled cycle, the failed provider remains excluded while eligible free fallbacks can run.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&(Number(job.nextAttemptAt)||Date.parse(job.nextAttemptAt||'')||0)>now+5*60*1000){
  const cooldowns=state.providerCooldowns||{};
  const hasCoolingProvider=Object.values(cooldowns).some(x=>(Number(x?.until)||Date.parse(x?.until||'')||0)>now);
  if(hasCoolingProvider){job={...job,nextAttemptAt:now+5*60*1000,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();}
 }
 // If a provider failed but another free provider is ready, do not make the draft wait five minutes.
 // Keep the failed provider excluded by its durable cooldown and immediately try the next eligible provider.
 if(job?.status==='waiting'&&job.resumeTo==='writing'){
  const failedId=providers.find(p=>String(job.lastError||'').startsWith(p.id+': '))?.id;
  if(failedId){
   const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};state.providerCooldowns||={};
   const eligibility={...state.providerUsage[day]};
   for(const p0 of providers)eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns[p0.id]?.until||null};
   const fallback=chooseFreeProvider(providers.filter(p=>p.id!==failedId),eligibility,now);
   if(fallback&&(Number(job.nextAttemptAt)||Date.parse(job.nextAttemptAt||'')||0)>now){
    job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
   }
  }
 }
 if(!job){const item=candidate(await adapters.discover(),state,publishedCounts,now);if(!item)return {action:'no-candidates',providerCalls:0};job=enqueue(state,item,now).job;await save();}
 let decision=cycleDecision(state,now);
 if(decision.action==='wait')return {action:'waiting',key:job.key,retryAt:decision.retryAt,providerCalls:0};
 if(decision.action==='publish'){
  if(!job.fileWritten){const written=await adapters.publishFile(job.article,job);job={...job,fileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();return {action:'file-ready',key:job.key,articlePath:job.articlePath,providerCalls:0};}
  if(!await adapters.verifyDeployment({article:job.article,job,articlePath:job.articlePath}))return {action:'deployment-pending',key:job.key,providerCalls:0};
  state.jobs[job.key]=transition(job,'published',{deployedAt:new Date(now).toISOString()},now);await save();return {action:'published',key:job.key,articlePath:job.articlePath,providerCalls:0};
 }
 // Resume a durable stage-three checkpoint through validation only; never spend another model request.
 if(decision.action==='validate'){
  const article=job.article||await adapters.assembleArticle(job);
  let quality=validateArticle(article,articleLimits);
  if(quality.valid&&adapters.editorialGate){
   const editorial=await adapters.editorialGate(article,job);
   if(editorial!==true&&editorial?.valid!==true)quality={...quality,valid:false,errors:[...quality.errors,...(editorial?.errors||['Editorial gate rejected draft.'])]};
  }
  if(!quality.valid){
   job=transition(job,'quality-failed',{lastError:quality.errors.join(' | '),nextAttemptAt:now+3600000,resumeTo:'writing',stage:2,parts:job.parts.slice(0,2)},now);
   state.jobs[job.key]=job;await save();
   return {action:'quality-rejected',key:job.key,errors:quality.errors,providerCalls:0};
  }
  job=transition(job,'quality-passed',{article,quality,fileWritten:false},now);
  state.jobs[job.key]=job;await save();
  const written=await adapters.publishFile(article,job);
  job={...job,fileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};
  state.jobs[job.key]=job;await save();
  return {action:'file-ready',key:job.key,articlePath:job.articlePath,quality,providerCalls:0};
 }
 if(decision.action==='resume'){job=transition(job,'resumed',{resumeTo:job.resumeTo||'writing'},now);state.jobs[job.key]=job;await save();}
 if(job.status==='queued'){job=transition(job,'research-started',{},now);state.jobs[job.key]=job;await save();}
 if(job.status==='researching'){
  try{const evidence=await adapters.collectEvidence(job.item);const evidenceCheck=validateEvidence(evidence);if(!evidenceCheck.valid)throw Error(evidenceCheck.errors.join(' '));job=transition(job,'research-saved',{evidence},now);state.jobs[job.key]=job;state.cycle.articleKey=job.key;await save();}
  catch(error){
   const message=String(error?.message||error);
   // Permanent evidence gaps should not pin the single-job queue for hours.
   if(/No sufficiently matching independent encyclopedia page|Independent source has insufficient detail|Primary source metadata is too thin|No HTTPS poster available/.test(message)){
    job=transition(job,'abandoned',{lastError:'Evidence rejected: '+message},now);
    state.jobs[job.key]=job;await save();
    // Evidence-only failures cost no model tokens. Skip a small bounded batch in one
    // scheduled cycle instead of waiting an hour for every unsupported trending title.
    if(researchSkips<5)return runCycle({state,adapters,providers,now,persist,publishedCounts,articleLimits,researchSkips:researchSkips+1});
    return {action:'research-rejected',key:job.key,reason:message,skipped:researchSkips+1,providerCalls:0};
   }
   job=transition(job,'provider-deferred',{lastError:'Evidence: '+message,nextAttemptAt:now+3600000,resumeTo:'researching',countAttempt:false},now);
   state.jobs[job.key]=job;await save();return {action:'research-deferred',key:job.key,providerCalls:0};
  }
 }
 if(job.status==='writing'){
  const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};state.providerCooldowns||={};const eligibility={...state.providerUsage[day]};for(const p0 of providers){eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns[p0.id]?.until||null};}const p=chooseFreeProvider(providers,eligibility,now);
  if(!p){job=transition(job,'provider-deferred',{lastError:'No free provider within configured daily budget.',nextAttemptAt:now+3600000,resumeTo:'writing',countAttempt:false},now);state.jobs[job.key]=job;await save();return {action:'provider-unavailable',key:job.key,providerCalls:0};}
  let part,requestCount=1;try{part=await adapters.generatePart({job,provider:p,stage:job.stage+1});if(!part||typeof part.text!=='string'||!part.text.trim())throw Error('Empty article stage.');requestCount=Math.max(1,Number(part.requests)||1);recordUsage(state.providerUsage[day],p.id,{requests:requestCount,tokens:Number(part.tokens||0),success:true});delete state.providerCooldowns[p.id];}
  catch(error){requestCount=Math.max(1,Number(error?.requests)||1);recordUsage(state.providerUsage[day],p.id,{requests:requestCount,tokens:Number(error?.tokens||0),success:false});const message=String(error?.message||error);const contentQualityFailure=/^Section word count rejected:|^Stage 3 required fields missing:|^رد النموذج JSON غير مكتمل|^Invalid JSON/.test(message);if(contentQualityFailure){delete state.providerCooldowns[p.id];job=transition(job,'provider-deferred',{lastError:p.id+': '+message,nextAttemptAt:now+5*60*1000,resumeTo:'writing'},now);}else{const prior=state.providerCooldowns[p.id]||{failures:0};const failures=Number(prior.failures||0)+1;const cooldownMs=Math.min(24*60*60*1000,2*60*60*1000*Math.pow(2,Math.min(failures-1,3)));const retryAt=Number(error?.retryAt)>now?Number(error.retryAt):now+cooldownMs;state.providerCooldowns[p.id]={failures,until:retryAt,lastError:message.slice(0,500)};job=transition(job,'provider-deferred',{lastError:p.id+': '+message,nextAttemptAt:now+5*60*1000,resumeTo:'writing'},now);}state.jobs[job.key]=job;await save();return {action:'generation-deferred',key:job.key,provider:p.id,providerCalls:requestCount};}
  job=transition(job,'part-saved',{part:{text:part.text},lastProvider:p.id},now);state.jobs[job.key]=job;await save();if(job.stage<3)return {action:'stage-saved',key:job.key,stage:job.stage,provider:p.id,providerCalls:requestCount};
  const article=await adapters.assembleArticle(job);let quality=validateArticle(article,articleLimits);
  if(quality.valid&&adapters.editorialGate){const editorial=await adapters.editorialGate(article,job);if(editorial!==true&&editorial?.valid!==true)quality={...quality,valid:false,errors:[...quality.errors,...(editorial?.errors||['Editorial gate rejected draft.'])]};}
  if(!quality.valid){job=transition(job,'quality-failed',{lastError:quality.errors.join(' | '),nextAttemptAt:now+3600000,resumeTo:'writing',stage:2,parts:job.parts.slice(0,2)},now);state.jobs[job.key]=job;await save();return {action:'quality-rejected',key:job.key,errors:quality.errors,providerCalls:1};}
  job=transition(job,'quality-passed',{article,quality,fileWritten:false},now);state.jobs[job.key]=job;await save();const written=await adapters.publishFile(article,job);job={...job,fileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();return {action:'file-ready',key:job.key,articlePath:job.articlePath,quality,providerCalls:requestCount};
 }
 return {action:'checkpointed',key:job.key,status:job.status,stage:job.stage,providerCalls:0};
}
