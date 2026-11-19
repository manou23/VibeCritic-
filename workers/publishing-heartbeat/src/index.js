const DISPATCH_URL = "https://api.github.com/repos/manou23/VibeCritic-/actions/workflows/publishing-v3.yml/dispatches";
const HEADERS = {
  accept: "application/vnd.github+json",
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "VibeCritic-Publishing-Heartbeat/3.0"
};
export async function dispatchPublishingWorkflow(env, fetchImpl = fetch) {
  const token = String(env?.GH_ACTIONS_TOKEN || "").trim();
  if (!token) throw new Error("Missing GH_ACTIONS_TOKEN secret");
  const response = await fetchImpl(DISPATCH_URL, {
    method: "POST",
    headers: { ...HEADERS, authorization: "Bearer " + token },
    body: JSON.stringify({ ref: "main" })
  });
  if (response.status !== 204) {
    const detail = await response.text().catch(() => "");
    throw new Error("GitHub workflow dispatch failed: HTTP " + response.status + " " + detail.slice(0,300));
  }
  return { dispatched: true, status: 204 };
}
export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller, env, context) {
    const task = dispatchPublishingWorkflow(env);
    if (context?.waitUntil) context.waitUntil(task);
    else await task;
  }
};
