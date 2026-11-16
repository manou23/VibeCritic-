import assert from 'node:assert/strict';
import { selectActiveDraftJob } from './generate-reviews.mjs';

const now = 1_800_000_000_000;
const draft = (key, createdAt, nextAttemptAt, status = 'waiting', stage = 1) => ({
  key,
  createdAt,
  nextAttemptAt,
  status,
  item: { type: 'game', id: key },
  draft: { stage, sections: [] }
});

const deferredOld = draft('old-deferred', '2026-11-15T10:00:00.000Z', now + 60_000);
const dueNew = draft('new-due', '2026-11-16T10:00:00.000Z', now - 1);
assert.equal(
  selectActiveDraftJob([deferredOld, dueNew], now)?.key,
  'new-due',
  'a deferred draft must not block another draft whose retry time has arrived'
);
assert.equal(
  selectActiveDraftJob([deferredOld], now),
  null,
  'a draft still in provider cooldown must not be selected as active'
);
assert.equal(
  selectActiveDraftJob([draft('due-old', '2026-11-14T10:00:00.000Z', now - 1), dueNew], now)?.key,
  'due-old',
  'among due drafts, preserve the oldest-first resume order'
);
assert.equal(
  selectActiveDraftJob([{ ...dueNew, status: 'published' }], now),
  null,
  'published jobs must never be resumed'
);

console.log('Content queue cooldown/resume tests passed.');
