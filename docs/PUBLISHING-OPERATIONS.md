# VibeCritic Publishing Operations

## Automated publisher V3
The V3 publisher is the only automated AI publishing workflow. It runs on a 15-minute GitHub Actions schedule and can also be started manually. Each run handles at most one article job.

## Safe completion criteria
A cycle is complete only when:
1. V3 reliability tests pass.
2. Candidate identity and two independent HTTPS source domains are validated.
3. The Arabic article passes length, structure, score, source, strengths and limitations checks.
4. A new Markdown file is created without overwriting any existing article.
5. The production content validation and Astro build pass.
6. The workflow commits the validated article and durable V3 state.
7. A later cycle confirms that the deployed public article URL returns the expected title.

A green workflow run or a successful build alone does not prove publication. Check the V3 job summary and live URL.

## Manual publishing
Manual editorial submissions remain isolated in manual-publishing/inbox and continue to use the dedicated manual publisher. The AI publisher must never alter manual articles.

## Provider safety
Only explicitly enabled free-tier providers are eligible. OpenRouter model IDs must end in :free. Secrets stay in GitHub Actions secrets and are never written to files or logs. If no permitted free provider is available, the publisher waits rather than switching to a paid service.
