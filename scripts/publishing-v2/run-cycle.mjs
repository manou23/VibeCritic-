import fs from 'node:fs/promises';
import {loadState,saveState} from './store.mjs';
import {runCycle} from './runner.mjs';
import {createPublishingAdapters,buildFreeProviders} from './adapters.mjs';
import fs from 'node:fs/promises';

async function readPublisherSettings(){
  try {
    const value=JSON.parse(await fs.readFile('data/publisher-v2-settings.json','utf8'));
    const interval=Number(value.intervalMinutes||30);
    if(![30,45,60,90,120,180].includes(interval)) throw new Error('Invalid publisher interval');
    const timezone=String(value.timezone||'Africa/Algiers');
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const part=name=>Number(parts.find(x=>x.type===name)?.value||0);
    const nowMinute=part('hour')*60+part('minute');
    const parse=v=>{const m=String(v||'').match(/^([01]\\d|2[0-3]):([0-5]\\d)$/);if(!m)throw new Error('Invalid publisher time window');return Number(m[1])*60+Number(m[2]);};
    const start=parse(value.startTime||'00:00'),end=parse(value.endTime||'23:59');
    const inWindow=start===end||(start<end?nowMinute>=start&&nowMinute<=end:nowMinute>=start||nowMinute<=end);
    return {enabled:value.enabled!==false,intervalMinutes:interval,inWindow,timezone,localTime:parts.map(x=>x.value).join('')};
  } catch(error) {
    if(error?.code==='ENOENT') return {enabled:true,intervalMinutes:30,inWindow:true,timezone:'Africa/Algiers'};
    throw error;
  }
}


const settings=await readPublisherSettings();
if(!settings.enabled){
 console.log('V2 cycle skipped: publisher paused from admin settings.');
 process.exit(0);
}
if(!settings.inWindow){
 console.log('V2 cycle skipped: outside configured publishing window ('+settings.timezone+' '+settings.localTime+').');
 process.exit(0);
}
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
 cycleIntervalMinutes:settings.intervalMinutes,
 persist:saveState
});
console.log('V2 cycle:',JSON.stringify({action:result.action,key:result.key,stage:result.stage,provider:result.provider,providerCalls:result.providerCalls,errors:result.errors||[]}));
console.log('Queue:',JSON.stringify(Object.values(state.jobs).map(j=>({key:j.key,status:j.status,stage:j.stage,attempts:j.attempts,nextAttemptAt:j.nextAttemptAt,fileWritten:!!j.fileWritten,lastError:j.lastError?String(j.lastError).slice(0,240):null}))));
if(result.articlePath){const articleId=String(result.articlePath).split('/').pop().replace(/\.md$/,'');console.log('Article deployment URL:','https://vibecritic.pages.dev/reviews/'+encodeURIComponent(articleId)+'/');}
if(result.action==='deployment-pending')console.log('Deployment not visible yet; the next scheduled cycle will verify again.');
if(result.action==='published')console.log('Verified live article:',result.articlePath);
