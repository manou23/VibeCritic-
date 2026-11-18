# VibeCritic Manual Editorial Publisher

This is a separate, human-authored publication lane. It does not use the AI publisher, its queue, its state file, its provider adapters, its timers, or its credentials.

## Ownership and workflow

- ChatGPT prepares and places one completed, source-checked Markdown review at a time in \`manual-publishing/inbox/\`.
- The manual lane never discovers titles, chooses topics, writes drafts, calls AI providers, or schedules work.
- A push containing an inbox article triggers only this deterministic validator/publisher.
- The publisher validates the article, copies it into the site's public review collection, archives the submitted source, and records its own state in \`data/manual-publisher-state.json\`.
- The normal Cloudflare Pages production build then deploys the commit to the live site.
- The user does not need to run a command or start a workflow.

## Hard separation

| Manual editorial lane | Automatic AI lane |
| --- | --- |
| \`manual-publishing/inbox/\` | Existing V2 queue |
| \`manual-publishing/archive/\` | Existing automated review output |
| \`data/manual-publisher-state.json\` | \`data/publisher-v2-state.json\` |
| \`.github/workflows/manual-editorial-publishing.yml\` | Existing publishing V2 workflows |
| No AI credentials or provider calls | Existing configured free providers |
| No cron or recurring trigger | Existing automatic schedule |

The manual workflow has its own concurrency group and only watches inbox changes. It does not edit the V2 queue or state. The V2 runner does not read the manual inbox or manual state.

## Article contract

One article per release. The Markdown filename must be a lowercase kebab-case slug. Frontmatter must explicitly set:

- \`aiGenerated: false\`
- \`editorialWorkflow: manual-assisted\`
- \`reviewMode: review\`
- \`type: movie | series | game\`
- A unique \`sourceId\`, HTTPS \`sourceUrl\`, HTTPS poster and backdrop
- Overall score and all four category scores, each from 0 to 10
- At least three specific pros and two genuine cons

The article body must have section headings, at least 600 words, and source links. A verified YouTube trailer ID may be included when available; the publisher never invents one.

## Failure behavior

Invalid content is rejected before it enters the public collection. A successful build and sitemap validation are required before the workflow commits the release. If validation or build fails, the workflow stops and does not push a public article. After deployment, the live URL must still be checked separately; a successful workflow alone is not proof that Cloudflare has finished deploying.
