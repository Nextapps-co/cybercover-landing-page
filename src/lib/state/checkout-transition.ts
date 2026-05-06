// Direction-aware navigation helpers for checkout wizard transitions.
//
// CheckoutLayout includes Astro's <ClientRouter />, which intercepts navigations
// and runs CSS view-transitions between pages. The slide direction is selected
// by `data-checkout-direction` on <html> (see global.css). Here we set that
// flag immediately before triggering navigation, then call Astro's `navigate()`
// so the layout's `astro:before-preparation` listener picks it up.
//
// For routes outside CheckoutLayout (e.g. /cennik, Stripe hosted checkout),
// callers should keep using `window.location.assign / href` — those produce a
// full page reload, which is the correct behavior across layouts.

import { navigate } from 'astro:transitions/client';

type Direction = 'forward' | 'backward';

function setDirection(direction: Direction): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-checkout-direction', direction);
}

export function navigateForward(href: string): void {
  setDirection('forward');
  void navigate(href);
}

export function navigateBackward(href: string): void {
  setDirection('backward');
  void navigate(href);
}
