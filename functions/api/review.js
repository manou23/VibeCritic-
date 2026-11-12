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
 const r={title:clean(d.title||title,160),kind,hook:clean(d.hook,900),story:clean(d.story,3500),style:clean(d.style,3500),visuals:clean(d.visuals,3000),audio:clean(d.audio,2500),pros:arr(d.pros,5,300),cons:arr(d.cons,5,300),verdict:clean(d.verdict,1800),score:Number.isFinite(score)?Math.round(Math.max(0,Math.min(10,score))*10)/10:null};
 for(const f of ['hook','story','style','visuals','audio','verdict'])if(!r[f])throw Error('المراجعة غير مكتملة: '+f);
 if(r.pros.length<3||r.score===null)throw Error('التقييم أو قائمة الإيجابيات غير مكتملة؛ يلزم 3 إيجابيات على الأقل ودرجة صالحة.');
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
  let res=await fetchWithRetry(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctrl.signal});
  if(res.status===400){const retry={...body};delete retry.response_format;res=await fetchWithRetry(url,{method:'POST',headers,body:JSON.stringify(retry),signal:ctrl.signal})}
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
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>12000)return Response.json({error:'حجم الطلب كبير جداً.'},{status:413});
  const body=JSON.parse(raw),title=clean(body.title,120),kind=body.kind==='game'?'game':body.kind==='series'?'series':body.kind==='movie'?'movie':'';
  if(title.length<2||!kind)return Response.json({error:'أدخل اسم العمل واختر فيلماً أو لعبة أو مسلسلاً.'},{status:400});
  const prompt=['اسم العمل: '+title,'النوع: '+(kind==='game'?'لعبة فيديو':kind==='series'?'مسلسل تلفزيوني':'فيلم سينمائي'),'اكتب مراجعة نقدية مفصلة اعتماداً على المعرفة الموثوقة فقط. إذا كان الاسم ملتبساً فاطلب توضيحاً ضمن hook أو اذكر الالتباس بوضوح ولا تنسب معلومات لعمل غير مؤكد. لا تحرق الأحداث ولا تدّع تجربة شخصية.','حلل العمل بحسب نوعه، وخصص كل محور لفكرة مختلفة مع أمثلة مؤكدة أو استنتاجات معلّمة بوضوح. لا تكرر أوصافاً عامة مثل رائع ومذهل دون تفسير أثرها.','game: حلل التحكم والاستجابة والأنظمة والتقدم وتصميم المراحل/العالم عندما تكون معروفة. movie: حلل السيناريو والإخراج والتمثيل والإيقاع. series: حلل بنية الموسم وتطور الشخصيات والإيقاع واتساق الحلقات.','لا تزعم أن العمل ترند أو رائج الآن ولا تذكر أرقاماً حديثة أو ترتيباً حالياً دون بيانات حديثة مقدمة في الطلب. لا تخلط بين الشعبية والجودة. الدرجة يجب أن تنبع من الحجج النقدية.','اكتب بالعربية الفصحى.'].join('\n');
  const out=await generate(env,prompt,title,kind);
  return Response.json({ok:true,review:out.review,provider:out.provider},{headers:{'cache-control':'no-store'}});
 }catch(e){console.error('AI review API:',e);return Response.json({error:e instanceof SyntaxError?'تعذر قراءة بيانات الطلب.':(e.message||'حدث خطأ غير متوقع.')},{status:500,headers:{'cache-control':'no-store'}})}
}
