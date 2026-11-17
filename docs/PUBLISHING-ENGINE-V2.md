# VibeCritic Publishing Engine v2

## Why rebuild

The old publisher accumulated discovery, evidence collection, AI provider routing, multi-stage writing, cooldowns, queue recovery, editorial memory and publication side effects in one large script. A successful build could coexist with failed generation. V2 separates deterministic orchestration from source and model adapters.

## Product rules to preserve

- Arabic editorial identity, critical specificity and credibility outrank volume.
- Cover games, films and series with balanced rotation. Games come from RAWG/IGDB; films and series from TMDB.
- Prefer current/relevant works. Never invent release dates, credits, platforms, scenes, performance, gameplay or viewing experience.
- Clearly distinguish AI and manual reviews. Never relabel manual content as AI.
- Preserve every existing review, rating, ID, URL and editorial reference.
- No paid providers, paid fallbacks, paid upgrades or uncontrolled use of free quotas.
- A build alone is not a successful publication. Require a new committed article, production build, SEO/sitemap checks and a successful deployed URL check.

## Editorial contract

Each AI article is composed in three durable, saved stages. The workflow checks every 15 minutes, while the engine advances at most one writing stage per 30-minute window. The same article is resumed from its saved stage after interruptions; publication happens only after all three stages pass the editorial gate. Save every stage before the run exits; resume the same article and exact stage after a transient failure. The completed article must contain at least 650 words and 3,200 characters, a clear critical thesis, compelling opening, analysis of why creative/design choices work or fail, distinctive evidence-backed details, a reasoned verdict, at least three specific strengths and two genuine limitations. Scores must be justified and match the fixed weighted rubric: story 30%, visuals 25%, sound 20%, pacing 25%. No generic praise, score inflation, invented hands-on claims or avoidable spoilers.

Persist evidence separately from generated prose. Require at least two independent HTTPS source domains. TMDB/RAWG/IGDB are catalog evidence, not proof of artistic quality. Official sources establish factual product details; independent sources may support context. Use verified poster/backdrop assets. Add a verified official trailer when available; never fabricate a video ID or pass off an unrelated video as official.

## Architecture

1. **Discovery adapter:** fetch candidate metadata only; no AI calls.
2. **Editorial selector:** deduplicate against Markdown files and published index; rotate games, films and series fairly; choose one candidate.
3. **Evidence adapter:** persist source dossier with source URLs, observed timestamps, factual scope and confidence.
4. **Free-provider router:** choose exactly one configured free provider per run using a fixed priority order (Gemini → opt-in Cloudflare Workers AI → OpenRouter free-only fallback chain (`nvidia/nemotron-3.5-super-vl:free` then `google/gemma-4-26b-a4b-it:free`); the adapter sends only `:free` model IDs in the `models` fallback list, so it cannot fall back to a paid model. Reasoning is explicitly disabled for this section-writing call so it cannot consume the entire output-token budget), then check daily request/token budgets and provider-specific circuit-breaker cooldowns. A failed provider is cooled down and a later scheduled run can select the next eligible provider.
5. **Three-stage writer:** one stage per 30-minute window; checkpoint immediately. Parse and validate structured output. Malformed or undersized output is a failed stage, never publishable.
6. **Editorial gate:** deterministic length, field, evidence, score, pros/cons and media checks. Retain rejected drafts for diagnosis; never write them to the public collection.
7. **Publisher:** write one complete Markdown file with `aiGenerated: true`, `editorialWorkflow: automated`, `publishedAt`, stable `sourceId`, sources, poster/backdrop and optional verified official video.
8. **Deployment verifier:** run Astro build, content schema, score integrity and sitemap checks; then verify the deployed article route before marking the job published.

## Queue and recovery

There is one active draft globally. Always select the oldest active job, including when it is cooling down. If it is waiting, exit without discovering newer jobs or spending tokens. A retry resumes the exact saved stage. Jobs cannot skip stages, publish twice or become published before their Markdown file and deployment are verified. Persist state using a versioned schema and atomic file replacement.

State flow:
`queued → researching → writing (stage 1/3) → writing (stage 2/3) → quality-check (stage 3/3) → ready → published`

Transient provider/network failures move the same job to `waiting` with a bounded retry time. Provider cooldown starts at two hours and grows exponentially (capped at 24 hours), so the next scheduled checkpoint can select another configured free provider instead of repeatedly retrying the same timed-out provider. Invalid evidence and editorial failures are recorded distinctly and must not create infinite retries.

## Resource policy

- At most one article-writing stage per 30-minute window; never generate multiple stages in one checkpoint.
- Never call a provider that is disabled, cooling down or at its configured daily request/token cap.
- Groq is intentionally excluded from automatic publishing until a specific model is verified as genuinely free for the connected account. Current Groq production-model documentation lists token prices, so a generic `GROQ_FREE_TIER_ONLY` flag is not sufficient proof of a no-cost route.
- Cloudflare Workers AI is enabled only when its token and account ID are configured. The adapter hard-caps it at 3 requests and 9,000 estimated tokens per UTC day; each request is capped at 2,500 output tokens. Cloudflare documents a 10,000-Neuron daily free allocation and states that requests fail after the free allocation on Workers Free. The conservative request cap is intended to keep the small three-stage article workflow well below that daily allocation. Model override: `CLOUDFLARE_MODEL`.
- No parallel or sequential provider cascade in a single run.
- Do not immediately retry malformed output with another model. Persist the failure and use a bounded retry policy.
- Track provider usage and cooldowns in the committed V2 state per UTC day; never log secrets.
- If no free provider is available, wait. Never switch to paid services.

## Rollout gates

V2 is developed on a separate branch; production workflow remains untouched until acceptance.

1. Unit tests: state transitions, oldest-job lock, cooldown, budgets, article contract and deduplication.
2. Dry run with fixtures: prove no external API calls and no public file writes.
3. One real article across all three hourly stages with durable evidence and provider usage.
4. Verify one new AI Markdown file, correct metadata, score integrity, image and verified official video where available.
5. Production build, SEO and sitemap checks pass.
6. Verify deployed URL and newest-first listing.
7. Only then switch production workflow. Keep V1 available for rollback until multiple real publications succeed.

## Observed failure — 16 November 2026

Workflow run 603 passed syntax and editorial test steps, then failed in `Generate reviews`. Score validation, media enrichment, production build and deployment verification were skipped. Queue checkpoint succeeded, but no article was published. V2 makes generation, validation, publication and deployment separate explicit gates. Cloudflare Workers AI is opt-in only: it is considered only when its token, account ID, and repository variable `CLOUDFLARE_FREE_TIER_ONLY=true` are configured. The adapter hard-caps it at 3 requests and 9,000 estimated tokens per UTC day; each request is capped at 2,500 output tokens. Cloudflare documents a 10,000-Neuron daily free allocation. Keep this opt-in disabled until the token is verified and the account's billing plan is understood. Groq remains excluded from the automatic provider pool to prevent accidental paid usage.
