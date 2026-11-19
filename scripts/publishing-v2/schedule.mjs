// Keep publication slots anchored to their scheduled timestamps, not invocation time.
export function nextScheduledAt(state, now, intervalMs) {
  const base = Number(state?.cycle?.nextPublishAt) || (now + intervalMs);
  const queuedSlots = Object.values(state?.jobs || {})
    .filter(job => job?.status === 'ready' && Number(job.scheduledFor) > 0)
    .map(job => Number(job.scheduledFor) + intervalMs);
  return Math.max(base, ...queuedSlots);
}

// Advance from the last scheduled slot so delayed runs can catch up one article per cycle.
export function nextPublishAtAfterSuccess(state, scheduledFor, intervalMs) {
  const currentSlot = Number(state?.cycle?.nextPublishAt) || 0;
  const publishedSlot = Number(scheduledFor) || 0;
  const anchor = Math.max(currentSlot, publishedSlot);
  return (anchor || Date.now()) + intervalMs;
}
