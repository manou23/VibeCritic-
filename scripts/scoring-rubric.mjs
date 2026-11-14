export const SCORE_BANDS = Object.freeze([
  { min: 9.5, max: 10, label: 'استثنائي ونادر' },
  { min: 9.0, max: 9.4, label: 'ممتاز جداً' },
  { min: 8.5, max: 8.9, label: 'ممتاز' },
  { min: 8.0, max: 8.4, label: 'جيد جداً' },
  { min: 7.0, max: 7.9, label: 'جيد' },
  { min: 6.0, max: 6.9, label: 'متوسط' },
  { min: 5.0, max: 5.9, label: 'دون المتوسط' },
  { min: 4.0, max: 4.9, label: 'ضعيف' },
  { min: 0.1, max: 3.9, label: 'ضعيف جداً' }
]);
export function scoreBandFor(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0.1 || score > 10) return null;
  return SCORE_BANDS.find(band => score >= band.min && score <= band.max) || null;
}
export const SCORE_SCALE_PROMPT = SCORE_BANDS.map(band => band.min.toFixed(1) + '–' + band.max.toFixed(1) + ': ' + band.label).join('؛ ');
