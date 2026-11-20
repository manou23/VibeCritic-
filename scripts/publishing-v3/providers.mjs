import { parseJsonResponse } from "../review-json.mjs";
const env = process.env;
// One bounded OpenAI fallback request per publishing process; free providers remain preferred.
let openAICallsThisRun = 0;
const OPENAI_MAX_CALLS_PER_RUN = 1;
const OPENAI_MAX_OUTPUT_TOKENS = 5000;
const providers = [
  { id:"gemini", key:"GEMINI_API_KEY", enabled:env.PUBLISHER_V3_GEMINI_FREE_ONLY === "true", model:env.PUBLISHER_V3_GEMINI_MODEL || "gemini-2.5-flash" },
  { id:"groq", key:"GROQ_API_KEY", enabled:env.PUBLISHER_V3_GROQ_FREE_ONLY === "true", model:env.PUBLISHER_V3_GROQ_MODEL || "openai/gpt-oss-120b" },
  { id:"openrouter", key:"OPENROUTER_API_KEY", enabled:env.PUBLISHER_V3_OPENROUTER_FREE_ONLY === "true", model:env.PUBLISHER_V3_OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free" },
  { id:"openai", key:"OPENAI_API_KEY", enabled:env.PUBLISHER_V3_OPENAI_ENABLED === "true", model:env.PUBLISHER_V3_OPENAI_MODEL || "gpt-4o-mini" }
];
export function availableProviders() {
  return providers.filter(p => p.enabled && env[p.key] && (p.id !== "openrouter" || p.model.endsWith(":free")));
}
export async function generateJson(prompt, { providerId, skipProviderId, maxTokens = 10000 } = {}) {
  const pool = availableProviders().filter(p => p.id !== "openai" || openAICallsThisRun < OPENAI_MAX_CALLS_PER_RUN);
  const remaining = skipProviderId ? pool.filter(p=>p.id!==skipProviderId) : pool;
  const ordered = providerId ? pool.filter(p=>p.id===providerId) : (remaining.length ? remaining : pool);
  if (!ordered.length) throw new Error("No explicitly enabled AI provider is available");
  const errors = [];
  let requests = 0;
  for (const p of ordered) {
    requests++;
    try {
      const key = env[p.key];
      const providerMaxTokens = p.id === "openai" ? Math.min(maxTokens, OPENAI_MAX_OUTPUT_TOKENS) : maxTokens;
      if (p.id === "openai") openAICallsThisRun++;
      let url, headers = { "content-type":"application/json" }, body;
      if (p.id === "gemini") {
        url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(p.model) + ":generateContent?key=" + encodeURIComponent(key);
        body = { contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.35,maxOutputTokens:maxTokens,responseMimeType:"application/json"} };
      } else {
        url = p.id === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : p.id === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
        headers.authorization = "Bearer " + key;
        if (p.id === "openrouter") { headers["HTTP-Referer"]="https://vibecritic.pages.dev/"; headers["X-Title"]="VibeCritic"; }
        body = { model:p.model, ...(p.id === "openrouter" ? { models:[p.model,"google/gemma-4-26b-a4b-it:free","meta-llama/llama-3.3-70b-instruct:free"].filter((value,index,array)=>value.endsWith(":free") && array.indexOf(value)===index), plugins:[{id:"response-healing"}], provider:{require_parameters:true} } : {}), temperature:0.25, max_tokens:providerMaxTokens, response_format:{type:"json_object"}, messages:[{role:"system",content:"أنت محرر نقدي عربي دقيق. أعد JSON صالحاً فقط ولا تختلق معلومات."},{role:"user",content:prompt}] };
      }
      const response = await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
      if (!response.ok) throw new Error(p.id + " HTTP " + response.status + ": " + (await response.text()).slice(0,300));
      const data = await response.json();
      const choice = data.choices?.[0];
      const finishReason = p.id === "gemini" ? data.candidates?.[0]?.finishReason : choice?.finish_reason;
      if (finishReason === "length" || finishReason === "MAX_TOKENS") throw new Error(p.id + " output was truncated at max_tokens=" + maxTokens);
      const raw = p.id === "gemini" ? data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("") : choice?.message?.content;
      if (!raw) throw new Error(p.id + " returned an empty response (finish_reason=" + String(finishReason||"unknown") + ")");
      let value;
      try { value = parseJsonResponse(raw); }
      catch (error) {
        throw new Error(p.id + " returned invalid/incomplete JSON (finish_reason=" + String(finishReason||"unknown") + ", output_tokens=" + String(data.usage?.completion_tokens||data.usage?.output_tokens||"unknown") + "): " + error.message);
      }
      return { value, provider:p.id, tokens:Number(data.usage?.total_tokens)||0, requests };
    } catch (error) { errors.push(String(error.message||error)); }
  }
  const failure = new Error("All configured AI providers failed: " + errors.join(" | "));
  failure.requests = requests;
  throw failure;
}
