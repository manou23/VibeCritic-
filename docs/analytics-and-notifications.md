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
