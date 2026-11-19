import assert from 'node:assert/strict';
import { dispatchWorkflow } from './src/index.js';

let captured;
const result = await dispatchWorkflow({ GH_ACTIONS_TOKEN: 'test-token' }, async (url, init) => {
  captured = { url, init };
  return new Response(null, { status: 204 });
});
assert.equal(result.ok, true);
assert.match(captured.url, /actions\/workflows\/publishing-v2-automatic\.yml\/dispatches$/);
assert.equal(captured.init.method, 'POST');
assert.equal(captured.init.headers.Authorization, 'Bearer test-token');
assert.deepEqual(JSON.parse(captured.init.body), { ref: 'main' });

await assert.rejects(() => dispatchWorkflow({}, async () => new Response(null, { status: 204 })),
  /Missing Cloudflare secret: GH_ACTIONS_TOKEN/);
await assert.rejects(() => dispatchWorkflow({ GH_ACTIONS_TOKEN: 'test-token' }, async () =>
  new Response('forbidden', { status: 403 })), /HTTP 403/);
console.log('VibeCritic Cloudflare heartbeat tests passed.');
