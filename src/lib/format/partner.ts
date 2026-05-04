const STORAGE_KEY = 'cybercover:partner-code';

export function getPartnerFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('partner');
  if (raw !== null) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    return trimmed;
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored && stored.length > 0 ? stored : null;
}

export function clearPartner(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
