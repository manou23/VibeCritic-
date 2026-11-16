# VibeCritic Publishing Operations

## Controlled publishing trigger

The `Generate reviews and publish` workflow intentionally does not generate new reviews on every ordinary push. This prevents generated-content commits and routine maintenance changes from starting an uncontrolled publishing loop.

To request a deliberate generation cycle, make a reviewed commit whose message contains the exact marker:

`[generate-reviews]`

The workflow then runs its metadata checks, provider preflight, review generation, quality gates, production build, and content checkpoint. A green workflow result alone is not proof that new reviews were published: verify the generation step, the reported publication counts, the resulting review files, and the live Pages deployment.

## AI connectivity diagnostic

The dedicated Workers AI connectivity probe is separately gated by the commit marker:

`[test-workers-ai]`

Use it only when diagnosing the Cloudflare Workers AI / AI Gateway connection. The normal generation workflow can use any configured supported provider and does not require this dedicated probe to run on every publishing cycle.

## Required publishing configuration

The workflow validates its required metadata and AI-provider configuration before generation. Keep provider credentials in GitHub Actions secrets; never put API keys in repository files, logs, commits, or this document.

## Success criteria

A publishing cycle is complete only when:
1. The generation step actually ran and reported its result.
2. Every generated review passed the editorial and score-integrity gates.
3. The production build and sitemap validation succeeded.
4. The generated review files were committed to `main`.
5. Cloudflare Pages deployed the corresponding `main` revision.
6. The live site displays the new review pages and the updated listing order.
