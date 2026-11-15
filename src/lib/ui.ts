import type { ReviewType } from '../consts';
export const typeLabel: Record<ReviewType,string> = {game:'لعبة',movie:'فيلم',series:'مسلسل'};
export const scoreTone=(s?:number)=>!Number.isFinite(s)?'border-white/20 text-white/50':s!>=7.5?'border-[#6dc849] text-[#6dc849]':s!>=5?'border-[#fdca52] text-[#fdca52]':'border-[#fc4e4e] text-[#fc4e4e]';
export const releaseTimestamp=(value:unknown,fallback?:Date)=>{if(value instanceof Date&&Number.isFinite(value.getTime()))return value.getTime();if(typeof value==='string'&&value.trim()){const n=Date.parse(value);if(Number.isFinite(n))return n;}return fallback instanceof Date&&Number.isFinite(fallback.getTime())?fallback.getTime():0;};
