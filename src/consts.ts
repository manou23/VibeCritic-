export const SITE_NAME = 'VibeCritic';
export const SITE_DESC = 'مراجعات يومية للألعاب والأفلام والمسلسلات الرائجة: إيجابيات وسلبيات وتقييم من 10.';
export type ReviewType = 'game' | 'movie' | 'series';
export const TYPE_LABEL: Record<ReviewType, string> = { game: 'لعبة', movie: 'فيلم', series: 'مسلسل' };
export const TYPE_PLURAL: Record<ReviewType, string> = { game: 'ألعاب', movie: 'أفلام', series: 'مسلسلات' };
export const url = (p = '') => {
  let base = import.meta.env.BASE_URL;
  if (base.endsWith('/')) base = base.slice(0, -1);
  if (p.startsWith('/')) p = p.slice(1);
  return \`\${base}/\${p}\`;
};
export const normalizeAr = (s: string) =>
  s.toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
export function scoreTone(score: number) {
  if (score >= 8) return { text: 'text-emerald-500', stroke: 'stroke-emerald-500', bg: 'bg-emerald-500', label: 'ممتاز' };
  if (score >= 6) return { text: 'text-amber-500', stroke: 'stroke-amber-500', bg: 'bg-amber-500', label: 'جيد' };
  if (score >= 4) return { text: 'text-orange-500', stroke: 'stroke-orange-500', bg: 'bg-orange-500', label: 'متوسط' };
  return { text: 'text-red-500', stroke: 'stroke-red-500', bg: 'bg-red-500', label: 'ضعيف' };
}
export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat('ar-u-ca-gregory', { dateStyle: 'long' }).format(new Date(d));
