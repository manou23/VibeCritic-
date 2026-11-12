# VibeCritic AI Review API

The interactive reviewer lives at \`/ai-review/\`. Its backend is a Cloudflare Pages Function at \`/api/review\`. Provider credentials are read only on the server; never add API keys to \`PUBLIC_*\` variables or browser code.

## Required deployment

Deploy the repository to **Cloudflare Pages** with the repository root as the project root. Cloudflare Pages automatically deploys the root-level \`functions/\` directory alongside the static Astro output. The feature's API endpoint will not run on a static-only GitHub Pages deployment.

## Environment variables

Add these in Cloudflare Pages → Settings → Variables and Secrets → Production (and Preview if needed):

| Variable | Purpose |
| --- | --- |
| \`OPENROUTER_API_KEY\` | One OpenRouter key |
| \`OPENROUTER_API_KEYS\` | Optional key array as JSON or comma/newline-separated values |
| \`GROQ_API_KEY\` / \`GROQ_API_KEYS\` | Groq key or key array |
| \`GEMINI_API_KEY\` / \`GEMINI_API_KEYS\` | Google AI Studio key or key array |
| \`OPENAI_API_KEY\` / \`OPENAI_API_KEYS\` | OpenAI key or key array |
| \`OPENROUTER_MODEL\`, \`GROQ_MODEL\`, \`GEMINI_MODEL\`, \`OPENAI_MODEL\` | Optional model overrides |
| \`AI_PROVIDERS\` | Optional custom provider configuration (JSON array) |

A key array may be JSON:

\`\`\`json
["key-one", "key-two", "key-three"]
\`\`\`

or comma/newline-separated. Do not commit keys to the repository.

## Automated review generation

The scheduled GitHub Actions workflow reads provider keys from GitHub repository secrets and the optional provider/model choices from repository variables. Configure `AI_PROVIDER` as one of `openrouter`, `groq`, `gemini`, or `openai`; the generator now tries the selected provider first, then the other configured providers if it fails. Model overrides are available through `OPENROUTER_MODEL`, `GROQ_MODEL`, `GEMINI_MODEL`, and `OPENAI_MODEL` repository variables. These GitHub settings are separate from Cloudflare Pages secrets: configure the keys in both places if you want both scheduled publishing and the interactive `/api/review` feature to work.

## Custom OpenAI-compatible providers

Set \`AI_PROVIDERS\` to a JSON array. Use \`keysEnv\` or \`singleKeyEnv\` to point to Cloudflare secret names; use \`modelEnv\` to override a model without editing code.

\`\`\`json
[
  {
    "name": "My compatible provider",
    "baseUrl": "https://provider.example/v1",
    "model": "model-name",
    "keysEnv": "MY_PROVIDER_API_KEYS",
    "singleKeyEnv": "MY_PROVIDER_API_KEY",
    "modelEnv": "MY_PROVIDER_MODEL"
  }
]
\`\`\`

The endpoint appends \`/chat/completions\` to \`baseUrl\` unless it already ends with that path. It sends an OpenAI-style chat-completions request and expects the assistant response to contain the review JSON.

## Rotation behavior

For every provider, the function tries each configured key in order. On quota/rate-limit, invalid-key, server, timeout, or response errors, it moves to the next key; after exhausting a provider it moves to the next provider. The scheduled generator also falls back across OpenRouter, OpenAI, Gemini, and Groq when the selected provider fails. The endpoint returns only the generated review and provider name, never the API key. It has request-size and best-effort per-IP limits; configure Cloudflare Rate Limiting/WAF rules for stronger production abuse protection and monitor provider spending.

## Review format

The output is structured into story, style/gameplay or direction/performance, visuals, audio, pros, cons, verdict, and a score out of 10. The prompt asks the model to avoid fabricated facts and major spoilers. AI output can still be inaccurate, so verify factual claims before publishing.
