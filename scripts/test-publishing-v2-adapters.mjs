import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY='test-key';
process.env.TMDB_API_KEY='test-tmdb-key';
process.env.RAWG_API_KEY='test-rawg-key';
process.env.GEMINI_MODEL='gemini-2.5-flash';
process.env.CLOUDFLARE_API_TOKEN='test-token';
process.env.CLOUDFLARE_ACCOUNT_ID='test-account';
process.env.CLOUDFLARE_FREE_TIER_ONLY='true';
process.env.GROQ_API_KEY='test-key';
process.env.GROQ_FREE_TIER_ONLY='true';
process.env.OPENROUTER_API_KEY='test-key';
const {buildFreeProviders,createPublishingAdapters}=await import('./publishing-v2/adapters.mjs?adapter-test');
// Keep the free-provider routing policy covered by the production reliability gate.
const providers=buildFreeProviders();
assert.deepEqual(providers.map(x=>x.id),['gemini','cloudflare','groq','openrouter']);
assert.equal(providers[1].dailyRequestLimit,3,'Cloudflare must remain below the published free Neurons allocation');
assert.equal(providers[1].dailyTokenLimit,9000);
assert.equal(providers[2].model,'openai/gpt-oss-120b','Groq must use a currently listed production model');
assert.equal(providers[2].dailyRequestLimit,50,'Groq budget must stay below the documented free-tier daily request allowance');
assert.equal(providers[2].dailyTokenLimit,100000,'Groq token budget must stay below the documented daily token allowance');
assert.equal(providers[3].dailyRequestLimit,40,'OpenRouter free-model budget must stay below its 50 requests/day cap');
assert.equal(providers[3].dailyTokenLimit,40000);
assert.equal(providers[1].model,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');
assert.equal(providers[3].model,'nvidia/nemotron-3.5-super-vl:free');
assert.ok(providers.every(x=>x.free===true));
assert.deepEqual(providers.map(x=>x.enabled),[false,false,true,true],'unstable Gemini and Cloudflare routes stay quarantined unless explicitly re-enabled');
assert.deepEqual(providers.map(x=>x.priority),[3,4,1,2],'reliable Groq and OpenRouter routes must be preferred by the publisher');
process.env.GEMINI_PROVIDER_ENABLED='true';process.env.CLOUDFLARE_PROVIDER_ENABLED='true';
const optInProviders=buildFreeProviders();
assert.ok(optInProviders.filter(x=>x.id==='gemini'||x.id==='cloudflare').every(x=>x.enabled===true),'quarantined providers can be re-enabled explicitly after verification');
delete process.env.GEMINI_PROVIDER_ENABLED;delete process.env.CLOUDFLARE_PROVIDER_ENABLED;
assert.equal(providers[0].model,'gemini-3.8-flash','retired Gemini default must be upgraded to the currently recommended model');
assert.ok(!providers.some(x=>x.id==='openai'),'paid OpenAI must never enter the V2 free provider pool');
const review=Array.from({length:25},()=> 'تحليل نقدي موثق يشرح تفاصيل العمل وحدود الأدلة المتاحة').join(' ');
const shortPayload={review:Array.from({length:8},()=> 'مراجعة قصيرة لا تبلغ الحد المطلوب للكلمات').join(' '),scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const adequatePayload={review:Array.from({length:18},()=> 'تحليل نقدي موثق يشرح تفاصيل العمل وحدود الأدلة المتاحة').join(' '),scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const payload={review,scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const originalFetch=globalThis.fetch;let calls=0,mode='gemini',groqShortOnce=false,groqShortTwice=0,groqInvalidScoreOnce=false;
globalThis.fetch=async(url,options)=>{
 calls++;
 const parsedUrl=new URL(String(url));
 if(mode==='deployment-check'||mode==='deployment-404')return new Response('<html><title>What We Do in the Shadows</title></html>',{status:mode==='deployment-check'?200:404,headers:{'content-type':'text/html'}});
 if(mode==='discover-expansion'){
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/trending/all/week')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/movie/popular')return new Response(JSON.stringify({results:[{id:101,title:'Popular Movie',overview:'A detailed premise for the popular movie discovery test.',release_date:'2020-01-01',poster_path:'/movie.jpg',backdrop_path:'/movie-backdrop.jpg',vote_count:1000}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/tv/popular')return new Response(JSON.stringify({results:[{id:202,name:'Popular Series',overview:'A detailed premise for the popular series discovery test.',first_air_date:'2020-01-01',poster_path:'/series.jpg',backdrop_path:'/series-backdrop.jpg',vote_count:900}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/search/company'){
   assert.equal(parsedUrl.searchParams.get('query'),'Netflix');
   return new Response(JSON.stringify({results:[{id:178464,name:'Netflix'},{id:12345,name:'Netflix Animation'}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/discover/movie'){
   assert.equal(parsedUrl.searchParams.get('primary_release_date.gte'),'2026-01-01');
   if(parsedUrl.searchParams.get('with_companies')==='178464|12345'){
    assert.equal(parsedUrl.searchParams.get('primary_release_date.lte'),'2026-12-31');
    return new Response(JSON.stringify({results:parsedUrl.searchParams.get('page')==='1'?[{id:303,title:'Netflix 2026 Film',overview:'A detailed Netflix 2026 film synopsis for discovery.',release_date:'2026-02-10',poster_path:'/netflix-film.jpg',backdrop_path:'/netflix-film-backdrop.jpg',vote_count:250},{id:909,title:'Netflix Future 2026 Film',overview:'A forthcoming Netflix 2026 film synopsis for the release watchlist.',release_date:'2026-11-25',poster_path:'/netflix-future-film.jpg',backdrop_path:'/netflix-future-film-backdrop.jpg',vote_count:100}]:[]}),{status:200,headers:{'content-type':'application/json'}});
   }
   assert.ok(parsedUrl.searchParams.get('primary_release_date.lte'));
   assert.equal(parsedUrl.searchParams.get('with_watch_providers'),'8');
   if(parsedUrl.searchParams.get('watch_region')==='DZ')return new Response(JSON.stringify({results:parsedUrl.searchParams.get('page')==='1'?[{id:606,title:'Netflix Licensed 2026 Film',overview:'A detailed synopsis for a 2026 film currently streaming on Netflix Algeria.',release_date:'2026-04-10',poster_path:'/licensed-film.jpg',backdrop_path:'/licensed-film-backdrop.jpg',vote_count:150}]:[]}),{status:200,headers:{'content-type':'application/json'}});
   assert.equal(parsedUrl.searchParams.get('watch_region'),'US');
   return new Response(JSON.stringify({results:parsedUrl.searchParams.get('page')==='1'?[{id:808,title:'Netflix US 2026 Film',overview:'A detailed synopsis for a 2026 film streaming on Netflix US.',release_date:'2026-05-15',poster_path:'/us-film.jpg',backdrop_path:'/us-film-backdrop.jpg',vote_count:120}]:[]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/discover/tv'){
   assert.equal(parsedUrl.searchParams.get('air_date.gte'),'2026-01-01');
   assert.ok(parsedUrl.searchParams.get('air_date.lte'));
   if(parsedUrl.searchParams.get('with_networks')==='213')return new Response(JSON.stringify({results:parsedUrl.searchParams.get('page')==='1'?[{id:404,name:'Netflix 2026 Series',overview:'A detailed Netflix 2026 series synopsis for discovery.',first_air_date:'2016-07-15',poster_path:'/netflix-series.jpg',backdrop_path:'/netflix-series-backdrop.jpg',vote_count:400}]:[]}),{status:200,headers:{'content-type':'application/json'}});
   assert.equal(parsedUrl.searchParams.get('with_watch_providers'),'8');
   assert.equal(parsedUrl.searchParams.get('watch_region'),'DZ');
   return new Response(JSON.stringify({results:parsedUrl.searchParams.get('page')==='1'?[{id:707,name:'Netflix Licensed 2026 Series',overview:'A detailed synopsis for a 2026 series currently streaming on Netflix Algeria.',first_air_date:'2019-01-01',poster_path:'/licensed-series.jpg',backdrop_path:'/licensed-series-backdrop.jpg',vote_count:200}]:[]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(parsedUrl.hostname==='api.rawg.io')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected discovery URL: '+String(url));
 }
 if(mode==='wikidata-evidence'){
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({title:'Evidence Recovery Film',original_title:'Evidence Recovery Film',overview:'A detailed and verified synopsis for the evidence recovery film, describing its central premise, principal characters, setting, and conflict with enough context for critical analysis.',release_date:'2020-01-01',poster_path:null,backdrop_path:'/recovery-backdrop.jpg',genres:[{name:'Drama'}],credits:{cast:[],crew:[]},videos:{results:[]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{search:[]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname.startsWith('/api/rest_v1/page/summary/'))return new Response('not found',{status:404});
  if(parsedUrl.hostname==='www.wikidata.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({search:[{id:'Q12345',label:'Evidence Recovery Film',description:'2020 drama film about a family facing a difficult decision',aliases:[]}]}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected Wikidata recovery URL: '+String(url));
 }
 if(mode==='wikidata-unrelated-evidence'){
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({title:'The Beast',original_title:'The Beast',overview:'A sufficiently detailed verified synopsis for the upcoming action film, describing its premise, characters, setting, and central conflict with enough context for analysis.',release_date:'2026-10-08',poster_path:'/beast.jpg',backdrop_path:'/beast-backdrop.jpg',genres:[{name:'Action'}],credits:{cast:[],crew:[]},videos:{results:[]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{search:[]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname.startsWith('/api/rest_v1/page/summary/'))return new Response('not found',{status:404});
  if(parsedUrl.hostname==='www.wikidata.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({search:[{id:'Q1781715',label:'The Beast',description:'album by Polish death metal band Vader',aliases:[]}]}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected unrelated Wikidata URL: '+String(url));
 }
 if(mode==='game-video-fallback'){
  if(parsedUrl.hostname==='api.rawg.io'&&parsedUrl.pathname==='/api/games/99')return new Response(JSON.stringify({name:'Game With Clip',description_raw:'A verified and sufficiently detailed game description that explains its setting, premise, and gameplay systems for the adapter test.',released:'2020-01-01',background_image:'https://media.rawg.io/media/game-poster.jpg',clip:{clip:'https://media.rawg.io/media/game-trailer.mp4'},genres:[{name:'Action'}],platforms:[{platform:{name:'PC'}}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.rawg.io'&&parsedUrl.pathname==='/api/games/99/movies')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php'&&parsedUrl.searchParams.get('list')==='search')return new Response(JSON.stringify({query:{search:[{title:'Game With Clip'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{pages:{1:{extract:Array.from({length:25},()=> 'Independent encyclopedia information describes the game and its development history in factual detail.').join(' ')}}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected game clip URL: '+String(url));
 }
 if(mode==='netflix-licensed-movie-evidence'){
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/movie/606/watch/providers')return new Response(JSON.stringify({results:{DZ:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({title:'Netflix Licensed 2026 Film',original_title:'Netflix Licensed 2026 Film',overview:'A detailed factual synopsis of this 2026 film, including its premise, setting, principal characters, and central conflict, with enough detail for critical review.',release_date:'2026-04-10',poster_path:'/licensed-film.jpg',backdrop_path:'/licensed-film-backdrop.jpg',production_companies:[{id:999,name:'Independent Studio'}],genres:[{name:'Drama'}],credits:{cast:[],crew:[]},videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'Abcdef12345',name:'Official Trailer'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php'&&parsedUrl.searchParams.get('list')==='search')return new Response(JSON.stringify({query:{search:[{title:'Netflix Licensed 2026 Film'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{pages:{1:{extract:Array.from({length:30},()=> 'Independent reference information describes the film and its production in factual detail.').join(' ')}}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected Netflix licensed movie evidence URL: '+String(url));
 }
 if(mode==='netflix-series-evidence'){
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/tv/505/season/4/videos')return new Response(JSON.stringify({results:[{site:'YouTube',type:'Trailer',official:true,key:'Seas0n12345',name:'Official Season 4 Trailer'}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({name:'Netflix Returning Series',original_name:'Netflix Returning Series',overview:'A detailed factual synopsis of the Netflix returning series, its setting, characters, and main conflict, long enough to support an independent critical review.',first_air_date:'2016-07-15',release_date:'',poster_path:'/netflix-series-poster.jpg',backdrop_path:'/netflix-series-backdrop.jpg',networks:[{id:213,name:'Netflix'}],seasons:[{season_number:1,air_date:'2016-07-15'},{season_number:4,air_date:'2026-02-01'}],genres:[{name:'Drama'}],credits:{cast:[{name:'Lead Actor'}],crew:[{name:'Creator',job:'Creator'}]},videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'Abcdef12345',name:'Official Season Trailer'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php'&&parsedUrl.searchParams.get('list')==='search')return new Response(JSON.stringify({query:{search:[{title:'Netflix Returning Series'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{pages:{1:{extract:Array.from({length:30},()=> 'Independent reference details the series production and narrative history using factual information.').join(' ')}}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected Netflix series evidence URL: '+String(url));
 }
 if(mode==='evidence-fallback'){
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({title:'Test Film',original_title:'Test Film',overview:'A sufficiently detailed verified overview for this test film, describing its premise, characters, setting, and central conflict in a factual way.',release_date:'2020-01-01',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',genres:[{name:'Drama'}],credits:{cast:[{name:'Actor One'}],crew:[{name:'Director One',job:'Director'}]},videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'Abcdef12345',name:'Official Trailer'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response('rate limited',{status:429});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname.startsWith('/api/rest_v1/page/summary/'))return new Response(JSON.stringify({title:'Test Film',extract:Array.from({length:30},()=> 'An independent encyclopedia summary describes the film and its production in factual detail.').join(' '),content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/Test_Film'}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected evidence fallback URL: '+String(url));
 }
 const body=JSON.parse(options.body);
 if(mode==='gemini'||mode==='gemini-adequate'){
  assert.match(String(url),/generativelanguage\.googleapis\.com/);
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.match(body.contents[0].parts[0].text,/9 أو أكثر إلا لاستثنائية واضحة/,'ratings must use calibrated, non-inflated score bands');
  assert.match(body.contents[0].parts[0].text,/210 إلى 240 كلمة عربية فعلية/,'each section must target enough words to meet the full article minimum');
  assert.match(body.contents[0].parts[0].text,/لا ترفع الدرجة لمجرد شهرة Netflix/,'Netflix brand must not inflate critical scores');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(mode==='gemini-adequate'?adequatePayload:payload)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(mode==='groq'||mode==='groq-retry'||mode==='groq-expand-retry'||mode==='groq-invalid-score'){
  assert.match(String(url),/api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(body.model,'openai/gpt-oss-120b');
  assert.equal(Object.hasOwn(body,'reasoning'),false,'Groq API does not accept OpenRouter reasoning options');
  assert.equal(body.max_completion_tokens,6144,'Groq GPT-OSS needs an explicit completion-token budget');
  assert.equal(body.max_tokens,undefined,'use Groq max_completion_tokens instead of deprecated max_tokens');
  assert.equal(body.reasoning_effort,'low','bound GPT-OSS reasoning tokens so JSON has room to complete');
  assert.equal(body.response_format.type,'json_object','Groq uses flexible JSON mode so invalid score values can be caught locally and routed to a fallback provider');
  assert.equal(body.response_format.json_schema,undefined,'do not let Groq reject an otherwise usable response before local validation');
  assert.ok(body.messages[0].content.includes('ولا تستخدم null'),'Groq prompt must require numeric score values');
  assert.ok(body.messages[1].content.includes('210 إلى 240 كلمة عربية فعلية'),'Groq must receive the same complete-section length target');
  assert.equal(body.include_reasoning,false,'do not include internal reasoning in the JSON response');
  assert.equal(options.headers.authorization,'Bearer test-key');
  if(mode==='groq-retry'&&groqShortOnce){groqShortOnce=false;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(shortPayload)},finish_reason:'stop'}],usage:{total_tokens:123}}),{status:200,headers:{'content-type':'application/json'}});}
  if(mode==='groq-expand-retry'&&groqShortTwice>0){groqShortTwice--;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(shortPayload)},finish_reason:'stop'}],usage:{total_tokens:123}}),{status:200,headers:{'content-type':'application/json'}});}
  if(mode==='groq-invalid-score'&&groqInvalidScoreOnce){groqInvalidScoreOnce=false;const invalid={...payload,scores:{...payload.scores,story:null}};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invalid)},finish_reason:'stop'}],usage:{total_tokens:111}}),{status:200,headers:{'content-type':'application/json'}});}
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)},finish_reason:'stop'}],usage:{total_tokens:321}}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(mode==='cloudflare'){
  assert.match(String(url),/accounts\/test-account\/ai\/run\/@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast$/);
  assert.equal(options.headers.authorization,'Bearer test-token');
  assert.equal(body.response_format.type,'json_object');
  return new Response(JSON.stringify({success:true,result:{response:JSON.stringify(payload)},usage:{total_tokens:123}}),{status:200,headers:{'content-type':'application/json'}});
 }
 assert.match(String(url),/openrouter\.ai\/api\/v1\/chat\/completions/);
 assert.deepEqual(body.models,['nvidia/nemotron-3.5-super-vl:free','google/gemma-4-26b-a4b-it:free']);
 assert.equal(body.reasoning.enabled,false,'reasoning must not consume the whole article-section output budget');
 assert.equal(body.response_format.type,'json_object');
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)},finish_reason:'stop'}],usage:{total_tokens:456}}),{status:200,headers:{'content-type':'application/json'}});
};
try{
 const adapters=createPublishingAdapters();
 mode='discover-expansion';
 const expanded=await adapters.discover();
 assert.ok(expanded.some(x=>x.type==='movie'&&x.id==='101'),'popular movies must remain discoverable when trending results are exhausted');
 assert.ok(expanded.some(x=>x.type==='series'&&x.id==='202'),'popular series must remain discoverable when trending results are exhausted');
 assert.ok(expanded.some(x=>x.type==='movie'&&x.id==='303'&&x.streamingPlatform==='Netflix'&&x.collection==='Netflix 2026'),'released Netflix 2026 films must enter the editorial queue');
 assert.deepEqual(expanded.find(x=>x.id==='303').netflixCompanyIds,[178464,12345],'Netflix-owned animation and subsidiary studios must be included in original film discovery');
 assert.ok(expanded.some(x=>x.id==='909'&&x.date==='2026-11-25'),'upcoming 2026 Netflix Originals must be collected now without being published early');
 assert.ok(expanded.some(x=>x.type==='series'&&x.id==='404'&&x.streamingPlatform==='Netflix'&&x.collection==='Netflix 2026'),'released Netflix 2026 series must enter the editorial queue');
 assert.ok(expanded.findIndex(x=>x.id==='303')<expanded.findIndex(x=>x.id==='101'),'Netflix 2026 titles must be prioritized ahead of generic popular titles');
 assert.ok(expanded.some(x=>x.type==='movie'&&x.id==='606'&&x.netflixOriginal===false&&x.streamingRegion==='DZ'),'2026 titles currently streaming on Netflix Algeria must also enter the collection');
 assert.ok(expanded.some(x=>x.type==='series'&&x.id==='707'&&x.netflixOriginal===false&&x.streamingRegion==='DZ'),'2026 series airing on Netflix Algeria must also enter the collection');
 assert.ok(expanded.some(x=>x.type==='movie'&&x.id==='808'&&x.netflixOriginal===false&&x.streamingRegion==='US'),'global Netflix 2026 films unavailable in the Algeria provider feed must be retained with their actual US region');
 mode='game-video-fallback';
 const gameEvidence=await adapters.collectEvidence({type:'game',id:'99',name:'Game With Clip',date:'2020-01-01',overview:'A verified and sufficiently detailed game description that explains its setting, premise, and gameplay systems for the adapter test.',sourceName:'RAWG',sourceUrl:'https://rawg.io/games/game-with-clip',poster:'https://media.rawg.io/media/game-poster.jpg',backdrop:'https://media.rawg.io/media/game-poster.jpg'});
 assert.equal(gameEvidence.externalVideoUrl,'https://media.rawg.io/media/game-trailer.mp4','RAWG detail-page clips should be accepted when the movies endpoint is empty');
 mode='wikidata-evidence';
 const wikidataRecovered=await adapters.collectEvidence({type:'movie',id:'777',name:'Evidence Recovery Film',date:'2020-01-01',overview:'Short synopsis',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/777',poster:'',backdrop:''});
 assert.equal(wikidataRecovered.sources[1].name,'Wikidata','Wikidata must be used when no matching Wikipedia article is available');
 assert.equal(wikidataRecovered.sources[1].url,'https://www.wikidata.org/wiki/Q12345');
 assert.equal(wikidataRecovered.youtubeVideoId,'','a missing trailer must not block evidence-backed review generation');
 assert.equal(wikidataRecovered.poster,'https://image.tmdb.org/t/p/w1280/recovery-backdrop.jpg','a verified backdrop may replace a missing poster');
 assert.ok(wikidataRecovered.overview.length>80,'the adapter must choose the richer detail-page synopsis over a short discovery snippet');
 mode='wikidata-unrelated-evidence';
 await assert.rejects(
  adapters.collectEvidence({type:'movie',id:'1185344',name:'The Beast',date:'2026-10-08',overview:'A sufficiently detailed verified synopsis for the upcoming action film, describing its premise, characters, setting, and central conflict with enough context for analysis.',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/1185344',poster:'',backdrop:''}),
  /No sufficiently matching independent movie reference/,
  'an unrelated Wikidata album with the same title must never be accepted as evidence for a film'
 );
 mode='netflix-licensed-movie-evidence';
 const licensedMovieEvidence=await adapters.collectEvidence({type:'movie',id:'606',name:'Netflix Licensed 2026 Film',date:'2026-04-10',overview:'A detailed factual synopsis of this 2026 film, including its premise, setting, principal characters, and central conflict, with enough detail for critical review.',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/606',poster:'https://image.tmdb.org/t/p/w780/licensed-film.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/licensed-film-backdrop.jpg',streamingPlatform:'Netflix',collection:'Netflix 2026',netflixOriginal:false,streamingRegion:'DZ'});
 assert.equal(licensedMovieEvidence.releaseDate,'2026-04-10');
 assert.equal(licensedMovieEvidence.netflixOriginal,false);
 assert.equal(licensedMovieEvidence.streamingRegion,'DZ','licensed titles must keep the region where Netflix availability was verified');
 mode='netflix-series-evidence';
 const netflixSeriesEvidence=await adapters.collectEvidence({type:'series',id:'505',name:'Netflix Returning Series',date:'2016-07-15',overview:'A detailed factual synopsis of the Netflix returning series, its setting, characters, and main conflict, long enough to support an independent critical review.',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/tv/505',poster:'https://image.tmdb.org/t/p/w780/netflix-series-poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/netflix-series-backdrop.jpg',streamingPlatform:'Netflix',collection:'Netflix 2026',netflixOriginal:true});
 assert.equal(netflixSeriesEvidence.releaseDate,'2026-02-01','returning Netflix series must use the 2026 season release date, not its original premiere date');
 assert.equal(netflixSeriesEvidence.streamingPlatform,'Netflix');
 assert.equal(netflixSeriesEvidence.collection,'Netflix 2026');
 assert.equal(netflixSeriesEvidence.youtubeVideoId,'Seas0n12345','use the verified season-specific trailer when TMDB provides one');
 mode='evidence-fallback';
 const recoveredEvidence=await adapters.collectEvidence({type:'movie',id:'77',name:'Test Film',date:'2020-01-01',overview:'A sufficiently detailed verified overview for this test film, describing its premise, characters, setting, and central conflict in a factual way.',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/77',poster:'https://image.tmdb.org/t/p/w780/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg'});
 assert.equal(recoveredEvidence.sources[1].name,'Wikipedia');
 assert.ok(recoveredEvidence.sources[1].extract.length>=180,'REST fallback must provide enough independent source detail to pass the evidence gate');
 assert.equal(recoveredEvidence.sources[1].url,'https://en.wikipedia.org/wiki/Test_Film');
 assert.equal(recoveredEvidence.youtubeVideoId,'Abcdef12345');
 mode='gemini';calls=0;
 assert.equal(await adapters.isAlreadyPublished({type:'game',id:'28',name:'Red Dead Redemption 2'}),true,'manual Arabic-title reviews must match their originalTitle and RAWG source ID');
 assert.equal(await adapters.isAlreadyPublished({type:'game',id:'999999',name:'Unpublished test game'}),false,'unpublished titles must remain eligible');
 const generated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[0],stage:1});
 assert.equal(calls,1,'exactly one provider request per stage');
 assert.ok(JSON.parse(generated.text).review);
 mode='groq';
 const groqGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.ok(JSON.parse(groqGenerated.text).review);
 assert.equal(groqGenerated.tokens,321);
 assert.equal(calls,2,'Groq uses one compatible API request per stage');
 mode='gemini-adequate';const beforeAdequate=calls;
 const adequateGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'76'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/76',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[0],stage:1});
 assert.equal(calls-beforeAdequate,1,'a section meeting the site validator 150-word minimum must not be needlessly rejected and retried');
 assert.ok(JSON.parse(adequateGenerated.text).review);
 mode='groq-retry';groqShortOnce=true;const beforeGroqRetry=calls;
 const groqRetried=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.equal(calls-beforeGroqRetry,2,'a short Groq section is retried exactly once');
 assert.equal(groqRetried.requests,2,'both Groq requests are reported for quota accounting');
 assert.equal(groqRetried.tokens,444,'token usage includes the rejected and successful Groq attempts');
 mode='groq-invalid-score';groqInvalidScoreOnce=true;const beforeScoreRepair=calls;
 const scoreRepaired=await adapters.generatePart({job:{item:{type:'movie',id:'78'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/78',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.equal(calls-beforeScoreRepair,2,'invalid numeric scores are repaired with one same-provider retry before fallback');
 assert.equal(scoreRepaired.requests,2,'invalid-score retry requests are fully counted against the free quota');
 assert.equal(JSON.parse(scoreRepaired.text).scores.story,7.2,'score repair must return a numeric score');
 mode='groq-expand-retry';groqShortTwice=2;const beforeExpansion=calls;
 const expandedRetry=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.equal(calls-beforeExpansion,3,'if the same free provider returns a short section twice, a third evidence-bound expansion attempt runs before provider fallback');
 assert.equal(expandedRetry.requests,3,'all three same-provider requests are counted against the free quota');
 assert.equal(expandedRetry.tokens,567,'all three attempts contribute to token accounting');
 assert.ok(JSON.parse(expandedRetry.text).review.length>0);
 mode='cloudflare';const beforeCloudflare=calls;
 const cloudflareGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[1],stage:1});
 assert.ok(JSON.parse(cloudflareGenerated.text).review);
 assert.equal(cloudflareGenerated.tokens,123);
 assert.equal(calls-beforeCloudflare,1,'Cloudflare uses one request per invocation');
 mode='openrouter';const beforeOpenRouter=calls;
 const openrouterGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[3],stage:1});
 assert.ok(JSON.parse(openrouterGenerated.text).review);
 assert.equal(openrouterGenerated.tokens,456);
 assert.equal(calls-beforeOpenRouter,1,'OpenRouter uses one request per invocation');
 const stage3={review,scores:{story:8,visuals:7,sound:6,pacing:9},pros:['قوة سردية موثقة','تصميم متماسك','أداء مناسب'],cons:['معلومات فنية ناقصة','إيقاع غير متوازن'],verdict:'حكم نقدي واضح يستند إلى المصادر ولا يدعي تجربة مباشرة.'};
 const job={item:{id:'77'},evidence:{title:'فيلم تجريبي',originalTitle:'',type:'movie',sourceId:'movie:77',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/77',overview:'وصف موثق',releaseDate:'2026',poster:'https://image.tmdb.org/t/p/w780/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg',genres:['دراما'],platforms:[],cast:[],crew:[],streamingPlatform:'Netflix',collection:'Netflix 2026',youtubeVideoId:'UnA7tepsc7s',youtubeVideoTitle:'المقطع الرسمي',sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}]},parts:[{text:JSON.stringify(payload)},{text:JSON.stringify(payload)},{text:JSON.stringify(stage3)}]};
 const article=await adapters.assembleArticle(job);
 assert.equal(article.score,7.6);
 assert.equal(article.sourceId,'movie:77');
 assert.equal(article.pros.length,3);
 assert.equal(article.cons.length,2);
 assert.ok(article.body.startsWith('## القصة والشخصيات والبناء\n\n'),'generated reviews must use the established Markdown section layout');
 const advanceJob={...job,evidence:{...job.evidence,releaseDate:'2027-01-15'}};
 const advanceArticle=await adapters.assembleArticle(advanceJob);
 assert.equal(advanceArticle.reviewMode,'preview','future releases must be explicitly marked as advance-reading previews');
 assert.equal(advanceArticle.isAdvanceReading,true);
 assert.ok(advanceArticle.headline.startsWith('قراءة استباقية:'),'upcoming titles must have an advance-reading headline');
 assert.ok(advanceArticle.body.startsWith('> **قراءة استباقية:**'),'the article body must visibly disclose that the work has not released yet');
 assert.ok(advanceArticle.body.includes('تقديرية ومؤقتة'),'pre-release scores must be labeled provisional');

 assert.ok(article.body.includes(review),'all generated review sections must be retained');
 assert.ok(article.body.includes('## التقييم النقدي وحدود العمل'),'the final section must have a clear editorial heading');
 assert.equal(article.youtubeVideoId,'UnA7tepsc7s','verified trailer metadata must be carried into the article');
 assert.equal(article.youtubeVideoTitle,'المقطع الرسمي');
 assert.equal(article.streamingPlatform,'Netflix','Netflix platform label must survive article assembly');
 assert.equal(article.collection,'Netflix 2026','Netflix editorial collection label must survive article assembly');
 assert.ok(article.tags.includes('Netflix')&&article.tags.includes('Netflix 2026'),'Netflix reviews must carry searchable collection tags');
 assert.ok(article.body.includes('https://en.wikipedia.org/wiki/Test'),'independent source links must be visible');
 mode='deployment-check';
 assert.equal(await adapters.verifyDeployment({article:{title:'What We Do in the Shadows',youtubeVideoId:'3_jTVuExbAo'},articlePath:'src/content/reviews/series-what-we-do-in-the-shadows-83631.md'}),true,'a live article with HTTP 200 and its title must verify even when optional badge and video markers are not server-rendered');
 mode='deployment-404';
 assert.equal(await adapters.verifyDeployment({article:{title:'What We Do in the Shadows',youtubeVideoId:'3_jTVuExbAo'},articlePath:'src/content/reviews/series-what-we-do-in-the-shadows-83631.md'}),false,'a missing live article must remain pending');
}finally{globalThis.fetch=originalFetch;}
console.log('VibeCritic V2 adapter contract tests passed.');
