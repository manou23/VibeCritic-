import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

// Cloudflare Pages is the production host. Keep GitHub Pages available only
// when explicitly selected, so a missing CF_PAGES variable cannot silently
// generate sitemap URLs for the old GitHub Pages domain.
const isGitHubPages = process.env.PUBLIC_DEPLOY_TARGET === 'github-pages';
const site =
  process.env.PUBLIC_SITE_URL ||
  (isGitHubPages ? 'https://manou23.github.io' : 'https://vibecritic.pages.dev');

export default defineConfig({
  site,
  base: isGitHubPages ? '/VibeCritic-' : '/',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [sitemap(), pagefind()],
  vite: {
    plugins: [tailwindcss()],
    build: { minify: 'esbuild', cssMinify: 'esbuild' },
  },
});
