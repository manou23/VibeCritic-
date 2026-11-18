const RECOVERABLE=/^Evidence rejected: (?:Independent source has insufficient detail|No sufficiently matching independent encyclopedia page|Primary source metadata is too thin|No HTTPS poster available|No verified trailer available)/i;

// Reactivate one-time recoverable evidence failures, including upcoming titles.
export function recoverAbandonedJobs(state,now=Date.now()){
 let recovered=0;
 for(const [key,job] of Object.entries(state?.jobs||{})){
  if(job?.status!=="abandoned"||job.fileWritten||job.articlePath||!RECOVERABLE.test(String(job.lastError||"")))continue;
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


// Restore jobs previously abandoned only because their release date was still ahead.
// They are now published as clearly-labelled previews, not completed reviews.
export function recoverFutureReleaseJobs(state,now=Date.now()){
 let recovered=0;
 const today=new Date(now).toISOString().slice(0,10);
 for(const [key,job] of Object.entries(state?.jobs||{})){
  const date=String(job?.item?.date||"").slice(0,10);
  if(job?.status!=="abandoned"||job.fileWritten||job.articlePath||!/Editorial rejection: release date is in the future/i.test(String(job.lastError||""))||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||date<=today)continue;
  state.jobs[key]={...job,status:"queued",stage:0,parts:[],evidence:null,article:null,quality:null,attempts:0,lastError:null,nextAttemptAt:null,resumeTo:null,updatedAt:new Date(now).toISOString(),preReleasePreview:true};
  recovered++;
 }
 return recovered;
}
