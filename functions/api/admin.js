const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
const REPO_DEFAULT="manou23/VibeCritic-";
const SETTINGS_PATH="data/publisher-v2-settings.json";
const WORKFLOW="publishing-v2-schedule.yml";
function decodePart(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))));}
function b64url(value){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
async function accessIdentity(request,env){
 const token=request.headers.get("cf-access-jwt-assertion");
 if(!token||!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD||!env.ADMIN_EMAIL)throw new Error("ADMIN_ACCESS_NOT_CONFIGURED");
 const parts=token.split(".");if(parts.length!==3)throw new Error("INVALID_ACCESS_TOKEN");
 const header=decodePart(parts[0]),claims=decodePart(parts[1]),team=String(env.CF_ACCESS_TEAM_DOMAIN).replace(/\/+$/,"");
 if(claims.iss!==team||!Array.isArray([].concat(claims.aud)).includes(env.CF_ACCESS_AUD)||Number(claims.exp||0)<=Date.now()/1000||Number(claims.nbf||0)>Date.now()/1000)throw new Error("INVALID_ACCESS_CLAIMS");
 const jwksResponse=await fetch(team+"/cdn-cgi/access/certs",{headers:{accept:"application/json"}});
 if(!jwksResponse.ok)throw new Error("ACCESS_KEYS_UNAVAILABLE");
 const jwks=await jwksResponse.json(),key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==="RSA");if(!key)throw new Error("ACCESS_KEY_NOT_FOUND");
 const publicKey=await crypto.subtle.importKey("jwk",key,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",publicKey,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
 if(!valid)throw new Error("INVALID_ACCESS_SIGNATURE");
 const email=String(claims.email||"").toLowerCase(),allowed=String(env.ADMIN_EMAIL).split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!email||!allowed.includes(email))throw new Error("ADMIN_EMAIL_NOT_ALLOWED");return {email};
}
function githubHeaders(env){return {authorization:"Bearer "+env.GITHUB_ADMIN_TOKEN,accept:"application/vnd.github+json","x-github-api-version":"2022-11-28","content-type":"application/json"};}
async function github(env,path,options={}){
 const response=await fetch("https://api.github.com/repos/"+(env.GITHUB_REPOSITORY||REPO_DEFAULT)+path,{...options,headers:{...githubHeaders(env),...(options.headers||{})}});
 const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error("GITHUB_"+response.status+": "+String(body.message||"GitHub request failed").slice(0,240));return body;
}
function safeSettings(value){
 value=value&&typeof value==="object"?value:{};const interval=Number(value.intervalMinutes||30),enabled=value.enabled!==false,start=String(value.startTime||"00:00"),end=String(value.endTime||"23:59"),timezone=String(value.timezone||"Africa/Algiers");
 if(![30,45,60,90,120,180].includes(interval))throw new Error("الفاصل الزمني غير مسموح.");
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))throw new Error("صيغة وقت التشغيل غير صحيحة.");
 try{new Intl.DateTimeFormat("en",{timeZone:timezone}).format(new Date());}catch{throw new Error("المنطقة الزمنية غير صالحة.");}
 return {version:1,enabled,intervalMinutes:interval,startTime:start,endTime:end,timezone,updatedAt:new Date().toISOString()};
}
function decodeFile(content){return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\n/g,"")),c=>c.charCodeAt(0)));}
async function getSettings(env){try{const file=await github(env,"/contents/"+SETTINGS_PATH);return {settings:JSON.parse(decodeFile(file.content)),sha:file.sha};}catch(e){if(String(e.message).includes("GITHUB_404"))return {settings:safeSettings({}),sha:null};throw e;}}
async function getState(env){
 const response=await fetch("https://raw.githubusercontent.com/"+(env.GITHUB_REPOSITORY||REPO_DEFAULT)+"/main/data/publisher-v2-state.json",{headers:{accept:"application/json"}});
 if(!response.ok)throw new Error("PUBLISHER_STATE_HTTP_"+response.status);
 const state=await response.json(),jobs=Object.values(state.jobs||{}),counts=jobs.reduce((out,job)=>{out[job.status]=(out[job.status]||0)+1;return out;},{});
 const errors=jobs.filter(job=>job.lastError&&["waiting","rejected","abandoned"].includes(job.status)).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))).slice(0,12).map(job=>({key:job.key,title:job.item?.name||job.item?.originalTitle||job.key,status:job.status,stage:job.stage,lastError:String(job.lastError).slice(0,400),updatedAt:job.updatedAt}));
 const active=jobs.filter(job=>["queued","researching","writing","waiting","quality-check","ready"].includes(job.status)).sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")))[0]||null;
 return {updatedAt:state.updatedAt||null,counts,total:jobs.length,active:active?{key:active.key,title:active.item?.name||active.item?.originalTitle||active.key,status:active.status,stage:active.stage,nextAttemptAt:active.nextAttemptAt,lastError:active.lastError}:null,errors,published:counts.published||0,abandoned:counts.abandoned||0};
}
async function dashboard(env){
 const [settings,state,runs]=await Promise.all([getSettings(env),getState(env),github(env,"/actions/workflows/"+WORKFLOW+"/runs?per_page=15").catch(error=>({workflowError:String(error.message)}))]);
 return {settings:settings.settings,settingsSha:settings.sha,state,runs:(runs.workflow_runs||[]).map(run=>({id:run.id,name:run.name,event:run.event,status:run.status,conclusion:run.conclusion,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url,run_number:run.run_number})),workflowError:runs.workflowError||null,repository:env.GITHUB_REPOSITORY||REPO_DEFAULT};
}
function errorResponse(error){const m=String(error.message||error),status=m==="ADMIN_ACCESS_NOT_CONFIGURED"?503:m==="ADMIN_EMAIL_NOT_ALLOWED"?403:401;return json({error:m==="ADMIN_ACCESS_NOT_CONFIGURED"?"لم يتم إعداد حماية Cloudflare Access للوحة الإدارة.":m},status);}
export async function onRequestGet({request,env}){try{const identity=await accessIdentity(request,env);if(!env.GITHUB_ADMIN_TOKEN)return json({error:"GITHUB_ADMIN_TOKEN غير مهيأ."},503);return json({...await dashboard(env),identity:{email:identity.email}});}catch(error){return errorResponse(error);}}
export async function onRequestPost({request,env}){
 try{
  const identity=await accessIdentity(request,env);if(!env.GITHUB_ADMIN_TOKEN)return json({error:"GITHUB_ADMIN_TOKEN غير مهيأ."},503);
  const body=await request.json().catch(()=>null);if(!body||typeof body!=="object")return json({error:"طلب غير صالح."},400);
  if(body.action==="settings"){
   const settings=safeSettings(body.settings),current=await getSettings(env);
   const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(settings,null,2)+"\n")));
   const payload={message:"chore(admin): update publisher schedule settings",content:encoded,branch:"main"};if(current.sha)payload.sha=current.sha;
   const saved=await github(env,"/contents/"+SETTINGS_PATH,{method:"PUT",body:JSON.stringify(payload)});
   return json({ok:true,settings,commit:saved.commit?.html_url||null,updatedBy:identity.email});
  }
  if(body.action==="run-now"){await github(env,"/actions/workflows/"+WORKFLOW+"/dispatches",{method:"POST",body:JSON.stringify({ref:"main"})});return json({ok:true,message:"تم إرسال طلب تشغيل يدوي إلى GitHub Actions."});}
  return json({error:"الإجراء غير معروف."},400);
 }catch(error){return errorResponse(error);}
}