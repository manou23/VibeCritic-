import { parseJsonResponse } from "../review-json.mjs";

const env = process.env;
const OPENAI_MAX_CALLS_PER_RUN = 2;
const OPENAI_MAX_OUTPUT_TOKENS = 10000;

export function availableProviders() {
  return env.OPENAI_API_KEY && env.PUBLISHER_V3_OPENAI_ENABLED === "true"
    ? [{ id:"openai", key:"OPENAI_API_KEY", model:env.PUBLISHER_V3_OPENAI_MODEL || "gpt-6-luna" }]
    : [];
}

export async function generateJson(prompt, { providerId, skipProviderId, maxTokens = 10000 } = {}) {
  const provider = availableProviders()[0];
  if (!provider || (providerId && provider.id !== providerId)) {
    throw new Error("OpenAI is not configured: add OPENAI_API_KEY and enable PUBLISHER_V3_OPENAI_ENABLED");
  }
  // A quality retry may use OpenAI again; it never falls back to another provider.
  if (skipProviderId && skipProviderId !== "openai") {
    throw new Error("Requested provider is not available: " + skipProviderId);
  }
  const calls = Number(globalThis.__vibecriticOpenAICalls || 0);
  if (calls >= OPENAI_MAX_CALLS_PER_RUN) {
    throw new Error("OpenAI per-run request limit reached (" + OPENAI_MAX_CALLS_PER_RUN + ")");
  }
  globalThis.__vibecriticOpenAICalls = calls + 1;
  const maxOutputTokens = Math.min(maxTokens, OPENAI_MAX_OUTPUT_TOKENS);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{ "content-type":"application/json", authorization:"Bearer " + env.OPENAI_API_KEY },
    body:JSON.stringify({
      model:provider.model,
      input:[
        { role:"system", content:[{type:"input_text",text:"أنت محرر نقدي عربي دقيق. أعد JSON صالحاً فقط ولا تختلق معلومات."}] },
        { role:"user", content:[{type:"input_text",text:prompt}] }
      ],
      max_output_tokens:maxOutputTokens,
      text:{format:{type:"json_object"}}
    }),
    signal:AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error("openai HTTP " + response.status + ": " + (await response.text()).slice(0,500));
  const data = await response.json();
  const raw = (data.output || [])
    .filter(item=>item.type==="message")
    .flatMap(item=>item.content || [])
    .filter(item=>item.type==="output_text")
    .map(item=>item.text || "")
    .join("");
  if (!raw) {
    const reason = data.incomplete_details?.reason || data.status || "unknown";
    throw new Error("openai returned an empty/incomplete response (reason=" + reason + ")");
  }
  let value;
  try { value = parseJsonResponse(raw); }
  catch (error) {
    throw new Error("openai returned invalid/incomplete JSON: " + error.message);
  }
  const usage = data.usage || {};
  return {
    value,
    provider:"openai",
    tokens:Number(usage.total_tokens) || (Number(usage.input_tokens||0)+Number(usage.output_tokens||0)),
    requests:1
  };
}
