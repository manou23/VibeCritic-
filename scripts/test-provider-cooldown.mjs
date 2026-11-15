import assert from 'node:assert/strict';
import { retryHintTimestamp } from './provider-cooldown.mjs';

const now = 1_800_000_000_000;

assert.equal(
  retryHintTimestamp('Please retry in 8h35m22.574086971s.', now),
  now + Math.ceil((8 * 3600 + 35 * 60 + 22.574086971) * 1000)
);
assert.equal(
  retryHintTimestamp('try again in 2m51.072s', now),
  now + Math.ceil((2 * 60 + 51.072) * 1000)
);
assert.equal(retryHintTimestamp('Retry in 45s', now), now + 45_000);
assert.equal(retryHintTimestamp('quota exceeded; no reset provided', now), null);
assert.equal(retryHintTimestamp('', now), null);

console.log('Provider cooldown retry-hint tests passed.');
