import assert from 'node:assert/strict';
import {createState} from './publishing-v2/core.mjs';
import {runCycle} from './publishing-v2/runner.mjs';

const now=Date.parse('2026-11-16T12:00:00Z'),state=createState();
let aiCalls=0,fileWrites=0,deployChecks=0,saves=0,crashOnce=true,deploymentReady=false;
const text=Array.from({length:240},()=> 'تحليل نقدي يشرح بناء الشخصيات والصورة والإيقاع وحدود التجربة').join(' ');
const article={title:'عنوان',headline:'عنوان نقدي',summary:'ملخص',verdict:'حكم نقدي',type:'series',sourceId:'series:1',body:Array.from({length:700},()=>text).join(' '),storyScore:8,visualsScore:8,soundScore:8,pacingScore:8,score:8,pros:['قوة أولى','قوة ثانية','قوة ثالثة'],cons:['تحفظ أول','تحفظ ثان'],sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}],poster:'https://example.com/poster.jpg'};
const adapters={
 discover:async()=>[{type:'series',id:'1',date:'2026-11-16'}],
 collectEvidence:async()=>({sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
 generatePart:async({stage})=>{aiCalls++;return {text:'مرحلة '+stage+' '+text,tokens:120};},
 assembleArticle:async()=>{if(crashOnce){crashOnce=false;throw new Error('simulated interruption before quality gate');}return article;},
 publishFile:async()=>{fileWrites++;return {path:'src/content/reviews/series-1.md'};},
 verifyDeployment:async()=>{deployChecks++;return deploymentReady;}
};
const providers=[{id:'free-model',enabled:true,free:true,dailyRequestLimit:5,dailyTokenLimit:5000}];
for(let stage=1;stage<=2;stage++){
 const result=await runCycle({state,adapters,providers,now:now+stage,persist:async()=>{saves++;}});
 assert.equal(result.action,'stage-saved');
 assert.equal(result.providerCalls,1);
 assert.equal(result.stage,stage);
}
await assert.rejects(
 runCycle({state,adapters,providers,now:now+3,persist:async()=>{saves++;}}),
 /simulated interruption/
);
assert.equal(aiCalls,3);
assert.equal(state.jobs['series:1'].status,'quality-check','stage three must be checkpointed before quality validation');
const resumed=await runCycle({state,adapters,providers,now:now+4,persist:async()=>{saves++;}});
assert.equal(resumed.action,'file-ready');
assert.equal(resumed.providerCalls,0,'recovery from quality-check must not spend another AI request');
assert.equal(aiCalls,3,'recovery must not regenerate the third stage');
assert.equal(fileWrites,1);
assert.equal(state.jobs['series:1'].status,'ready');
const pending=await runCycle({state,adapters,providers,now:now+5,persist:async()=>{saves++;}});
assert.equal(pending.action,'deployment-pending','a written file is not published until the live URL is verified');
assert.equal(state.jobs['series:1'].status,'ready');
assert.equal(fileWrites,1);
deploymentReady=true;
const final=await runCycle({state,adapters,providers,now:now+6,persist:async()=>{saves++;}});
assert.equal(final.action,'published');
assert.equal(aiCalls,3);
assert.equal(deployChecks,2);
assert.equal(fileWrites,1,'deployment retries must not rewrite an already committed article');
assert.equal(state.jobs['series:1'].status,'published');
assert.ok(saves>=7);
const afterPublish=await runCycle({state,adapters,providers,now:now+7,persist:async()=>{saves++;}});
assert.equal(afterPublish.action,'cycle-complete','only one article may be processed in a five-hour cycle');
assert.equal(afterPublish.key,'series:1');
assert.equal(aiCalls,3);
// A failed provider is cooled down durably instead of being retried on every hourly cycle.
const failureState=createState();let failedProviderCalls=0;
const failureAdapters={
 discover:async()=>[{type:'movie',id:'cooldown-test'}],
 collectEvidence:async()=>({sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
 generatePart:async({provider})=>{failedProviderCalls++;if(provider.id==='rate-limited')throw new Error('429 rate limit');return {text:'backup stage',tokens:100};},
 assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
};
const failureProviders=[{id:'rate-limited',enabled:true,free:true,priority:1,dailyRequestLimit:5,dailyTokenLimit:5000},{id:'backup-free',enabled:true,free:true,priority:2,dailyRequestLimit:5,dailyTokenLimit:5000}];
const failed=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now,persist:async()=>{}});
assert.equal(failed.action,'generation-deferred');
assert.equal(failedProviderCalls,1);
assert.equal(failureState.providerCooldowns['rate-limited'].failures,1);
// Simulate an old persisted checkpoint whose retryAt was incorrectly tied to the provider cooldown.
failureState.jobs['movie:cooldown-test'].nextAttemptAt=now+3*60*60*1000;
assert.ok(failureState.providerCooldowns['rate-limited'].until-now>=2*60*60*1000,'provider cooldown must span the next hourly schedule so fallback providers can be selected');
const retry=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now:now+1000,persist:async()=>{}});
assert.equal(retry.action,'waiting');
assert.ok(failureState.jobs['movie:cooldown-test'].nextAttemptAt<=now+6*60*1000,'legacy waiting checkpoint must be migrated to a short retry window');
assert.equal(failedProviderCalls,1,'a cooled-down provider must not be called again during the short retry window');
const fallback=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now:now+6*60*1000,persist:async()=>{}});
assert.equal(fallback.action,'stage-saved','the next eligible cycle must select an available free fallback provider');
assert.equal(fallback.provider,'backup-free');
assert.equal(failedProviderCalls,2,'fallback provider should receive the next single AI call');

// The durable cycle allows work for three hours and rests until the five-hour boundary.
const cycleState=createState();
let cycleNow=now;
const cycleAdapters={...adapters,discover:async()=>[]};
const firstCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:cycleNow,persist:async()=>{}});
assert.equal(firstCycle.action,'no-candidates');
assert.equal(cycleState.cycle.deadlineAt,now+3*60*60*1000);
assert.equal(cycleState.cycle.nextStartAt,now+5*60*60*1000);
const duringRest=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+4*60*60*1000,persist:async()=>{}});
assert.equal(duringRest.action,'cycle-rest','the final two hours must remain idle');
const nextCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+5*60*60*1000,persist:async()=>{}});
assert.equal(nextCycle.action,'no-candidates');
assert.equal(cycleState.cycle.startedAt,now+5*60*60*1000);
assert.equal(cycleState.cycle.nextStartAt,now+10*60*60*1000);

console.log('VibeCritic Publishing Engine v2 crash-recovery and five-hour cycle tests passed.');
