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
assert.ok(providers.every(x=>x.free===true&&x.enabled===true));
assert.equal(providers[0].model,'gemini-3.8-flash','retired Gemini default must be upgraded to the currently recommended model');
assert.ok(!providers.some(x=>x.id==='openai'),'paid OpenAI must never enter the V2 free provider pool');
const review=Array.from({length:25},()=> 'تحليل نقدي موثق يشرح تفاصيل العمل وحدود الأدلة المتاحة').join(' ');
const shortPayload={review:Array.from({length:8},()=> 'مراجعة قصيرة لا تبلغ الحد المطلوب للكلمات').join(' '),scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const payload={review,scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const originalFetch=globalThis.fetch;let calls=0,mode='gemini',groqShortOnce=false;
globalThis.fetch=async(url,options)=>{
 calls++;
 const parsedUrl=new URL(String(url));
 if(mode==='discover-expansion'){
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/trending/all/week')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/movie/popular')return new Response(JSON.stringify({results:[{id:101,title:'Popular Movie',overview:'A detailed premise for the popular movie discovery test.',release_date:'2020-01-01',poster_path:'/movie.jpg',backdrop_path:'/movie-backdrop.jpg',vote_count:1000}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.themoviedb.org'&&parsedUrl.pathname==='/3/tv/popular')return new Response(JSON.stringify({results:[{id:202,name:'Popular Series',overview:'A detailed premise for the popular series discovery test.',first_air_date:'2020-01-01',poster_path:'/series.jpg',backdrop_path:'/series-backdrop.jpg',vote_count:900}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.rawg.io')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected discovery URL: '+String(url));
 }
 if(mode==='game-video-fallback'){
  if(parsedUrl.hostname==='api.rawg.io'&&parsedUrl.pathname==='/api/games/99')return new Response(JSON.stringify({name:'Game With Clip',description_raw:'A verified and sufficiently detailed game description that explains its setting, premise, and gameplay systems for the adapter test.',released:'2020-01-01',background_image:'https://media.rawg.io/media/game-poster.jpg',clip:{clip:'https://media.rawg.io/media/game-trailer.mp4'},genres:[{name:'Action'}],platforms:[{platform:{name:'PC'}}]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='api.rawg.io'&&parsedUrl.pathname==='/api/games/99/movies')return new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php'&&parsedUrl.searchParams.get('list')==='search')return new Response(JSON.stringify({query:{search:[{title:'Game With Clip'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response(JSON.stringify({query:{pages:{1:{extract:Array.from({length:25},()=> 'Independent encyclopedia information describes the game and its development history in factual detail.').join(' ')}}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected game clip URL: '+String(url));
 }
 if(mode==='evidence-fallback'){
  if(parsedUrl.hostname==='api.themoviedb.org')return new Response(JSON.stringify({title:'Test Film',original_title:'Test Film',overview:'A sufficiently detailed verified overview for this test film, describing its premise, characters, setting, and central conflict in a factual way.',release_date:'2020-01-01',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',genres:[{name:'Drama'}],credits:{cast:[{name:'Actor One'}],crew:[{name:'Director One',job:'Director'}]},videos:{results:[{site:'YouTube',type:'Trailer',official:true,key:'Abcdef12345',name:'Official Trailer'}]}}),{status:200,headers:{'content-type':'application/json'}});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname==='/w/api.php')return new Response('rate limited',{status:429});
  if(parsedUrl.hostname==='en.wikipedia.org'&&parsedUrl.pathname.startsWith('/api/rest_v1/page/summary/'))return new Response(JSON.stringify({title:'Test Film',extract:Array.from({length:30},()=> 'An independent encyclopedia summary describes the film and its production in factual detail.').join(' '),content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/Test_Film'}}}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected evidence fallback URL: '+String(url));
 }
 const body=JSON.parse(options.body);
 if(mode==='gemini'){
  assert.match(String(url),/generativelanguage\.googleapis\.com/);
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(mode==='groq'||mode==='groq-retry'){
  assert.match(String(url),/api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(body.model,'openai/gpt-oss-120b');
  assert.equal(Object.hasOwn(body,'reasoning'),false,'Groq API does not accept OpenRouter reasoning options');
  assert.equal(body.max_completion_tokens,4096,'Groq GPT-OSS needs an explicit completion-token budget');
  assert.equal(body.max_tokens,undefined,'use Groq max_completion_tokens instead of deprecated max_tokens');
  assert.equal(body.reasoning_effort,'low','bound GPT-OSS reasoning tokens so JSON has room to complete');
  assert.equal(body.response_format.type,'json_schema','Groq must use strict structured JSON output');
  assert.equal(body.response_format.json_schema.strict,true);
  assert.deepEqual(body.response_format.json_schema.schema.required,['review','scores','pros','cons','verdict']);
  assert.equal(body.include_reasoning,false,'do not include internal reasoning in the JSON response');
  assert.equal(options.headers.authorization,'Bearer test-key');
  if(mode==='groq-retry'&&groqShortOnce){groqShortOnce=false;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(shortPayload)},finish_reason:'stop'}],usage:{total_tokens:123}}),{status:200,headers:{'content-type':'application/json'}});}
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
 mode='game-video-fallback';
 const gameEvidence=await adapters.collectEvidence({type:'game',id:'99',name:'Game With Clip',date:'2020-01-01',overview:'A verified and sufficiently detailed game description that explains its setting, premise, and gameplay systems for the adapter test.',sourceName:'RAWG',sourceUrl:'https://rawg.io/games/game-with-clip',poster:'https://media.rawg.io/media/game-poster.jpg',backdrop:'https://media.rawg.io/media/game-poster.jpg'});
 assert.equal(gameEvidence.externalVideoUrl,'https://media.rawg.io/media/game-trailer.mp4','RAWG detail-page clips should be accepted when the movies endpoint is empty');
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
 mode='groq-retry';groqShortOnce=true;const beforeGroqRetry=calls;
 const groqRetried=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.equal(calls-beforeGroqRetry,2,'a short Groq section is retried exactly once');
 assert.equal(groqRetried.requests,2,'both Groq requests are reported for quota accounting');
 assert.equal(groqRetried.tokens,444,'token usage includes the rejected and successful Groq attempts');
 mode='cloudflare';
 const cloudflareGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[1],stage:1});
 assert.ok(JSON.parse(cloudflareGenerated.text).review);
 assert.equal(cloudflareGenerated.tokens,123);
 assert.equal(calls,5,'one request per Cloudflare adapter invocation after Groq retry');
 mode='openrouter';
 const openrouterGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[3],stage:1});
 assert.ok(JSON.parse(openrouterGenerated.text).review);
 assert.equal(openrouterGenerated.tokens,456);
 assert.equal(calls,6,'one request per OpenRouter adapter invocation after Groq retry');
 const stage3={review,scores:{story:8,visuals:7,sound:6,pacing:9},pros:['قوة سردية موثقة','تصميم متماسك','أداء مناسب'],cons:['معلومات فنية ناقصة','إيقاع غير متوازن'],verdict:'حكم نقدي واضح يستند إلى المصادر ولا يدعي تجربة مباشرة.'};
 const job={item:{id:'77'},evidence:{title:'فيلم تجريبي',originalTitle:'',type:'movie',sourceId:'movie:77',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/77',overview:'وصف موثق',releaseDate:'2026',poster:'https://image.tmdb.org/t/p/w780/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg',genres:['دراما'],platforms:[],cast:[],crew:[],youtubeVideoId:'UnA7tepsc7s',youtubeVideoTitle:'المقطع الرسمي',sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}]},parts:[{text:JSON.stringify(payload)},{text:JSON.stringify(payload)},{text:JSON.stringify(stage3)}]};
 const article=await adapters.assembleArticle(job);
 assert.equal(article.score,7.6);
 assert.equal(article.sourceId,'movie:77');
 assert.equal(article.pros.length,3);
 assert.equal(article.cons.length,2);
 assert.ok(article.body.startsWith('## القصة والشخصيات والبناء\n\n'),'generated reviews must use the established Markdown section layout');
 assert.ok(article.body.includes(review),'all generated review sections must be retained');
 assert.ok(article.body.includes('## التقييم النقدي وحدود العمل'),'the final section must have a clear editorial heading');
 assert.equal(article.youtubeVideoId,'UnA7tepsc7s','verified trailer metadata must be carried into the article');
 assert.equal(article.youtubeVideoTitle,'المقطع الرسمي');
 assert.ok(article.body.includes('https://en.wikipedia.org/wiki/Test'),'independent source links must be visible');
}finally{globalThis.fetch=originalFetch;}
console.log('VibeCritic V2 adapter contract tests passed.');
