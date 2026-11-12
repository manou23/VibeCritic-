const DEFAULTS = [
  {name:'OpenRouter',base:'https://openrouter.ai/api/v1',model:'openrouter/free',modelEnv:'OPENROUTER_MODEL',list:'OPENROUTER_API_KEYS',single:'OPENROUTER_API_KEY'},
  {name:'Groq',base:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b',modelEnv:'GROQ_MODEL',list:'GROQ_API_KEYS',single:'GROQ_API_KEY'},
  {name:'Google AI Studio',base:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash',modelEnv:'GEMINI_MODEL',list:'GEMINI_API_KEYS',single:'GEMINI_API_KEY'},
  {name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-4o-mini',modelEnv:'OPENAI_MODEL',list:'OPENAI_API_KEYS',single:'OPENAI_API_KEY'}
];
const SYSTEM = 'أنت المحرر النقدي الرئيسي في VibeCritic، متخصص في الألعاب والأفلام والمسلسلات. اكتب بالعربية الفصحى الطبيعية، بنبرة ناقد جريء ودقيق لا بنبرة إعلان. ابدأ بفكرة نقدية واضحة لا بمقدمات عامة. لا تدّع أنك شاهدت أو لعبت العمل بنفسك. لا تختلق مشاهد أو أحداثاً أو أسماء أو طاقماً أو مطورين أو منصات أو مواصفات تقنية أو آراء جمهور أو أرقام مشاهدة ومبيعات. ميّز بوضوح بين المعلومة المتاحة والاستنتاج النقدي؛ إذا كانت البيانات ناقصة فقل ذلك ولا تملأ الفراغ بالتخمين. لا تحرق الأحداث الجوهرية. أعد JSON صالحاً فقط بهذه المفاتيح: title, hook, story, style, visuals, audio, pros, cons, verdict, score. hook افتتاحية جذابة بلا حرق. story تحليل السرد والشخصيات أو عالم اللعبة ومهماتها بحسب النوع. style تحليل أسلوب اللعب والتحكم والتقدم في الألعاب، أو الإخراج والأداء والإيقاع في الأفلام والمسلسلات. visuals تحليل الرسوميات والتصميم الفني في الألعاب، أو التصوير واللغة البصرية في الأعمال المرئية. audio تحليل الموسيقى والمؤثرات والصوت دون اختراع تفاصيل. اجعل كل محور محدداً ومختلفاً عن الآخر، وابتعد عن تكرار الفكرة نفسها بصياغات مختلفة. اربط كل حكم بسبب واضح، واذكر أثره على تجربة الجمهور. pros ثلاث نقاط قوة ملموسة على الأقل، وcons صفر إلى ثلاث تحفظات حقيقية؛ إذا لم توجد تحفظات موثوقة فأعد قائمة فارغة ولا تختلق عيوباً لإكمال العدد. verdict يوضح لمن يناسب العمل وهل يستحق الوقت وما أهم تحفظ. score درجة تحريرية من 0 إلى 10 بخطوة عشرية، متناسبة مع التحليل ومبررة وليست منقولة من تقييم المنصات. لا تصف العمل بأنه ترند أو الأكثر مشاهدة أو الأكثر مبيعاً أو رائج حالياً إلا إذا زودك الطلب ببيانات حديثة صريحة؛ الشهرة لا تعني الجودة، ولا تجعل الترند سبباً لرفع الدرجة. أعد JSON فقط ولا تضف حقائق غير مسندة.';
function keys(value){if(!value)return[];const s=String(value).trim();try{const v=JSON.parse(s);if(Array.isArray(v))return v.map(String).map(x=>x.trim()).filter(Boolean)}catch{}return s.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean)}
function providers(env){
 let cfg=DEFAULTS;
 if(env.AI_PROVIDERS){try{cfg=JSON.parse(env.AI_PROVIDERS);if(!Array.isArray(cfg))throw Error()}catch{throw Error('AI_PROVIDERS يجب أن يكون مصفوفة JSON صحيحة.')}}
 return cfg.map((p,i)=>({name:String(p.name||('Provider '+(i+1))),base:String(p.baseUrl||p.base||'').replace(/\/+$/,''),model:String((p.modelEnv&&env[p.modelEnv])||p.model||''),keys:[...new Set([...keys(p.keysEnv?env[p.keysEnv]:''),...keys(p.singleKeyEnv?env[p.singleKeyEnv]:''),...keys(p.list?env[p.list]:''),...keys(p.single?env[p.single]:''),...keys(p.keys),...keys(p.apiKeys)])],headers:p.headers||{}})).filter(p=>p.base&&p.model&&p.keys.length);
}
function parseContent(t){const s=String(t||'').replace(/^\s*\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`\s*$/,'').trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)throw Error('رد النموذج ليس JSON صالحاً');return JSON.parse(s.slice(a,b+1))}
function clean(v,n){return String(v??'').replace(/\u0000/g,'').trim().slice(0,n)}
function normalize(d,title,kind){
 const arr=(v,max,len)=>Array.isArray(v)?v.map(x=>clean(x,len)).filter(Boolean).slice(0,max):[];
 const score=Number(d.score);
 const r={title:clean(d.title||title,160),kind,hook:clean(d.hook,900),story:clean(d.story,3500),style:clean(d.style,3500),visuals:clean(d.visuals,3000),audio:clean(d.audio,2500),pros:arr(d.pros,5,300),cons:arr(d.cons,5,300),verdict:clean(d.verdict,1800),score:Number.isFinite(score)&&score>0&&score<=10?Math.round(score*10)/10:null};
 for(const f of ['hook','story','style','visuals','audio','verdict'])if(!r[f])throw Error('المراجعة غير مكتملة: '+f);
 if(r.pros.length<3||r.score===null||r.score<=0||r.score>10)throw Error('التقييم أو قائمة الإيجابيات غير مكتملة؛ يلزم 3 إيجابيات على الأقل ودرجة صالحة.');
 const statedScore=r.verdict.match(/(\\d+(?:[.,]\\d+)?)\\s*(?:\\/\\s*10|من\\s*10)/);
 if(statedScore&&Math.abs(Number(statedScore[1].replace(',','.'))-r.score)>0.05)throw Error('الدرجة في الحكم النهائي لا تطابق الدرجة المعتمدة.');
 return r;
}
async function fetchWithRetry(url,options){
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch(url,options);
  if(![429,500,502,503,504].includes(response.status)||attempt===2)return response;
  const retryAfter=Number(response.headers.get('retry-after'))*1000;
  const wait=Math.min(10000,Math.max(1000,retryAfter||1500*(attempt+1)));
  console.warn('AI provider transient HTTP '+response.status+'; retrying after '+wait+'ms');
  await new Promise(resolve=>setTimeout(resolve,wait));
 }
 return response;
}
async function call(p,key,prompt,title,kind){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),45000);
 const url=/\/chat\/completions$/i.test(p.base)?p.base:p.base+'/chat/completions';
 const headers={'content-type':'application/json',authorization:'Bearer '+key,...p.headers};
 if(p.name.toLowerCase().includes('openrouter')){headers['HTTP-Referer']='https://vibecritic.pages.dev/';headers['X-Title']='VibeCritic AI Critic'}
 const body={model:p.model,temperature:.65,max_tokens:2200,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}]};
 try{
  let data,txt='',finishReason='unknown';
  for(let attempt=0;attempt<3;attempt++){
   let res=await fetchWithRetry(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctrl.signal});
   if(res.status===400){const retry={...body};delete retry.response_format;res=await fetchWithRetry(url,{method:'POST',headers,body:JSON.stringify(retry),signal:ctrl.signal})}
   if(!res.ok){const e=Error(p.name+' HTTP '+res.status+': '+(await res.text()).slice(0,500));e.status=res.status;throw e}
   data=await res.json();
   const c=data.choices?.[0]?.message?.content;
   txt=Array.isArray(c)?c.map(x=>x.text||'').join(''):String(c||'').trim();
   finishReason=data.choices?.[0]?.finish_reason||'unknown';
   if(txt)break;
   console.warn(p.name+' returned empty content; retry '+(attempt+1)+'/3, finish_reason='+finishReason);
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1200*(attempt+1)));
  }
  if(!txt)throw Error(p.name+': رد فارغ بعد 3 محاولات (finish_reason: '+finishReason+')');
  return normalize(parseContent(txt),title,kind);
 }finally{clearTimeout(timer)}
}
async function generate(env,prompt,title,kind){
 const list=providers(env);if(!list.length)throw Error('لا توجد مفاتيح AI مضبوطة في إعدادات Cloudflare.');
 const errors=[];
 for(const p of list)for(let i=0;i<p.keys.length;i++){try{return {review:await call(p,p.keys[i],prompt,title,kind),provider:p.name}}catch(e){errors.push(p.name+' key '+(i+1)+': '+e.message);if(e.status===400&&/model|unsupported|not found/i.test(e.message))break}}
 console.error('AI providers exhausted',errors);
 const safeErrors=errors.slice(-8).map(message=>message
  .replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[مفتاح مخفي]')
  .replace(/Bearer\s+[^\s,;]+/gi,'Bearer [مخفي]')
  .replace(/(api[_-]?key[=: ]+)[^\s,;]+/gi,'$1[مخفي]')
  .slice(0,360));
 throw Error('تعذر إنشاء المراجعة. تفاصيل فشل المزوّد: '+(safeErrors.join(' | ')||'لم يصل رد صالح من أي مزوّد')+' . لا تشارك أي مفتاح API.');

}

async function findYoutubeTrailer(env,title,kind){
 const apiKey=String(env.YOUTUBE_API_KEY||'').trim();
 if(!apiKey)return {available:false,reason:'missing_api_key'};
 const suffix=kind==='game'?'official game trailer':kind==='series'?'official TV series trailer':'official movie trailer';
 const params=new URLSearchParams({part:'snippet',q:title+' '+suffix,type:'video',maxResults:'10',order:'relevance',videoEmbeddable:'true',videoSyndicated:'true',videoDefinition:'high',regionCode:'DZ',relevanceLanguage:'en',key:apiKey});
 const searchResponse=await fetch('https://www.googleapis.com/youtube/v3/search?'+params.toString());
 if(!searchResponse.ok){const message=await searchResponse.text();console.warn('YouTube search failed:',searchResponse.status,message.slice(0,300));return {available:false,reason:searchResponse.status===403?'quota_or_api_restriction':'search_failed'};}
 const searchData=await searchResponse.json();
 const candidates=(searchData.items||[]).filter(x=>x.id?.videoId&&x.snippet?.title);
 if(!candidates.length)return {available:false,reason:'not_found'};
 const ids=candidates.map(x=>x.id.videoId).join(',');
 const detailParams=new URLSearchParams({part:'snippet,status,contentDetails',id:ids,key:apiKey});
 const detailResponse=await fetch('https://www.googleapis.com/youtube/v3/videos?'+detailParams.toString());
 if(!detailResponse.ok){console.warn('YouTube video verification failed:',detailResponse.status);return {available:false,reason:'verification_failed'};}
 const detailData=await detailResponse.json();
 const details=new Map((detailData.items||[]).map(x=>[x.id,x]));
 const normalizeText=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
 const titleTokens=new Set(normalizeText(title));
 const blocked=/\b(fan.?made|concept trailer|reaction|review|parody|trailer breakdown|gameplay walkthrough|movie clips)\b/i;
 const ranked=candidates.map(item=>{
  const v=details.get(item.id.videoId);if(!v||v.status?.privacyStatus!=='public'||v.status?.embeddable!==true)return null;
  const videoTitle=item.snippet.title||v.snippet?.title||'',channel=item.snippet.channelTitle||v.snippet?.channelTitle||'';
  if(blocked.test(videoTitle))return null;
  const titleWords=normalizeText(videoTitle),channelWords=normalizeText(channel);
  const overlap=[...titleTokens].filter(t=>t.length>2&&titleWords.includes(t)).length;
  const officialSignal=/\bofficial\b/i.test(videoTitle)||/\bofficial\b/i.test(channel);
  const trailerSignal=/\b(trailer|teaser|launch trailer|reveal trailer)\b/i.test(videoTitle);
  const score=overlap*3+(officialSignal?8:0)+(trailerSignal?5:0)+(channelWords.some(t=>['studio','pictures','entertainment','games','playstation','xbox','nintendo','ubisoft','ea','bandai','namco','capcom','rockstar','square','enix','warner','bros','netflix','paramount','universal','disney'].includes(t))?2:0);
  return {score,videoId:item.id.videoId,title:videoTitle,channelTitle:channel,publishedAt:item.snippet.publishedAt||null,thumbnail:item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.medium?.url||item.snippet.thumbnails?.default?.url||null,officialSignal,license:v.status?.license||'youtube',duration:v.contentDetails?.duration||null};
 }).filter(Boolean).sort((a,b)=>b.score-a.score);
 const best=ranked[0];
 if(!best||best.score<5)return {available:false,reason:'no_confident_match'};
 return {available:true,videoId:best.videoId,title:best.title,channelTitle:best.channelTitle,url:'https://www.youtube.com/watch?v='+best.videoId,embedUrl:'https://www.youtube-nocookie.com/embed/'+best.videoId,thumbnail:best.thumbnail,publishedAt:best.publishedAt,embeddable:true,public:true,officialSignal:best.officialSignal,confidence:best.officialSignal?'official_signal_detected':'trailer_candidate',license:best.license,duration:best.duration,rightsNote:'YouTube API يؤكد أن الفيديو عام وقابل للتضمين، لكنه لا يثبت ملكية القناة لحقوق العمل أو وجود ترخيص تجاري.'};
}

const hits=new Map();
async function permitted(req,env){
 const origin=req.headers.get('Origin'),host=req.headers.get('Host');
 if(origin){try{if(!host||new URL(origin).host!==host)return false}catch{return false}}
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(env.AI_REVIEW_LIMITER?.limit){
  const decision=await env.AI_REVIEW_LIMITER.limit({key:ip});
  return decision.success===true;
 }
 // Fallback only: isolate-local. Configure AI_REVIEW_LIMITER or a Cloudflare WAF rate-limit rule for distributed enforcement.
 const now=Date.now(),recent=(hits.get(ip)||[]).filter(t=>now-t<600000);
 if(recent.length>=8)return false;
 recent.push(now);hits.set(ip,recent);
 if(hits.size>500){
  for(const [key,times] of hits){const active=times.filter(t=>now-t<600000);if(active.length)hits.set(key,active);else hits.delete(key)}
  while(hits.size>500)hits.delete(hits.keys().next().value);
 }
 return true;
}

async function verifyTurnstile(token,request,env){
 if(!env.TURNSTILE_SECRET_KEY)return true;
 if(!token)return false;
 const body=new FormData();
 body.set('secret',env.TURNSTILE_SECRET_KEY);
 body.set('response',token);
 const ip=request.headers.get('CF-Connecting-IP');
 if(ip)body.set('remoteip',ip);
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)return false;
 const result=await response.json();
 return result.success===true;
}
async function reviewCacheKey(title,kind){
 const normalized=kind+'|'+title.toLocaleLowerCase().replace(/\s+/g,' ').trim();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
 const hash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return new Request('https://vibecritic.pages.dev/__ai-review-cache/'+hash);
}
export async function onRequestPost({request,env}){
 if(!(await permitted(request,env)))return Response.json({error:'تم تجاوز الحد المؤقت للطلبات أو مصدر الطلب غير مسموح.'},{status:429});
 try{
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>12000)return Response.json({error:'حجم الطلب كبير جداً.'},{status:413});
  const body=JSON.parse(raw),title=clean(body.title,120),kind=body.kind==='game'?'game':body.kind==='series'?'series':body.kind==='movie'?'movie':'';
  if(title.length<2||!kind)return Response.json({error:'أدخل اسم العمل واختر فيلماً أو لعبة أو مسلسلاً.'},{status:400});
  if(!(await verifyTurnstile(clean(body.turnstileToken,4096),request,env)))return Response.json({error:'يرجى إكمال تحقق الأمان ثم إعادة المحاولة.'},{status:403});
  const cache=typeof caches!=='undefined'?caches.default:null;
  const cacheKey=await reviewCacheKey(title,kind);
  if(cache){
   try{
    const cached=await cache.match(cacheKey);
    if(cached){
     const payload=await cached.json();
     return Response.json({...payload,cached:true},{headers:{'cache-control':'no-store','x-vibecritic-cache':'HIT'}});
    }
   }catch(error){console.warn('AI review cache read failed:',error.message);}
  }
  const prompt=['اسم العمل: '+title,'النوع: '+(kind==='game'?'لعبة فيديو':kind==='series'?'مسلسل تلفزيوني':'فيلم سينمائي'),'اكتب مراجعة نقدية مفصلة اعتماداً على المعرفة الموثوقة فقط. إذا كان الاسم ملتبساً فاطلب توضيحاً ضمن hook أو اذكر الالتباس بوضوح ولا تنسب معلومات لعمل غير مؤكد. لا تحرق الأحداث ولا تدّع تجربة شخصية.','حلل العمل بحسب نوعه، وخصص كل محور لفكرة مختلفة مع أمثلة مؤكدة أو استنتاجات معلّمة بوضوح. لا تكرر أوصافاً عامة مثل رائع ومذهل دون تفسير أثرها.','game: حلل التحكم والاستجابة والأنظمة والتقدم وتصميم المراحل/العالم عندما تكون معروفة. movie: حلل السيناريو والإخراج والتمثيل والإيقاع. series: حلل بنية الموسم وتطور الشخصيات والإيقاع واتساق الحلقات.','لا تزعم أن العمل ترند أو رائج الآن ولا تذكر أرقاماً حديثة أو ترتيباً حالياً دون بيانات حديثة مقدمة في الطلب. لا تخلط بين الشعبية والجودة. الدرجة يجب أن تنبع من الحجج النقدية.','اكتب بالعربية الفصحى.'].join('\n');
  const [reviewResult,trailerResult]=await Promise.allSettled([generate(env,prompt,title,kind),findYoutubeTrailer(env,title,kind)]);
  if(reviewResult.status==='rejected')throw reviewResult.reason;
  const out=reviewResult.value;
  const trailer=trailerResult.status==='fulfilled'?trailerResult.value:{available:false,reason:'search_failed'};
  if(trailerResult.status==='rejected')console.warn('YouTube trailer lookup failed:',trailerResult.reason);
  const payload={ok:true,review:out.review,provider:out.provider,trailer};
  if(cache){
   try{
    await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public, max-age=21600'}}));
   }catch(error){console.warn('AI review cache write failed:',error.message);}
  }
  return Response.json(payload,{headers:{'cache-control':'no-store','x-vibecritic-cache':'MISS'}});
 }catch(e){console.error('AI review API:',e);return Response.json({error:e instanceof SyntaxError?'تعذر قراءة بيانات الطلب.':(e.message||'حدث خطأ غير متوقع.')},{status:500,headers:{'cache-control':'no-store'}})}
}
