import crypto from 'node:crypto';

const siteUrl = new URL(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://vibecritic.pages.dev/');
if (!siteUrl.pathname.endsWith('/') || siteUrl.search || siteUrl.hash) {
  throw new Error('GOOGLE_SEARCH_CONSOLE_SITE_URL must be a URL-prefix property ending in /, without query or hash.');
}
const sitemapUrl = new URL('sitemap.xml', siteUrl).href;

async function requestWithRetry(url, options = {}, attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
      if (response.ok) return response;
      const body = (await response.text()).slice(0, 500);
      lastError = new Error(`HTTP ${response.status} for ${url}: ${body}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      console.log(`Sitemap is not ready yet (attempt ${attempt}/${attempts}); retrying in 10 seconds.`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  throw lastError || new Error('Sitemap could not be reached.');
}

const response = await requestWithRetry(sitemapUrl);
const xml = await response.text();
if (!/<urlset\\b/i.test(xml)) throw new Error('Published sitemap.xml is not a valid URL-set sitemap.');
const locations = [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map(match => match[1].trim());
if (!locations.length) throw new Error('Published sitemap.xml contains no URLs.');
const seen = new Set();
for (const raw of locations) {
  const url = new URL(raw);
  if (url.origin !== siteUrl.origin) throw new Error(`Sitemap contains a URL outside the configured site: ${url.origin}`);
  if (seen.has(url.href)) throw new Error(`Sitemap contains a duplicate URL: ${url.href}`);
  seen.add(url.href);
}
console.log(`Published sitemap verified: ${locations.length} unique URLs at ${sitemapUrl}`);

const serviceAccountJson = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.log('Google Search Console API submission skipped: configure the GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT repository secret. Google can still discover the sitemap through robots.txt.');
  process.exit(0);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (!serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT must contain client_email and private_key.');
}
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
  iss: serviceAccount.client_email,
  scope: 'https://www.googleapis.com/auth/webmasters',
  aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600
})}`;
const signer = crypto.createSign('RSA-SHA256');
signer.update(unsigned);
signer.end();
const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;

const tokenResponse = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  }),
  signal: AbortSignal.timeout(20000)
});
if (!tokenResponse.ok) throw new Error(`Google OAuth token request failed with HTTP ${tokenResponse.status}: ${(await tokenResponse.text()).slice(0, 500)}`);
const token = (await tokenResponse.json()).access_token;
if (!token) throw new Error('Google OAuth response did not include an access token.');

const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl.href)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
const submitResponse = await fetch(endpoint, {
  method: 'PUT',
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20000)
});
if (!submitResponse.ok) {
  throw new Error(`Google Search Console sitemap submission failed with HTTP ${submitResponse.status}: ${(await submitResponse.text()).slice(0, 700)}`);
}
console.log(`Google Search Console accepted sitemap submission for ${siteUrl.href}.`);
console.log('This is a crawl/discovery request, not a guarantee that every URL will be indexed.');
