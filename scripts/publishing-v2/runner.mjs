import { enqueue, selectRunnableJob, cycleDecision, transition, chooseFreeProvider, recordUsage, validateArticle, validateEvidence } from './core.mjs';
import { recoverAbandonedJobs } from './recovery.mjs';
function nextScheduledAt(state,now,interval){
 const base=Math.max(now,Number(state.cycle?.nextPublishAt)||now+interval);
 const queued=Object.values(state.jobs||{}).filter(j=>j?.status==='ready'&&Number(j.scheduledFor)>0).map(j=>Number(j.scheduledFor));
 return Math.max(base,...queued.map(t=>t+interval));
}
function candidate(items,state,counts={},now=Date.now()) { const used=new Set(Object.keys(state.jobs)); const c={game:counts.game||0,movie:counts.movie||0,series:counts.series||0}; for(const j of Object.values(state.jobs)) if(j.status==='published') c[j.item.type]=(c[j.item.type]||0)+1; return (items||[]).filter(x=>x&&['game','movie','series'].includes(x.type)&&String(x.id||'').trim()&&!used.has(x.type+':'+x.id)).sort((a,b)=>Number(b.editorialPriority||0)-Number(a.editorialPriority||0)||c[a.type]-c[b.type]||String(b.date||'').localeCompare(String(a.date||'')) )[0]||null; }
// One bounded task per invocation. Publication cadence and writing-stage pacing are separate clocks.
export async function runCycle({state,adapters,providers,now=Date.now(),persist=async()=>{},publishedCounts={},articleLimits={},researchSkips=0,cycleIntervalMinutes=45,stageIntervalMinutes=15}) {
 if(!state||state.version!==2||!adapters) throw Error('Publisher v2 state and adapters are required.');
 const save=async()=>{state.updatedAt=new Date(now).toISOString();await persist(state);};
 const recoveredJobs=recoverAbandonedJobs(state,now);if(recoveredJobs)await save();
 const CYCLE_INTERVAL=Math.max(15,Math.min(1440,Number(cycleIntervalMinutes)||45))*60*1000;
 const STAGE_INTERVAL=Math.max(5,Math.min(240,Number(stageIntervalMinutes)||15))*60*1000;
 state.cycle ||= {};
 if(!Number(state.cycle.nextPublishAt)){
  state.cycle.nextPublishAt=Number(state.cycle.nextStartAt)||now+CYCLE_INTERVAL;
  await save();
 }
 state.discoveryBacklog ||= {};
 const DISCOVERY_INTERVAL=6*60*60*1000;
 const lastDiscovery=Number(state.discoveryCheckedAt)||Date.parse(state.discoveryCheckedAt||'')||0;
 if(!lastDiscovery||now-lastDiscovery>=DISCOVERY_INTERVAL){
  const excluded=[...Object.keys(state.jobs),...Object.keys(state.discoveryBacklog)];
  const discovered=await adapters.discover(excluded);
  let addedToBacklog=0;
  for(const item of Array.isArray(discovered)?discovered:[]){
   const key=item?.type+':'+item?.id;
   if(!item?.id||state.jobs[key]||state.discoveryBacklog[key])continue;
   state.discoveryBacklog[key]=item;addedToBacklog++;
  }
  state.discoveryCheckedAt=now;
  state.discoveryCount=Number(state.discoveryCount||0)+addedToBacklog;
  await save();
 }
 // Ready articles live in a separate publication queue. Preparation continues while
 // a ready article waits for its fixed 45-minute publication slot.
 let readyJobs=Object.values(state.jobs).filter(j=>j?.status==='ready').sort((a,b)=>(Number(a.scheduledFor)||0)-(Number(b.scheduledFor)||0)||String(a.createdAt).localeCompare(String(b.createdAt)));
 let ready=readyJobs[0]||null;
 if(ready){
  const dueSlot=Math.max(Number(ready.scheduledFor)||0,Number(state.cycle.nextPublishAt)||now);
  if(!ready.scheduledFor||dueSlot!==Number(ready.scheduledFor)){
   ready={...ready,scheduledFor:dueSlot};state.jobs[ready.key]=ready;await save();
  }
 }
 let deploymentPending=false;
 if(ready&&Number(ready.scheduledFor)<=now){
  if(!ready.siteFileWritten){
   // Legacy checkpoints already wrote directly to the live directory; new jobs carry stagedPath.
   if(ready.fileWritten&&!ready.stagedPath&&ready.articlePath){
    ready={...ready,siteFileWritten:true};
   }else{
    const written=await adapters.publishFile(ready.article,{...ready,stagedPath:ready.stagedPath});
    ready={...ready,siteFileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};
   }
   state.jobs[ready.key]=ready;await save();
  }
  if(await adapters.verifyDeployment({article:ready.article,job:ready,articlePath:ready.articlePath})){
   state.jobs[ready.key]=transition(ready,'published',{deployedAt:new Date(now).toISOString()},now);
   state.cycle.lastPublishedAt=now;
   state.cycle.lastPublishedKey=ready.key;
   state.cycle.nextPublishAt=Math.max(now,Number(ready.scheduledFor)||now)+CYCLE_INTERVAL;
   await save();
   return {action:'published',key:ready.key,articlePath:ready.articlePath,scheduledFor:ready.scheduledFor,providerCalls:0};
  }
  deploymentPending=true;
  ready={...ready,lastDeploymentCheckAt:now};state.jobs[ready.key]=ready;await save();
 }
 // Give one saved research job its explicitly allowed alternate-source retry even when its
 // previous backoff is still active; the marker prevents repeated free-API hammering.
 const alternateResearch=Object.values(state.jobs).find(j=>j?.status==='waiting'&&j.resumeTo==='researching'&&!j.researchFallbackAttempted&&/Source HTTP 429/.test(String(j.lastError||'')));
 if(alternateResearch){
  state.jobs[alternateResearch.key]={...alternateResearch,nextAttemptAt:now,researchFallbackAttempted:true};
  await save();
 }
 // Wake a delayed writing checkpoint only when another configured free provider can
 // actually continue it. Otherwise leave it paused and let queued titles use this cycle.
 const providerDay=new Date(now).toISOString().slice(0,10);
 for(const paused of Object.values(state.jobs)){
  if(paused?.status!=='waiting'||paused.resumeTo!=='writing'||(Number(paused.nextAttemptAt)||Date.parse(paused.nextAttemptAt||'')||0)<=now)continue;
  const failedId=providers.find(p=>String(paused.lastError||'').startsWith(p.id+': '))?.id;
  const excluded=new Set(paused.excludedProviders||[]);
  if(failedId)excluded.add(failedId);
  const eligibility={...(state.providerUsage[providerDay]||{})};
  for(const provider of providers)eligibility[provider.id]={...(eligibility[provider.id]||{}),cooldownUntil:state.providerCooldowns?.[provider.id]?.until||null};
  const fallback=chooseFreeProvider(providers.filter(provider=>!excluded.has(provider.id)),eligibility,now);
  if(fallback){
   state.jobs[paused.key]={...paused,nextAttemptAt:now,fallbackWokenAt:now};
   await save();
   break;
  }
 }
 let job=selectRunnableJob(state.jobs,now,{includeReady:false});
 // A code-level article assembly/validation fix should not leave a valid saved draft
 // sleeping for an hour; resume it immediately after the corrected build is deployed.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&/Article below minimum word count|Article below minimum character count/.test(String(job.lastError||''))){
  job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
 }
 // After deploying the alternate Wikipedia REST lookup, give one previously rate-limited
 // research job an immediate fallback attempt. If it is still throttled, normal short retry applies.
 if(job?.status==='waiting'&&job.resumeTo==='researching'&&/Source HTTP 429/.test(String(job.lastError||''))&&!job.researchFallbackAttempted){
  job={...job,nextAttemptAt:now,researchFallbackAttempted:true,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
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
 // Upcoming titles are eligible for clearly labeled advance-reading articles; the adapter
 // instructs the writer not to present predictions as hands-on reviews.
 // Avoid creating a duplicate review when an existing manual or assisted article covers this title.
 if(job&&!job.fileWritten&&job.status!=='ready'&&adapters.isAlreadyPublished&&await adapters.isAlreadyPublished(job.item)){
  const duplicateKey=job.key;
  state.jobs[duplicateKey]=transition(job,'abandoned',{lastError:'Skipped: an existing review already covers this title or source ID.'},now);
  if(state.cycle?.articleKey===duplicateKey)state.cycle.articleKey=null;
  await save();job=null;
 }
 // Permanent evidence failures were previously deferred as generic research errors.
 // Retire those legacy checkpoints immediately so one unsupported title cannot block discovery.
 if(job?.status==='waiting'&&job.resumeTo==='researching'&&/^Evidence: /.test(String(job.lastError||''))&&/Independent source has insufficient detail|No sufficiently matching independent encyclopedia page|Primary source metadata is too thin|No HTTPS poster available|No verified trailer available/.test(String(job.lastError||''))){
  state.jobs[job.key]=transition(job,'abandoned',{lastError:'Evidence rejected: '+String(job.lastError).replace(/^Evidence: /,'')},now);
  await save();job=null;
 }
 // A short draft is a local quality rejection, not a provider outage. Clear stale cooldowns
 // left by older runs so the same free provider can retry after the short content retry window.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&/Section word count rejected:|Stage 3 required fields missing:|رد النموذج JSON غير مكتمل|Invalid JSON/.test(String(job.lastError||''))){
  const failedId=providers.find(p=>String(job.lastError||'').startsWith(p.id+': '))?.id;
  if(failedId){
   state.providerCooldowns||={};delete state.providerCooldowns[failedId];
   const excluded=new Set(job.excludedProviders||[]);excluded.add(failedId);
   job={...job,excludedProviders:[...excluded],nextAttemptAt:now,updatedAt:new Date(now).toISOString()};
   state.jobs[job.key]=job;await save();
  }
 }
 // Migrate legacy waiting checkpoints: a provider cooldown must not freeze the whole draft queue.
 // On the next scheduled cycle, the failed provider remains excluded while eligible free fallbacks can run.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&(Number(job.nextAttemptAt)||Date.parse(job.nextAttemptAt||'')||0)>now+5*60*1000){
  const cooldowns=state.providerCooldowns||{};
  const hasCoolingProvider=Object.values(cooldowns).some(x=>(Number(x?.until)||Date.parse(x?.until||'')||0)>now);
  if(hasCoolingProvider){job={...job,nextAttemptAt:now+5*60*1000,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();}
 }
 // If a provider failed but another free provider is ready, resume without waiting for the retry delay.
 // Content-quality failures are excluded for this draft only; real provider outages use global cooldowns.
 if(job?.status==='waiting'&&job.resumeTo==='writing'){
  const failedId=providers.find(p=>String(job.lastError||'').startsWith(p.id+': '))?.id;
  const excluded=new Set(job.excludedProviders||[]);
  if(failedId)excluded.add(failedId);
  if(excluded.size){
   job={...job,excludedProviders:[...excluded]};
   const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};state.providerCooldowns||={};
   const eligibility={...state.providerUsage[day]};
   for(const p0 of providers)eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns[p0.id]?.until||null};
   const fallback=chooseFreeProvider(providers.filter(p=>!excluded.has(p.id)),eligibility,now);
   if(fallback&&(Number(job.nextAttemptAt)||Date.parse(job.nextAttemptAt||'')||0)>now){
    job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
   }else{
    state.jobs[job.key]=job;await save();
   }
  }
 }
 if(!job){
  const item=candidate(Object.values(state.discoveryBacklog||{}),state,publishedCounts,now);
  if(!item)return deploymentPending?{action:'deployment-pending',key:ready?.key,articlePath:ready?.articlePath,providerCalls:0}:ready?{action:'publication-waiting',key:ready.key,scheduledFor:ready.scheduledFor,nextPublishAt:state.cycle.nextPublishAt,providerCalls:0}:{action:'no-candidates',providerCalls:0,queuedCandidates:Object.keys(state.discoveryBacklog||{}).length};
  delete state.discoveryBacklog[item.type+':'+item.id];
  job=enqueue(state,item,now,{allowConcurrent:true}).job;await save();
 }
 let decision=cycleDecision(state,now,job);
 if(decision.action==='wait')return {action:'waiting',key:job.key,retryAt:decision.retryAt,providerCalls:0};
 if(decision.action==='publish'){
  if(!job.siteFileWritten){
   if(job.fileWritten&&!job.stagedPath&&job.articlePath){job={...job,siteFileWritten:true};}
   else{const written=await adapters.publishFile(job.article,{...job,stagedPath:job.stagedPath});job={...job,siteFileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};}
   state.jobs[job.key]=job;await save();
  }
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
   const retryFromStage=Math.min(3,Math.max(1,Number(quality.retryFromStage)||3));job=transition(job,'quality-failed',{lastError:quality.errors.join(' | '),nextAttemptAt:now+3600000,resumeTo:'writing',stage:retryFromStage-1,parts:job.parts.slice(0,retryFromStage-1)},now);
   state.jobs[job.key]=job;await save();
   return {action:'quality-rejected',key:job.key,errors:quality.errors,providerCalls:0};
  }
  const scheduledFor=nextScheduledAt(state,now,CYCLE_INTERVAL);
  job=transition(job,'quality-passed',{article,quality,fileWritten:false,siteFileWritten:false,scheduledFor},now);
  state.jobs[job.key]=job;await save();
  const staged=adapters.stageFile?await adapters.stageFile(article,job):null;
  job={...job,fileWritten:Boolean(staged),stagedPath:staged?.path||null,updatedAt:new Date(now).toISOString()};
  state.jobs[job.key]=job;await save();
  return {action:'article-prepared',key:job.key,stagedPath:job.stagedPath,scheduledFor:job.scheduledFor,quality,providerCalls:0};
 }
 if(decision.action==='resume'){job=transition(job,'resumed',{resumeTo:job.resumeTo||'writing'},now);state.jobs[job.key]=job;await save();}
 if(job.status==='queued'){job=transition(job,'research-started',{},now);state.jobs[job.key]=job;await save();}
 if(job.status==='researching'){
  try{const evidence=await adapters.collectEvidence(job.item);const evidenceCheck=validateEvidence(evidence);if(!evidenceCheck.valid)throw Error(evidenceCheck.errors.join(' '));job=transition(job,'research-saved',{evidence},now);state.jobs[job.key]=job;state.cycle.articleKey=job.key;await save();}
  catch(error){
   const message=String(error?.message||error);
   // Permanent evidence gaps should not pin the single-job queue for hours.
   if(/No sufficiently matching independent encyclopedia page|No sufficiently matching independent reference|Independent source has insufficient detail|Primary source metadata is too thin|No HTTPS poster(?: or backdrop)? available|No verified trailer available/.test(message)){
    const recoveryAttempts=Number(job.evidenceRecoveryAttempts||0)+1;
    if(recoveryAttempts<=2){
     job=transition(job,'provider-deferred',{lastError:'Evidence recovery attempt '+recoveryAttempts+': '+message,nextAttemptAt:now+15*60*1000,retryDelayMs:15*60*1000,resumeTo:'researching',countAttempt:false,evidenceRecoveryAttempts:recoveryAttempts},now);
     state.jobs[job.key]=job;await save();
     return {action:'evidence-recovery-deferred',key:job.key,recoveryAttempts,retryAt:job.nextAttemptAt,reason:message,providerCalls:0};
    }
    job=transition(job,'abandoned',{lastError:'Evidence rejected after automatic recovery: '+message,recoveryAttempts:1},now);
    state.jobs[job.key]=job;await save();
    if(researchSkips<5)return runCycle({state,adapters,providers,now,persist,publishedCounts,articleLimits,researchSkips:researchSkips+1,cycleIntervalMinutes,stageIntervalMinutes});
    return {action:'research-rejected',key:job.key,reason:message,skipped:researchSkips+1,providerCalls:0};
   }
   const retryDelayMs=/Source HTTP 429/.test(message)?15*60*1000:3600000;
   job=transition(job,'provider-deferred',{lastError:'Evidence: '+message,nextAttemptAt:now+retryDelayMs,retryDelayMs,resumeTo:'researching',countAttempt:false},now);
   state.jobs[job.key]=job;await save();return {action:'research-deferred',key:job.key,providerCalls:0};
  }
 }
 // Pace one saved article section per 30-minute slot. The checkpoint is durable,
 // so scheduled runs between slots do not call an AI provider or consume quota.
 const stageDue=Number(job?.nextStageAt)||Date.parse(job?.nextStageAt||'')||0;
 if(job?.status==='writing'&&job.stage>0&&stageDue>now)return {action:'stage-waiting',key:job.key,stage:job.stage,retryAt:stageDue,providerCalls:0};
 if(job.status==='writing'){
  const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};state.providerCooldowns||={};const eligibility={...state.providerUsage[day]};for(const p0 of providers){eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns[p0.id]?.until||null};}
  const excludedProviders=new Set(job.excludedProviders||[]);
  const p=chooseFreeProvider(providers.filter(p0=>!excludedProviders.has(p0.id)),eligibility,now);
  if(!p&&excludedProviders.size){
   const retryProvider=chooseFreeProvider(providers,eligibility,now);
   if(retryProvider){
    job=transition(job,'provider-deferred',{lastError:'All eligible free providers returned unusable content; retrying after a short pause.',nextAttemptAt:now+5*60*1000,retryDelayMs:5*60*1000,resumeTo:'writing',countAttempt:false,excludedProviders:[]},now);
    state.jobs[job.key]=job;await save();
    return {action:'provider-retry-deferred',key:job.key,providerCalls:0};
   }
  }
  if(!p){job=transition(job,'provider-deferred',{lastError:'No free provider within configured daily budget.',nextAttemptAt:now+3600000,resumeTo:'writing',countAttempt:false},now);state.jobs[job.key]=job;await save();return {action:'provider-unavailable',key:job.key,providerCalls:0};}
  let part,requestCount=1;try{part=await adapters.generatePart({job,provider:p,stage:job.stage+1});if(!part||typeof part.text!=='string'||!part.text.trim())throw Error('Empty article stage.');requestCount=Math.max(1,Number(part.requests)||1);recordUsage(state.providerUsage[day],p.id,{requests:requestCount,tokens:Number(part.tokens||0),success:true});delete state.providerCooldowns[p.id];}
  catch(error){requestCount=Math.max(1,Number(error?.requests)||1);recordUsage(state.providerUsage[day],p.id,{requests:requestCount,tokens:Number(error?.tokens||0),success:false});const message=String(error?.message||error);const contentQualityFailure=/^Section word count rejected:|^Stage 3 required fields missing:|^رد النموذج JSON غير مكتمل|^Invalid JSON/.test(message);if(contentQualityFailure){delete state.providerCooldowns[p.id];const excluded=new Set(job.excludedProviders||[]);excluded.add(p.id);job=transition(job,'provider-deferred',{lastError:p.id+': '+message,nextAttemptAt:now+5*60*1000,resumeTo:'writing',excludedProviders:[...excluded]},now);}else{const prior=state.providerCooldowns[p.id]||{failures:0};const failures=Number(prior.failures||0)+1;const cooldownMs=Math.min(24*60*60*1000,2*60*60*1000*Math.pow(2,Math.min(failures-1,3)));const retryAt=Number(error?.retryAt)>now?Number(error.retryAt):now+cooldownMs;state.providerCooldowns[p.id]={failures,until:retryAt,lastError:message.slice(0,500)};job=transition(job,'provider-deferred',{lastError:p.id+': '+message,nextAttemptAt:now+5*60*1000,resumeTo:'writing'},now);}state.jobs[job.key]=job;await save();
  // Immediately fall back to another eligible free provider in the same scheduled run.
  // This prevents a malformed response or transient provider outage from freezing the draft
  // until the next cron checkpoint (or leaving it stuck when schedule events are delayed).
  const fallbackUsage={...state.providerUsage[day]};
  for(const candidateProvider of providers)fallbackUsage[candidateProvider.id]={...(fallbackUsage[candidateProvider.id]||{}),cooldownUntil:state.providerCooldowns?.[candidateProvider.id]?.until||null};
  const excludedNow=new Set(job.excludedProviders||[]);
  if(!contentQualityFailure)excludedNow.add(p.id);
  const fallback=chooseFreeProvider(providers.filter(candidateProvider=>!excludedNow.has(candidateProvider.id)),fallbackUsage,now);
  if(fallback){job={...job,nextAttemptAt:now,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();return runCycle({state,adapters,providers,now,persist,publishedCounts,articleLimits,researchSkips,cycleIntervalMinutes,stageIntervalMinutes});}
  return {action:'generation-deferred',key:job.key,provider:p.id,providerCalls:requestCount};}
  job=transition(job,'part-saved',{part:{text:part.text},lastProvider:p.id,excludedProviders:[],...(job.stage<2?{nextStageAt:now+STAGE_INTERVAL}:{})},now);state.jobs[job.key]=job;await save();if(job.stage<3)return {action:'stage-saved',key:job.key,stage:job.stage,nextStageAt:job.nextStageAt||null,provider:p.id,providerCalls:requestCount};
  const article=await adapters.assembleArticle(job);let quality=validateArticle(article,articleLimits);
  if(quality.valid&&adapters.editorialGate){const editorial=await adapters.editorialGate(article,job);if(editorial!==true&&editorial?.valid!==true)quality={...quality,valid:false,errors:[...quality.errors,...(editorial?.errors||['Editorial gate rejected draft.'])]};}
  if(!quality.valid){const retryFromStage=Math.min(3,Math.max(1,Number(quality.retryFromStage)||3));job=transition(job,'quality-failed',{lastError:quality.errors.join(' | '),nextAttemptAt:now+3600000,resumeTo:'writing',stage:retryFromStage-1,parts:job.parts.slice(0,retryFromStage-1)},now);state.jobs[job.key]=job;await save();return {action:'quality-rejected',key:job.key,errors:quality.errors,providerCalls:1};}
  const scheduledFor=nextScheduledAt(state,now,CYCLE_INTERVAL);
  job=transition(job,'quality-passed',{article,quality,fileWritten:false,siteFileWritten:false,scheduledFor},now);state.jobs[job.key]=job;await save();
  const staged=adapters.stageFile?await adapters.stageFile(article,job):null;
  job={...job,fileWritten:Boolean(staged),stagedPath:staged?.path||null,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();
  return {action:'article-prepared',key:job.key,stagedPath:job.stagedPath,scheduledFor:job.scheduledFor,quality,providerCalls:requestCount};
 }
 if(deploymentPending)return {action:'deployment-pending',key:ready.key,articlePath:ready.articlePath,scheduledFor:ready.scheduledFor,providerCalls:0};
 if(ready)return {action:'publication-waiting',key:ready.key,scheduledFor:ready.scheduledFor,nextPublishAt:state.cycle.nextPublishAt,providerCalls:0};
 return {action:'checkpointed',key:job.key,status:job.status,stage:job.stage,providerCalls:0};
}
