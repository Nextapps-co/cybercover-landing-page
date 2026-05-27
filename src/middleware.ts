import { defineMiddleware } from 'astro:middleware';
import { ACCESS_COOKIE, accessToken, getAccessKey, isGatedPath, safeEqual } from './lib/server/access-gate';

/**
 * Internal access gate dla flow zakupowego (`/cennik` + `/checkout/*`).
 *
 * Aktywny TYLKO gdy ustawiony jest `CHECKOUT_ACCESS_KEY`. Brak zmiennej = brak
 * ochrony (dev / lokalnie) — świadomy fail-open: zamiast zablokować dostęp
 * samym sobie, gdy ktoś zapomni ustawić klucz na prod.
 *
 * Bez ważnego cookie (token == hash klucza) niezalogowany request jest
 * przekierowywany na brandowaną stronę `/dostep`, która zbiera hasło i — po
 * walidacji w `/api/access` — ustawia cookie wpuszczające dalej.
 *
 * Middleware odpala się per-request tylko dla tras on-demand, dlatego `/cennik`
 * i `/checkout/*` mają `export const prerender = false`. `/dostep` i `/api/*`
 * nie są objęte `isGatedPath`, więc nie powstaje pętla przekierowań.
 */
export const onRequest = defineMiddleware((context, next) => {
  const key = getAccessKey();

  // Brak klucza → gate wyłączony (dev / lokalnie).
  if (!key) return next();

  if (!isGatedPath(context.url.pathname)) return next();

  const token = context.cookies.get(ACCESS_COOKIE)?.value;
  if (token && safeEqual(token, accessToken(key))) {
    return next();
  }

  const returnTo = context.url.pathname + context.url.search;
  return context.redirect(`/dostep?return=${encodeURIComponent(returnTo)}`, 302);
});
