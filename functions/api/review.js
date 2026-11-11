const DEFAULTS = [
  {name:'OpenRouter',base:'https://openrouter.ai/api/v1',model:'openrouter/free',modelEnv:'OPENROUTER_MODEL',list:'OPENROUTER_API_KEYS',single:'OPENROUTER_API_KEY'},
  {name:'Groq',base:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b',modelEnv:'GROQ_MODEL',list:'GROQ_API_KEYS',single:'GROQ_API_KEY'},
  {name:'Google AI Studio',base:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.8-flash',modelEnv:'GEMINI_MODEL',list:'GEMINI_API_KEYS',single:'GEMINI_API_KEY'},
  {name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-4o-mini',modelEnv:'OPENAI_MODEL',list:'OPENAI_API_KEYS',single:'OPENAI_API_KEY'}
];
const SYSTEM = 'أنت ناقد فني مخضرم ومتخصص في السينما والألعاب. اكتب مراجعة عربية عميقة وجريئة وصادقة، وادخل مباشرة إلى الفكرة النقدية دون مقدمات مستهلكة. كن صريحاً بلا دعاية أو مجاملة. لا تدّع أنك شاهدت أو لعبت العمل بنفسك، ولا تختلق أحداثاً أو أسماء أو تفاصيل إنتاج أو معلومات غير مؤكدة. تجنب حرق الأحداث الجوهرية. أعد JSON صالحاً فقط بهذه المفاتيح: title, hook, story, style, visuals, audio, pros, cons, verdict, score. اجعل story تحليلاً للقصة والسرد، وstyle لأسلوب اللعب في الألعاب أو الإخراج والأداء في الأفلام، وvisuals للرسوميات والتصميم الفني أو التصوير واللغة البصرية، وaudio للصوتيات والموسيقى. pros مصفوفة من 3 نقاط محددة، cons مصفوفة من نقطتين محددتين، verdict خلاصة نقدية، score رقم من 0 إلى 10 بخطوة عشرية. لا تخترع معلومات عند عدم اليقين، واذكر حدود المعرفة.';
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
 const r={title:clean(d.title||title,160),kind,hook:clean(d.hook,900),story:clean(d.story,3500),style:clean(d.style,3500),visuals:clean(d.visuals,3000),audio:clean(d.audio,2500),pros:arr(d.pros,5,300),cons:arr(d.cons,5,300),verdict:clean(d.verdict,1800),score:Number.isFinite(score)?Math.round(Math.max(0,Math.min(10,score))*10)/10:null};
 for(const f of ['hook','story','style','visuals','audio','verdict'])if(!r[f])throw Error('المراجعة غير مكتملة: '+f);
 if(r.pros.length<2||!r.cons.length||r.score===null)throw Error('التقييم أو قوائم الإيجابيات والسلبيات غير مكتملة');
 return r;
}
async function call(p,key,prompt,title,kind){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),45000);
 const url=/\\/chat\\/completions$/i.test(p.base)?p.base:p.base+'/chat/completions';
 const headers={'content-type':'application/json',authorization:'Bearer '+key,...p.headers};
 if(p.name.toLowerCase().includes('openrouter')){headers['HTTP-Referer']='https://vibecritic.pages.dev/';headers['X-Title']='VibeCritic AI Critic'}
 const body={model:p.model,temperature:.65,max_tokens:2200,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}]};
 try{
  let res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctrl.signal});
  if(res.status===400){const retry={...body};delete retry.response_format;res=await fetch(url,{method:'POST',headers,body:JSON.stringify(retry),signal:ctrl.signal})}
  if(!res.ok){const e=Error(p.name+' HTTP '+res.status+': '+(await res.text()).slice(0,500));e.status=res.status;throw e}
  const data=await res.json(),c=data.choices?.[0]?.message?.content,txt=Array.isArray(c)?c.map(x=>x.text||'').join(''):c;
  if(!txt)throw Error(p.name+': رد فارغ');
  return normalize(parseContent(txt),title,kind);
 }finally{clearTimeout(timer)}
}
async function generate(env,prompt,title,kind){
 const list=providers(env);if(!list.length)throw Error('لا توجد مفاتيح AI مضبوطة في إعدادات Cloudflare.');
 const errors=[];
 for(const p of list)for(let i=0;i<p.keys.length;i++){try{return {review:await call(p,p.keys[i],prompt,title,kind),provider:p.name}}catch(e){errors.push(p.name+' key '+(i+1)+': '+e.message);if(e.status===400&&/model|unsupported|not found/i.test(e.message))break}}
 console.error('AI providers exhausted',errors);
 throw Error('تعذر إنشاء المراجعة. جُرّبت المفاتيح والمزوّدات المتاحة؛ تحقق من الرصيد وحدود الاستخدام واسم النموذج.');
}
const hits=new Map();
function permitted(req){
 const origin=req.headers.get('Origin'),host=req.headers.get('Host');
 if(origin&&host){try{if(new URL(origin).host!==host)return false}catch{return false}}
 const ip=req.headers.get('CF-Connecting-IP')||'unknown',now=Date.now(),old=(hits.get(ip)||[]).filter(t=>now-t<600000);
 if(old.length>=8)return false;old.push(now);hits.set(ip,old);if(hits.size>500)hits.clear();return true;
}
export async function onRequestPost({request,env}){
 if(!permitted(request))return Response.json({error:'تم تجاوز الحد المؤقت للطلبات أو مصدر الطلب غير مسموح.'},{status:429});
 try{
  const size=Number(request.headers.get('content-length')||0);if(size>12000)return Response.json({error:'حجم الطلب كبير جداً.'},{status:413});
  const body=await request.json(),title=clean(body.title,120),kind=body.kind==='game'?'game':body.kind==='movie'?'movie':'';
  if(title.length<2||!kind)return Response.json({error:'أدخل اسم العمل واختر فيلماً أو لعبة.'},{status:400});
  const prompt=['اسم العمل: '+title,'النوع: '+(kind==='game'?'لعبة فيديو':'فيلم سينمائي'),'اكتب مراجعة بالاعتماد على معرفتك الموثوقة فقط. إذا كان الاسم ملتبساً فاذكر ذلك ولا تخترع تفاصيل. تجنب حرق الأحداث.','game: حلل التحكم والأنظمة والتقدم والتصميم في محور style. movie: حلل الإخراج والتمثيل والإيقاع في محور style.','اكتب بالعربية الفصحى.'].join('\n');
  const out=await generate(env,prompt,title,kind);
  return Response.json({ok:true,review:out.review,provider:out.provider},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('AI review API:',e);return Response.json({error:e instanceof SyntaxError?'تعذر قراءة بيانات الطلب.':(e.message||'حدث خطأ غير متوقع.')},{status:500,headers:{'cache-control':'no-store'}})}
}
