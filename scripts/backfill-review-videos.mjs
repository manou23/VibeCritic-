import fs from 'node:fs/promises';
import path from 'node:path';

const dir='src/content/reviews';
const tmdbKey=String(process.env.TMDB_API_KEY||'').trim();
const youtubeKey=String(process.env.YOUTUBE_API_KEY||'').trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function json(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}
function field(frontmatter,name){
  const match=frontmatter.match(new RegExp('^'+name+':\\s*(.*)$','m'));
  if(!match)return '';
  const raw=match[1].trim();
  if(raw.startsWith('"')){try{return JSON.parse(raw);}catch{}}
  if(raw.startsWith("'")&&raw.endsWith("'"))return raw.slice(1,-1);
  return raw;
}
function videoFields(id,title){
  return 'youtubeVideoId: '+JSON.stringify(id)+'\\nyoutubeVideoTitle: '+JSON.stringify(title)+'\\n';
}
async function movieOrSeries(type,id){
  if(!tmdbKey||!id)return null;
  const mediaType=type==='series'?'tv':'movie';
  const data=await json('https://api.themoviedb.org/3/'+mediaType+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({api_key:tmdbKey,append_to_response:'videos'}));
  const video=(data.videos?.results||[])
    .filter(v=>v.site==='YouTube'&&v.official===true&&['Trailer','Teaser'].includes(v.type)&&/^[A-Za-z0-9_-]{11}$/.test(v.key||''))
    .sort((a,b)=>(a.type==='Trailer'?0:1)-(b.type==='Trailer'?0:1)||String(b.published_at||'').localeCompare(String(a.published_at||'')))[0];
  return video?{id:video.key,title:video.name}:null;
}
async function gameTrailer(title){
  if(!youtubeKey||!title)return null;
  const query=new URLSearchParams({part:'snippet',q:title+' official game trailer',type:'video',maxResults:'10',order:'relevance',videoEmbeddable:'true',videoSyndicated:'true',regionCode:'US',relevanceLanguage:'en',key:youtubeKey});
  const search=await json('https://www.googleapis.com/youtube/v3/search?'+query);
  const candidates=(search.items||[]).filter(x=>x.id?.videoId&&x.snippet?.title);
  if(!candidates.length)return null;
  const ids=candidates.map(x=>x.id.videoId).join(',');
  const details=await json('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'snippet,status',id:ids,key:youtubeKey}));
  const byId=new Map((details.items||[]).map(x=>[x.id,x]));
  const tokens=String(title).toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').split(/[^a-z0-9]+/).filter(x=>x.length>2);
  const ranked=candidates.map(candidate=>{
    const video=byId.get(candidate.id.videoId);
    if(!video||video.status?.privacyStatus!=='public'||video.status?.embeddable!==true)return null;
    const videoTitle=candidate.snippet.title||'',channel=candidate.snippet.channelTitle||'';
    if(/fan.?made|concept trailer|reaction|review|parody|trailer breakdown|gameplay walkthrough/i.test(videoTitle))return null;
    if(!/\\bofficial\\b/i.test(videoTitle+' '+channel)||!/\\b(trailer|teaser)\\b/i.test(videoTitle))return null;
    const words=videoTitle.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').split(/[^a-z0-9]+/);
    const overlap=tokens.filter(t=>words.includes(t)).length;
    return overlap?{id:candidate.id.videoId,title:videoTitle,score:overlap}:null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return ranked[0]||null;
}
async function main(){
  const files=(await fs.readdir(dir)).filter(name=>name.endsWith('.md')).sort();
  let scanned=0,updated=0,missing=0,errors=0;
  for(const file of files){
    const full=path.join(dir,file);
    let content=await fs.readFile(full,'utf8');
    const fm=content.match(/^---\\n([\\s\\S]*?)\\n---/);
    if(!fm)continue;
    const frontmatter=fm[1];
    if(field(frontmatter,'youtubeVideoId'))continue;
    const type=field(frontmatter,'type');
    if(!['movie','series','game'].includes(type))continue;
    scanned++;
    const title=field(frontmatter,'title'),sourceId=field(frontmatter,'sourceId');
    if((type==='game'&&!youtubeKey)||((type==='movie'||type==='series')&&!tmdbKey)){missing++;continue;}
    try{
      const video=type==='game'?await gameTrailer(title):await movieOrSeries(type,sourceId);
      if(!video){missing++;console.log('No suitable public/embeddable video:',file);continue;}
      const fields=videoFields(video.id,video.title);
      let updatedFrontmatter;
      if(/^backdrop:.*$/m.test(frontmatter))updatedFrontmatter=frontmatter.replace(/^(backdrop:.*\\n)/m,'$1'+fields);
      else if(/^poster:.*$/m.test(frontmatter))updatedFrontmatter=frontmatter.replace(/^(poster:.*\\n)/m,'$1'+fields);
      else updatedFrontmatter=frontmatter+'\\n'+fields.trimEnd();
      content=content.replace(fm[0],'---\\n'+updatedFrontmatter+'\\n---');
      await fs.writeFile(full,content,'utf8');
      updated++;
      console.log('Added trailer:',title,'->',video.id);
    }catch(error){errors++;console.warn('Video lookup failed for '+file+': '+error.message);}
    await pause(180);
  }
  console.log(JSON.stringify({scanned,updated,withoutVideo:missing,errors,total:files.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
