const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const normalize = value => clean(value).toLocaleLowerCase('ar')
  .replace(/[ًٌٍَُِّْـ]/gu, '')
  .replace(/[أإآ]/gu, 'ا')
  .replace(/ى/gu, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();
const names = value => list(value).map(entry => typeof entry === 'string' ? clean(entry) : clean(entry?.name)).filter(Boolean);
const oneName = value => typeof value === 'string' ? clean(value) : clean(value?.name);
const unique = values => [...new Set(list(values).map(clean).filter(Boolean))];
const normalizedSet = values => new Set(unique(values).map(normalize).filter(Boolean));
const overlap = (left, right) => {
  const a = normalizedSet(left), b = normalizedSet(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / (a.size + b.size - common);
};
const shared = (left, right) => {
  const b = normalizedSet(right);
  return unique(left).filter(value => b.has(normalize(value)));
};
const validDate = value => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
};

export function buildHistoricalProfile(item, reasoning = {}, criticalQuestions = {}) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const franchise = oneName(item?.franchise || item?.collection || metadata.franchise || metadata.collection);
  return {
    version: 1,
    workId: clean(item?.type) + ':' + clean(item?.id),
    workType: clean(item?.type),
    title: clean(item?.name || item?.title),
    releaseDate: clean(item?.date || item?.releaseDate),
    franchise,
    genres: unique([...names(item?.genres), ...names(metadata.genres)]).slice(0, 12),
    developers: unique([...names(item?.developers), ...names(metadata.developers)]).slice(0, 12),
    creators: unique([...names(metadata.creators), ...names(item?.creators)]).slice(0, 12),
    directors: unique([...names(metadata.directors), ...names(item?.directors)]).slice(0, 12),
    companies: unique([...names(metadata.productionCompanies), ...names(metadata.companies), ...names(item?.companies)]).slice(0, 12),
    selectedAngleId: clean(reasoning?.selected?.id),
    criticalQuestionIds: unique(list(criticalQuestions?.questions).map(question => question?.id)).slice(0, 12)
  };
}

function compareProfiles(current, previous) {
  const sameFranchise = Boolean(current.franchise && previous.franchise &&
    normalize(current.franchise) === normalize(previous.franchise));
  const sharedDevelopers = shared(current.developers, previous.developers);
  const sharedCreators = shared(current.creators, previous.creators);
  const sharedDirectors = shared(current.directors, previous.directors);
  const sharedCompanies = shared(current.companies, previous.companies);
  const sharedGenres = shared(current.genres, previous.genres);
  const genreOverlap = overlap(current.genres, previous.genres);
  const hasCreativeLink = sharedDevelopers.length || sharedCreators.length || sharedDirectors.length;
  const hasCompanyAndGenreLink = sharedCompanies.length && genreOverlap >= 0.25;
  const eligible = sameFranchise || hasCreativeLink || hasCompanyAndGenreLink;
  const score = Math.min(100, Math.round(
    (sameFranchise ? 45 : 0) +
    (sharedDevelopers.length ? 25 : 0) +
    (sharedCreators.length ? 20 : 0) +
    (sharedDirectors.length ? 20 : 0) +
    (sharedCompanies.length ? 15 : 0) +
    genreOverlap * 10
  ));
  const currentTime = validDate(current.releaseDate), previousTime = validDate(previous.releaseDate);
  const chronology = currentTime === null || previousTime === null ? 'unknown'
    : previousTime < currentTime ? 'earlier-work'
      : previousTime > currentTime ? 'later-work' : 'same-period';
  const links = [];
  if (sameFranchise) links.push('السلسلة/العالم المعلن: ' + current.franchise);
  if (sharedDevelopers.length) links.push('مطورون مشتركون: ' + sharedDevelopers.join('، '));
  if (sharedCreators.length) links.push('صنّاع/مبتكرون مشتركون: ' + sharedCreators.join('، '));
  if (sharedDirectors.length) links.push('مخرجون مشتركون: ' + sharedDirectors.join('، '));
  if (sharedCompanies.length) links.push('شركات إنتاج مشتركة: ' + sharedCompanies.join('، '));
  if (sharedGenres.length) links.push('تصنيفات مشتركة: ' + sharedGenres.join('، '));
  return {
    eligible, score, chronology, links,
    shared: { franchise: sameFranchise, developers: sharedDevelopers, creators: sharedCreators, directors: sharedDirectors, companies: sharedCompanies, genres: sharedGenres },
    genreOverlap: Number(genreOverlap.toFixed(3))
  };
}

export function buildHistoricalComparisonReport(currentProfile, previousProfiles = []) {
  const current = currentProfile && typeof currentProfile === 'object' ? currentProfile : {};
  const matches = list(previousProfiles)
    .filter(profile => profile && profile.workId !== current.workId && profile.workType === current.workType)
    .map(profile => ({
      workId: clean(profile.workId),
      title: clean(profile.title || profile.workId),
      releaseDate: clean(profile.releaseDate),
      ...compareProfiles(current, profile)
    }))
    .filter(match => match.eligible)
    .sort((a, b) => b.score - a.score || (validDate(a.releaseDate) || 0) - (validDate(b.releaseDate) || 0))
    .slice(0, 5);
  const earlier = matches.filter(match => match.chronology === 'earlier-work').length;
  const later = matches.filter(match => match.chronology === 'later-work').length;
  return {
    version: 1,
    workId: clean(current.workId),
    workType: clean(current.workType),
    status: matches.length ? 'historical-context-found' : 'no-linked-history',
    comparedCount: list(previousProfiles).filter(profile => profile?.workType === current.workType && profile?.workId !== current.workId).length,
    matchCount: matches.length,
    earlierWorks: earlier,
    laterWorks: later,
    matches,
    principle: 'القرابة الزمنية أو اشتراك الطاقم أو التصنيف يوفّر سياقاً للمقارنة فقط؛ لا يثبت التأثير أو الاقتباس أو تفوق عمل على آخر.'
  };
}

export function formatHistoricalComparisonContext(report) {
  if (!report) return '';
  const lines = report.matches.map(match => {
    const timeLabel = match.chronology === 'earlier-work' ? 'عمل أسبق زمنياً'
      : match.chronology === 'later-work' ? 'عمل لاحق زمنياً'
        : match.chronology === 'same-period' ? 'من الفترة الزمنية نفسها' : 'التسلسل الزمني غير محسوم';
    return '- «' + match.title + '» (' + (match.releaseDate || 'تاريخ غير متاح') + '؛ ' + timeLabel + '): ' + match.links.join('؛ ') + '.';
  });
  return [
    'سياق المقارنات التاريخية V1:',
    'الحالة: ' + report.status + '؛ الأعمال المرتبطة المتاحة: ' + report.matchCount + ' من ' + report.comparedCount + '.',
    ...(lines.length ? ['مقارنات تاريخية ذات رابط موثق:', ...lines] : ['لا توجد في الذاكرة الحالية أعمال سابقة مرتبطة بما يكفي لإجراء مقارنة تاريخية مسؤولة.']),
    report.principle,
    'استخدم الأعمال السابقة لتوضيح الاستمرارية أو التحول في السلسلة أو الفريق الإبداعي أو هوية المطور، إذا كانت البيانات تسمح. لا تفترض أن العمل الجديد أفضل أو أسوأ، ولا تنسب تأثيراً أو اقتباساً أو نية إبداعية لمجرد اشتراك الأسماء أو التصنيف. ميّز دائماً بين حقيقة الرابط والاستنتاج النقدي.'
  ].join('\n');
}

export function buildHistoricalComparisonRecord(report) {
  if (!report) return null;
  return {
    version: report.version,
    status: report.status,
    comparedCount: report.comparedCount,
    matchCount: report.matchCount,
    earlierWorks: report.earlierWorks,
    laterWorks: report.laterWorks,
    matches: report.matches.slice(0, 5).map(({ workId, title, releaseDate, score, chronology, shared: links }) =>
      ({ workId, title, releaseDate, score, chronology, shared: links })
    )
  };
}
