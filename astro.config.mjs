import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Keep GitHub Pages working while allowing Cloudflare Pages to use the root path.
const isCloudflarePages = process.env.CF_PAGES === '1';
const site =
  process.env.PUBLIC_SITE_URL ||
  (isCloudflarePages
    ? 'https://vibecritic.pages.dev'
    : 'https://manou23.github.io');

export default defineConfig({
  site,
  base: isCloudflarePages ? '/' : '/VibeCritic-',
  trailingSlash: 'always',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    build: { minify: 'esbuild', cssMinify: 'esbuild' },
  },
});
