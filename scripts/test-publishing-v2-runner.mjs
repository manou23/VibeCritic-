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
const firstStage=await runCycle({state,adapters,providers,now:now+1,persist:async()=>{saves++;}});
assert.equal(firstStage.action,'stage-saved');
assert.equal(firstStage.providerCalls,1);
assert.equal(firstStage.stage,1);
assert.equal(firstStage.nextStageAt,now+1+30*60*1000);
const blockedStage=await runCycle({state,adapters,providers,now:now+15*60*1000,persist:async()=>{saves++;}});
assert.equal(blockedStage.action,'stage-waiting','a scheduled run inside the 30-minute slot must not consume another AI request');
assert.equal(blockedStage.providerCalls,0);
assert.equal(aiCalls,1);
const secondStage=await runCycle({state,adapters,providers,now:now+30*60*1000+1,persist:async()=>{saves++;}});
assert.equal(secondStage.action,'stage-saved');
assert.equal(secondStage.providerCalls,1);
assert.equal(secondStage.stage,2);
assert.equal(secondStage.nextStageAt,now+60*60*1000+1);
await assert.rejects(
 runCycle({state,adapters,providers,now:now+60*60*1000+1,persist:async()=>{saves++;}}),
 /simulated interruption/
);
assert.equal(aiCalls,3);
assert.equal(state.jobs['series:1'].status,'quality-check','stage three must be checkpointed before quality validation');
const resumed=await runCycle({state,adapters,providers,now:now+60*60*1000+2,persist:async()=>{saves++;}});
assert.equal(resumed.action,'file-ready');
assert.equal(resumed.providerCalls,0,'recovery from quality-check must not spend another AI request');
assert.equal(aiCalls,3,'recovery must not regenerate the third stage');
assert.equal(fileWrites,1);
assert.equal(state.jobs['series:1'].status,'ready');
const pending=await runCycle({state,adapters,providers,now:now+60*60*1000+3,persist:async()=>{saves++;}});
assert.equal(pending.action,'deployment-pending','a written file is not published until the live URL is verified');
assert.equal(state.jobs['series:1'].status,'ready');
assert.equal(fileWrites,1);
deploymentReady=true;
const final=await runCycle({state,adapters,providers,now:now+60*60*1000+4,persist:async()=>{saves++;}});
assert.equal(final.action,'published');
assert.equal(aiCalls,3);
assert.equal(deployChecks,2);
assert.equal(fileWrites,1,'deployment retries must not rewrite an already committed article');
assert.equal(state.jobs['series:1'].status,'published');
assert.ok(saves>=7);
const afterPublish=await runCycle({state,adapters,providers,now:now+60*60*1000+5,persist:async()=>{saves++;}});
assert.equal(afterPublish.action,'cycle-complete','only one article may be processed per cycle');
assert.equal(afterPublish.key,'series:1');
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
assert.equal(failed.action,'generation-deferred');
assert.equal(failedProviderCalls,1);
assert.equal(failureState.providerCooldowns['rate-limited'].failures,1);
// Simulate an old persisted checkpoint whose retryAt was incorrectly tied to the provider cooldown.
failureState.jobs['movie:cooldown-test'].nextAttemptAt=now+30*60*1000;
assert.ok(failureState.providerCooldowns['rate-limited'].until-now>=2*60*60*1000,'provider cooldown must span the next scheduled checkpoint so fallback providers can be selected');
const fallback=await runCycle({state:failureState,adapters:failureAdapters,providers:failureProviders,now:now+1000,persist:async()=>{}});
assert.equal(fallback.action,'stage-saved','an available free fallback should resume immediately after a provider failure');
assert.equal(fallback.provider,'backup-free');
assert.equal(failedProviderCalls,2,'fallback provider should receive the next single AI call without waiting for the failed provider cooldown');

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
readyState.cycle={startedAt:now,deadlineAt:now+3*60*60*1000,nextStartAt:now+5*60*60*1000,articleKey:'game:ready'};
const readyAdapters={...adapters,isAlreadyPublished:async()=>true,verifyDeployment:async()=>true};
const readyResult=await runCycle({state:readyState,adapters:readyAdapters,providers,now,persist:async()=>{}});
assert.equal(readyResult.action,'published','ready article should proceed to deployment verification despite duplicate lookup matching its own file');
assert.equal(readyState.jobs['game:ready'].status,'published');

// Publishing runs continuously with a 30-minute article cycle and no rest window.
const cycleState=createState();
const cycleAdapters={...adapters,discover:async()=>[]};
const firstCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now,persist:async()=>{}});
assert.equal(firstCycle.action,'no-candidates');
assert.equal(cycleState.cycle.deadlineAt,now+30*60*1000);
assert.equal(cycleState.cycle.nextStartAt,now+30*60*1000);
const midCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+15*60*1000,persist:async()=>{}});
assert.equal(midCycle.action,'no-candidates','the same cycle remains active for its first 30 minutes');
assert.equal(cycleState.cycle.startedAt,now);
const nextCycle=await runCycle({state:cycleState,adapters:cycleAdapters,providers,now:now+30*60*1000,persist:async()=>{}});
assert.equal(nextCycle.action,'no-candidates');
assert.equal(cycleState.cycle.startedAt,now+30*60*1000);
assert.equal(cycleState.cycle.nextStartAt,now+60*60*1000);

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
  {type:'movie',id:'netflix-2026',name:'Netflix 2026 Film',date:'2026-11-16',streamingPlatform:'Netflix',collection:'Netflix 2026',editorialPriority:100}
 ],
 collectEvidence:async item=>({title:item.name,type:item.type,sourceId:item.type+':'+item.id,overview:'Verified synopsis',sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/1'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}],youtubeVideoId:'Abcdef12345',poster:'https://example.com/poster.jpg'}),
 generatePart:async({stage})=>({text:'Netflix queue stage '+stage+' '+text,tokens:100}),
 assembleArticle:async()=>article,publishFile:async()=>({path:'unused'}),verifyDeployment:async()=>false
};
await runCycle({state:netflixPriorityState,adapters:netflixPriorityAdapters,providers,now:now+20000000,persist:async()=>{}});
assert.ok(netflixPriorityState.jobs['movie:netflix-2026'],'Netflix 2026 content must be selected ahead of lower-priority general discovery items');
assert.equal(netflixPriorityState.jobs['movie:netflix-2026'].item.streamingPlatform,'Netflix');
assert.equal(netflixPriorityState.jobs['movie:netflix-2026'].item.collection,'Netflix 2026');

console.log('VibeCritic Publishing Engine v2 crash-recovery and continuous-cycle tests passed.');
