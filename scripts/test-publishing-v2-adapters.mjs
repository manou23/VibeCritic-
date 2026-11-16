import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY='test-key';
process.env.GEMINI_MODEL='gemini-2.5-flash';
process.env.CLOUDFLARE_API_TOKEN='test-token';
process.env.CLOUDFLARE_ACCOUNT_ID='test-account';
process.env.CLOUDFLARE_FREE_TIER_ONLY='true';
process.env.GROQ_API_KEY='test-key';
process.env.GROQ_FREE_TIER_ONLY='true';
process.env.OPENROUTER_API_KEY='test-key';
const {buildFreeProviders,createPublishingAdapters}=await import('./publishing-v2/adapters.mjs?adapter-test');
const providers=buildFreeProviders();
assert.deepEqual(providers.map(x=>x.id),['gemini','cloudflare','openrouter']);
assert.equal(providers[1].dailyRequestLimit,3,'Cloudflare must remain below the published free Neurons allocation');
assert.equal(providers[1].dailyTokenLimit,9000);
assert.ok(!providers.some(x=>x.id==='groq'),'Groq must stay excluded until a genuinely free model and plan are verified');
assert.equal(providers[1].model,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');
assert.equal(providers[2].model,'nvidia/nemotron-3.5-super-vl:free');
assert.ok(providers.every(x=>x.free===true&&x.enabled===true));
assert.equal(providers[0].model,'gemini-3.8-flash','retired Gemini default must be upgraded to the currently recommended model');
assert.ok(!providers.some(x=>x.id==='openai'),'paid OpenAI must never enter the V2 free provider pool');
const review=Array.from({length:25},()=> 'تحليل نقدي موثق يشرح تفاصيل العمل وحدود الأدلة المتاحة').join(' ');
const payload={review,scores:{story:7.2,visuals:8.1,sound:7.4,pacing:6.8},pros:[],cons:[],verdict:''};
const originalFetch=globalThis.fetch;let calls=0,mode='gemini';
globalThis.fetch=async(url,options)=>{
 calls++;
 const body=JSON.parse(options.body);
 if(mode==='gemini'){
  assert.match(String(url),/generativelanguage\.googleapis\.com/);
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
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
 const generated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[0],stage:1});
 assert.equal(calls,1,'exactly one provider request per stage');
 assert.ok(JSON.parse(generated.text).review);
 mode='cloudflare';
 const cloudflareGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[1],stage:1});
 assert.ok(JSON.parse(cloudflareGenerated.text).review);
 assert.equal(cloudflareGenerated.tokens,123);
 assert.equal(calls,2,'one request per adapter invocation');
 mode='openrouter';
 const openrouterGenerated=await adapters.generatePart({job:{item:{type:'movie',id:'77'},evidence:{title:'فيلم تجريبي',type:'movie',releaseDate:'2026',overview:'وصف موثق',genres:[],platforms:[],cast:[],crew:[],metadata:{},sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77',extract:'معلومات'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test',extract:'معلومات مستقلة'}]},parts:[]},provider:providers[2],stage:1});
 assert.ok(JSON.parse(openrouterGenerated.text).review);
 assert.equal(openrouterGenerated.tokens,456);
 assert.equal(calls,3,'one request per adapter invocation');
 const stage3={review,scores:{story:8,visuals:7,sound:6,pacing:9},pros:['قوة سردية موثقة','تصميم متماسك','أداء مناسب'],cons:['معلومات فنية ناقصة','إيقاع غير متوازن'],verdict:'حكم نقدي واضح يستند إلى المصادر ولا يدعي تجربة مباشرة.'};
 const job={item:{id:'77'},evidence:{title:'فيلم تجريبي',originalTitle:'',type:'movie',sourceId:'movie:77',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/movie/77',overview:'وصف موثق',releaseDate:'2026',poster:'https://image.tmdb.org/t/p/w780/poster.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/backdrop.jpg',genres:['دراما'],platforms:[],cast:[],crew:[],sources:[{name:'TMDB',url:'https://www.themoviedb.org/movie/77'},{name:'Wikipedia',url:'https://en.wikipedia.org/wiki/Test'}]},parts:[{text:JSON.stringify(payload)},{text:JSON.stringify(payload)},{text:JSON.stringify(stage3)}]};
 const article=await adapters.assembleArticle(job);
 assert.equal(article.score,7.6);
 assert.equal(article.sourceId,'movie:77');
 assert.equal(article.pros.length,3);
 assert.equal(article.cons.length,2);
 assert.ok(article.body.startsWith(review+'\n\n'+review));
 assert.ok(article.body.includes('https://en.wikipedia.org/wiki/Test'),'independent source links must be visible');
}finally{globalThis.fetch=originalFetch;}
console.log('VibeCritic V2 adapter contract tests passed.');
