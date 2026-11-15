 await recordEditorialCandidate(item,a); await recordEditorialCandidate(item,a);
 await updateContentJob(enriched,{status:'published',item:null,evidenceDossier:null,nextAttemptAt:0,lastError:null,publishedAt:new Date().toISOString()});
 return item.type+':'+item.id;
}
async function main(){
 await fs.mkdir(outDir,{recursive:true});await fs.mkdir('data',{recursive:true});await fs.mkdir('src/data',{recursive:true});
 await loadLearningMemory();await loadContentQueue();await loadProviderUsage();await refreshOpenRouterQuota();const publishingPlan=resourceDailyPublishingPlan();dailyTotalLimit=publishingPlan.limit;console.log('سقف النشر اليومي وفق الموارد المجانية:',dailyTotalLimit,'| نمط الحساب:',publishingPlan.mode);await saveProviderCapacity(publishingPlan);
 try{
  const top=await globalTrending();
  await fs.writeFile('src/data/trending.json',JSON.stringify(top,null,2)+'\n','utf8');
  console.log(`تم تحديث قائمة الترندات العالمية: ${top.length} أعمال.`);
 }catch(e){console.error('تعذر تحديث الترندات العالمية، سيتم الاحتفاظ بآخر قائمة:',e.message);}
 let done=[];try{done=JSON.parse(await fs.readFile(processedPath,'utf8'));}catch{}
 const publishedIndex=await loadPublishedIndex();
 console.log('سجل الأعمال المنشورة (published.json + ملفات المراجعات):',publishedIndex.size);
 const types=['game','series','movie'];
 const publishedFiles=(await fs.readdir(outDir)).filter(name=>name.endsWith('.md'));
 const publishedKeys=publishedIndex;
 const publishedModes=new Map();
 const counts={game:0,series:0,movie:0},todayCounts={game:0,series:0,movie:0};
 const today=algeriaDate();
 for(const file of publishedFiles){
  const type=types.find(value=>file.startsWith(value+'-'));if(!type)continue;
  counts[type]++;
  const content=await fs.readFile(path.join(outDir,file),'utf8');
  const id=file.match(/-(\d+)\.md$/)?.[1];
  if(id){const key=type+':'+id,declaredMode=content.match(/^reviewMode:\s*(preview|review)\s*$/m)?.[1],legacyPreview=!declaredMode&&/قراءة استباقية/i.test(content.slice(0,5000));publishedKeys.add(key);publishedModes.set(key,declaredMode||(legacyPreview?'preview':'review'));}
  // Daily quotas count only AI-generated reviews, never manually authored articles.
  // The frontmatter "date" is the work's release date, not its publication date.
  if(/^aiGenerated:\s*true\s*$/m.test(content)){
   let publicationDate=content.match(/^publishedAt:\s*["']?([^"'\\r\\n]+)["']?\s*$/m)?.[1]?.trim();
   // Legacy AI reviews without an explicit publication timestamp are not counted.
   // Git commit dates are not reliable publication dates (bulk edits can reset them).
   // New AI publications always write publishedAt in the review frontmatter.
   if(publicationDate){
    const parsed=new Date(publicationDate);
    if(Number.isFinite(parsed.getTime())&&parsed.toLocaleDateString('en-CA',{timeZone:'Africa/Algiers'})===today)todayCounts[type]++;
   }
  }
 }
 const totalPublished=Object.values(counts).reduce((sum,value)=>sum+value,0);
 const buildPhase=totalPublished<initialLibraryMilestone;
 console.log('إجمالي المراجعات:',totalPublished,'/',initialLibraryMilestone,'| حسب القسم:',JSON.stringify(counts));
 console.log('وضع النشر:',buildPhase?'استكمال المكتبة الأولية حتى 100 مقالة':'النشر المستمر: رصد الإصدارات الجديدة دون سقف إجمالي للمقالات');
 let rawPools;
 if(buildPhase){
  const [futureGames,recentGames,archiveGames,futureSeries,futureMovies,seriesNow,movieNow,seriesArchive,movieArchive]=await Promise.all([upcomingGames(),games(),gamesArchive(),tmdb('series','upcoming'),tmdb('movie','upcoming'),tmdb('series'),tmdb('movie'),tmdb('series','archive'),tmdb('movie','archive')]);
  rawPools={game:[...futureGames,...recentGames,...archiveGames],series:[...futureSeries,...seriesNow,...seriesArchive],movie:[...futureMovies,...movieNow,...movieArchive]};
 }else{
  const [futureGames,recentGames,futureSeries,recentSeries,futureMovies,recentMovies]=await Promise.all([upcomingGames(),games(),tmdb('series','upcoming'),tmdb('series','releases'),tmdb('movie','upcoming'),tmdb('movie','releases')]);
  rawPools={game:[...futureGames,...recentGames],series:[...futureSeries,...recentSeries],movie:[...futureMovies,...recentMovies]};
 }
 const eligible=items=>{
  const seen=new Set();
  return items.filter(x=>{
   const key=x.type+':'+x.id,upgrade=isPreviewUpgrade(x,publishedModes,today);
   if(seen.has(key)||String(x.description||'').trim().length<60||((done.includes(key)||publishedKeys.has(key))&&!upgrade))return false;
   const releaseDate=String(x.date||'').slice(0,10);
   const recentCutoff=addDays(today,-730);
   // Do not fill the catalogue with unrelated classics: keep archive candidates to the last two years.
   // Explicitly prioritized major franchises remain eligible even when their release date is older.
   if(!upgrade&&editorialPriority(x)>=999&&/^\\d{4}-\\d{2}-\\d{2}$/.test(releaseDate)&&releaseDate<recentCutoff)return false;
   if(x.type==='game'&&!upgrade&&communityDemand(x)<2&&editorialPriority(x)>=999)return false;
   seen.add(key);return true;
  }).sort((a,b)=>{
   const upgradeA=isPreviewUpgrade(a,publishedModes,today)?1:0,upgradeB=isPreviewUpgrade(b,publishedModes,today)?1:0;
   const priorityDiff=editorialPriority(a)-editorialPriority(b);
   if(priorityDiff!==0)return upgradeB-upgradeA||priorityDiff;
   const dateA=String(a.date||''),dateB=String(b.date||'');
   const recentA=/^\\d{4}-\\d{2}-\\d{2}$/.test(dateA)?dateA:'0000-00-00';
   const recentB=/^\\d{4}-\\d{2}-\\d{2}$/.test(dateB)?dateB:'0000-00-00';
   return upgradeB-upgradeA||recentB.localeCompare(recentA)||communityDemand(b)-communityDemand(a)||Number(b.popularity||0)-Number(a.popularity||0);
  });
 };
 const pools={game:eligible(rawPools.game),series:eligible(rawPools.series),movie:eligible(rawPools.movie)};
 const pendingJobs=resumableContentJobs();
 const deferredKeys=new Set(Object.values(contentQueue.jobs).filter(job=>['waiting','ready','generating','quality-check'].includes(job.status)&&Number(job.nextAttemptAt||0)>Date.now()).map(job=>job.key));
 for(const type of types){
  const resumed=pendingJobs.filter(job=>job.type===type).map(job=>job.item).filter(item=>item&&!publishedKeys.has(contentJobKey(item)));
  const seen=new Set();
  pools[type]=[...resumed,...pools[type].filter(item=>!deferredKeys.has(contentJobKey(item)))].filter(item=>{const key=contentJobKey(item);if(seen.has(key))return false;seen.add(key);return true;});
 }
 console.log('مهام الطابور الدائم الجاهزة للاستئناف:',pendingJobs.length);
 const skippedThinSources=Object.values(rawPools).reduce((total,items)=>total+items.filter(x=>String(x.description||'').trim().length<60).length,0);
 if(skippedThinSources)console.warn('تم استبعاد '+skippedThinSources+' أعمال لعدم توفر وصف مصدر كافٍ لتوليد مراجعة موثوقة.');
 let quotas={game:0,series:0,movie:0};
 const publishedToday=Object.values(todayCounts).reduce((sum,value)=>sum+value,0);
 const dailyRemaining=Math.max(0,dailyTotalLimit-publishedToday);
 console.log('سقف النشر اليومي الإجمالي:',dailyTotalLimit,'| المنشور حتى الآن:',publishedToday,'| المتبقي:',dailyRemaining);
 if(buildPhase){
  let remaining=Math.min(dailyRemaining,perRunLimit,Math.max(0,initialLibraryMilestone-totalPublished));
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
  let remaining=Math.min(dailyRemaining,perRunLimit);
  // Keep game, film and series publishing balanced after the initial library is complete.
  // Prefer the section with fewer published reviews; candidate count breaks ties only.
  const order=[...types].sort((a,b)=>counts[a]-counts[b]||pools[b].length-pools[a].length);
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
  let candidateAttempts=0;
  while(quotas[type]>0&&pools[type].length>0&&candidateAttempts<5){
   const item=pools[type].shift();candidateAttempts++;
   try{
    const key=type+':'+item.id,upgraded=isPreviewUpgrade(item,publishedModes,today);
    done.push(await writeReview(item));
    quotas[type]--;
    if(!upgraded)counts[type]++;
    publishedKeys.add(key);publishedModes.set(key,'review');
    await savePublishedIndex(publishedKeys);
    fresh.push({...item,upgradedFromPreview:upgraded});
    console.log(upgraded?'تم تحويل القراءة الاستباقية إلى مراجعة بعد الإصدار:':'تم إنشاء مراجعة:',item.name,'|',type,'| الإجمالي:',Object.values(counts).reduce((sum,value)=>sum+value,0));
   }catch(e){generationFailures++;console.error('تعذر إنشاء مراجعة:',item.name,e.message);}
  }
 }
 if(!fresh.length&&generationFailures>0)throw new Error('فشلت جميع محاولات توليد المراجعات في هذه الدفعة؛ راجع سجلات المزوّدات ومفاتيح API.');
 await fs.writeFile('data/new-reviews.json',JSON.stringify(fresh.map(item=>({type:item.type,id:String(item.id),upgradedFromPreview:Boolean(item.upgradedFromPreview)})),null,2),'utf8');
 if(!fresh.length)console.log(buildPhase?'لا توجد أعمال جديدة صالحة لاستكمال المكتبة في هذه الدفعة.':'لم يتم العثور على إصدارات جديدة مؤهلة خلال آخر 7 أيام.');
 if(generationFailures>0)console.warn('تم تجاوز '+generationFailures+' أعمال بسبب أخطاء توليد، مع الاحتفاظ بالمراجعات الناجحة.');
 await fs.writeFile(processedPath,JSON.stringify([...new Set(done)],null,2)+'\n');
 await savePublishedIndex(publishedKeys);
 await persistFailedQueueCheckpoint();
 const finalTotal=Object.values(counts).reduce((sum,value)=>sum+value,0);
 console.log(finalTotal>=initialLibraryMilestone?'تم بلوغ المحطة الأولى (100 مقالة)؛ يستمر الناشر في التشغيلات القادمة برصد الإصدارات الجديدة ونشر المؤهل منها دون سقف إجمالي.':`المتبقي للمحطة الأولى (100 مقالة): ${initialLibraryMilestone-finalTotal}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
 main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>flushSourceCache().catch(error=>{console.error('تعذر حفظ ذاكرة المصادر في D1:',error.message);process.exitCode=1;}));
}
