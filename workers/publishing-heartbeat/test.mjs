import assert from "node:assert/strict";
import { dispatchPublishingWorkflow } from "./src/index.js";
let captured;
const ok = await dispatchPublishingWorkflow({ GH_ACTIONS_TOKEN:"test-token" }, async (url, options) => {
  captured = { url, options };
  return { status:204 };
});
assert.deepEqual(ok,{dispatched:true,status:204});
assert.match(captured.url,/actions\/workflows\/publishing-v3\.yml\/dispatches$/);
assert.equal(captured.options.method,"POST");
assert.equal(captured.options.headers.authorization,"Bearer test-token");
assert.deepEqual(JSON.parse(captured.options.body),{ref:"main"});
await assert.rejects(dispatchPublishingWorkflow({},async()=>({status:204})),/Missing GH_ACTIONS_TOKEN/);
await assert.rejects(dispatchPublishingWorkflow({GH_ACTIONS_TOKEN:"test"},async()=>({status:403,text:async()=>"forbidden"})),/HTTP 403/);
console.log("Publishing V3 heartbeat tests passed.");
