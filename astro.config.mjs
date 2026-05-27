// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://cybercover.pl',
  // `output` zostaje statyczny (default) — landing + legal są prerenderowane.
  // Adapter Node istnieje wyłącznie po to, by `/cennik` + `/checkout/*`
  // (oznaczone `prerender = false`) renderowały się on-demand, dzięki czemu
  // `src/middleware.ts` (access gate) odpala się per-request dla tych tras.
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'],
    },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
