const DISPATCH_URL = "https://api.github.com/repos/manou23/VibeCritic-/actions/workflows/publishing-v3.yml/dispatches";
const HEADERS = {
  accept: "application/vnd.github+json",
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "VibeCritic-Publishing-Heartbeat/4.0"
};
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = status => status === 408 || status === 429 || status >= 500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function dispatchPublishingWorkflow(env, fetchImpl = fetch, sleepImpl = sleep) {
  const token = String(env?.GH_ACTIONS_TOKEN || "").trim();
  if (!token) throw new Error("Missing GH_ACTIONS_TOKEN secret");
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(DISPATCH_URL, {
        method: "POST",
        headers: { ...HEADERS, authorization: "Bearer " + token },
        body: JSON.stringify({ ref: "main" })
      });
      if (response.status === 204) return { dispatched: true, status: 204, attempts: attempt };
      const detail = await response.text().catch(() => "");
      lastError = new Error("GitHub workflow dispatch failed: HTTP " + response.status + " " + detail.slice(0,300));
      if (!RETRYABLE_STATUS(response.status) || attempt === MAX_ATTEMPTS) throw lastError;
    } catch (error) {
      lastError = error;
      if (String(error.message || "").startsWith("GitHub workflow dispatch failed: HTTP ") && !RETRYABLE_STATUS(Number(String(error.message).match(/HTTP (\d+)/)?.[1] || 0))) throw error;
      if (attempt === MAX_ATTEMPTS) throw new Error("GitHub workflow dispatch failed after " + attempt + " attempts: " + String(error.message || error));
    }
    await sleepImpl(250 * (2 ** (attempt - 1)));
  }
  throw lastError || new Error("GitHub workflow dispatch failed");
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "vibecritic-publishing-heartbeat", status: "ok", cron: "*/15 * * * *", purpose: "GitHub Actions publishing fallback" }, {
        headers: { "cache-control": "no-store" }
      });
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller, env, context) {
    const task = dispatchPublishingWorkflow(env)
      .then(result => console.log("Publishing heartbeat dispatched", JSON.stringify(result)))
      .catch(error => console.error("Publishing heartbeat failed", String(error?.message || error)));
    if (context?.waitUntil) context.waitUntil(task);
    else await task;
  }
};
