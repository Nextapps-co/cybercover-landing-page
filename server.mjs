// Produkcyjny serwer dla buildu Astro w trybie `middleware` (patrz astro.config.mjs).
//
// Po co własny serwer zamiast `node ./dist/server/entry.mjs` (standalone):
// standalone NIE kompresuje odpowiedzi, więc CSS ~72 KB szedł nieskompresowany
// (render-blocking + "document latency" w PageSpeed). Tutaj wszystko — statyki
// z `dist/client` ORAZ odpowiedzi SSR (/cennik, /checkout/*) — przechodzi przez
// `compression()` (gzip), co ścina ten CSS do ~13 KB na łączu.
//
// Routing bez zmian względem standalone (oba warianty URL → 200, bez 301):
//  - assety (/_astro/*, /img/*, favicony) → express.static (immutable cache na /_astro)
//  - prerenderowane strony (/, /regulamin, ...) w formacie katalogowym → fallback na index.html
//  - on-demand (/cennik, /checkout/*) + access-gate (src/middleware.ts) → handler Astro (ssrHandler)
import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { handler as ssrHandler } from './dist/server/entry.mjs';

const clientDir = resolve('dist/client');
const app = express();

// Gzip dla statyk i odpowiedzi SSR. Musi być przed static + handlerem.
app.use(compression());

// Assety i pliki z rozszerzeniem. `redirect: false` — nie chcemy 301 /regulamin → /regulamin/
// (linki wewnętrzne są bez ukośnika); katalogowe HTML obsługuje fallback niżej.
app.use(
  express.static(clientDir, {
    index: 'index.html',
    redirect: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${'/_astro/'}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// Prerenderowane strony (format katalogowy Astro): /regulamin → dist/client/regulamin/index.html,
// serwowane bezpośrednio z kodem 200 (bez przekierowania), jak robił to standalone.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.includes('.')) return next(); // assety mają rozszerzenie — już obsłużone wyżej
  const htmlPath = join(clientDir, req.path, 'index.html');
  if (htmlPath.startsWith(clientDir) && existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  next();
});

// Reszta (on-demand strony + middleware/access-gate) → SSR handler Astro.
app.use(ssrHandler);

const port = Number(process.env.PORT) || 4321;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`cybercover-landing-page (middleware+gzip) → http://${host}:${port}`);
});
