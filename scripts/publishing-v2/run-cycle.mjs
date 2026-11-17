import fs from 'node:fs/promises';
import {loadState,saveState} from './store.mjs';
import {runCycle} from './runner.mjs';
import {createPublishingAdapters,buildFreeProviders} from './adapters.mjs';

const state=await loadState();
const adapters=createPublishingAdapters();
const providers=buildFreeProviders();
const publishedCounts={game:0,movie:0,series:0};
try{
 const files=await fs.readdir('src/content/reviews');
 for(const file of files.filter(x=>x.endsWith('.md'))){
  const content=await fs.readFile('src/content/reviews/'+file,'utf8');
  const type=content.match(/^type:\s*(game|movie|series)\s*$/m)?.[1];
  if(type)publishedCounts[type]++;
 }
}catch{}
const result=await runCycle({
 state,adapters,providers,publishedCounts,
 articleLimits:{minWords:600,minCharacters:3200},
 persist:saveState
});
console.log('V2 cycle:',JSON.stringify({action:result.action,key:result.key,stage:result.stage,provider:result.provider,providerCalls:result.providerCalls,errors:result.errors||[]}));
console.log('Queue:',JSON.stringify(Object.values(state.jobs).map(j=>({key:j.key,status:j.status,stage:j.stage,attempts:j.attempts,nextAttemptAt:j.nextAttemptAt,fileWritten:!!j.fileWritten,lastError:j.lastError?String(j.lastError).slice(0,240):null}))));
if(result.articlePath){const articleId=String(result.articlePath).split('/').pop().replace(/\.md$/,'');console.log('Article deployment URL:','https://vibecritic.pages.dev/reviews/'+encodeURIComponent(articleId)+'/');}
if(result.action==='deployment-pending')console.log('Deployment not visible yet; the next scheduled cycle will verify again.');
if(result.action==='published')console.log('Verified live article:',result.articlePath);
