const RECOVERABLE=/^(?:Evidence rejected: (?:Independent source has insufficient detail|No sufficiently matching independent encyclopedia page|Primary source metadata is too thin|No HTTPS poster available|No verified trailer available)|Editorial rejection: release date is in the future)/i;

// Reactivate recoverable research failures and legacy future-release rejections.
// Upcoming titles now proceed through the preview workflow instead of being discarded.
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
