import type { APIRoute } from 'astro';
import {
  ACCESS_COOKIE,
  accessToken,
  getAccessKey,
  safeEqual,
  safeReturnPath,
} from '../../lib/server/access-gate';

export const prerender = false;

/**
 * Walidacja hasła z formularza `/dostep`. Poprawne hasło → httpOnly cookie +
 * redirect na żądaną stronę. Błędne → powrót na `/dostep` z flagą błędu.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const password = String(form.get('password') ?? '');
  const returnTo = safeReturnPath(form.get('return') ? String(form.get('return')) : null);

  const key = getAccessKey();

  // Gate wyłączony — nie ma czego pilnować, wpuść.
  if (!key) return context.redirect(returnTo, 303);

  if (!password || !safeEqual(password, key)) {
    return context.redirect(`/dostep?return=${encodeURIComponent(returnTo)}&error=1`, 303);
  }

  context.cookies.set(ACCESS_COOKIE, accessToken(key), {
    path: '/',
    httpOnly: true,
    secure: context.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12, // 12h — wygodne okno na sesję testową
  });

  return context.redirect(returnTo, 303);
};
