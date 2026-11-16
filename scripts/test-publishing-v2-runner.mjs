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
const first=await runCycle({state,adapters,providers,now,persist:async()=>{saves++;}});
assert.equal(first.action,'file-ready','one five-hour cycle must finish the full article');
assert.equal(first.providerCalls,3,'all three sections must be generated in the same scheduled cycle');
assert.equal(aiCalls,3);
assert.equal(state.jobs['series:1'].status,'quality-check','all sections must be checkpointed before quality validation');
await assert.rejects(
 runCycle({state,adapters,providers,now:now+1,persist:async()=>{saves++;}}),
 /simulated interruption/
);
assert.equal(aiCalls,3,'recovery after assembly interruption must not spend more model requests');
const resumed=await runCycle({state,adapters,providers,now:now+2,persist:async()=>{saves++;}});
assert.equal(resumed.action,'file-ready');
assert.equal(resumed.providerCalls,0,'recovery from quality-check must not spend another AI request');
assert.equal(aiCalls,3,'recovery must not regenerate the third stage');
assert.equal(fileWrites,1);
assert.equal(state.jobs['series:1'].status,'ready');
const pending=await runCycle({state,adapters,providers,now:now+3,persist:async()=>{saves++;}});
assert.equal(pending.action,'deployment-pending','a written file is not published until the live URL is verified');
assert.equal(state.jobs['series:1'].status,'ready');
assert.equal(fileWrites,1);
deploymentReady=true;
const final=await runCycle({state,adapters,providers,now:now+4,persist:async()=>{saves++;}});
assert.equal(final.action,'published');
assert.equal(aiCalls,3);
assert.equal(deployChecks,2);
assert.equal(fileWrites,1,'deployment retries must not rewrite an already committed article');
assert.equal(state.jobs['series:1'].status,'published');
assert.ok(saves>=7);
// A failed provider is cooled down durably; the next cycle completes all sections using a free fallback.
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
failureState.jobs['movie:cooldown-test'].nextAttemptAt=now+3*60*60*1000;
const retry=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now:now+1000,persist:async()=>{}});
assert.equal(retry.action,'waiting');
assert.ok(failureState.jobs['movie:cooldown-test'].nextAttemptAt<=now+6*60*1000);
assert.equal(failedProviderCalls,1);
const fallback=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now:now+6*60*1000,persist:async()=>{}});
assert.equal(fallback.action,'file-ready','the fallback provider should finish the full article in one cycle');
assert.equal(fallback.providerCalls,3);
assert.equal(failedProviderCalls,4,'one failed request plus three successful fallback sections');
assert.equal(failureState.jobs['movie:cooldown-test'].status,'ready');

console.log('VibeCritic Publishing Engine v2 crash-recovery runner tests passed.');
