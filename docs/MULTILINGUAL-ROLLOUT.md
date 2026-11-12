# VibeCritic multilingual rollout

## Goal

Add English and French as carefully managed localized editions while keeping
Arabic as the default edition and preserving every existing Arabic URL.

## Current foundation

- Locale identifiers: `ar`, `en`, `fr`.
- Arabic remains the default locale at the root path.
- English routes use the `/en/` prefix.
- French routes use the `/fr/` prefix.
- Arabic is RTL; English and French are LTR.
- Locale metadata is centralized in `src/i18n/config.ts`.

## Release stages

1. **Foundation (this change):** central locale metadata and safe path helpers.
2. **Localized shell:** translated navigation, footer, search labels, accessibility
   labels, metadata and a language selector. Do not expose links to editions that
   do not yet have a working localized home page.
3. **Pilot content:** publish a small set of reviewed English and French review
   pages, linked to their Arabic originals through stable content identifiers.
4. **SEO:** emit canonical URLs per edition, reciprocal hreflang links only for
   pages that genuinely exist, localized sitemap entries, and correct Open Graph
   locale values.
5. **Scale-up:** translate older and newly published reviews in batches after
   quality and build checks pass.

## Content and editorial rules

- Never machine-translate and publish a full batch without editorial review.
- A localized review must preserve the original score, facts, release details,
  pros, cons and editorial conclusion. Translation must not silently change
  the critic's position.
- Keep a stable shared content identifier between language editions. Do not
  assume translated slugs are identical.
- Do not publish placeholder or incomplete translations as finished reviews.
- If a translation is unavailable, do not create a broken language-switch link.
- Keep the existing Arabic routes and content intact.

## Out of scope for the foundation

- No changes to the daily publishing workflow or its schedule.
- No changes to AI Reviewer configuration, API keys or runtime behavior.
- No changes to comments or the draft comments pull request.
- No automatic maintenance workflow activation.
- No production deployment as part of this foundation step.
