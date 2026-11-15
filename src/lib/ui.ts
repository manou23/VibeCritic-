import type { ReviewType } from '../consts';

export const typeLabel: Record<ReviewType, string> = {
  game: 'لعبة',
  movie: 'فيلم',
  series: 'مسلسل',
};

export const scoreTone = (score?: number) => {
  if (!Number.isFinite(score)) return 'border-white/20 text-white/50';
  if (score! >= 7.5) return 'border-[#6dc849] text-[#6dc849]';
  if (score! >= 5) return 'border-[#fdca52] text-[#fdca52]';
  return 'border-[#fc4e4e] text-[#fc4e4e]';
};

export const releaseTimestamp = (value: unknown, fallback?: Date) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback instanceof Date && Number.isFinite(fallback.getTime()) ? fallback.getTime() : 0;
};
