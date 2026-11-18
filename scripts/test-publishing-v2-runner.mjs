import assert from 'node:assert/strict';
import {createState} from './publishing-v2/core.mjs';
import {runCycle} from './publishing-v2/runner.mjs';

const now=Date.parse('2026-11-16T12:00:00Z'),state=createState();
let aiCalls=0,fileWrites=0,deployChecks=0,saves=0,crashOnce=true,deploymentReady=false;
const text=Array.from({length:240},()=> 'تحليل نقدي يشرح بناء الشخصيات والصورة والإيقاع وحدود التجربة').join(' ');
const sectionWords=prefix=>Array.from({length:220},(_,i)=>prefix+i).join(' ');
const articleBody=["## القصة",sectionWords("story"),"## الأنظمة",sectionWords("systems"),"## التقييم",sectionWords("verdict")].join("\n\n");
const article={title:'عنوان',headline:'عنوان نقدي',summary:'ملخص',verdict:'حكم نقدي',type:'series',sourceId:'series:1',body:articleBody,storyScore:8,visualsScore:8,soundScore:8,pacingScore:8,score:8,pros:['قوة أولى','قوة ثانية','قوة ثالثة'],cons:['تحفظ أول','تحفظ ثان'],youtubeVideoId:'Abcdef12345',sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}],poster:'https://example.com/poster.jpg',youtubeVideoId:'Abcdef12345'};
const adapters={
 discover:async()=>[{type:'series',id:'1',date:'2026-11-16'}],
 collectEvidence:async()=>({youtubeVideoId:'Abcdef12345',sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
 generatePart:async({stage})=>{aiCalls++;return {text:'مرحلة '+stage+' '+text,tokens:120};},
 assembleArticle:async()=>{if(crashOnce){crashOnce=false;throw new Error('simulated interruption before quality gate');}return article;},
 publishFile:async()=>{fileWrites++;return {path:'src/content/reviews/series-1.md'};},
 verifyDeployment:async()=>{deployChecks++;return deploymentReady;}
};
const providers=[{id:'free-model',enabled:true,free:true,dailyRequestLimit:5,dailyTokenLimit:5000}];
const firstStage=await runCycle({state,adapters,providers,now:now+1,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(firstStage.action,'stage-saved');
assert.equal(firstStage.providerCalls,1);
assert.equal(firstStage.stage,1);
assert.equal(firstStage.nextStageAt,now+1+15*60*1000);
assert.equal(state.cycle.nextPublishAt,now+1+45*60*1000,'publication slots must be spaced 45 minutes apart');
const blockedStage=await runCycle({state,adapters,providers,now:now+10*60*1000,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(blockedStage.action,'no-candidates','a paused stage is skipped without spending another AI request when no other runnable draft exists');
assert.equal(blockedStage.providerCalls,0);
assert.equal(aiCalls,1);
const secondStage=await runCycle({state,adapters,providers,now:now+15*60*1000+1,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(secondStage.action,'stage-saved');
assert.equal(secondStage.providerCalls,1);
assert.equal(secondStage.stage,2);
assert.equal(secondStage.nextStageAt,now+30*60*1000+1);
await assert.rejects(
 runCycle({state,adapters,providers,now:now+30*60*1000+1,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}}),
 /simulated interruption/
);
assert.equal(aiCalls,3);
assert.equal(state.jobs['series:1'].status,'quality-check','stage three must be checkpointed before quality validation');
const resumed=await runCycle({state,adapters,providers,now:now+30*60*1000+2,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(resumed.action,'file-ready');
assert.equal(resumed.providerCalls,0,'recovery from quality-check must not spend another AI request');
assert.equal(aiCalls,3,'recovery must not regenerate the third stage');
assert.equal(fileWrites,1);
assert.equal(state.jobs['series:1'].status,'ready');
const early=await runCycle({state,adapters,providers,now:now+30*60*1000+3,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(early.action,'publication-waiting','a verified draft must wait for its scheduled 45-minute slot');
assert.equal(deployChecks,0,'the live deployment check must not run before the publication slot');
const pending=await runCycle({state,adapters,providers,now:now+45*60*1000,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(pending.action,'deployment-pending','a written file is not published until the live URL is verified');
assert.equal(state.jobs['series:1'].status,'ready');
assert.equal(fileWrites,1);
deploymentReady=true;
const final=await runCycle({state,adapters,providers,now:now+45*60*1000+1,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(final.action,'published');
assert.equal(aiCalls,3);
assert.equal(deployChecks,2);
assert.equal(fileWrites,1,'deployment retries must not rewrite an already committed article');
assert.equal(state.jobs['series:1'].status,'published');
assert.ok(saves>=7);
const afterPublish=await runCycle({state,adapters,providers,now:now+45*60*1000+2,cycleIntervalMinutes:45,stageIntervalMinutes:15,persist:async()=>{saves++;}});
assert.equal(afterPublish.action,'no-candidates','the next article remains due at the next 45-minute slot');
assert.equal(state.cycle.nextPublishAt,now+90*60*1000);
assert.equal(aiCalls,3);
// A failed provider is cooled down durably instead of being retried on every 30-minute checkpoint.
const failureState=createState();let failedProviderCalls=0;
const failureAdapters={
 discover:async()=>[{type:'movie',id:'cooldown-test'}],
 collectEvidence:async()=>({youtubeVideoId:'Abcdef12345',sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
 generatePart:async({provider})=>{failedProviderCalls++;if(provider.id==='rate-limited')throw new Error('429 rate limit');return {text:'backup stage',tokens:100};},
 assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
};
const failureProviders=[{id:'rate-limited',enabled:true,free:true,priority:1,dailyRequestLimit:5,dailyTokenLimit:5000},{id:'backup-free',enabled:true,free:true,priority:2,dailyRequestLimit:5,dailyTokenLimit:5000}];
const failed=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now,persist:async()=>{}});
assert.equal(failed.action,'stage-saved','an available free fallback should run in the same invocation');
assert.equal(failed.provider,'backup-free');
assert.equal(failedProviderCalls,2,'fallback provider should be called immediately after the first provider fails');
assert.equal(failureState.providerCooldowns['rate-limited'].failures,1);
assert.ok(failureState.providerCooldowns['rate-limited'].until-now>=2*60*60*1000,'provider cooldown should remain durable after fallback succeeds');

// Malformed model JSON is an article-quality failure, not a provider outage:
 // exclude the failing provider for this draft and use the next eligible free provider.
 const malformedState=createState();const malformedProviderCalls=[];
 const malformedAdapters={
  discover:async()=>[{type:'movie',id:'malformed-json',date:'2020-01-01'}],
  collectEvidence:async()=>({youtubeVideoId:'Abcdef12345',sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
  generatePart:async({provider})=>{
   malformedProviderCalls.push(provider.id);
   if(provider.id==='primary-free'){
    const error=new Error('رد النموذج JSON غير مكتمل أو ينقصه قوس إغلاق');
    error.requests=2;error.tokens=80;throw error;
   }
   return {text:'backup stage',tokens:100};
  },
  assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
 };
 const malformedProviders=[{id:'primary-free',enabled:true,free:true,priority:1,dailyRequestLimit:5,dailyTokenLimit:5000},{id:'backup-free',enabled:true,free:true,priority:2,dailyRequestLimit:5,dailyTokenLimit:5000}];
 const malformedFailure=await runCycle({state:malformedState,adapters:malformedAdapters,providers:malformedProviders,now,persist:async()=>{}});
 assert.equal(malformedFailure.action,'stage-saved','malformed JSON should immediately fall back within the same run');
 assert.equal(malformedFailure.provider,'backup-free');
 assert.deepEqual(malformedProviderCalls,['primary-free','backup-free']);
 assert.deepEqual(malformedState.jobs['movie:malformed-json'].excludedProviders,[],'a successful fallback clears the per-job provider exclusion');
 assert.equal(malformedState.providerCooldowns['primary-free'],undefined,'invalid JSON must not create a provider-outage cooldown');
 assert.equal(malformedState.providerUsage['2026-11-16']['primary-free'].requests,2,'both malformed JSON attempts must count against the free request budget');

// Duplicate titles must be retired before they reserve the cycle's single article slot.
const duplicateState=createState();
duplicateState.jobs['movie:dupe']={key:'movie:dupe',item:{type:'movie',id:'dupe'},status:'writing',stage:1,parts:[],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
duplicateState.cycle={startedAt:now,deadlineAt:now+3*60*60*1000,nextStartAt:now+30*60*1000,articleKey:'movie:dupe'};
const duplicateAdapters={...adapters,discover:async()=>[],isAlreadyPublished:async()=>true};
const duplicateResult=await runCycle({state:duplicateState,adapters:duplicateAdapters,providers,now,persist:async()=>{}});
assert.equal(duplicateResult.action,'no-candidates');
assert.equal(duplicateState.cycle.articleKey,null,'a duplicate must release any previously reserved cycle article slot');

// A ready article must not be mistaken for a duplicate of its own newly written file.
const readyState=createState();
readyState.jobs['game:ready']={key:'game:ready',item:{type:'game',id:'ready'},status:'ready',stage:3,parts:[],article,articlePath:'src/content/reviews/game-ready.md',fileWritten:true,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
readyState.cycle={startedAt:now,deadlineAt:now+3*60*60*1000,nextStartAt:now-1,articleKey:'game:ready'};
const readyAdapters={...adapters,isAlreadyPublished:async()=>true,verifyDeployment:async()=>true};
const readyResult=await runCycle({state:readyState,adapters:readyAdapters,providers,now,persist:async()=>{}});
assert.equal(readyResult.action,'published','ready article should proceed to deployment verification despite duplicate lookup matching its own file');
assert.equal(readyState.jobs['game:ready'].status,'published');

// Publishing runs continuously with a 30-minute article cycle and no rest window.
const cycleState=createState();
const cycleAdapters={...adapters,discover:async()=>[]};
const firstCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now,persist:async()=>{}});
assert.equal(firstCycle.action,'no-candidates');
assert.equal(cycleState.cycle.nextPublishAt,now+45*60*1000);
assert.equal(cycleState.cycle.nextPublishAt,now+45*60*1000);
const midCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+15*60*1000,persist:async()=>{}});
assert.equal(midCycle.action,'no-candidates','the same cycle remains active for its first 30 minutes');
assert.equal(cycleState.cycle.nextPublishAt,now+45*60*1000);
const nextCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+30*60*1000,persist:async()=>{}});
assert.equal(nextCycle.action,'no-candidates');
assert.equal(cycleState.cycle.nextPublishAt,now+45*60*1000);

// A repetitive third section is rejected and only that section is regenerated after the bounded retry delay.
const qualityState=createState();
let qualityCalls=0,qualityAssembles=0,qualityWrites=0;
const repeatedArticle={...article,body:["## القصة",sectionWords("alpha"),"## الأنظمة",sectionWords("beta"),"## التقييم",sectionWords("beta")].join("\n\n")};
const qualityAdapters={
 discover:async()=>[{type:'movie',id:'repeat',date:'2026-11-16'}],
 collectEvidence:async()=>({youtubeVideoId:'Abcdef12345',sources:[{name:'Official',url:'https://example.com/a'},{name:'Independent',url:'https://example.org/b'}]}),
 generatePart:async({stage})=>{qualityCalls++;return {text:'stage '+stage+' '+text,tokens:100};},
 assembleArticle:async()=>{qualityAssembles++;return qualityAssembles===1?repeatedArticle:article;},
 publishFile:async()=>{qualityWrites++;return {path:'src/content/reviews/movie-repeat.md'};},
 verifyDeployment:async()=>true
};
const qualityNow=now+100000;
await runCycle({state:qualityState,adapters:qualityAdapters,providers,now:qualityNow,persist:async()=>{}});
await runCycle({state:qualityState,adapters:qualityAdapters,providers,now:qualityNow+30*60*1000,persist:async()=>{}});
const rejectedQuality=await runCycle({state:qualityState,adapters:qualityAdapters,providers,now:qualityNow+60*60*1000,persist:async()=>{}});
assert.equal(rejectedQuality.action,'quality-rejected');
assert.equal(qualityState.jobs['movie:repeat'].stage,2,'the later overlapping section is the retry boundary');
assert.equal(qualityState.jobs['movie:repeat'].parts.length,2,'keep the two earlier sections and regenerate only the third');
assert.equal(qualityWrites,0,'repetitive content must never be written');
const repairedQuality=await runCycle({state:qualityState,adapters:qualityAdapters,providers,now:qualityNow+60*60*1000+3600003,persist:async()=>{}});
assert.equal(repairedQuality.action,'file-ready');
assert.equal(qualityCalls,4,'only the rejected third section is regenerated');
assert.equal(qualityAssembles,2);
assert.equal(qualityWrites,1);

// A saved research job that hit Wikipedia's 429 receives one immediate alternate-endpoint attempt.
const rateLimitState=createState();
rateLimitState.jobs["movie:rate-limit"]={key:"movie:rate-limit",item:{type:"movie",id:"rate-limit",date:"2020-01-01"},status:"waiting",stage:0,parts:[],evidence:null,attempts:0,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),nextAttemptAt:now+60*60*1000,lastError:"Evidence: Source HTTP 429 (en.wikipedia.org)",resumeTo:"researching"};
let alternateEvidenceCalls=0;
const rateLimitAdapters={
 discover:async()=>[],
 collectEvidence:async()=>{alternateEvidenceCalls++;return {title:"Test",type:"movie",sourceId:"movie:rate-limit",overview:"Verified source detail",sources:[{name:"TMDB",url:"https://www.themoviedb.org/movie/1"},{name:"Wikipedia",url:"https://en.wikipedia.org/wiki/Test"}],youtubeVideoId:"Abcdef12345",poster:"https://example.com/poster.jpg"};},
 generatePart:async()=>({text:"saved first section",tokens:100}),
 assembleArticle:async()=>article,publishFile:async()=>({path:"unused"}),verifyDeployment:async()=>false
};
const rateLimitRetry=await runCycle({state:rateLimitState,adapters:rateLimitAdapters,providers,now:now+1000,persist:async()=>{}});
assert.equal(alternateEvidenceCalls,1,"the current blocked research job must get one immediate fallback attempt");
assert.equal(rateLimitRetry.action,"stage-saved");
assert.equal(rateLimitState.jobs["movie:rate-limit"].researchFallbackAttempted,true,"the one-time fallback marker must persist across restarts");

// A dedicated Netflix 2026 editorial collection outranks the general mixed discovery pool.
const netflixPriorityState=createState();
const netflixPriorityAdapters={
 discover:async()=>[
  {type:'game',id:'general-game',name:'General Game',date:'2026-11-16'},
  {type:'movie',id:'netflix-2026',name:'Netflix 2026 Film',date:'2026-11-16',streamingPlatform:'Netflix',collection:'Netflix 2026',editorialPriority:100},
  {type:'movie',id:'netflix-future-2026',name:'Upcoming Netflix 2026 Film',date:new Date(now+365*24*60*60*1000).toISOString().slice(0,10),streamingPlatform:'Netflix',collection:'Netflix 2026',editorialPriority:100}
 ],
 collectEvidence:async item=>({title:item.name,type:item.type,sourceId:item.type+':'+item.id,overview:'Verified synopsis',sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/1'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}],youtubeVideoId:'Abcdef12345',poster:'https://example.com/poster.jpg'}),
 generatePart:async({stage})=>({text:'Netflix queue stage '+stage+' '+text,tokens:100}),
 assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
};
await runCycle({state:netflixPriorityState,adapters:netflixPriorityAdapters,providers,now:now+20000000,persist:async()=>{}});
assert.ok(netflixPriorityState.jobs['movie:netflix-future-2026'],'upcoming Netflix titles must now enter the active publishing queue as advance-reading work');
assert.equal(netflixPriorityState.jobs['movie:netflix-future-2026'].item.streamingPlatform,'Netflix');
assert.equal(netflixPriorityState.jobs['movie:netflix-future-2026'].item.collection,'Netflix 2026');
assert.ok(netflixPriorityState.discoveryBacklog['movie:netflix-2026'],'released Netflix titles must remain in the durable backlog while the upcoming preview is processed');

// Netflix titles are collected into durable storage even while an older saved draft owns the active slot.
const collectionState=createState();
collectionState.jobs['series:existing']={key:'series:existing',item:{type:'series',id:'existing'},status:'writing',stage:1,parts:[{text:'saved stage one'}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),nextStageAt:now+30*60*1000};
collectionState.cycle={startedAt:now,deadlineAt:now+30*60*1000,nextStartAt:now+30*60*1000,articleKey:'series:existing'};
let collectionPersisted=false;
const collectionAdapters={
 discover:async excluded=>{
  assert.ok(excluded.includes('series:existing'),'active jobs must be excluded from fresh discovery');
  return [
   {type:'movie',id:'netflix-film-2026',name:'Netflix Film 2026',date:'2026-02-10',streamingPlatform:'Netflix',collection:'Netflix 2026',editorialPriority:100},
   {type:'series',id:'netflix-series-2026',name:'Netflix Series 2026',date:'2026-03-10',streamingPlatform:'Netflix',collection:'Netflix 2026',editorialPriority:100}
  ];
 },
 collectEvidence:async()=>({}),
 generatePart:async()=>({text:'unused',tokens:0}),
 assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
};
const collectionResult=await runCycle({state:collectionState,adapters:{...collectionAdapters,collectEvidence:async item=>({title:item.name,type:item.type,sourceId:item.type+':'+item.id,overview:'Verified source detail',sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/1'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}],youtubeVideoId:'Abcdef12345',poster:'https://example.com/poster.jpg'}),generatePart:async()=>({text:'first prepared section',tokens:100})},providers,now:now+1000,persist:async()=>{collectionPersisted=true;}});
assert.equal(collectionResult.action,'stage-saved','a future stage checkpoint must not block preparation of another queued article');
assert.equal(Object.keys(collectionState.discoveryBacklog).length,1,'one discovered title should move from backlog into the runnable preparation queue');
assert.ok(collectionState.jobs['series:netflix-series-2026']||collectionState.jobs['movie:netflix-film-2026'],'the next discovered title should be prepared while the earlier draft waits');
assert.ok(collectionPersisted,'the discovered collection must be durably checkpointed');
assert.notEqual(collectionState.jobs['series:existing'].key,collectionState.jobs['movie:netflix-film-2026']?.key,'the paused draft remains saved while another title is prepared');

console.log('VibeCritic Publishing Engine v2 crash-recovery and continuous-cycle tests passed.');
