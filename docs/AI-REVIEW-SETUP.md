# VibeCritic AI Review API

The interactive reviewer lives at `/ai-review/`. Its backend is a Cloudflare Pages Function at `/api/review`. Provider credentials are read only on the server; never add API keys to `PUBLIC_*` variables or browser code.

## Static full-text search

The site uses `astro-pagefind` to generate a local search index after the Astro build. Search runs in the visitor's browser against static index files; it does not require a search server, database, or search API key. The generated `pagefind/` assets must be included in the deployed build output.

## Required deployment

Deploy the repository to **Cloudflare Pages** with the repository root as the project root, build command `npm run build`, and output directory `dist`. Cloudflare Pages deploys the root-level `functions/` directory alongside the static Astro output. The interactive API endpoint will not run on a static-only GitHub Pages deployment.

## Environment variables

Add these in Cloudflare Pages → Settings → Variables and Secrets → Production (and Preview if needed):

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | One OpenRouter key |
| `OPENROUTER_API_KEYS` | Optional key array as JSON or comma/newline-separated values |
| `GROQ_API_KEY` / `GROQ_API_KEYS` | Groq key or key array |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | Google AI Studio key or key array |
| `OPENAI_API_KEY` / `OPENAI_API_KEYS` | OpenAI key or key array |
| `OPENROUTER_MODEL`, `GROQ_MODEL`, `GEMINI_MODEL`, `OPENAI_MODEL` | Optional model overrides |
| `AI_PROVIDERS` | Optional custom provider configuration (JSON array) |

A key array may be JSON:

```json
["key-one", "key-two", "key-three"]
```

or comma/newline-separated. Do not commit keys to the repository.

## Automated review generation

The scheduled GitHub Actions workflow reads provider keys from GitHub repository secrets and optional provider/model choices from repository variables. Configure these under GitHub → Settings → Secrets and variables → Actions:

- `TMDB_API_KEY` for movies and series.
- `RAWG_API_KEY` for games (recommended). If absent, the script uses IGDB when both `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are configured.
- At least one AI key: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `OPENAI_API_KEY`.

Configure `AI_PROVIDER` as one of `gemini`, `groq`, `openrouter`, or `openai`; the generator tries the selected provider first, then falls back in this order: Gemini, Groq, OpenRouter, OpenAI. With no explicit selection, the first configured provider in that same order is selected. Model overrides are available through `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL`, and `OPENAI_MODEL` repository variables.

`MAX_PER_RUN` is capped at 3 reviews per Algeria-local calendar day, including repeated manual runs. The workflow's automatic schedule runs once daily. `GAMES_WINDOW_DAYS` defaults to 14. These GitHub settings are separate from Cloudflare Pages secrets: configure the AI keys in both places if you want both scheduled publishing and the interactive `/api/review` feature to work.

## Content discovery and publishing

Movies and series are sourced from TMDb weekly trending endpoints. Games are sourced from RAWG releases in the last 14 days, ordered by `-added` (community add count); IGDB remains a fallback if RAWG is unavailable. The generator balances published counts across games, series, and movies, checks processed IDs and type-specific review filenames before creating content, and stops at the daily review cap. RAWG requires an API key and attribution/link on pages using its data; the site footer provides that credit.

## Custom OpenAI-compatible providers

Set `AI_PROVIDERS` to a JSON array. Use `keysEnv` or `singleKeyEnv` to point to Cloudflare secret names; use `modelEnv` to override a model without editing code.

```json
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
```

The endpoint appends `/chat/completions` to `baseUrl` unless it already ends with that path. It sends an OpenAI-style chat-completions request and expects the assistant response to contain the review JSON.

## Rotation behavior

The interactive endpoint tries configured keys for each provider in its configured order (OpenRouter, Groq, Gemini, OpenAI by default). On quota/rate-limit, invalid-key, server, timeout, or response errors, it moves to the next key and then the next provider. The scheduled generator uses the provider order documented above. The endpoint returns only the generated review and provider name, never the API key. It has request-size and best-effort per-IP limits; configure Cloudflare Rate Limiting/WAF rules for stronger production abuse protection and monitor provider spending.

## Abuse protection, caching, and share links

The interactive API requires both Turnstile verification and a distributed rate limiter. It deliberately fails closed: if either dependency is not configured or is unavailable, review generation returns HTTP 503 instead of silently accepting unverified requests.

### 1. Turnstile

Create a Turnstile widget in Cloudflare and configure:

- `PUBLIC_TURNSTILE_SITE_KEY`: public site key in **Pages → Settings → Environment variables → Production**. This is a build-time variable; trigger a new Pages deployment after adding or changing it.
- `TURNSTILE_SECRET_KEY`: private secret in **Pages → Settings → Variables and Secrets → Production**. Keep it server-side only.
- Add `vibecritic.pages.dev` to the widget's allowed hostnames. Add any Preview hostname patterns only if you intend to test Preview deployments.

The page sends the Turnstile action `ai_review`. The API validates the token with Cloudflare Siteverify and requires all three conditions: `success === true`, action equals `ai_review`, and the verified hostname matches the incoming request hostname. Tokens are single-use and expire after five minutes. Never put the secret in source control or send it in chat.

### 2. Distributed rate limiter (Durable Object)

The rate limiter is a separate Worker because Cloudflare Pages cannot create and deploy a Durable Object class inside the Pages project. The Worker source and SQLite migration are in `workers/ai-review-limiter/`.

Deploy it once from the repository root:

```sh
npx wrangler deploy --config workers/ai-review-limiter/wrangler.jsonc
```

Then bind its namespace to the Pages project:

1. Open **Workers & Pages → your VibeCritic Pages project → Settings → Bindings**.
2. Select **Add → Durable Object**.
3. Set the variable name to exactly `AI_REVIEW_LIMITER`.
4. Select the `AiReviewLimiter` namespace from Worker `vibecritic-ai-review-limiter`.
5. Save and redeploy the Pages project.

The Durable Object uses a SQLite-backed token bucket per hashed client IP: capacity 8, refilling continuously over 10 minutes. Raw IP addresses are not used as Durable Object names or stored in its database. If the binding is missing or fails, the API returns 503. Do not replace this with an isolate-local Map; that is not distributed protection.

SQLite-backed Durable Objects are available on Cloudflare Workers Free, subject to Cloudflare's daily request, compute, and storage limits. If those quotas are exceeded, protection may temporarily reject requests; monitor usage in Cloudflare. See Cloudflare's current [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Pages bindings guide](https://developers.cloudflare.com/pages/functions/bindings/).

### 3. Request validation and cache

The endpoint accepts same-origin JSON POST requests only, limits the body to 12 KB, validates the title (2–120 characters) and media type against an allowlist, and rejects missing, oversized, expired, reused, or incorrectly scoped Turnstile tokens. Rate limiting runs before provider calls and cache reads, so cache hits are also protected.

Successful AI review responses are cached at the Cloudflare edge for up to six hours, reducing repeated provider calls for the same normalized title and media type. Share links encode the generated result in the URL fragment; the result is not stored as a public server-side record. Anyone with the link can read the encoded review, so do not include private information in a review request.

## Review format

The interactive output is structured into story, style/gameplay or direction/performance, visuals, audio, pros, cons, verdict, and a score out of 10. Scheduled reviews include dedicated editorial sections by media type. Prompts ask models to avoid fabricated facts and major spoilers. AI output can still be inaccurate, so verify factual claims before publishing.
