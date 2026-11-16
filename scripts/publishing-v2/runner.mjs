import { enqueue, selectActiveJob, cycleDecision, transition, chooseFreeProvider, recordUsage, validateArticle, validateEvidence } from './core.mjs';
function candidate(items,state,counts={}) { const used=new Set(Object.keys(state.jobs)); const c={game:counts.game||0,movie:counts.movie||0,series:counts.series||0}; for(const j of Object.values(state.jobs)) if(j.status==='published') c[j.item.type]=(c[j.item.type]||0)+1; return (items||[]).filter(x=>x&&['game','movie','series'].includes(x.type)&&String(x.id||'').trim()&&!used.has(x.type+':'+x.id)).sort((a,b)=>c[a.type]-c[b.type]||Number(b.editorialPriority||0)-Number(a.editorialPriority||0)||String(b.date||'').localeCompare(String(a.date||'')))[0]||null; }
export async function runCycle({state,adapters,providers,now=Date.now(),persist=async()=>{},publishedCounts={},articleLimits={}}) {
 if(!state||state.version!==2||!adapters) throw Error('Publisher v2 state and adapters are required.');
 const save=async()=>{state.updatedAt=new Date(now).toISOString();await persist(state);}; let job=selectActiveJob(state.jobs);
 // Migrate legacy waiting checkpoints: a provider cooldown must not freeze the whole draft queue.
 if(job?.status==='waiting'&&job.resumeTo==='writing'&&(Number(job.nextAttemptAt)||Date.parse(job.nextAttemptAt||'')||0)>now+5*60*1000){
  const cooldowns=state.providerCooldowns||{};
  const hasCoolingProvider=Object.values(cooldowns).some(x=>(Number(x?.until)||Date.parse(x?.until||'')||0)>now);
  if(hasCoolingProvider){job={...job,nextAttemptAt:now+5*60*1000,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();}
 }
 if(!job){const item=candidate(await adapters.discover(),state,publishedCounts);if(!item)return {action:'no-candidates',providerCalls:0};job=enqueue(state,item,now).job;await save();}
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
  try{const evidence=await adapters.collectEvidence(job.item);const evidenceCheck=validateEvidence(evidence);if(!evidenceCheck.valid)throw Error(evidenceCheck.errors.join(' '));job=transition(job,'research-saved',{evidence},now);state.jobs[job.key]=job;await save();}
  catch(error){job=transition(job,'provider-deferred',{lastError:'Evidence: '+String(error?.message||error),nextAttemptAt:now+3600000,resumeTo:'researching',countAttempt:false},now);state.jobs[job.key]=job;await save();return {action:'research-deferred',key:job.key,providerCalls:0};}
 }
 if(job.status==='writing'){
  const day=new Date(now).toISOString().slice(0,10);state.providerUsage[day]||={};state.providerCooldowns||={};const eligibility={...state.providerUsage[day]};for(const p0 of providers){eligibility[p0.id]={...(eligibility[p0.id]||{}),cooldownUntil:state.providerCooldowns[p0.id]?.until||null};}const p=chooseFreeProvider(providers,eligibility,now);
  if(!p){job=transition(job,'provider-deferred',{lastError:'No free provider within configured daily budget.',nextAttemptAt:now+3600000,resumeTo:'writing',countAttempt:false},now);state.jobs[job.key]=job;await save();return {action:'provider-unavailable',key:job.key,providerCalls:0};}
  let part;try{part=await adapters.generatePart({job,provider:p,stage:job.stage+1});if(!part||typeof part.text!=='string'||!part.text.trim())throw Error('Empty article stage.');recordUsage(state.providerUsage[day],p.id,{requests:1,tokens:Number(part.tokens||0),success:true});delete state.providerCooldowns[p.id];}
  catch(error){recordUsage(state.providerUsage[day],p.id,{requests:1,tokens:Number(error?.tokens||0),success:false});const prior=state.providerCooldowns[p.id]||{failures:0};const failures=Number(prior.failures||0)+1;const cooldownMs=Math.min(24*60*60*1000,2*60*60*1000*Math.pow(2,Math.min(failures-1,3)));const retryAt=Number(error?.retryAt)>now?Number(error.retryAt):now+cooldownMs;state.providerCooldowns[p.id]={failures,until:retryAt,lastError:String(error?.message||error).slice(0,500)};job=transition(job,'provider-deferred',{lastError:p.id+': '+String(error?.message||error),nextAttemptAt:now+5*60*1000,resumeTo:'writing'},now);state.jobs[job.key]=job;await save();return {action:'generation-deferred',key:job.key,provider:p.id,providerCalls:1};}
  job=transition(job,'part-saved',{part:{text:part.text},lastProvider:p.id},now);state.jobs[job.key]=job;await save();if(job.stage<3)return {action:'stage-saved',key:job.key,stage:job.stage,provider:p.id,providerCalls:1};
  const article=await adapters.assembleArticle(job);let quality=validateArticle(article,articleLimits);
  if(quality.valid&&adapters.editorialGate){const editorial=await adapters.editorialGate(article,job);if(editorial!==true&&editorial?.valid!==true)quality={...quality,valid:false,errors:[...quality.errors,...(editorial?.errors||['Editorial gate rejected draft.'])]};}
  if(!quality.valid){job=transition(job,'quality-failed',{lastError:quality.errors.join(' | '),nextAttemptAt:now+3600000,resumeTo:'writing',stage:2,parts:job.parts.slice(0,2)},now);state.jobs[job.key]=job;await save();return {action:'quality-rejected',key:job.key,errors:quality.errors,providerCalls:1};}
  job=transition(job,'quality-passed',{article,quality,fileWritten:false},now);state.jobs[job.key]=job;await save();const written=await adapters.publishFile(article,job);job={...job,fileWritten:true,articlePath:written?.path||null,updatedAt:new Date(now).toISOString()};state.jobs[job.key]=job;await save();return {action:'file-ready',key:job.key,articlePath:job.articlePath,quality,providerCalls:1};
 }
 return {action:'checkpointed',key:job.key,status:job.status,stage:job.stage,providerCalls:0};
}
