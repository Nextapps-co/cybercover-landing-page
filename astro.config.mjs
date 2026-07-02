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
  // Tryb `middleware` (nie `standalone`), bo własny serwer `server.mjs` opakowuje
  // handler Astro w `compression()` (gzip) i serwuje statyki z `dist/client`.
  // Standalone nie kompresuje odpowiedzi — CSS 72 KB szedł nieskompresowany.
  adapter: node({ mode: 'middleware' }),
  // CSRF origin-check Astro porównuje nagłówek `Origin` z originem `request.url`.
  // Za proxy Railway (terminacja TLS) serwer widzi request jako http, a `Origin`
  // to https → mismatch → "Cross-site POST form submissions are forbidden" na
  // POST `/api/access`. Wyłączamy: jedyny POST-route to bramka dostępu (brak
  // stanu usera = brak realnej powierzchni CSRF), reszta ruchu to statyki albo
  // fetch do zewnętrznego backendu.
  security: { checkOrigin: false },
  integrations: [
    // Sitemap tylko dla stron indeksowalnych — checkout i bramka dostępu
    // są `noindex` + zablokowane w robots.txt, więc nie powinny tu trafiać.
    sitemap({ filter: (page) => !page.includes('/checkout/') && !page.includes('/dostep') }),
    react(),
  ],
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
