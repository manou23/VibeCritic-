import assert from 'node:assert/strict';
import { nextScheduledAt, nextPublishAtAfterSuccess } from './publishing-v2/schedule.mjs';

const hour = 60 * 60 * 1000;
const now = Date.parse('2026-11-19T12:00:00Z');
const overdue = { cycle: { nextPublishAt: now - 3 * hour }, jobs: {} };
assert.equal(nextScheduledAt(overdue, now, 45 * 60 * 1000), now - 3 * hour,
  'a missed publication slot must remain due instead of being reset to now');
assert.equal(nextPublishAtAfterSuccess(overdue, now - 3 * hour, 45 * 60 * 1000), now - 2.25 * hour,
  'successful catch-up advances from the scheduled slot, not wall-clock time');

const queued = { cycle: { nextPublishAt: now - hour }, jobs: {
  'movie:1': { status: 'ready', scheduledFor: now - hour },
  'game:2': { status: 'ready', scheduledFor: now - 15 * 60 * 1000 }
}};
assert.equal(nextScheduledAt(queued, now, 45 * 60 * 1000), now + 30 * 60 * 1000,
  'new ready articles must be spaced after all already queued publication slots');
assert.equal(nextPublishAtAfterSuccess({ cycle: { nextPublishAt: now - hour } }, now - 30 * 60 * 1000, 45 * 60 * 1000), now + 15 * 60 * 1000,
  'advancement must use the later of the current slot and published slot');
console.log('VibeCritic publication schedule recovery tests passed.');
