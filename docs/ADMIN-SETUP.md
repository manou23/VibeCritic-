# VibeCritic Admin Console setup

The admin console is protected by Cloudflare Access at the edge and independently verifies the Access JWT in the Pages Function. Never put credentials in source control or paste tokens into chat.

## Cloudflare Pages environment variables

Add these as Production environment variables:

- `CF_ACCESS_TEAM_DOMAIN`: your Cloudflare Access team issuer, e.g. `https://your-team.cloudflareaccess.com`
- `CF_ACCESS_AUD`: the Access application AUD tag for the admin application
- `ADMIN_EMAIL`: the permitted administrator email (or comma-separated allowlist)
- `GITHUB_ADMIN_TOKEN`: a fine-grained GitHub token restricted to this repository with Contents: Read and write, Actions: Read and write, and Metadata: Read
- `GITHUB_REPOSITORY`: `manou23/VibeCritic-`

## Cloudflare Access

Create a self-hosted Access application for `vibecritic.pages.dev/admin*` and `vibecritic.pages.dev/api/admin`. Apply an allow policy for the exact administrator email(s) only. The Pages Function also validates JWT signature, issuer, audience, expiry, and email allowlist.

## First release

- Reads the real V2 durable state and recent GitHub Actions runs.
- Shows the active job, stage, published/abandoned counts, stale-state warnings, and recent errors.
- Saves pause/resume, interval, daily time window, and timezone settings to `data/publisher-v2-settings.json`.
- Dispatches a manual recovery cycle through GitHub Actions.

The scheduled workflow remains a 15-minute heartbeat. The engine reads the saved settings before doing work, so the dashboard does not need to rewrite workflow cron expressions. The current publishing engine keeps its existing stage spacing and one-active-draft safety.

## Verify after deployment

Open `https://vibecritic.pages.dev/admin/` while signed in through Cloudflare Access. Confirm the identity email, latest state timestamp, and recent workflow runs. Missing environment variables are configuration errors, not successful authentication.
