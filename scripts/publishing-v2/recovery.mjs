const RECOVERABLE=/^Evidence rejected: (?:Independent source has insufficient detail|No sufficiently matching independent encyclopedia page|Primary source metadata is too thin|No HTTPS poster available|No verified trailer available)/i;

function released(item,now){
 const date=String(item?.date||"").slice(0,10);
 return !/^\d{4}-\d{2}-\d{2}$/.test(date)||date<=new Date(now).toISOString().slice(0,10);
}

// Reactivate one-time recoverable research failures without touching duplicates,
// future releases, already-written articles, or unrelated editorial rejections.
export function recoverAbandonedJobs(state,now=Date.now()){
 let recovered=0;
 for(const [key,job] of Object.entries(state?.jobs||{})){
  if(job?.status!=="abandoned"||job.fileWritten||job.articlePath||!RECOVERABLE.test(String(job.lastError||""))||!released(job.item,now))continue;
  if(Number(job.recoveryAttempts||0)>=1)continue;
  state.jobs[key]={
   ...job,status:"queued",stage:0,parts:[],evidence:null,article:null,quality:null,
   attempts:0,recoveryAttempts:Number(job.recoveryAttempts||0)+1,evidenceRecoveryAttempts:0,
   lastError:null,nextAttemptAt:null,resumeTo:null,updatedAt:new Date(now).toISOString()
  };
  recovered++;
 }
 return recovered;
}
