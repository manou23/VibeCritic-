import fs from 'node:fs/promises';
import path from 'node:path';

const dir='src/content/reviews';
const tmdbKey=String(process.env.TMDB_API_KEY||'').trim();
const youtubeKey=String(process.env.YOUTUBE_API_KEY||'').trim();
const rawgKey=String(process.env.RAWG_API_KEY||'').trim();
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
function setField(frontmatter,name,value){
  const line=name+': '+JSON.stringify(value);
  const pattern=new RegExp('^'+name+':.*$','m');
  return pattern.test(frontmatter)?frontmatter.replace(pattern,line):frontmatter+'\n'+line;
}
function validVideo(id){return /^[A-Za-z0-9_-]{11}$/.test(String(id||''));}
async function tmdbMedia(type,id){
  if(!tmdbKey||!id)return null;
  const mediaType=type==='series'?'tv':'movie';
  const data=await json('https://api.themoviedb.org/3/'+mediaType+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({api_key:tmdbKey,append_to_response:'videos',include_video_language:'en,null'}));
  const video=(data.videos?.results||[])
    .filter(v=>v.site==='YouTube'&&v.official===true&&['Trailer','Teaser'].includes(v.type)&&validVideo(v.key))
    .sort((a,b)=>(a.type==='Trailer'?0:1)-(b.type==='Trailer'?0:1)||String(b.published_at||'').localeCompare(String(a.published_at||'')))[0];
  return {
    poster:data.poster_path?'https://image.tmdb.org/t/p/w500'+data.poster_path:'',
    backdrop:data.backdrop_path?'https://image.tmdb.org/t/p/w1280'+data.backdrop_path:'',
    video:video?{id:video.key,title:video.name}:null
  };
}
async function rawgArtwork(id){
  if(!rawgKey||!id)return null;
  const data=await json('https://api.rawg.io/api/games/'+encodeURIComponent(id)+'?key='+encodeURIComponent(rawgKey));
  const image=data.background_image||data.background_image_additional||'';
  return {poster:image,backdrop:data.background_image_additional||image};
}
async function youtubeTrailer(title,type){
  if(!youtubeKey||!title)return null;
  const kind=type==='game'?'game trailer':type==='series'?'TV series official trailer':'official movie trailer';
  const query=new URLSearchParams({part:'snippet',q:title+' '+kind,type:'video',maxResults:'10',order:'relevance',videoEmbeddable:'true',videoSyndicated:'true',regionCode:'US',relevanceLanguage:'en',key:youtubeKey});
  const search=await json('https://www.googleapis.com/youtube/v3/search?'+query);
  const candidates=(search.items||[]).filter(x=>x.id?.videoId&&x.snippet?.title);
  if(!candidates.length)return null;
  const ids=candidates.map(x=>x.id.videoId).join(',');
  const details=await json('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'snippet,status',id:ids,key:youtubeKey}));
  const byId=new Map((details.items||[]).map(x=>[x.id,x]));
  const tokens=String(title).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(x=>x.length>2);
  const ranked=candidates.map(candidate=>{
    const video=byId.get(candidate.id.videoId);
    if(!video||video.status?.privacyStatus!=='public'||video.status?.embeddable!==true)return null;
    const videoTitle=candidate.snippet.title||'',channel=candidate.snippet.channelTitle||'';
    if(/fan.?made|concept trailer|reaction|review|parody|trailer breakdown|gameplay walkthrough/i.test(videoTitle))return null;
    if(!/\bofficial\b/i.test(videoTitle+' '+channel)||!(/\b(trailer|teaser)\b/i.test(videoTitle)))return null;
    const words=videoTitle.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/);
    const overlap=tokens.filter(t=>words.includes(t)).length;
    return overlap?{id:candidate.id.videoId,title:videoTitle,score:overlap}:null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return ranked[0]||null;
}
async function main(){
  const files=(await fs.readdir(dir)).filter(name=>name.endsWith('.md')).sort();
  let scanned=0,updated=0,imagesAdded=0,videosAdded=0,withoutVideo=0,withoutImage=0,errors=0;
  for(const file of files){
    const full=path.join(dir,file);
    let content=await fs.readFile(full,'utf8');
    const fm=content.match(/^---\n([\s\S]*?)\n---/);
    if(!fm)continue;
    let frontmatter=fm[1];
    const type=field(frontmatter,'type');
    if(!['movie','series','game'].includes(type))continue;
    const title=field(frontmatter,'title');
    const sourceId=field(frontmatter,'sourceId');
    const hasPoster=Boolean(field(frontmatter,'poster'));
    const hasBackdrop=Boolean(field(frontmatter,'backdrop'));
    const hasVideo=validVideo(field(frontmatter,'youtubeVideoId'));
    if(hasPoster&&hasBackdrop&&hasVideo)continue;
    scanned++;
    let image=null,video=null;
    try{
      if((type==='movie'||type==='series')&&tmdbKey&&(!hasPoster||!hasBackdrop||!hasVideo)){
        const data=await tmdbMedia(type,sourceId);
        if(data){
          image={poster:data.poster,backdrop:data.backdrop};
          video=data.video;
        }
      }else if(type==='game'&&(!hasPoster||!hasBackdrop)){
        const sourceName=field(frontmatter,'sourceName').toUpperCase();
        const sourceUrl=field(frontmatter,'sourceUrl').toLowerCase();
        if(rawgKey&&(sourceName==='RAWG'||sourceUrl.includes('rawg.io'))) image=await rawgArtwork(sourceId);
        else image={poster:field(frontmatter,'poster'),backdrop:field(frontmatter,'backdrop')||field(frontmatter,'poster')};
      }
      if(!hasVideo&&!video&&youtubeKey)video=await youtubeTrailer(title,type);
      let changed=false;
      if(!hasPoster){
        const poster=image?.poster||image?.backdrop||(video?.id?'https://img.youtube.com/vi/'+video.id+'/hqdefault.jpg':'');
        if(poster){frontmatter=setField(frontmatter,'poster',poster);imagesAdded++;changed=true;}
      }
      if(!hasBackdrop){
        const backdrop=image?.backdrop||image?.poster||(video?.id?'https://img.youtube.com/vi/'+video.id+'/hqdefault.jpg':'');
        if(backdrop){frontmatter=setField(frontmatter,'backdrop',backdrop);if(!image?.poster&&!image?.backdrop)imagesAdded++;changed=true;}
      }
      if(!hasVideo&&video?.id&&validVideo(video.id)){
        frontmatter=setField(frontmatter,'youtubeVideoId',video.id);
        frontmatter=setField(frontmatter,'youtubeVideoTitle',video.title||('Official trailer — '+title));
        videosAdded++;changed=true;
      }
      if(!field(frontmatter,'poster')&&!field(frontmatter,'backdrop'))withoutImage++;
      if(!validVideo(field(frontmatter,'youtubeVideoId')))withoutVideo++;
      if(changed){
        content=content.replace(fm[0],'---\n'+frontmatter+'\n---');
        await fs.writeFile(full,content,'utf8');
        updated++;
        console.log('Media enriched:',title,'image:',Boolean(field(frontmatter,'poster')||field(frontmatter,'backdrop')),'video:',validVideo(field(frontmatter,'youtubeVideoId')));
      }
    }catch(error){
      errors++;
      console.warn('Media lookup failed for '+file+': '+error.message);
    }
    await pause(180);
  }
  console.log(JSON.stringify({scanned,updated,imagesAdded,videosAdded,withoutImage,withoutVideo,errors,total:files.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
