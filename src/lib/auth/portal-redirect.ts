// Per spec §5.1.3 — redirect na portal z reason w query param.
//
// Wywoływane przez:
// - http.ts przy 401 gdy mamy token (session-expired)
// - PricingCards przy handoff exchange invalid/user-inactive

export type RedirectReason = 'session-expired' | 'user-inactive' | 'token-invalid' | 'manual';

export function redirectToPortal(reason: RedirectReason): void {
  if (typeof window === 'undefined') return;
  const portalUrl = import.meta.env.PUBLIC_PORTAL_URL;
  if (!portalUrl) {
    console.warn('[portal-redirect] PUBLIC_PORTAL_URL not set — staying on /cennik');
    window.location.assign('/cennik');
    return;
  }
  let url: URL;
  try {
    url = new URL(portalUrl);
  } catch {
    console.warn(`[portal-redirect] PUBLIC_PORTAL_URL invalid: ${portalUrl}`);
    window.location.assign('/cennik');
    return;
  }
  url.searchParams.set('returnReason', reason);
  window.location.assign(url.toString());
}
