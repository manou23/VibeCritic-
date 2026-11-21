import assert from "node:assert/strict";
import worker, { dispatchPublishingWorkflow } from "./src/index.js";

let captured;
const ok = await dispatchPublishingWorkflow({ GH_ACTIONS_TOKEN:"test-token" }, async (url, options) => {
  captured = { url, options };
  return { status:204 };
});
assert.deepEqual(ok,{dispatched:true,status:204,attempts:1});
assert.match(captured.url,/actions\/workflows\/publishing-v3\.yml\/dispatches$/);
assert.equal(captured.options.method,"POST");
assert.equal(captured.options.headers.authorization,"Bearer test-token");
assert.deepEqual(JSON.parse(captured.options.body),{ref:"main"});

await assert.rejects(dispatchPublishingWorkflow({},async()=>({status:204})),/Missing GH_ACTIONS_TOKEN/);

let transientCalls = 0;
const recovered = await dispatchPublishingWorkflow(
  { GH_ACTIONS_TOKEN:"test-token" },
  async () => ({ status: ++transientCalls === 1 ? 503 : 204, text:async()=>"temporary outage" }),
  async () => {}
);
assert.deepEqual(recovered,{dispatched:true,status:204,attempts:2});
assert.equal(transientCalls,2);

let forbiddenCalls = 0;
await assert.rejects(
  dispatchPublishingWorkflow({GH_ACTIONS_TOKEN:"test"},async()=>{forbiddenCalls++;return {status:403,text:async()=>"forbidden"};},async()=>{}),
  /HTTP 403/
);
assert.equal(forbiddenCalls,1);

let exhaustedCalls = 0;
await assert.rejects(
  dispatchPublishingWorkflow({GH_ACTIONS_TOKEN:"test"},async()=>{exhaustedCalls++;return {status:503,text:async()=>"unavailable"};},async()=>{}),
  /after 3 attempts/
);
assert.equal(exhaustedCalls,3);

const health = await worker.fetch(new Request("https://heartbeat.example/health"));
assert.equal(health.status,200);
assert.equal(health.headers.get("cache-control"),"no-store");
assert.deepEqual(await health.json(),{
  service:"vibecritic-publishing-heartbeat",
  status:"ok",
  cron:"15 7,10,13,16,19 * * *",
  purpose:"GitHub Actions publishing scheduler"
});
assert.equal((await worker.fetch(new Request("https://heartbeat.example/"))).status,404);
console.log("Publishing V3 heartbeat tests passed.");
