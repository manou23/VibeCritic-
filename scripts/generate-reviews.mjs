import fs from 'node:fs/promises';
import path from 'node:path';

const env=process.env;
const provider=(env.AI_PROVIDER||(env.OPENROUTER_API_KEY?'openrouter':env.OPENAI_API_KEY?'openai':'gemini')).toLowerCase();
const maxPerRun=Math.max(1,Number.isFinite(Number(env.MAX_PER_RUN))?Number(env.MAX_PER_RUN):3);
const gamesWindowDays=Math.max(1,Number.isFinite(Number(env.GAMES_WINDOW_DAYS))?Number(env.GAMES_WINDOW_DAYS):90);
const outDir='src/content/reviews',processedPath='data/processed.json';
function required(name){if(!env[name])throw new Error(`متغير البيئة ${name} غير مضبوط في GitHub Secrets`);return env[name];}
async function getJson(url){const r=await fetch(url);if(!r.ok){const safeUrl=url.replace(/([?&]api_key=)[^&]+/i,'$1[REDACTED]');throw new Error(`HTTP ${r.status}: ${safeUrl}`);}return r.json();}
const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
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
async function enrichItem(item){
 if(item.type==='game')return item;
 try{
  const key=required('TMDB_API_KEY'),endpoint=item.type==='movie'?'movie':'tv';
  const detail=await getJson('https://api.themoviedb.org/3/'+endpoint+'/'+item.id+'?api_key='+key+'&language=ar&append_to_response=credits,videos');
  const cast=(detail.credits?.cast||[]).slice(0,7).map(x=>x.character?x.name+' بدور '+x.character:x.name).filter(Boolean);
  const directors=(detail.credits?.crew||[]).filter(x=>x.job==='Director').slice(0,2).map(x=>x.name);
  const creators=(detail.created_by||[]).map(x=>x.name).filter(Boolean);
  const officialVideo=(detail.videos?.results||[])
   .filter(video=>video.site==='YouTube'&&video.official===true&&['Trailer','Teaser'].includes(video.type)&&/^[A-Za-z0-9_-]{11}$/.test(video.key||''))
   .sort((a,b)=>(a.type==='Trailer'?0:1)-(b.type==='Trailer'?0:1)||String(b.published_at||'').localeCompare(String(a.published_at||'')))[0];
  return {...item,genres:(detail.genres||[]).map(x=>x.name).filter(Boolean),metadata:{youtubeVideoId:officialVideo?.key||null,youtubeVideoTitle:officialVideo?.name||null,genres:(detail.genres||[]).map(x=>x.name).filter(Boolean),directors,creators,cast,runtime:detail.runtime||null,episodeRuntime:Array.isArray(detail.episode_run_time)?detail.episode_run_time.slice(0,3):[],seasons:detail.number_of_seasons||null,episodes:detail.number_of_episodes||null,productionCompanies:(detail.production_companies||[]).slice(0,5).map(x=>x.name)}};
 }catch(error){console.warn('تعذر إثراء بيانات العمل من TMDB، سيُستخدم الوصف المتاح:',error.message);return item;}
}
async function generateReview(item){
 const isGame=item.type==='game';
 const headings=isGame?['أسلوب اللعب والأنظمة','التصميم الفني والعالم','القصة وبناء الشخصيات','الأداء التقني والثبات','التقدم والتجربة على المدى الطويل']:['الحبكة والسيناريو','الأداء والشخصيات','الإخراج واللغة البصرية','الموسيقى والتصميم الصوتي',item.type==='series'?'بناء الموسم والإيقاع':'الإيقاع والتماسك الدرامي'];
 const metadata=JSON.stringify(item.metadata||{genres:item.genres||[],platforms:item.platforms||[],developers:item.developers||[],gameModes:item.gameModes||[],perspectives:item.perspectives||[],engines:item.engines||[],sourceRating:item.rating||null,releaseDate:item.date||null});
 const prompt=[
 'اكتب مراجعة نقدية عربية احترافية ومتوازنة ومفصلة، وليست دعاية أو ملخصاً دعائياً.',
 'لا تدّع أنك شاهدت أو لعبت العمل بنفسك. لا تخترع أسماء ممثلين أو مطورين أو منصات أو مشاهد أو أحداثاً أو تفاصيل أداء تقني غير موجودة في البيانات. إذا لم تتوفر معلومات موثوقة عن جانب ما، صرّح بأن البيانات لا تكفي للحكم عليه ثم حلّل ما يمكن استنتاجه فقط. لا تحرق الأحداث. لا تكرر الوصف المصدر حرفياً. تجنب المبالغة والعبارات العامة.',
 'اكتب عربية فصيحة طبيعية بنبرة ناقد متخصص وفقرات مترابطة.',
 'أعد JSON صالحاً فقط بالمفاتيح: hook, headline, summary, score, pros, cons, tags, verdict, review.',
 'hook: افتتاحية جذابة من 2-3 جمل دون حرق. headline: عنوان نقدي موجز. summary: تعريف مركز في جملتين أو ثلاث.',
 'review: مراجعة Markdown بين 450 و650 كلمة تقريباً، تبدأ بعنوان ## التحليل الفني والقصصي، ثم تستخدم العناوين الفرعية التالية حرفياً وبالترتيب:',
 ...headings.map((h,i)=>(i+1)+') ### '+h),
 'ناقش في كل محور ما تسمح به البيانات فقط وأثر الاختيارات الفنية على التجربة. اختم بفقرة تلخص المحصلة النقدية.',
 'pros: أربع نقاط قوة محددة. cons: نقطتان أو ثلاث تحفظات حقيقية؛ لا تخترع عيباً لملء القائمة.',
 'verdict: 3-4 جمل تجيب هل يستحق المشاهدة/اللعب، ولمن يناسب، والتحفظ الأهم، وسبب الدرجة.',
 'score: درجة من 0 إلى 10 بخطوة عشرية واحدة، تقدير تحريري مبرر لا تقييم رسمي ولا نقل آلي لتقييم المصدر. tags: ثلاثة إلى ستة وسوم.',
 'بيانات العمل:','النوع: '+(isGame?'لعبة':item.type==='series'?'مسلسل':'فيلم'),'الاسم: '+item.name,'تاريخ الإصدار: '+(item.date||'غير متاح'),'الوصف المصدر: '+(item.description||'غير متوفر'),'التصنيفات: '+((item.genres||[]).join('، ')||'غير متاحة'),'بيانات إضافية موثوقة: '+metadata,'تقييم المصدر (للاستئناس فقط): '+(item.rating||'غير متاح')
 ].join('\n');
 let text,parsed=null;
 if(provider==='openai'){
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+required('OPENAI_API_KEY')},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',temperature:.35,messages:[{role:'system',content:'أنت ناقد ومحرر عربي متخصص. التزم بالنزاهة النقدية وبنية JSON المطلوبة، ولا تختلق معلومات.'},{role:'user',content:prompt}]})});
  if(!r.ok)throw new Error('OpenAI HTTP '+r.status+': '+await r.text());text=(await r.json()).choices?.[0]?.message?.content;
 }else if(provider==='openrouter'){
  const endpoint='https://openrouter.ai/api/v1/chat/completions',headers={'content-type':'application/json',authorization:'Bearer '+required('OPENROUTER_API_KEY'),'HTTP-Referer':'https://vibecritic.pages.dev/','X-Title':'VibeCritic'};
  let messages=[{role:'system',content:'أنت ناقد ومحرر عربي متخصص. أعد JSON صالحاً فقط والتزم بكل محاور المراجعة المطلوبة.'},{role:'user',content:prompt}],lastIssue='رد فارغ';
  for(let attempt=0;attempt<3&&!parsed;attempt++){
   let r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.25,response_format:{type:'json_object'},messages})});
   if(!r.ok&&r.status===400)r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.25,messages})});
   if(!r.ok)throw new Error('OpenRouter HTTP '+r.status+': '+await r.text());
   const response=await r.json(),message=response.choices?.[0]?.message;text=message?.content;if(Array.isArray(text))text=text.map(part=>part.text||'').join('');
   if(message?.refusal)lastIssue='رفض النموذج إنشاء المراجعة';else if(typeof text==='string'&&text.trim()){try{parsed=parseJson(text);}catch(e){lastIssue=e.message;}}else lastIssue='لم يرجع النموذج محتوى نصياً';
   if(!parsed&&attempt<2){const previous=typeof text==='string'&&text.trim()?text.slice(0,5000):'(لا يوجد محتوى)';messages=[...messages,{role:'assistant',content:previous},{role:'user',content:'أعد JSON صالحاً بالمفاتيح hook وheadline وsummary وscore وpros وcons وtags وverdict وreview مع كل عناوين المحاور المطلوبة. لا تشرح الخطأ.'}];}
  }
  if(!parsed)throw new Error('تعذر الحصول على JSON صالح بعد 3 محاولات: '+lastIssue);
 }else if(provider==='gemini'){
  const model=env.GEMINI_MODEL||'gemini-2.5-flash',key=required('GEMINI_API_KEY');
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.35,responseMimeType:'application/json'}})});
  if(!r.ok)throw new Error('Gemini HTTP '+r.status+': '+await r.text());text=(await r.json()).candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
 }else throw new Error('AI_PROVIDER يجب أن يكون openai أو gemini أو openrouter');
 const d=provider==='openrouter'?parsed:parseJson(text),review=String(d.review||'').replace(/<[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').trim();
 if(review.length<700)throw new Error('المراجعة المولّدة أقصر من الحد المطلوب للتحليل المتكامل');
 const pros=Array.isArray(d.pros)?d.pros.map(clean).filter(Boolean).slice(0,4):[],cons=Array.isArray(d.cons)?d.cons.map(clean).filter(Boolean).slice(0,3):[];
 if(pros.length<3||cons.length<2)throw new Error('قوائم نقاط القوة والضعف غير مكتملة');
 return {hook:clean(d.hook),headline:clean(d.headline),summary:clean(d.summary),verdict:clean(d.verdict),score:Math.round(Math.min(10,Math.max(0,Number(d.score)||0))*10)/10,pros,cons,tags:Array.isArray(d.tags)?d.tags.slice(0,8).map(clean):[],review};
}
async function tmdb(type){
 const key=required('TMDB_API_KEY'),endpoint=type==='movie'?'movie':'tv';
 const today=new Date().toISOString().slice(0,10);
 const since=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
 const [trend,discover,genreData]=await Promise.all([
  getJson(`https://api.themoviedb.org/3/trending/${endpoint}/week?api_key=${key}&language=ar`),
  getJson(`https://api.themoviedb.org/3/discover/${endpoint}?api_key=${key}&language=ar&sort_by=${type==='movie'?'primary_release_date':'first_air_date'}.desc&${type==='movie'?'primary_release_date':'first_air_date'}.gte=${since}&${type==='movie'?'primary_release_date':'first_air_date'}.lte=${today}&include_adult=false`),
  getJson(`https://api.themoviedb.org/3/genre/${endpoint}/list?api_key=${key}&language=ar`)
 ]);
 const genreNames=new Map((genreData.genres||[]).map(g=>[g.id,g.name]));
 const map=(x,trendRank=999)=>({id:String(x.id),type,name:x.title||x.name||'بدون عنوان',description:x.overview||'',date:x.release_date||x.first_air_date||'',poster:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',backdrop:x.backdrop_path?`https://image.tmdb.org/t/p/w780${x.backdrop_path}`:'',rating:Number(x.vote_average)||0,genres:(x.genre_ids||[]).map(id=>genreNames.get(id)).filter(Boolean),sourceUrl:`https://www.themoviedb.org/${endpoint}/${x.id}`,popularity:Number(x.popularity)||0,trendRank});
 const merged=new Map();
 for(const item of [...(trend.results||[]).map((x,i)=>map(x,i+1)),...(discover.results||[]).map(x=>map(x))])if(!merged.has(item.id))merged.set(item.id,item);
 return [...merged.values()].sort((a,b)=>(a.trendRank??999)-(b.trendRank??999)||b.popularity-a.popularity||(b.date||'').localeCompare(a.date||''));
}
async function games(){
 const clientId=required('IGDB_CLIENT_ID'),clientSecret=required('IGDB_CLIENT_SECRET');
 const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})});
 if(!tokenResponse.ok)throw new Error(`Twitch OAuth HTTP ${tokenResponse.status}: ${await tokenResponse.text()}`);
 const {access_token}=await tokenResponse.json();
 if(!access_token)throw new Error('لم يرجع Twitch access token صالحاً');
 const headers={'Client-ID':clientId,Authorization:`Bearer ${access_token}`,Accept:'application/json','Content-Type':'text/plain'};
 const since=Math.floor((Date.now()-gamesWindowDays*86400000)/1000);
 const recentQuery=`fields name,summary,first_release_date,cover.image_id,genres.name,rating,follows,hypes,rating_count,url,platforms.name,game_modes.name,player_perspectives.name,involved_companies.company.name,involved_companies.developer,game_engines.name; where first_release_date >= ${since}; sort first_release_date desc; limit 30;`;
 const recentResponse=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers,body:recentQuery});
 if(!recentResponse.ok)throw new Error(`IGDB recent games HTTP ${recentResponse.status}: ${await recentResponse.text()}`);
 let trendingGames=[];
 try{
  const popularityQuery='fields game_id,popularity_type,value; where popularity_type = 1; sort value desc; limit 60;';
  const popularityResponse=await fetch('https://api.igdb.com/v4/popularity_primitives',{method:'POST',headers,body:popularityQuery});
  if(popularityResponse.ok){
   const primitives=await popularityResponse.json();
   const ids=[...new Set(primitives.map(x=>Number(x.game_id)).filter(Boolean))].slice(0,40);
   if(ids.length){
    const detailResponse=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers,body:`fields name,summary,first_release_date,cover.image_id,genres.name,rating,follows,hypes,rating_count,url; where id = (${ids.join(',')}); limit 40;`});
    if(detailResponse.ok){
     const details=await detailResponse.json(),rankById=new Map(primitives.map((x,i)=>[String(x.game_id),{rank:i+1,signal:Number(x.value)||0}]));
     trendingGames=details.map(x=>({...x,trendRank:rankById.get(String(x.id))?.rank||999,trendSignal:rankById.get(String(x.id))?.signal||0}));
    }
   }
  }else console.warn('IGDB popularity endpoint unavailable; using follows and hypes:',popularityResponse.status);
 }catch(e){console.warn('تعذر جلب مؤشرات شعبية IGDB؛ سيتم استخدام مؤشرات الألعاب البديلة:',e.message);}
 const recent=await recentResponse.json();
 const byId=new Map();
 for(const x of [...trendingGames,...recent]){
  const previous=byId.get(String(x.id));
  if(!previous||Number(x.trendRank||999)<Number(previous.trendRank||999))byId.set(String(x.id),x);
 }
 return [...byId.values()].map(x=>{
  const image=x.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_cover_big/${x.cover.image_id}.jpg`:'';
  return {id:String(x.id),type:'game',name:x.name||'بدون عنوان',description:x.summary||'',date:x.first_release_date?new Date(x.first_release_date*1000).toISOString().slice(0,10):'',poster:image,backdrop:image,rating:Number(x.rating)||0,genres:(x.genres||[]).map(g=>g.name),sourceUrl:x.url||`https://www.igdb.com/games/${x.id}`,popularity:Number(x.trendSignal)||0,trendRank:Number(x.trendRank)||999,follows:Number(x.follows)||0,hypes:Number(x.hypes)||0,ratingCount:Number(x.rating_count)||0,platforms:(x.platforms||[]).map(p=>p.name).filter(Boolean),developers:(x.involved_companies||[]).filter(c=>c.developer).map(c=>c.company?.name).filter(Boolean),gameModes:(x.game_modes||[]).map(v=>v.name).filter(Boolean),perspectives:(x.player_perspectives||[]).map(v=>v.name).filter(Boolean),engines:(x.game_engines||[]).map(v=>v.name).filter(Boolean)};
 }).sort((a,b)=>a.trendRank-b.trendRank||((b.hypes*3+b.follows+b.ratingCount)-(a.hypes*3+a.follows+a.ratingCount))||b.popularity-a.popularity);
}
async function globalTrending(){
 const key=required('TMDB_API_KEY');
 const trending=await getJson(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}&language=ar`);
 const media=(trending.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv').map((x,i)=>({
  id:String(x.id),sourceId:String(x.id),type:x.media_type==='tv'?'series':'movie',
  title:x.title||x.name||'بدون عنوان',poster:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',
  backdrop:x.backdrop_path?`https://image.tmdb.org/t/p/w780${x.backdrop_path}`:'',
  summary:x.overview||'',sourceUrl:`https://www.themoviedb.org/${x.media_type==='tv'?'tv':'movie'}/${x.id}`,
  source:'TMDB',sourceRank:Number(x.popularity)||0,trendRank:i+1,updatedAt:new Date().toISOString()
 }));
 const clientId=required('IGDB_CLIENT_ID'),clientSecret=required('IGDB_CLIENT_SECRET');
 const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})});
 if(!tokenResponse.ok)throw new Error(`Twitch OAuth HTTP ${tokenResponse.status}: ${await tokenResponse.text()}`);
 const {access_token}=await tokenResponse.json();
 if(!access_token)throw new Error('لم يرجع Twitch access token صالحاً');
 const headers={'Client-ID':clientId,Authorization:`Bearer ${access_token}`,Accept:'application/json','Content-Type':'text/plain'};
 let gameList=[];
 try{
  const popularityResponse=await fetch('https://api.igdb.com/v4/popularity_primitives',{method:'POST',headers,body:'fields game_id,popularity_type,value; where popularity_type = 1; sort value desc; limit 30;'});
  if(popularityResponse.ok){
   const primitives=await popularityResponse.json(),ids=[...new Set(primitives.map(x=>Number(x.game_id)).filter(Boolean))].slice(0,20);
   if(ids.length){
    const detailResponse=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers,body:`fields name,summary,cover.image_id,follows,hypes,rating_count,url; where id = (${ids.join(',')}); limit 20;`});
    if(detailResponse.ok){
     const details=await detailResponse.json(),rankById=new Map(primitives.map((x,i)=>[String(x.game_id),{rank:i+1,signal:Number(x.value)||0}]));
     gameList=details.map(x=>({...x,trendRank:rankById.get(String(x.id))?.rank||999,trendSignal:rankById.get(String(x.id))?.signal||0}));
    }
   }
  }else console.warn('تعذر الوصول إلى مؤشرات ترند IGDB:',popularityResponse.status);
 }catch(e){console.warn('تعذر جلب ترند الألعاب من IGDB:',e.message);}
 if(!gameList.length){
  const fallback=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers,body:'fields name,summary,cover.image_id,follows,hypes,rating_count,url; where follows > 0 | hypes > 0; sort follows desc; limit 20;'});
  if(!fallback.ok)throw new Error(`IGDB trending fallback HTTP ${fallback.status}: ${await fallback.text()}`);
  gameList=(await fallback.json()).map((x,i)=>({...x,trendRank:i+1,trendSignal:Number(x.follows)||0}));
 }
 const games=[...gameList].sort((a,b)=>(a.trendRank||999)-(b.trendRank||999)).slice(0,3).map(x=>({
  id:String(x.id),sourceId:String(x.id),type:'game',title:x.name||'بدون عنوان',
  poster:x.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_cover_big/${x.cover.image_id}.jpg`:'',
  backdrop:x.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_720p/${x.cover.image_id}.jpg`:'',
  summary:x.summary||'',sourceUrl:x.url||`https://www.igdb.com/games/${x.id}`,
  source:'IGDB',sourceRank:Number(x.trendSignal)||Number(x.follows)||0,trendRank:Number(x.trendRank)||999,updatedAt:new Date().toISOString()
 }));
 const picks=[];
 for(let i=0;i<3;i++){if(media[i])picks.push(media[i]);if(games[i])picks.push(games[i]);}
 return picks.slice(0,6).map((x,i)=>({...x,rank:i+1}));
}
async function writeReview(item){
 const enriched=await enrichItem(item),a=await generateReview(enriched),date=new Date().toISOString().slice(0,10);
 const videoFields=enriched.metadata?.youtubeVideoId?['youtubeVideoId: '+y(enriched.metadata.youtubeVideoId),'youtubeVideoTitle: '+y(enriched.metadata.youtubeVideoTitle)]:[];
  const fm=['---','title: '+y(item.name),'headline: '+y(a.headline),'hook: '+y(a.hook),'summary: '+y(a.summary),'verdict: '+y(a.verdict),'reviewVersion: 2','type: '+item.type,'date: '+date,'releaseDate: '+y(item.date),'poster: '+y(item.poster),'backdrop: '+y(item.backdrop),...videoFields,'score: '+a.score,'pros:',arr(a.pros),'cons:',arr(a.cons),'tags:',arr(a.tags),'genres:',arr(enriched.genres||[]),'sourceRating: '+item.rating,'sourceId: '+y(item.id),'sourceUrl: '+y(item.sourceUrl),'aiGenerated: true','---','',a.review,'','> قراءة نقدية تحريرية مولّدة بمساعدة الذكاء الاصطناعي، مبنية على البيانات المنشورة المتاحة. لا تمثل تجربة مشاهدة أو لعب مباشرة، ولا تقييماً رسمياً من المصدر.',''].join('\n');
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
 const pools={
  game:(await games()).filter(x=>!done.includes(`${x.type}:${x.id}`)),
  series:(await tmdb('series')).filter(x=>!done.includes(`${x.type}:${x.id}`)),
  movie:(await tmdb('movie')).filter(x=>!done.includes(`${x.type}:${x.id}`))
 };
 const files=await fs.readdir(outDir);
 const counts={game:0,series:0,movie:0};
 for(const file of files){for(const type of types){if(file.startsWith(type+'-')&&file.endsWith('.md'))counts[type]++;}}
 console.log('عدد المراجعات المنشورة حسب النوع:',JSON.stringify(counts));
 const fresh=[];
 while(fresh.length<maxPerRun){
  const available=types.filter(type=>pools[type].length>0);
  if(!available.length)break;
  const values=available.map(type=>counts[type]);
  const gap=Math.max(...values)-Math.min(...values);
  let chosenType;
  if(gap>1){
   chosenType=available.sort((a,b)=>counts[a]-counts[b]||(a==='game'?-1:b==='game'?1:a.localeCompare(b)))[0];
  }else{
   const newest=available.flatMap(type=>pools[type].map(item=>({type,item}))).sort((a,b)=>(a.item.trendRank??999)-(b.item.trendRank??999)||(b.item.popularity||0)-(a.item.popularity||0)||(b.item.date||'').localeCompare(a.item.date||''))[0];
   chosenType=newest.type;
  }
  const item=pools[chosenType].shift();
  try{
   done.push(await writeReview(item));counts[chosenType]++;
   fresh.push(item);
   console.log('تم إنشاء مراجعة:',item.name,'|',chosenType,'| التوازن الحالي:',JSON.stringify(counts));
  }catch(e){console.error('تعذر إنشاء مراجعة:',item.name,e.message);}
 }
 if(!fresh.length)console.log('لا توجد أعمال جديدة صالحة للنشر في هذه الدفعة.');
 await fs.writeFile(processedPath,JSON.stringify([...new Set(done)],null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
