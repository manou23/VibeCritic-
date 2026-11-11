import fs from 'node:fs/promises';
import path from 'node:path';

const env=process.env;
const provider=(env.AI_PROVIDER||(env.OPENROUTER_API_KEY?'openrouter':env.OPENAI_API_KEY?'openai':'gemini')).toLowerCase();
const maxPerRun=Math.max(1,Number(env.MAX_PER_RUN||3));
const gamesWindowDays=Math.max(1,Number(env.GAMES_WINDOW_DAYS||14));
const outDir='src/content/reviews',processedPath='data/processed.json';
function required(name){if(!env[name])throw new Error(`متغير البيئة ${name} غير مضبوط في GitHub Secrets`);return env[name];}
async function getJson(url){const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}: ${url}`);return r.json();}
const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').trim();
const slugify=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,70)||'review';
const y=v=>JSON.stringify(String(v??''));
const arr=a=>a?.length?a.map(v=>`  - ${y(v)}`).join('\n'):'  []';
function parseJson(t){
 const raw=String(t||'').replace(/^\\s*```(?:json)?\\s*/i,'').replace(/\\s*```\\s*$/,'').trim();
 let start=-1,depth=0,inString=false,escaped=false;
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(start<0){if(ch==='{'){start=i;depth=1;}continue;}
  if(inString){if(escaped)escaped=false;else if(ch==='\\\\')escaped=true;else if(ch==='\"')inString=false;continue;}
  if(ch==='\"'){inString=true;continue;}
  if(ch==='{')depth++;
  else if(ch==='}'&&--depth===0){try{return JSON.parse(raw.slice(start,i+1));}catch(e){start=-1;}}
 }
 throw new Error('لم يرجع النموذج JSON صالحاً بعد تنظيف الرد');
}
async function generateReview(item){
 const prompt=`اكتب مراجعة عربية أصلية ومتوازنة. لا تدّع أنك شاهدت أو لعبت العمل، ولا تخترع معلومات، ولا تحرق الأحداث. أعد JSON فقط: headline جملة جذابة، summary ملخص موجز، score رقم 0-10 كتقدير تحريري لا كتقييم رسمي، pros ثلاث نقاط، cons نقطتان أو ثلاث، tags ثلاثة وسوم، review ثلاث فقرات.\nالنوع: ${item.type}\nالاسم: ${item.name}\nالوصف المتاح: ${item.description||'غير متوفر'}\nالتصنيفات: ${(item.genres||[]).join('، ')}`;
 let text;
 if(provider==='openai'){
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${required('OPENAI_API_KEY')}`},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',temperature:.65,messages:[{role:'system',content:'أنت محرر مراجعات عربي دقيق. أعد JSON صالحاً فقط.'},{role:'user',content:prompt}]})});
  if(!r.ok)throw new Error(`OpenAI HTTP ${r.status}: ${await r.text()}`);text=(await r.json()).choices?.[0]?.message?.content;
 }else if(provider==='openrouter'){
  const endpoint='https://openrouter.ai/api/v1/chat/completions';
  const headers={'content-type':'application/json',authorization:`Bearer ${required('OPENROUTER_API_KEY')}`,'HTTP-Referer':'https://manou23.github.io/VibeCritic-/','X-Title':'VibeCritic'};
  const messages=[{role:'system',content:'أنت محرر مراجعات عربي دقيق. أعد كائن JSON صالحاً فقط، دون Markdown أو أي نص خارجه.'},{role:'user',content:prompt}];
  let r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.45,response_format:{type:'json_object'},messages})});
  if(!r.ok&&r.status===400)r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:env.OPENROUTER_MODEL||'openrouter/free',temperature:.45,messages})});
  if(!r.ok)throw new Error(`OpenRouter HTTP ${r.status}: ${await r.text()}`);
  const response=await r.json();text=response.choices?.[0]?.message?.content;
  if(Array.isArray(text))text=text.map(part=>part.text||'').join('');
 }else if(provider==='gemini'){
  const model=env.GEMINI_MODEL||'gemini-2.5-flash',key=required('GEMINI_API_KEY');
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.65,responseMimeType:'application/json'}})});
  if(!r.ok)throw new Error(`Gemini HTTP ${r.status}: ${await r.text()}`);text=(await r.json()).candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
 }else throw new Error('AI_PROVIDER يجب أن يكون openai أو gemini أو openrouter');
 const d=parseJson(text);
 return {headline:clean(d.headline),summary:clean(d.summary),score:Math.min(10,Math.max(0,Number(d.score)||0)),pros:Array.isArray(d.pros)?d.pros.slice(0,5).map(clean):[],cons:Array.isArray(d.cons)?d.cons.slice(0,5).map(clean):[],tags:Array.isArray(d.tags)?d.tags.slice(0,8).map(clean):[],review:String(d.review||'').trim()};
}
async function tmdb(type){
 const key=required('TMDB_API_KEY'),endpoint=type==='movie'?'movie':'tv';
 const d=await getJson(`https://api.themoviedb.org/3/trending/${endpoint}/week?api_key=${key}&language=ar`);
 return(d.results||[]).map(x=>({id:String(x.id),type,name:x.title||x.name||'بدون عنوان',description:x.overview||'',date:x.release_date||x.first_air_date||'',poster:x.poster_path?`https://image.tmdb.org/t/p/w500${x.poster_path}`:'',backdrop:x.backdrop_path?`https://image.tmdb.org/t/p/w1280${x.backdrop_path}`:'',rating:Number(x.vote_average)||0,genres:[],sourceUrl:`https://www.themoviedb.org/${endpoint}/${x.id}`}));
}
async function games(){
 const clientId=required('IGDB_CLIENT_ID'),clientSecret=required('IGDB_CLIENT_SECRET');
 const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})});
 if(!tokenResponse.ok)throw new Error(`Twitch OAuth HTTP ${tokenResponse.status}: ${await tokenResponse.text()}`);
 const {access_token}=await tokenResponse.json();
 if(!access_token)throw new Error('لم يرجع Twitch access token صالحاً');
 const since=Math.floor((Date.now()-gamesWindowDays*86400000)/1000);
 const query=`fields name,summary,first_release_date,cover.image_id,genres.name,rating,url; where first_release_date >= ${since}; sort first_release_date desc; limit 30;`;
 const r=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers:{'Client-ID':clientId,Authorization:`Bearer ${access_token}`,Accept:'application/json','Content-Type':'text/plain'},body:query});
 if(!r.ok)throw new Error(`IGDB HTTP ${r.status}: ${await r.text()}`);
 const data=await r.json();
 return data.map(x=>{
  const image=x.cover?.image_id?`https://images.igdb.com/igdb/image/upload/t_cover_big/${x.cover.image_id}.jpg`:'';
  return {id:String(x.id),type:'game',name:x.name||'بدون عنوان',description:x.summary||'',date:x.first_release_date?new Date(x.first_release_date*1000).toISOString().slice(0,10):'',poster:image,backdrop:image,rating:Number(x.rating)||0,genres:(x.genres||[]).map(g=>g.name),sourceUrl:x.url||`https://www.igdb.com/games/${x.id}`};
 });
}
async function writeReview(item){
 const a=await generateReview(item),date=new Date().toISOString().slice(0,10);
 const fm=['---',`title: ${y(item.name)}`,`headline: ${y(a.headline)}`,`summary: ${y(a.summary)}`,`type: ${item.type}`,`date: ${date}`,`releaseDate: ${y(item.date)}`,`poster: ${y(item.poster)}`,`backdrop: ${y(item.backdrop)}`,`score: ${a.score}`,'pros:',arr(a.pros),'cons:',arr(a.cons),'tags:',arr(a.tags),'genres:',arr(item.genres),`sourceRating: ${item.rating}`,`sourceId: ${y(item.id)}`,`sourceUrl: ${y(item.sourceUrl)}`,'aiGenerated: true','---','',a.review,'','> مراجعة تحريرية مولّدة بمساعدة الذكاء الاصطناعي اعتماداً على البيانات المتاحة، وليست تقييماً رسمياً من المصدر.',''].join('\n');
 await fs.writeFile(path.join(outDir,`${item.type}-${slugify(item.name)}-${item.id}.md`),fm,'utf8');return `${item.type}:${item.id}`;
}
async function main(){
 await fs.mkdir(outDir,{recursive:true});await fs.mkdir('data',{recursive:true});
 let done=[];try{done=JSON.parse(await fs.readFile(processedPath,'utf8'));}catch{}
 const items=[...(await tmdb('movie')),...(await tmdb('series')),...(await games())],fresh=items.filter(x=>!done.includes(`${x.type}:${x.id}`)).slice(0,maxPerRun);
 if(!fresh.length){console.log('لا توجد أعمال جديدة للمراجعة.');return;}
 for(const item of fresh){try{done.push(await writeReview(item));console.log('تم إنشاء مراجعة:',item.name);}catch(e){console.error('تعذر إنشاء مراجعة:',item.name,e.message);}}
 await fs.writeFile(processedPath,JSON.stringify([...new Set(done)],null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
