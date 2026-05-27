import crypto from 'node:crypto';

/**
 * Wspólna logika internal access gate'u dla flow zakupowego.
 *
 * Klucz żyje wyłącznie po stronie serwera w `CHECKOUT_ACCESS_KEY` (bez prefiksu
 * `PUBLIC_` → nigdy nie trafia do bundla klienta). Po poprawnym wpisaniu hasła
 * na `/dostep` ustawiamy httpOnly cookie z deterministycznym tokenem, który
 * dowodzi znajomości klucza bez ujawniania go (i nie da się go podrobić bez
 * znajomości klucza). Middleware sprawdza to cookie per-request.
 */

export const ACCESS_COOKIE = 'cc_access';

const TOKEN_SALT = 'cybercover-access-gate:v1';

/** Klucz dostępu z env albo `undefined` gdy nieustawiony (= gate wyłączony). */
export function getAccessKey(): string | undefined {
  const key = process.env.CHECKOUT_ACCESS_KEY;
  return key && key.length > 0 ? key : undefined;
}

/** Token zapisywany w cookie — hash(klucz + salt), nie sam klucz. */
export function accessToken(key: string): string {
  return crypto.createHash('sha256').update(`${key}:${TOKEN_SALT}`).digest('hex');
}

/**
 * Porównanie w stałym czasie, odporne na różnice długości — hashujemy oba
 * wejścia do 32-bajtowego digestu, więc `timingSafeEqual` zawsze dostaje
 * bufory równej długości i nie wycieka długości sekretu.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Czy dana ścieżka jest objęta gate'em (flow zakupowy). */
export function isGatedPath(pathname: string): boolean {
  return (
    pathname === '/cennik' ||
    pathname.startsWith('/cennik/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/')
  );
}

/** Anti open-redirect: dopuszczamy tylko ścieżki względne w obrębie strony. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/cennik';
  return raw;
}
