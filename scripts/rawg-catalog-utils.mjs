export function normalizeGameTitle(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function selectExactRawgMatch(results, title, year) {
  const target = normalizeGameTitle(title);
  if (!target || !Array.isArray(results)) return null;
  const matches = results.filter(item => normalizeGameTitle(item?.name) === target);
  if (matches.length === 1) return matches[0];
  if (!matches.length) return null;
  const targetYear = Number(String(year || '').slice(0, 4)) || null;
  if (!targetYear) return null;
  const dated = matches.map(item => ({ item, year: Number(String(item?.released || '').slice(0, 4)) || null })).filter(entry => entry.year);
  if (!dated.length) return null;
  const exactYear = dated.filter(entry => entry.year === targetYear);
  if (exactYear.length === 1) return exactYear[0].item;
  if (exactYear.length > 1) return null;
  const distance = Math.min(...dated.map(entry => Math.abs(entry.year - targetYear)));
  const nearest = dated.filter(entry => Math.abs(entry.year - targetYear) === distance);
  return nearest.length === 1 && distance <= 1 ? nearest[0].item : null;
}

export function hasCompleteRawgMetadata(frontmatter) {
  const text = String(frontmatter || '');
  const scalar = key => {
    const match = text.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  const hasKey = key => new RegExp('^' + key + ':', 'm').test(text);
  return /^\d+$/.test(scalar('rawgSourceId')) &&
    /^https:\/\/rawg\.io\/games\/[^\s]+$/i.test(scalar('rawgSourceUrl')) &&
    ['rawgReleaseDate', 'rawgGenres', 'rawgPlatforms', 'rawgDevelopers'].every(hasKey);
}
