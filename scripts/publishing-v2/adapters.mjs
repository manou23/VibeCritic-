import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJsonResponse } from '../review-json.mjs';

// V2 adapters: free-tier-only model calls and source-grounded editorial metadata.
const env=process.env, ROOT='src/content/reviews';
const clean=v=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const slug=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60)||'review';
const arr=v=>Array.isArray(v)?v:[];
async function get(url){
 const r=await fetch(url,{headers:{'user-agent':'VibeCriticPublisher/2.0','accept':'application/json'},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw new Error('Source HTTP '+r.status+' ('+new URL(url).hostname+')');
 return r.json();
}
function tmdb(pathname,params={}){
 const u=new URL('https://api.themoviedb.org/3/'+pathname);u.searchParams.set('api_key',env.TMDB_API_KEY);
 for(const [k,v] of Object.entries(params))if(v!=null)u.searchParams.set(k,String(v));return u.toString();
}
const norm=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'');
async function seen(){
 const ids=new Set();
 for(const f of ['data/processed.json','data/published.json'])try{const d=JSON.parse(await fs.readFile(f,'utf8'));for(const x of Array.isArray(d)?d:(d.published||[]))if(typeof x==='string')ids.add(x);}catch{}
 try{for(const f of await fs.readdir(ROOT))if(f.endsWith('.md')){const s=await fs.readFile(path.join(ROOT,f),'utf8'),m=s.match(/^sourceId:\s*["']?([^\r\n"']+)/m),t=s.match(/^title:\s*["']?([^\r\n"']+)/m);if(m)ids.add(m[1].trim());if(t)ids.add('title:'+norm(t[1].replace(/["']$/,'')));}}catch{}
 return ids;
}
export function buildFreeProviders(){
 const out=[];
 if(env.GEMINI_API_KEY){const rawModel=String(env.GEMINI_MODEL||'');const configured=rawModel.startsWith('models/')?rawModel.slice(7):rawModel;const model=!configured||configured==='gemini-2.5-flash'?'gemini-3.8-flash':configured;out.push({id:'gemini',enabled:true,free:true,model,priority:1,dailyRequestLimit:12,dailyTokenLimit:18000});}
 if(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID&&env.CLOUDFLARE_FREE_TIER_ONLY==='true')out.push({id:'cloudflare',enabled:true,free:true,model:env.CLOUDFLARE_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast',priority:2,dailyRequestLimit:3,dailyTokenLimit:9000});
 if(env.GROQ_API_KEY)out.push({id:'groq',enabled:true,free:true,model:env.GROQ_MODEL||'openai/gpt-oss-120b',priority:3,dailyRequestLimit:8,dailyTokenLimit:20000});
 if(env.OPENROUTER_API_KEY)out.push({id:'openrouter',enabled:true,free:true,model:(String(env.OPENROUTER_MODEL||'').endsWith(':free')?String(env.OPENROUTER_MODEL):'nvidia/nemotron-3.5-super-vl:free'),priority:4,dailyRequestLimit:10,dailyTokenLimit:12000});
 return out;
}
async function discover(){
 const used=await seen();
 const [trending,games]=await Promise.all([
  env.TMDB_API_KEY?get(tmdb('trending/all/week',{language:'en-US'})).catch(()=>({results:[]})):Promise.resolve({results:[]}),
  env.RAWG_API_KEY?get('https://api.rawg.io/api/games?key='+encodeURIComponent(env.RAWG_API_KEY)+'&ordering=-added&page_size=40').catch(()=>({results:[]})):Promise.resolve({results:[]})
 ]);
 const items=[];
 for(const x of arr(trending.results)){
  if(!['movie','tv'].includes(x.media_type)||!x.id)continue;
  const type=x.media_type==='tv'?'series':'movie',id=String(x.id);if(used.has(type+':'+id)||used.has('title:'+norm(x.title||x.name)))continue;
  items.push({type,id,name:clean(x.title||x.name),originalTitle:x.original_title||x.original_name||'',overview:clean(x.overview),date:x.release_date||x.first_air_date||'',poster:x.poster_path?'https://image.tmdb.org/t/p/w780'+x.poster_path:'',backdrop:x.backdrop_path?'https://image.tmdb.org/t/p/w1280'+x.backdrop_path:'',sourceName:'TMDB',sourceUrl:'https://www.themoviedb.org/'+(type==='series'?'tv':'movie')+'/'+id,popularity:Number(x.vote_count||0)});
 }
 for(const x of arr(games.results)){
  const id=String(x.id||'');if(!id||used.has('game:'+id)||used.has('title:'+norm(x.name)))continue;
  items.push({type:'game',id,name:clean(x.name),overview:clean(x.description_raw||x.description),date:x.released||'',poster:x.background_image||'',backdrop:x.background_image_additional||x.background_image||'',sourceName:'RAWG',sourceUrl:'https://rawg.io/games/'+(x.slug||id),genres:arr(x.genres).map(v=>v.name).filter(Boolean),platforms:arr(x.platforms).map(v=>v.platform?.name).filter(Boolean),popularity:Number(x.added||0)});
 }
 const counts={game:0,movie:0,series:0};for(const x of items)counts[x.type]++;
 return items.sort((a,b)=>(counts[a.type]-counts[b.type])-(counts[b.type]-counts[a.type])||b.popularity-a.popularity).slice(0,80);
}
async function wiki(title){
 const u=new URL('https://en.wikipedia.org/w/api.php');for(const [k,v] of Object.entries({action:'query',list:'search',srsearch:title,format:'json',srlimit:'5'}))u.searchParams.set(k,v);
 const hits=arr((await get(u.toString())).query?.search);
 const hit=hits.find(x=>norm(x.title)===norm(title))||hits.find(x=>norm(x.title).includes(norm(title))||norm(title).includes(norm(x.title)));
 if(!hit)throw new Error('No sufficiently matching independent encyclopedia page: '+title);
 const p=new URL('https://en.wikipedia.org/w/api.php');for(const [k,v] of Object.entries({action:'query',prop:'extracts',exintro:'1',explaintext:'1',titles:hit.title,format:'json'}))p.searchParams.set(k,v);
 const pages=(await get(p.toString())).query?.pages||{},page=Object.values(pages)[0],extract=clean(page?.extract||'');
 if(extract.length<180)throw new Error('Independent source has insufficient detail.');
 return {name:'Wikipedia',url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(hit.title.replace(/ /g,'_')),extract:extract.slice(0,4500)};
}
async function collectEvidence(item){
 let data={},sourceUrl=item.sourceUrl,poster=item.poster,backdrop=item.backdrop,genres=item.genres||[],platforms=item.platforms||[],cast=[],crew=[],releaseDate=item.date||'';
 let youtubeVideoId='',youtubeVideoTitle='',externalVideoUrl='',externalVideoTitle='';
 if(item.type==='game'){
  if(!env.RAWG_API_KEY)throw new Error('RAWG_API_KEY missing');
  data=await get('https://api.rawg.io/api/games/'+item.id+'?key='+encodeURIComponent(env.RAWG_API_KEY));
  sourceUrl='https://rawg.io/games/'+(data.slug||item.id);poster=data.background_image||poster;backdrop=data.background_image_additional||poster;
  genres=arr(data.genres).map(x=>x.name).filter(Boolean);platforms=arr(data.platforms).map(x=>x.platform?.name).filter(Boolean);releaseDate=data.released||releaseDate;
  const clips=await get('https://api.rawg.io/api/games/'+item.id+'/movies?key='+encodeURIComponent(env.RAWG_API_KEY)).catch(()=>({results:[]}));
  const clip=arr(clips.results).find(x=>{const candidate=x?.data?.max||x?.data?.['480'];try{const u=new URL(candidate);return u.protocol==='https:'&&u.hostname==='media.rawg.io';}catch{return false;}});
  if(clip){externalVideoUrl=clip.data.max||clip.data['480'];externalVideoTitle=clean(clip.name||('مقطع من '+item.name));}
 }else{
  const kind=item.type==='series'?'tv':'movie';
  data=await get(tmdb(kind+'/'+item.id,{language:'en-US',append_to_response:'credits,videos'}));
  sourceUrl='https://www.themoviedb.org/'+kind+'/'+item.id;
  poster=data.poster_path?'https://image.tmdb.org/t/p/w780'+data.poster_path:poster;
  backdrop=data.backdrop_path?'https://image.tmdb.org/t/p/w1280'+data.backdrop_path:backdrop;
  genres=arr(data.genres).map(x=>x.name).filter(Boolean);releaseDate=data.release_date||data.first_air_date||releaseDate;
  cast=arr(data.credits?.cast).slice(0,8).map(x=>x.name).filter(Boolean);
  crew=arr(data.credits?.crew).filter(x=>['Director','Creator'].includes(x.job)).slice(0,5).map(x=>x.name).filter(Boolean);
  const trailers=arr(data.videos?.results).filter(v=>v.site==='YouTube'&&v.type==='Trailer'&&/^[A-Za-z0-9_-]{11}$/.test(v.key||''));
  const trailer=trailers.find(v=>v.official===true)||trailers[0];
  if(trailer){youtubeVideoId=trailer.key;youtubeVideoTitle=clean(trailer.name||('المقطع الرسمي لـ '+item.name));}
 }
 if(!poster?.startsWith('https://'))throw new Error('No HTTPS poster available');
 const independent=await wiki(item.name),primary={name:item.sourceName,url:sourceUrl,extract:clean(item.overview||data.overview||data.description_raw||'').slice(0,4000)};
 if(primary.extract.length<80)throw new Error('Primary source metadata is too thin');
 return {title:item.name,originalTitle:item.originalTitle||data.original_title||data.original_name||'',type:item.type,sourceName:item.sourceName,sourceUrl,sourceId:item.type+':'+item.id,releaseDate,overview:primary.extract,poster,backdrop:backdrop||poster,genres,platforms,cast,crew,youtubeVideoId,youtubeVideoTitle,externalVideoUrl,externalVideoTitle,sources:[primary,independent],metadata:{rating:data.vote_average||data.rating||null,votes:data.vote_count||data.ratings_count||0}};
}
function prompt(job,stage){
 const e=job.evidence,prior=job.parts.map(p=>p.text).join('\n\n');
 return ['أنت محرر VibeCritic وناقد عربي. لا تدّع مشاهدة أو لعباً مباشراً ولا تخترع حقائق.',
 'العمل: '+e.title+' | النوع: '+e.type+' | تاريخ الإصدار: '+(e.releaseDate||'غير مثبت'),
 'الأدلة: '+JSON.stringify({overview:e.overview,genres:e.genres,platforms:e.platforms,cast:e.cast,crew:e.crew,metadata:e.metadata,sources:e.sources.map(s=>({name:s.name,url:s.url,extract:s.extract}))}),
 'ما كتب سابقاً، لا تكرره: '+(prior||'لا شيء'),
 'اكتب القسم '+stage+' من 3، واستهدف 265 كلمة عربية فعلية (الحد الأدنى 250 والحد الأعلى 280). ابدأ review بعنوان Markdown واضح: '+(e.type==='game'?['## القصة والعالم والشخصيات','## أسلوب اللعب والتصميم والإيقاع','## التقييم النقدي وحدود التجربة'][stage-1]:['## القصة والشخصيات والبناء','## الإخراج والصورة والصوت والإيقاع','## التقييم النقدي وحدود العمل'][stage-1])+'. المرحلة 1 تشرح الفكرة والشخصيات دون حرق؛ المرحلة 2 تحلل الأنظمة أو الإخراج والعناصر الفنية والإيقاع؛ المرحلة 3 تضيف موازنة نقدية جديدة ولا تعيد صياغة القسمين السابقين.',
 'أعد JSON فقط: review,scores,pros,cons,verdict. scores تحوي story,visuals,sound,pacing من 0 إلى 10. في المرحلة 3 فقط اكتب 3 نقاط قوة و2 تحفظات محددة وverdict من 50 إلى 90 كلمة. قبل ذلك اجعل القوائم والحكم فارغة. لا تكتب نصاً خارج review.',
 'لا تحول غياب البيانات إلى ادعاءات. لا تستخدم التوقعات كحقائق. اجعل كل حكم مرتبطاً بما ورد في الأدلة.'].join('\n\n');
}
async function modelCall(provider,text){
 const key=env[provider.id==='gemini'?'GEMINI_API_KEY':provider.id==='cloudflare'?'CLOUDFLARE_API_TOKEN':provider.id==='groq'?'GROQ_API_KEY':'OPENROUTER_API_KEY'];
 let url,headers={'content-type':'application/json'},body;
 if(provider.id==='gemini'){
  url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(provider.model)+':generateContent?key='+encodeURIComponent(key);
  body={contents:[{parts:[{text:text}]}],generationConfig:{temperature:.3,maxOutputTokens:2500,responseMimeType:'application/json'}};
 }else if(provider.id==='cloudflare'){
  url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/ai/run/'+provider.model.split('/').map(x=>encodeURIComponent(x).replace(/%40/gi,'@')).join('/');
  headers.authorization='Bearer '+key;
  body={messages:[{role:'system',content:'ناقد عربي دقيق. أعد JSON صالحاً فقط، ولا تختلق معلومات.'},{role:'user',content:text}],temperature:.3,max_tokens:2500,response_format:{type:'json_object'}};
 }else{
  url=provider.id==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';headers.authorization='Bearer '+key;
  if(provider.id==='openrouter'){headers['HTTP-Referer']='https://vibecritic.pages.dev/';headers['X-Title']='VibeCritic';}
  const fallbacks=['nvidia/nemotron-3.5-super-vl:free','google/gemma-4-26b-a4b-it:free'].filter(x=>x!==provider.model);
  body=provider.id==='groq'?{model:provider.model,temperature:.3,max_completion_tokens:4096,reasoning_effort:'low',include_reasoning:false,response_format:{type:'json_schema',json_schema:{name:'vibecritic_review_section',strict:true,schema:{type:'object',additionalProperties:false,properties:{review:{type:'string'},scores:{type:'object',additionalProperties:false,properties:{story:{type:'number'},visuals:{type:'number'},sound:{type:'number'},pacing:{type:'number'}},required:['story','visuals','sound','pacing']},pros:{type:'array',items:{type:'string'}},cons:{type:'array',items:{type:'string'}},verdict:{type:'string'}},required:['review','scores','pros','cons','verdict']}}},messages:[{role:'system',content:'ناقد عربي دقيق. JSON فقط، لا تختلق.'},{role:'user',content:text}]}:{...(provider.id==='openrouter'?{models:[provider.model,...fallbacks],reasoning:{enabled:false}}:{}),model:provider.model,temperature:.3,max_tokens:2500,response_format:{type:'json_object'},messages:[{role:'system',content:'ناقد عربي دقيق. JSON فقط، لا تختلق.'},{role:'user',content:text}]};
 }
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw new Error(provider.id+' HTTP '+r.status+': '+(await r.text()).slice(0,600));
 const d=await r.json();let raw=provider.id==='gemini'?d.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join(''):provider.id==='cloudflare'?(d.result?.response||d.result?.output_text||''):d.choices?.[0]?.message?.content;
 if(Array.isArray(raw))raw=raw.map(x=>x.text||'').join('');
 if(typeof raw!=='string'||!raw.trim()){const c=d.choices?.[0],m=c?.message||{};throw new Error(provider.id+' empty response: '+JSON.stringify({model:d.model,finish_reason:c?.finish_reason,message_keys:Object.keys(m),error:d.error||null}).slice(0,500));}
 const parsed=parseJsonResponse(raw),words=(clean(parsed.review).match(/[\p{L}\p{N}]+/gu)||[]).length;
 const tokens=Number(d.usage?.total_tokens)||Math.ceil((text.length+raw.length)/4);if(words<220||words>280){const error=new Error('Section word count rejected: '+words);error.tokens=tokens;throw error;}
 for(const k of ['story','visuals','sound','pacing'])if(!Number.isFinite(Number(parsed.scores?.[k]))||Number(parsed.scores[k])<0||Number(parsed.scores[k])>10)throw new Error('Invalid score '+k);
 return {parsed,tokens};
}
const y=v=>JSON.stringify(String(v??''));
const yamlList=a=>a?.length?'\n'+a.map(v=>'  - '+y(v)).join('\n'):' []';
async function publishFile(a,job){
 const filename=a.type+'-'+slug(a.title)+'-'+String(job.item.id).replace(/[^\w-]/g,'')+'.md',target=path.join(ROOT,filename);
 await fs.mkdir(ROOT,{recursive:true});
 try{await fs.access(target);throw new Error('Refusing to overwrite '+target);}catch(e){if(e.code!=='ENOENT')throw e;}
 const fm=['---','title: '+y(a.title),'originalTitle: '+y(a.originalTitle),'headline: '+y(a.headline),'hook: '+y(a.hook),'summary: '+y(a.summary),'verdict: '+y(a.verdict),'reviewVersion: 5','reviewMode: review','date: '+a.date,'publishedAt: '+y(new Date().toISOString()),'type: '+a.type,'score: '+a.score,'storyScore: '+a.storyScore,'visualsScore: '+a.visualsScore,'soundScore: '+a.soundScore,'pacingScore: '+a.pacingScore,'sourceName: '+y(a.sourceName),'sourceId: '+y(a.sourceId),'sourceUrl: '+y(a.sourceUrl),...(a.youtubeVideoId?['youtubeVideoId: '+y(a.youtubeVideoId),'youtubeVideoTitle: '+y(a.youtubeVideoTitle)]:[]),...(a.externalVideoUrl?['externalVideoUrl: '+y(a.externalVideoUrl),'externalVideoTitle: '+y(a.externalVideoTitle)]:[]),'aiGenerated: true','editorialWorkflow: automated','poster: '+y(a.poster),'backdrop: '+y(a.backdrop),'platforms:'+yamlList(a.platforms),'genres:'+yamlList(a.genres),'cast:'+yamlList(a.cast),'crew:'+yamlList(a.crew),'pros:'+yamlList(a.pros),'cons:'+yamlList(a.cons),'tags:'+yamlList(a.tags)].join('\n');
 await fs.writeFile(target,fm+'\n---\n\n'+a.body+'\n\n> مراجعة تحريرية مبنية على المصادر المذكورة، ولا تدّعي تجربة مباشرة.\n',{flag:'wx',encoding:'utf8'});
 return {path:target.replace(/\\/g,'/')};
}
async function verifyDeployment({article,articlePath}){
 const id=path.basename(articlePath||'').replace(/\.md$/,'');if(!id)return false;
 try{const r=await fetch('https://vibecritic.pages.dev/reviews/'+encodeURIComponent(id)+'/',{signal:AbortSignal.timeout(15000)});if(!r.ok)return false;const html=await r.text();const videoVisible=article.youtubeVideoId?html.includes(article.youtubeVideoId):article.externalVideoUrl?html.includes(article.externalVideoUrl):true;return html.includes(article.title)&&html.includes('تحليل مدعوم بالذكاء الاصطناعي')&&videoVisible;}catch{return false;}
}
async function isAlreadyPublished(item){
 const wanted=norm(item?.name);if(!wanted)return false;
 try{for(const f of await fs.readdir(ROOT)){if(!f.endsWith('.md'))continue;const s=await fs.readFile(path.join(ROOT,f),'utf8'),m=s.match(/^title:\s*["']?([^\r\n"']+)/m);if(m&&norm(m[1])===wanted)return true;}}catch{}
 return false;
}
export function createPublishingAdapters(){return {
 discover,collectEvidence,isAlreadyPublished,
 generatePart:async({job,provider,stage})=>{
  const basePrompt=prompt(job,stage);
  const isStage3Complete=r=>stage!==3||(String(r.parsed.verdict||'').trim().length>=30&&Array.isArray(r.parsed.pros)&&r.parsed.pros.filter(x=>String(x||'').trim()).length>=3&&Array.isArray(r.parsed.cons)&&r.parsed.cons.filter(x=>String(x||'').trim()).length>=2);
  try{const r=await modelCall(provider,basePrompt);if(!isStage3Complete(r))throw new Error('Stage 3 required fields missing: verdict/pros/cons');return {text:JSON.stringify(r.parsed),tokens:r.tokens,requests:1};}
  catch(firstError){
   if(provider.id!=='groq'||!(/^(Section word count rejected:|Stage 3 required fields missing:)/.test(String(firstError?.message||''))))throw firstError;
   const firstTokens=Number(firstError.tokens)||0;
   const retryInstruction=stage===3?'إصلاح إلزامي للمرحلة الثالثة: أعد JSON كاملاً مع review من 250 إلى 270 كلمة، وverdict عربي واضح لا يقل عن 30 كلمة، وpros مصفوفة تحتوي ثلاث نقاط قوة فعلية على الأقل، وcons مصفوفة تحتوي تحفظين فعليين على الأقل. لا تترك أي حقل فارغاً.':'مراجعة إلزامية للطول: الإجابة السابقة أقصر من الحد المطلوب. أعد كتابة القسم كاملاً بتفصيل أكبر، واجعل review بين 250 و270 كلمة عربية فعلية. أضف تحليلاً محدداً مرتبطاً بالأدلة ولا تكرر الجمل ولا تضف حقائق غير موثقة.';
   const retryPrompt=basePrompt+'\\n\\n'+retryInstruction;
   try{const retry=await modelCall(provider,retryPrompt);return {text:JSON.stringify(retry.parsed),tokens:firstTokens+retry.tokens,requests:2};}
   catch(retryError){retryError.tokens=(Number(retryError.tokens)||0)+firstTokens;retryError.requests=2;throw retryError;}
  }
 },
 assembleArticle:async job=>{
  const p=job.parts.map(x=>parseJsonResponse(x.text)),last=p[p.length-1],e=job.evidence;
  const dims={storyScore:Number(last.scores.story),visualsScore:Number(last.scores.visuals),soundScore:Number(last.scores.sound),pacingScore:Number(last.scores.pacing)};
  const score=Math.round((dims.storyScore*.3+dims.visualsScore*.25+dims.soundScore*.2+dims.pacingScore*.25)*10)/10;
  const headings=e.type==='game'?['القصة والعالم والشخصيات','أسلوب اللعب والتصميم والإيقاع','التقييم النقدي وحدود التجربة']:['القصة والشخصيات والبناء','الإخراج والصورة والصوت والإيقاع','التقييم النقدي وحدود العمل'];
  const sections=p.map((x,i)=>'## '+headings[i]+'\n\n'+clean(x.review).replace(/^##\s+[^\n]+\n?/,'').trim());
  const firstSection=clean(p[0]?.review||'').replace(/^##\s+[^\n]+\n?/,'').trim();
  const summary=(firstSection.split(/(?<=[.!؟])\s+/).slice(0,2).join(' ').slice(0,420)||clean(e.overview).slice(0,420));
  return {title:e.title,originalTitle:e.originalTitle,headline:'مراجعة نقدية: '+e.title+' بين نقاط القوة وحدود التجربة',hook:summary,summary,verdict:clean(last.verdict),type:e.type,sourceId:e.sourceId,sourceName:e.sourceName,sourceUrl:e.sourceUrl,date:new Date().toISOString().slice(0,10),score,...dims,pros:arr(last.pros).map(clean),cons:arr(last.cons).map(clean),sources:e.sources,poster:e.poster,backdrop:e.backdrop,platforms:e.platforms,genres:e.genres,cast:e.cast,crew:e.crew,tags:e.genres,youtubeVideoId:e.youtubeVideoId,youtubeVideoTitle:e.youtubeVideoTitle,externalVideoUrl:e.externalVideoUrl,externalVideoTitle:e.externalVideoTitle,body:sections.join('\n\n')+'\n\n### المصادر والمراجع\n\n'+e.sources.map(x=>'- ['+x.name+']('+x.url+')').join('\n')};
 },
 publishFile,verifyDeployment
};}
