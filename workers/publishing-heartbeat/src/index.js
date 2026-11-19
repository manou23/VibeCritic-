const OWNER = 'manou23';
const REPOSITORY = 'VibeCritic-';
const WORKFLOW = 'publishing-v2-automatic.yml';
const REF = 'main';
const DISPATCH_URL = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`;

export async function dispatchWorkflow(env, fetchImpl = fetch) {
  const token = String(env?.GITHUB_ACTIONS_TOKEN || '').trim();
  if (!token) throw new Error('Missing Cloudflare secret: GITHUB_ACTIONS_TOKEN');

  const response = await fetchImpl(DISPATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'VibeCritic-Publishing-Heartbeat'
    },
    body: JSON.stringify({ ref: REF }),
    redirect: 'error'
  });

  if (response.status !== 204) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`GitHub workflow dispatch failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return { ok: true, status: 204, workflow: WORKFLOW, ref: REF };
}

export default {
  async scheduled(_controller, env, context) {
    const task = dispatchWorkflow(env)
      .then(result => console.log('VibeCritic workflow dispatched:', JSON.stringify(result)))
      .catch(error => {
        console.error('VibeCritic heartbeat failed:', String(error?.message || error));
        throw error;
      });
    if (context?.waitUntil) context.waitUntil(task);
    else await task;
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  }
};
