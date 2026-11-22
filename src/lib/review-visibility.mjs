/**
 * Controls which review documents are promoted as completed reviews.
 * Legacy entries without reviewMode remain visible only when they carry
 * a valid numeric editorial score; limited evidence and previews never do.
 */
export function isPublicReview(data) {
  if (!data || data.reviewMode === "limited" || data.reviewMode === "preview") return false;
  if (data.reviewMode === "review" || data.reviewMode === "audience") return true;
  return data.reviewMode == null
    && typeof data.score === "number"
    && Number.isFinite(data.score)
    && data.score >= 0
    && data.score <= 10;
}

export function isAdvancePreview(data, today = new Date().toISOString().slice(0, 10)) {
  if (data?.reviewMode !== "preview") return false;
  const releaseDate = String(data.releaseDate || "").slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(releaseDate) && releaseDate > today;
}
