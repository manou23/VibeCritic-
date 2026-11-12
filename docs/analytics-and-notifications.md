# Cloudflare Web Analytics for VibeCritic

Cloudflare Pages can enable Web Analytics without adding an analytics vendor, a tracking cookie, or a token to the repository.

## Enable it

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages** and open the **VibeCritic** Pages project.
3. Open **Metrics**.
4. Under **Web Analytics**, choose **Enable**.
5. Wait for the next deployment. Cloudflare injects its beacon automatically for the Pages project.
6. Open **Analytics & Logs → Web Analytics** to view page views, visitors, and performance metrics.

Cloudflare describes Web Analytics as free and privacy-first and says it does not collect or use visitors' personal data. It is suitable for reviewing which page URLs attract visits, while it does not provide custom event tracking for button clicks.

Official documentation:
- https://developers.cloudflare.com/pages/how-to/web-analytics/
- https://developers.cloudflare.com/web-analytics/about/
- https://developers.cloudflare.com/web-analytics/faq/

## Telegram channel link

The site footer supports an optional build-time variable:

`PUBLIC_TELEGRAM_CHANNEL_URL`

Set it to the public URL of the VibeCritic Telegram channel in the Cloudflare Pages build environment. The channel link remains hidden until a valid URL is supplied. Do not put API tokens or bot secrets in this variable.

To automatically post newly generated reviews to the channel, create a Telegram bot with BotFather, add it as an administrator to the channel with permission to post messages, then add these GitHub repository Actions secrets:

- `TELEGRAM_BOT_TOKEN`: the bot token from BotFather.
- `TELEGRAM_CHANNEL_ID`: the channel username such as `@YourChannel` or the numeric channel ID.

The publishing step skips silently when either secret is missing. Keep both values in GitHub Secrets; never commit them or send them in chat.


## Review comments and community moderation

Review pages include an on-demand Utterances discussion embed. The repository is public and GitHub Issues are enabled. Before comments can load:

1. Install the **Utterances** GitHub App for `manou23/VibeCritic-`: https://github.com/apps/utterances
2. Grant it access to this repository.
3. Keep GitHub Issues enabled and allow the `site-comments` label (Utterances can create it on first use).
4. Test the discussion area on a published review while signed in to GitHub.

Each review maps to a GitHub issue by its page path. Comments are public and require a GitHub account. Moderation, deletion, and spam handling are managed in the repository's Issues tab. The embed loads only after a visitor clicks **فتح مساحة النقاش**, not on initial page load.

The Yes/No review-helpfulness control stores a visitor's choice in that visitor's own browser only. It is not an aggregate audience rating and does not send personal data to the server.
