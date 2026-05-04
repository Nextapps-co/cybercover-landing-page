const STORAGE_KEY = 'cybercover:discount-code';

export function getDiscountCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('discountCode');
  if (raw !== null) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    return trimmed;
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored && stored.length > 0 ? stored : null;
}

export function clearDiscountCode(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
