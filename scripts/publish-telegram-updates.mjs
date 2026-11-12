import fs from 'node:fs/promises';
import path from 'node:path';

const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const channel = String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
if (!token || !channel) {
  console.log('Telegram publishing is not configured; skipping channel notifications.');
  process.exit(0);
}

const queuePath = path.resolve('data/new-reviews.json');
let queue = [];
try { queue = JSON.parse(await fs.readFile(queuePath, 'utf8')); }
catch { console.log('No generated-review notification queue found; nothing to publish.'); process.exit(0); }
if (!Array.isArray(queue) || queue.length === 0) {
  console.log('No new reviews to publish to Telegram.');
  process.exit(0);
}

const root = path.resolve('src/content/reviews');
const files = await fs.readdir(root);
const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  if (!match) return '';
  try { return JSON.parse(match[1].trim()); } catch { return match[1].trim().replace(/^['"]|['"]$/g, ''); }
}

let sent = 0;
for (const item of queue) {
  const filename = files.find(name => name.startsWith(item.type + '-') && name.endsWith('-' + String(item.id) + '.md'));
  if (!filename) { console.warn('Could not locate generated review ' + item.type + ':' + item.id); continue; }
  const content = await fs.readFile(path.join(root, filename), 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  const title = scalar(match[1], 'title') || filename;
  const summary = scalar(match[1], 'summary');
  const score = scalar(match[1], 'score');
  const typeLabel = item.type === 'game' ? 'لعبة' : item.type === 'series' ? 'مسلسل' : 'فيلم';
  const slug = filename.replace(/\.md$/, '');
  const url = 'https://vibecritic.pages.dev/reviews/' + encodeURIComponent(slug) + '/';
  let published = false;
  for (let attempt = 1; attempt <= 18; attempt++) {
    try {
      const live = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (live.ok) { published = true; live.body?.cancel(); break; }
      live.body?.cancel();
    } catch {}
    if (attempt < 18) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!published) {
    console.warn('Production review URL is not live; Telegram publishing is stopping for this batch: ' + url);
    break;
  }
  const message = '<b>' + escapeHtml(title) + '</b>\n' +
    typeLabel + (score ? ' · تقييم VibeCritic: ' + escapeHtml(score) + '/10' : '') + '\n\n' +
    escapeHtml(summary).slice(0, 900) + '\n\n' +
    '<a href="' + escapeHtml(url) + '">اقرأ المراجعة كاملة على VibeCritic</a>';
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: channel, text: message, parse_mode: 'HTML', disable_web_page_preview: false }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('Telegram API returned HTTP ' + response.status);
    sent++;
    console.log('Published review to Telegram: ' + filename);
  } catch (error) {
    console.warn('Telegram notification failed for ' + filename + ': ' + error.message);
  }
}
console.log('Telegram publishing complete: ' + sent + ' of ' + queue.length + ' notifications sent.');
