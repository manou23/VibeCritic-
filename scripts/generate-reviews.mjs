import fs from 'node:fs/promises';
import path from 'node:path';

const env=process.env;
const provider=(env.AI_PROVIDER||(env.GEMINI_API_KEY?'gemini':env.GROQ_API_KEY?'groq':env.OPENROUTER_API_KEY?'openrouter':'openai')).toLowerCase();
const targetTotal=100,dailyPerType=5,releaseBatchLimit=10;
const gamesWindowDays=Math.max(1,Number.isFinite(Number(env.GAMES_WINDOW_DAYS))&&env.GAMES_WINDOW_DAYS?Number(env.GAMES_WINDOW_DAYS):14);
const outDir='src/content/reviews',processedPath='data/processed.json';
function required(name){if(!env[name])throw new Error(`متغير البيئة ${name} غير مضبوط في GitHub Secrets`);return env[name];}
async function getJson(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok){const safeUrl=url.replace(/([?&](?:api_key|key)=)[^&]+/i,'$1[REDACTED]');throw new Error(`HTTP ${r.status}: ${safeUrl}`);}return r.json();}
const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
function algeriaDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Algiers',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const values=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${values.year}-${values.month}-${values.day}`;}
const slugify=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,70)||'review';
const y=v=>JSON.stringify(String(v??''));
const arr=a=>a?.length?a.map(v=>`  - ${y(v)}`).join('\n'):'  []';
function parseJson(t){
 const raw=String(t||'').replace(/^\s*[\x60]{3}(?:json)?\s*/i,'').replace(/\s*[\x60]{3}\s*$/,'').trim();
 let start=-1,depth=0,inString=false,escaped=false;
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(start<0){if(ch==='{'){start=i;depth=1;}continue;}
  if(inString){
   if(escaped)escaped=false;
   else if(ch==='\\')escaped=true;
   else if(ch==='"')inString=false;
   continue;
  }
  if(ch==='"'){inString=true;continue;}
  if(ch==='{')depth++;
  else if(ch==='}'&&--depth===0){
   try{return JSON.parse(raw.slice(start,i+1));}
   catch{start=-1;depth=0;}
  }
 }
 throw new Error('لم يرجع النموذج JSON صالحاً بعد تنظيف الرد');
}
async function generateWithGemini(prompt){
 const model=env.GEMINI_MODEL||'gemini-3.8-flash',key=required('GEMINI_API_KEY');
 const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+key;
 let lastError='رد Gemini فارغ أو غير صالح';
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:4096,thinkingConfig:{thinkingLevel:'LOW'},responseMimeType:'application/json'}}),signal:AbortSignal.timeout(90000)});
  if(!r.ok){
   const detail=await r.text(),retryable=[429,500,502,503,504].includes(r.status);
   if(retryable&&attempt<2){const wait=Math.min(10000,1500*(attempt+1));console.warn('Gemini transient HTTP '+r.status+'; retrying after '+wait+'ms');await new Promise(resolve=>setTimeout(resolve,wait));continue;}
   throw new Error('Gemini HTTP '+r.status+': '+detail);
  }
  const payload=await r.json(),content=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
  if(content){try{return parseJson(content);}catch(e){lastError=e.message;}}
  else lastError=payload.promptFeedback?.blockReason?'تم حظر الطلب من Gemini: '+payload.promptFeedback.blockReason:'لم يرجع Gemini محتوى نصياً';
 }
 throw new Error('تعذر توليد JSON صالح من Gemini: '+lastError);
}
async function generateWithOpenAI(prompt){
 const model=env.OPENAI_MODEL||'gpt-4o-mini',key=required('OPENAI_API_KEY');
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({model,temperature:.3,response_format:{type:'json_object'},messages:[{role:'system',content:'أنت ناقد ومحرر عربي متخصص. أعد JSON صالحاً فقط والتزم بالنزاهة النقدية ولا تختلق معلومات.'},{role:'user',content:prompt}]}),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw new Error('OpenAI HTTP '+r.status+': '+await r.text());
 const content=(await r.json()).choices?.[0]?.message?.content;
 if(!content)throw new Error('لم يرجع OpenAI محتوى نصياً');
 return parseJson(content);
}
async function generateWithGroq(prompt){
 const model=env.GROQ_MODEL||'openai/gpt-oss-120b',key=required('GROQ_API_KEY');
 const url='https://api.groq.com/openai/v1/chat/completions';
 const body=JSON.stringify({model,temperature:.3,max_tokens:4096,response_format:{type:'json_object'},messages:[{role:'system',content:'أنت ناقد ومحرر عربي متخصص. أعد JSON صالحاً فقط والتزم بالنزاهة النقدية ولا تختلق معلومات.'},{role:'user',content:prompt}]});
 let r,detail='';
 for(let attempt=0;attempt<4;attempt++){
  r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body,signal:AbortSignal.timeout(90000)});
  if(r.ok)break;
  detail=await r.text();
  const retryable=r.status===429||[500,502,503,504].includes(r.status);
  if(!retryable||attempt===3)throw new Error('Groq HTTP '+r.status+': '+detail);
  const retryHeader=Number(r.headers.get('retry-after'))*1000;
  const retryBody=Number(detail.match(/try again in\s+([0-9.]+)s/i)?.[1])*1000;
  const wait=Math.min(30000,Math.max(retryHeader||0,retryBody||0,1500*(attempt+1)));
  console.warn('Groq rate/server limit; retry '+(attempt+1)+' after '+wait+'ms');
  await new Promise(resolve=>setTimeout(resolve,wait));
 }
 if(!r?.ok)throw new Error('Groq request failed: '+detail);
 const content=(await r.json()).choices?.[0]?.message?.content;
 if(!content)throw new Error('لم يرجع Groq محتوى نصياً');
 return parseJson(content);
}
async function generateWithOpenRouter(prompt){
 const endpoint='https://openrouter.ai/api/v1/chat/completions';
 const headers={'content-type':'application/json',authorization:'Bearer '+required('OPENROUTER_API_KEY'),'HTTP-Referer':'https://vibecritic.pages.dev/','X-Title':'VibeCritic'};
 let messages=[{role:'system',content:'أنت ناقد ومحرر عربي متخصص. أعد JSON صالحاً فقط والتزم بكل محاور المراجعة المطلوبة.'},{role:'user',content:prompt}],lastIssue='رد فارغ';
 for(let attempt=0;attempt<3;attempt++){
  let r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.25,max_tokens:4096,response_format:{type:'json_object'},messages}),signal:AbortSignal.timeout(90000)});
  if(!r.ok&&r.status===400)r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.25,max_tokens:4096,messages}),signal:AbortSignal.timeout(90000)});
  if(!r.ok)throw new Error('OpenRouter HTTP '+r.status+': '+(await r.text()).slice(0,700));
  const response=await r.json(),message=response.choices?.[0]?.message;
  let content=message?.content;if(Array.isArray(content))content=content.map(part=>part.text||'').join('');
  if(message?.refusal)lastIssue='رفض النموذج إنشاء المراجعة';
  else if(typeof content==='string'&&content.trim()){try{return parseJson(content)}catch(e){lastIssue=e.message;}}
  else lastIssue='لم يرجع النموذج محتوى نصياً';
  if(attempt<2){const previous=typeof content==='string'&&content.trim()?content.slice(0,5000):'(لا يوجد محتوى)';messages=[...messages,{role:'assistant',content:previous},{role:'user',content:'أعد JSON صالحاً بالمفاتيح hook وheadline وsummary وscore وpros وcons وtags وverdict وreview مع كل عناوين المحاور المطلوبة. لا تشرح الخطأ.'}];}
 }
 throw new Error('OpenRouter لم يرجع JSON صالحاً بعد 3 محاولات: '+lastIssue);
}
function validateGeneratedReview(d){
 const review=String(d?.review||'').replace(/<[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').trim();
 const pros=Array.isArray(d?.pros)?d.pros.filter(x=>String(x||'').trim()):[];
 const cons=Array.isArray(d?.cons)?d.cons.filter(x=>String(x||'').trim()):[];
 const score=Number(d?.score);
 if(d?.score===undefined||d?.score===null||String(d.score).trim()===''||!Number.isFinite(score)||score<=0||score>10)throw new Error('درجة المراجعة غير موجودة أو خارج النطاق 0–10');
 const statedScore=String(d?.verdict||'').match(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*10|من\s*10)/);
 if(statedScore&&Math.abs(Number(statedScore[1].replace(',','.'))-score)>0.05)throw new Error('الدرجة في الحكم النهائي لا تطابق حقل score');
 if(review.length<1800)throw new Error('المراجعة المولّدة أقصر من الحد الأدنى للتحليل المتكامل (1800 حرف)');
 if((review.match(/^###\s+/gm)||[]).length<5)throw new Error('المراجعة لا تتضمن المحاور النقدية الخمسة المطلوبة');
 if((review.match(/لا تتوفر معلومات كافية/g)||[]).length>2||(review.match(/لا يمكن الحكم/g)||[]).length>2)throw new Error('المراجعة تعتمد بصورة مفرطة على الاعتذار عن نقص المعلومات');
 if(pros.length<3)throw new Error('قائمة نقاط القوة غير مكتملة');
 if(!String(d?.headline||'').trim()||!String(d?.summary||'').trim()||!String(d?.verdict||'').trim())throw new Error('بيانات المراجعة الأساسية غير مكتملة');
 return d;
}
async function generateFallback(prompt,excluded=[],primaryError=null){
 const errors=[];
 if(primaryError)errors.push(provider+': '+primaryError.message);
 const attempts=[
  ['gemini',env.GEMINI_API_KEY,()=>generateWithGemini(prompt)],
  ['groq',env.GROQ_API_KEY,()=>generateWithGroq(prompt)],
  ['openrouter',env.OPENROUTER_API_KEY,()=>generateWithOpenRouter(prompt)],
  ['openai',env.OPENAI_API_KEY,()=>generateWithOpenAI(prompt)]
 ];
 for(const [name,key,run] of attempts){
  if(!key||excluded.includes(name))continue;
  try{console.warn('التحويل الاحتياطي إلى '+name+'.');return validateGeneratedReview(await run());}
  catch(e){errors.push(name+': '+e.message);console.warn('فشل المزوّد الاحتياطي '+name+':',e.message);}
 }
 throw new Error('تعذر إنشاء المراجعة عبر المزوّد الأساسي والاحتياطيات: '+errors.join(' | '));
}
async function findOfficialGameTrailer(item){
 const key=String(env.YOUTUBE_API_KEY||'').trim();
 if(!key)return null;
 try{
  const query=new URLSearchParams({part:'snippet',q:item.name+' official game trailer',type:'video',maxResults:'10',order:'relevance',videoEmbeddable:'true',videoSyndicated:'true',regionCode:'DZ',relevanceLanguage:'en',key});
  const search=await getJson('https://www.googleapis.com/youtube/v3/search?'+query.toString());
  const candidates=(search.items||[]).filter(x=>x.id?.videoId&&x.snippet?.title);
  if(!candidates.length)return null;
  const ids=candidates.map(x=>x.id.videoId).join(',');
  const details=await getJson('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'snippet,status',id:ids,key}).toString());
  const byId=new Map((details.items||[]).map(x=>[x.id,x]));
  const tokens=String(item.name||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').split(/[^a-z0-9]+/).filter(x=>x.length>2);
  const ranked=candidates.map(candidate=>{
   const video=byId.get(candidate.id.videoId);
   if(!video||video.status?.privacyStatus!=='public'||video.status?.embeddable!==true)return null;
   const title=candidate.snippet.title||'',channel=candidate.snippet.channelTitle||'';
   if(/fan.?made|concept trailer|reaction|review|parody|trailer breakdown|gameplay walkthrough/i.test(title))return null;
   const official=/\\bofficial\\b/i.test(title)||/\\bofficial\\b/i.test(channel);
   if(!official||!/\\b(trailer|teaser)\\b/i.test(title))return null;
   const words=title.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').split(/[^a-z0-9]+/);
   const overlap=tokens.filter(t=>words.includes(t)).length;
   return {score:overlap,videoId:candidate.id.videoId,title,channelTitle:channel};
  }).filter(x=>x&&x.score>0).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  return best?{youtubeVideoId:best.videoId,youtubeVideoTitle:best.title}:null;
 }catch(error){
  console.warn('تعذر العثور على تريلر رسمي للعبة '+item.name+'؛ ستُنشر المراجعة دون فيديو:',error.message);
  return null;
 }
}
async function enrichItem(item){
 if(item.type==='game'){const trailer=await findOfficialGameTrailer(item);return {...item,metadata:{...(item.metadata||{}),...(trailer||{})}};}
 try{
  const key=required('TMDB_API_KEY'),endpoint=item.type==='movie'?'movie':'tv';
  const detail=await getJson('https://api.themoviedb.org/3/'+endpoint+'/'+item.id+'?api_key='+key+'&language=ar&append_to_response=credits,videos,watch/providers,similar');
  const cast=(detail.credits?.cast||[]).slice(0,7).map(x=>x.character?x.name+' بدور '+x.character:x.name).filter(Boolean);
  const directors=(detail.credits?.crew||[]).filter(x=>x.job==='Director').slice(0,2).map(x=>x.name);
  const creators=(detail.created_by||[]).map(x=>x.name).filter(Boolean);
  const officialVideo=(detail.videos?.results||[])
   .filter(video=>video.site==='YouTube'&&video.official===true&&['Trailer','Teaser'].includes(video.type)&&/^[A-Za-z0-9_-]{11}$/.test(video.key||''))
   .sort((a,b)=>(a.type==='Trailer'?0:1)-(b.type==='Trailer'?0:1)||String(b.published_at||'').localeCompare(String(a.published_at||'')))[0];
  return {...item,date:detail.release_date||detail.first_air_date||item.date,rating:Number(detail.vote_average??item.rating)||0,sourceVoteCount:Number(detail.vote_count)||0,genres:(detail.genres||[]).map(x=>x.name).filter(Boolean),metadata:{voteAverage:Number(detail.vote_average)||0,voteCount:Number(detail.vote_count)||0,youtubeVideoId:officialVideo?.key||null,youtubeVideoTitle:officialVideo?.name||null,genres:(detail.genres||[]).map(x=>x.name).filter(Boolean),directors,creators,cast,runtime:detail.runtime||null,episodeRuntime:Array.isArray(detail.episode_run_time)?detail.episode_run_time.slice(0,3):[],seasons:detail.number_of_seasons||null,episodes:detail.number_of_episodes||null,productionCompanies:(detail.production_companies||[]).slice(0,5).map(x=>x.name),watchProviders:(detail['watch/providers']?.results?.DZ?.flatrate||[]).map(x=>x.provider_name),watchProviderUrl:detail['watch/providers']?.results?.DZ?.link||null,similar:(detail.similar?.results||[]).slice(0,5).map(x=>({id:String(x.id),title:x.title||x.name||''}))}};
 }catch(error){console.warn('تعذر إثراء بيانات العمل من TMDB، سيُستخدم الوصف المتاح:',error.message);return item;}
}
function validateSourceQuality(item){
 const today=algeriaDate();
 const releaseDate=String(item.date||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)||Number.isNaN(Date.parse(releaseDate)))throw new Error('تاريخ الإصدار غير موثوق أو مفقود');
 if(String(item.description||'').trim().length<140)throw new Error('الوصف المصدر أقصر من الحد الأدنى المطلوب (140 حرفاً)');
 if(!Array.isArray(item.genres)||item.genres.length===0)throw new Error('لا تتوفر تصنيفات موثوقة للعمل');
 const isPreview=releaseDate>today;
 const metadata=item.metadata||{};
 if(item.type==='game'){
  const platforms=metadata.platforms||item.platforms||[];
  const developers=metadata.developers||item.developers||[];
  if(platforms.length===0||developers.length===0)throw new Error('بيانات اللعبة لا تتضمن منصات ومطوراً موثقاً');
  if(!isPreview){
   const count=Number(item.sourceVoteCount??metadata.ratingCount)||0;
   const rating=Number(item.rating)||0;
   const metacritic=Number(metadata.metacritic)||0;
   if(!(count>=5&&rating>0)&&metacritic<60)throw new Error('بيانات تقييم اللعبة غير كافية (يلزم 5 تقييمات مصدرية أو Metacritic موثوق ≥60)');
  }
 }else{
  const cast=metadata.cast||[];
  const leadership=item.type==='movie'?(metadata.directors||[]):(metadata.creators||[]);
  if(cast.length<3||leadership.length===0)throw new Error('بيانات الطاقم الإبداعي غير كافية للتحليل');
  if(!isPreview){
   const count=Number(item.sourceVoteCount)||0;
   if(!(Number(item.rating)>0&&count>=5))throw new Error('بيانات تقييم الجمهور غير كافية (يلزم 5 أصوات مصدرية على الأقل)');
  }
 }
 return isPreview?'preview':'review';
}
async function generateReview(item){
 const isGame=item.type==='game';
 const headings=isGame?['أسلوب اللعب والأنظمة','التصميم الفني والعالم','القصة وبناء الشخصيات','الأداء التقني والثبات','التقدم والتجربة على المدى الطويل']:['الحبكة والسيناريو','الأداء والشخصيات','الإخراج واللغة البصرية','الموسيقى والتصميم الصوتي',item.type==='series'?'بناء الموسم والإيقاع':'الإيقاع والتماسك الدرامي'];
 const metadata=JSON.stringify({...((item.metadata&&typeof item.metadata==='object')?item.metadata:{genres:item.genres||[],platforms:item.platforms||[],developers:item.developers||[],gameModes:item.gameModes||[],perspectives:item.perspectives||[],engines:item.engines||[],sourceRating:item.rating||null,releaseDate:item.date||null}),trendContext:{source:item.source||'غير محدد',rank:Number(item.trendRank)||null,sourceMetricName:item.sourceMetricName||null,sourceMetricValue:Number.isFinite(Number(item.sourceMetricValue))?Number(item.sourceMetricValue):null,popularity:Number.isFinite(Number(item.popularity))&&Number(item.popularity)>0?Number(item.popularity):null,confidence:item.trendConfidence||'غير محدد',window:item.type==='game'?gamesWindowDays+' يوماً':'أسبوع TMDB'}});
 const prompt=[
 'اكتب مراجعة نقدية عربية احترافية ومتوازنة ومفصلة، وليست دعاية أو ملخصاً دعائياً.',
 'لا تدّع أنك شاهدت أو لعبت العمل بنفسك. لا تخترع أسماء ممثلين أو مطورين أو منصات أو مشاهد أو أحداثاً أو تفاصيل أداء تقني غير موجودة في البيانات. إذا لم تتوفر معلومات موثوقة عن جانب ما، صرّح بأن البيانات لا تكفي للحكم عليه ثم حلّل ما يمكن استنتاجه فقط. لا تحرق الأحداث. لا تكرر الوصف المصدر حرفياً. تجنب المبالغة والعبارات العامة.',
 'اكتب عربية فصيحة طبيعية بنبرة ناقد متخصص وفقرات مترابطة، وراجع تطابق الضمائر وجنس الشخصيات وأسمائها قبل إخراج النتيجة.',
 'أعد JSON صالحاً فقط بالمفاتيح: hook, headline, summary, score, pros, cons, tags, verdict, review.',
 'hook: افتتاحية جذابة من 2-3 جمل دون حرق. headline: عنوان نقدي موجز. summary: تعريف مركز في جملتين أو ثلاث.',
 'review: مراجعة Markdown بين 450 و650 كلمة تقريباً، تبدأ بعنوان ## التحليل الفني والقصصي، ثم تستخدم العناوين الفرعية التالية حرفياً وبالترتيب:',
 ...headings.map((h,i)=>(i+1)+') ### '+h),
 'ناقش في كل محور ما تسمح به البيانات فقط وأثر الاختيارات الفنية على التجربة. اختم بفقرة تلخص المحصلة النقدية.',
 'pros: ثلاث إلى أربع نقاط قوة محددة. cons: صفر إلى ثلاث تحفظات حقيقية؛ إذا لم تتوفر تحفظات موثوقة فأعد قائمة فارغة ولا تخترع عيباً لملء العدد.',
 'verdict: 3-4 جمل تجيب هل يستحق المشاهدة/اللعب، ولمن يناسب، والتحفظ الأهم، وسبب الدرجة.',
 'score: درجة تحريرية مبررة أكبر من صفر وحتى 10، بخطوة عشرية واحدة. لا تستخدم صفراً أو تترك الدرجة فارغة. لا تنقل تقييم المصدر آلياً. tags: ثلاثة إلى ستة وسوم.',
 'مؤشرات الترند (للسياق فقط وليست دليلاً على الجودة): المصدر '+(item.source||'غير محدد')+'، الترتيب داخل المصدر '+(item.trendRank||'غير متاح')+'، المقياس '+(item.sourceMetricName||'غير متاح')+' وقيمته '+(item.sourceMetricValue??'غير متاح')+'، مستوى الثقة '+(item.trendConfidence||'غير محدد')+'. المقاييس خاصة بمصادرها ولا تقارن رقمياً بين TMDB وRAWG وIGDB. لا تخترع أسباب الترند أو أرقام مشاهدات ومبيعات.',
 'حالة الإصدار: '+(String(item.date||'')>algeriaDate()?'لم يصدر بعد؛ هذه قراءة استباقية ولا يجوز الادعاء بتجربة أو تقييم فعلي.':'صدر وفق تاريخ المصدر؛ لا تدّع تجربة شخصية.'),'بيانات العمل:','النوع: '+(isGame?'لعبة':item.type==='series'?'مسلسل':'فيلم'),'الاسم: '+item.name,'تاريخ الإصدار: '+(item.date||'غير متاح'),'الوصف المصدر: '+(item.description||'غير متوفر'),'التصنيفات: '+((item.genres||[]).join('، ')||'غير متاحة'),'بيانات إضافية موثوقة: '+metadata,'تقييم المصدر (للاستئناس فقط): '+(item.rating||'غير متاح')
 ].join('\n');
 let parsed=null;
 const handlers={
  openrouter:()=>generateWithOpenRouter(prompt),
  openai:()=>generateWithOpenAI(prompt),
  gemini:()=>generateWithGemini(prompt),
  groq:()=>generateWithGroq(prompt)
 };
 try{
  if(!handlers[provider])throw new Error('AI_PROVIDER يجب أن يكون openai أو gemini أو groq أو openrouter');
  parsed=validateGeneratedReview(await handlers[provider]());
 }catch(primaryError){
  console.warn('فشل المزوّد الأساسي '+provider+':',primaryError.message);
  parsed=await generateFallback(prompt,[provider],primaryError);
 }
 const d=parsed,review=String(d.review||'').replace(/<[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').trim();
 if(review.length<700)throw new Error('المراجعة المولّدة أقصر من الحد المطلوب للتحليل المتكامل');
 const pros=Array.isArray(d.pros)?d.pros.map(clean).filter(Boolean).slice(0,4):[],cons=Array.isArray(d.cons)?d.cons.map(clean).filter(Boolean).slice(0,3):[];
 if(pros.length<3)throw new Error('قائمة نقاط القوة غير مكتملة');
 return {hook:clean(d.hook),headline:clean(d.headline),summary:clean(d.summary),verdict:clean(d.verdict),score:Math.round(Number(d.score)*10)/10,pros,cons,tags:Array.isArray(d.tags)?d.tags.slice(0,8).map(clean):[],review};
}
async function tmdb(type,mode='trending'){
 const key=required('TMDB_API_KEY'),endpoint=type==='movie'?'movie':'tv';
 const today=algeriaDate(),since=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 const pages=mode==='releases'?[1,2,3]:[1];
 const [lists,genreData]=await Promise.all([
  Promise.all(pages.map(page=>{
   const params=new URLSearchParams({api_key:key,language:'ar',page:String(page)});
   if(mode==='releases'){
    params.set(type==='movie'?'primary_release_date.gte':'first_air_date.gte',since);
    params.set(type==='movie'?'primary_release_date.lte':'first_air_date.lte',today);
    params.set('sort_by',type==='movie'?'primary_release_date.desc':'first_air_date.desc');
    params.set('include_adult','false');
   }
   return getJson('https://api.themoviedb.org/3/'+(mode==='releases'?'discover/':'trending/')+endpoint+(mode==='releases'?'':'/week')+'?'+params.toString());
  })),
  getJson(`https://api.themoviedb.org/3/genre/${endpoint}/list?api_key=${key}&language=ar`)
 ]);
 const genreNames=new Map((genreData.genres||[]).map(g=>[g.id,g.name]));
 return lists.flatMap(list=>list.results||[]).map((x,i)=>({
  id:String(x.id),type,name:x.title||x.name||'بدون عنوان',description:x.overview||'',
  date:x.release_date||x.first_air_date||'',
  poster:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',
  backdrop:x.backdrop_path?`https://image.tmdb.org/t/p/w780${x.backdrop_path}`:'',
  rating:Number(x.vote_average)||0,genres:(x.genre_ids||[]).map(id=>genreNames.get(id)).filter(Boolean),
  sourceUrl:`https://www.themoviedb.org/${endpoint}/${x.id}`,source:'TMDB',
  popularity:Number(x.popularity)||0,sourceMetricName:'TMDB popularity',sourceMetricValue:Number(x.popularity)||0,trendConfidence:Number(x.popularity)>0?'مرتفع':'منخفض',trendRank:i+1
 })).filter(x=>x.description.trim().length>=60&&(mode!=='releases'||(x.date>=since&&x.date<=today)))
 .filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i);
}
async function gamesFromRawg(){
 const key=required('RAWG_API_KEY');
 const today=new Date().toISOString().slice(0,10);
 const since=new Date(Date.now()-gamesWindowDays*86400000).toISOString().slice(0,10);
 const query=new URLSearchParams({key,dates:since+','+today,ordering:'-added',page_size:'40',exclude_additions:'true',exclude_parents:'true'});
 const listing=await getJson('https://api.rawg.io/api/games?'+query.toString());
 const candidates=(listing.results||[]).filter(x=>x.id&&x.slug&&x.released>=since&&x.released<=today).slice(0,18);
 const detailed=await Promise.all(candidates.map(async item=>{
  try{
   const detail=await getJson('https://api.rawg.io/api/games/'+encodeURIComponent(item.slug)+'?key='+encodeURIComponent(key));
   const stripHtml=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
   const description=stripHtml(detail.description_raw||detail.description||item.description||'');
   return {
    id:String(item.id),type:'game',name:item.name||'بدون عنوان',description,
    date:item.released||'',poster:item.background_image||detail.background_image||'',
    backdrop:item.background_image||detail.background_image||'',
    rating:Number(detail.rating??item.rating)||0,sourceVoteCount:Number(detail.ratings_count??item.ratings_count)||0,genres:(detail.genres||item.genres||[]).map(x=>x.name).filter(Boolean),
    sourceUrl:'https://rawg.io/games/'+item.slug,source:'RAWG',
    popularity:Number(item.added)||0,sourceMetricName:'RAWG added count',sourceMetricValue:Number(item.added)||0,trendConfidence:Number(item.added)>=10?'مرتفع':Number(item.added)>0?'متوسط':'منخفض',added:Number(item.added)||0,trendRank:candidates.indexOf(item)+1,
    platforms:(detail.platforms||item.platforms||[]).map(x=>x.platform?.name).filter(Boolean),
    developers:(detail.developers||[]).map(x=>x.name).filter(Boolean),
    metadata:{metacritic:item.metacritic||detail.metacritic||null,ratingCount:Number(detail.ratings_count??item.ratings_count)||0,added:Number(item.added)||0,platforms:(detail.platforms||item.platforms||[]).map(x=>x.platform?.name).filter(Boolean),developers:(detail.developers||[]).map(x=>x.name).filter(Boolean)}
   };
  }catch(error){console.warn('تعذر جلب تفاصيل RAWG للعبة '+item.name+':',error.message);return null;}
 }));
 return detailed.filter(x=>x&&x.description.length>=60&&x.added>0).sort((a,b)=>b.added-a.added);
}
async function gamesFromIgdb(){
 const clientId=required('IGDB_CLIENT_ID'),clientSecret=required('IGDB_CLIENT_SECRET');
 const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'}),signal:AbortSignal.timeout(30000)});
 if(!tokenResponse.ok)throw new Error(`Twitch OAuth HTTP ${tokenResponse.status}: ${await tokenResponse.text()}`);
 const {access_token}=await tokenResponse.json();if(!access_token)throw new Error('لم يرجع Twitch access token صالحاً');
 const headers={'Client-ID':clientId,Authorization:`Bearer ${access_token}`,Accept:'application/json','Content-Type':'text/plain'};
 const since=Math.floor((Date.now()-gamesWindowDays*86400000)/1000);
 const now=Math.floor(Date.now()/1000);
 const query=`fields name,summary,first_release_date,cover.image_id,genres.name,rating,follows,hypes,rating_count,url,platforms.name,involved_companies.company.name,involved_companies.developer; where first_release_date >= ${since} & first_release_date <= ${now}; sort first_release_date desc; limit 40;`;
 const response=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers,body:query,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`IGDB recent games HTTP ${response.status}: ${await response.text()}`);
 return (await response.json()).map((x,i)=>{
  const image=x.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_cover_big/${x.cover.image_id}.jpg`:'';
  return {id:String(x.id),type:'game',name:x.name||'بدون عنوان',description:x.summary||'',date:x.first_release_date?new Date(x.first_release_date*1000).toISOString().slice(0,10):'',poster:image,backdrop:image,rating:Number(x.rating)||0,genres:(x.genres||[]).map(g=>g.name),sourceUrl:x.url||`https://www.igdb.com/games/${x.id}`,source:'IGDB',popularity:Number(x.hypes||0)+Number(x.follows||0),sourceMetricName:'IGDB hypes + follows',sourceMetricValue:Number(x.hypes||0)+Number(x.follows||0),trendConfidence:(Number(x.hypes||0)+Number(x.follows||0))>=10?'متوسط':'منخفض',trendRank:i+1,platforms:(x.platforms||[]).map(p=>p.name).filter(Boolean),developers:(x.involved_companies||[]).filter(c=>c.developer).map(c=>c.company?.name).filter(Boolean),metadata:{ratingCount:Number(x.rating_count)||0,platforms:(x.platforms||[]).map(p=>p.name).filter(Boolean),developers:(x.involved_companies||[]).filter(c=>c.developer).map(c=>c.company?.name).filter(Boolean)}};
 }).filter(x=>x.description.trim().length>=60&&x.popularity>0).sort((a,b)=>b.popularity-a.popularity);
}
let gamesCachePromise;
async function games(){
 if(!gamesCachePromise)gamesCachePromise=(async()=>{
 if(env.RAWG_API_KEY){
  try{
   const results=await gamesFromRawg();
   if(results.length){console.log('RAWG: تم العثور على '+results.length+' ألعاب صدرت خلال آخر '+gamesWindowDays+' يوماً، مرتبة حسب عدد إضافتها.');return results;}
   console.warn('RAWG لم يُرجع ألعاباً صالحة في النافذة الزمنية المحددة؛ سيتم تجربة IGDB كخطة احتياطية.');
  }catch(error){console.warn('تعذر استخدام RAWG، سيتم تجربة IGDB كخطة احتياطية:',error.message);}
 }
 if(env.IGDB_CLIENT_ID&&env.IGDB_CLIENT_SECRET)return gamesFromIgdb();
 if(env.RAWG_API_KEY)return [];
 throw new Error('اضبط RAWG_API_KEY (موصى به) أو IGDB_CLIENT_ID وIGDB_CLIENT_SECRET لجلب الألعاب.');

 })();
 return gamesCachePromise;
}
async function globalTrending(){
 const key=required('TMDB_API_KEY');
 const trending=await getJson(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}&language=ar`);
 const media=(trending.results||[]).filter(x=>(x.media_type==='movie'||x.media_type==='tv')&&String(x.title||x.name||'').trim().length>=2&&String(x.overview||'').trim().length>=60).map((x,i)=>({
  id:String(x.id),sourceId:String(x.id),type:x.media_type==='tv'?'series':'movie',
  title:x.title||x.name||'بدون عنوان',poster:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',
  backdrop:x.backdrop_path?`https://image.tmdb.org/t/p/w780${x.backdrop_path}`:'',
  summary:x.overview||'',sourceUrl:`https://www.themoviedb.org/${x.media_type==='tv'?'tv':'movie'}/${x.id}`,
  source:'TMDB',sourceRank:Number(x.popularity)||0,popularity:Number(x.popularity)||0,sourceMetricName:'TMDB popularity',sourceMetricValue:Number(x.popularity)||0,trendConfidence:'مرتفع',trendRank:i+1,updatedAt:new Date().toISOString()
 })).filter((x,i,all)=>x.sourceMetricValue>0&&all.findIndex(y=>y.type===x.type&&y.id===x.id)===i);
 let gameList=[];
 try{gameList=await games();}catch(error){console.warn('تعذر تحديث ترند الألعاب، سيستمر الموقع بترند TMDB فقط:',error.message);}
 const gameItems=gameList.filter(x=>Number(x.popularity)>0&&Number(x.sourceMetricValue??x.popularity)>0).slice(0,3).map((x,i)=>({
  id:String(x.id),sourceId:String(x.id),type:'game',title:x.name,
  poster:x.poster||'',backdrop:x.backdrop||x.poster||'',summary:x.description||'',
  sourceUrl:x.sourceUrl||'',source:x.source||'RAWG',sourceRank:Number(x.popularity)||0,popularity:Number(x.popularity)||0,sourceMetricName:x.sourceMetricName||'source-native popularity',sourceMetricValue:Number(x.sourceMetricValue??x.popularity)||0,trendConfidence:x.trendConfidence||'متوسط',
  trendRank:i+1,updatedAt:new Date().toISOString()
 }));
 const picks=[];
 for(let i=0;i<3;i++){if(media[i])picks.push(media[i]);if(gameItems[i])picks.push(gameItems[i]);}
 return picks.slice(0,6).map((x,i)=>({...x,rank:i+1,trendRank:i+1}));
}
async function writeReview(item){
 const enriched=await enrichItem(item),reviewMode=validateSourceQuality(enriched),a=await generateReview(enriched),date=algeriaDate();
 const videoFields=enriched.metadata?.youtubeVideoId?['youtubeVideoId: '+y(enriched.metadata.youtubeVideoId),'youtubeVideoTitle: '+y(enriched.metadata.youtubeVideoTitle)]:[];
 const watchFields=enriched.metadata?.watchProviderUrl?['watchProviderUrl: '+y(enriched.metadata.watchProviderUrl)]:[];
  const fm=['---','title: '+y(item.name),'headline: '+y(a.headline),'hook: '+y(a.hook),'summary: '+y(a.summary),'verdict: '+y(a.verdict),'reviewVersion: 2','reviewMode: '+reviewMode,'sourceName: '+y(item.source||''),'sourceVoteCount: '+(Number(enriched.sourceVoteCount)||0),'sourceRatingScale: '+(item.source==='RAWG'?5:item.source==='IGDB'?100:10),'cast:',arr(enriched.metadata?.cast||[]),'crew:',arr([...(enriched.metadata?.directors||[]),...(enriched.metadata?.creators||[])]),'watchProviders:',arr(enriched.metadata?.watchProviders||[]),...watchFields,'type: '+item.type,'date: '+date,'releaseDate: '+y(enriched.date),'poster: '+y(item.poster),'backdrop: '+y(item.backdrop),...videoFields,'score: '+a.score,'trendRank: '+(Number(item.trendRank)||0),'trendSource: '+y(item.source||''),'trendPopularity: '+(Number(item.popularity)||0),'pros:',arr(a.pros),'cons:',arr(a.cons),'tags:',arr(a.tags),'genres:',arr(enriched.genres||[]),'sourceRating: '+(Number(enriched.rating)||0),'sourceId: '+y(item.id),'sourceUrl: '+y(item.sourceUrl),'aiGenerated: true','---','',a.review,'','> قراءة نقدية تحريرية مولّدة بمساعدة الذكاء الاصطناعي، مبنية على البيانات المنشورة المتاحة. لا تمثل تجربة مشاهدة أو لعب مباشرة، ولا تقييماً رسمياً من المصدر.',''].join('\n');
 await fs.writeFile(path.join(outDir,item.type+'-'+slugify(item.name)+'-'+item.id+'.md'),fm,'utf8');return item.type+':'+item.id;
}
async function main(){
 await fs.mkdir(outDir,{recursive:true});await fs.mkdir('data',{recursive:true});await fs.mkdir('src/data',{recursive:true});
 try{
  const top=await globalTrending();
  await fs.writeFile('src/data/trending.json',JSON.stringify(top,null,2)+'\n','utf8');
  console.log(`تم تحديث قائمة الترندات العالمية: ${top.length} أعمال.`);
 }catch(e){console.error('تعذر تحديث الترندات العالمية، سيتم الاحتفاظ بآخر قائمة:',e.message);}
 let done=[];try{done=JSON.parse(await fs.readFile(processedPath,'utf8'));}catch{}
 const types=['game','series','movie'];
 const publishedFiles=(await fs.readdir(outDir)).filter(name=>name.endsWith('.md'));
 const publishedKeys=new Set(publishedFiles.map(name=>{const type=types.find(type=>name.startsWith(type+'-'));const id=name.match(/-(\d+)\.md$/)?.[1];return type&&id?`${type}:${id}`:null;}).filter(Boolean));
 const counts={game:0,series:0,movie:0},todayCounts={game:0,series:0,movie:0};
 const today=algeriaDate();
 for(const file of publishedFiles){
  const type=types.find(value=>file.startsWith(value+'-'));if(!type)continue;
  counts[type]++;
  const content=await fs.readFile(path.join(outDir,file),'utf8');
  const date=content.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1];
  if(date===today)todayCounts[type]++;
 }
 const totalPublished=Object.values(counts).reduce((sum,value)=>sum+value,0);
 const buildPhase=totalPublished<targetTotal;
 console.log('إجمالي المراجعات:',totalPublished,'/',targetTotal,'| حسب القسم:',JSON.stringify(counts));
 console.log('وضع النشر:',buildPhase?'استكمال المكتبة إلى 100 مقالة':'رصد الإصدارات الجديدة');
 let rawPools;
 if(buildPhase){
  rawPools={game:await games(),series:await tmdb('series'),movie:await tmdb('movie')};
 }else{
  rawPools={game:await games(),series:await tmdb('series','releases'),movie:await tmdb('movie','releases')};
 }
 const eligible=items=>items.filter(x=>String(x.description||'').trim().length>=60&&!done.includes(`${x.type}:${x.id}`)&&!publishedKeys.has(`${x.type}:${x.id}`));
 const pools={game:eligible(rawPools.game),series:eligible(rawPools.series),movie:eligible(rawPools.movie)};
 const skippedThinSources=Object.values(rawPools).reduce((total,items)=>total+items.filter(x=>String(x.description||'').trim().length<60).length,0);
 if(skippedThinSources)console.warn('تم استبعاد '+skippedThinSources+' أعمال لعدم توفر وصف مصدر كافٍ لتوليد مراجعة موثوقة.');
 let quotas={game:0,series:0,movie:0};
 if(buildPhase){
  let remaining=Math.max(0,targetTotal-totalPublished);
  const order=[...types].sort((a,b)=>counts[a]-counts[b]);
  while(remaining>0){
   let progressed=false;
   for(const type of order){
    if(remaining<=0)break;
    if(quotas[type]<dailyPerType){quotas[type]++;remaining--;progressed=true;}
   }
   if(!progressed)break;
  }
  for(const type of types)quotas[type]=Math.min(quotas[type],Math.max(0,dailyPerType-todayCounts[type]));
  console.log('الحصة اليومية المستهدفة لكل قسم:',JSON.stringify(quotas),'| المنشور اليوم:',JSON.stringify(todayCounts));
 }else{
  let remaining=releaseBatchLimit;
  const order=[...types].sort((a,b)=>pools[b].length-pools[a].length);
  while(remaining>0){
   let progressed=false;
   for(const type of order){
    if(remaining<=0)break;
    if(quotas[type]<pools[type].length){quotas[type]++;remaining--;progressed=true;}
   }
   if(!progressed)break;
  }
  console.log('دفعة الإصدارات الجديدة المسموح بها في هذا التشغيل:',JSON.stringify(quotas));
 }
 const fresh=[];let generationFailures=0;
 for(const type of types){
  while(quotas[type]>0&&pools[type].length>0){
   const item=pools[type].shift();quotas[type]--;
   try{
    done.push(await writeReview(item));counts[type]++;
    fresh.push(item);
    console.log('تم إنشاء مراجعة:',item.name,'|',type,'| الإجمالي:',Object.values(counts).reduce((sum,value)=>sum+value,0));
   }catch(e){generationFailures++;console.error('تعذر إنشاء مراجعة:',item.name,e.message);}
  }
 }
 if(!fresh.length&&generationFailures>0)throw new Error('فشلت جميع محاولات توليد المراجعات في هذه الدفعة؛ راجع سجلات المزوّدات ومفاتيح API.');
 if(!fresh.length)console.log(buildPhase?'لا توجد أعمال جديدة صالحة لاستكمال المكتبة في هذه الدفعة.':'لم يتم العثور على إصدارات جديدة مؤهلة خلال آخر 7 أيام.');
 if(generationFailures>0)console.warn('تم تجاوز '+generationFailures+' أعمال بسبب أخطاء توليد، مع الاحتفاظ بالمراجعات الناجحة.');
 await fs.writeFile(processedPath,JSON.stringify([...new Set(done)],null,2)+'\n');
 const finalTotal=Object.values(counts).reduce((sum,value)=>sum+value,0);
 console.log(finalTotal>=targetTotal?'تم بلوغ هدف 100 مقالة؛ سيعمل التشغيل القادم بوضع رصد الإصدارات الجديدة.':`المتبقي للوصول إلى 100 مقالة: ${targetTotal-finalTotal}`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
