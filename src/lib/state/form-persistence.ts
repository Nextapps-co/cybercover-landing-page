// Per-step form value persistence (sessionStorage).
// Used to restore typed-but-not-submitted values when the user navigates
// away and back during checkout. Keyed by step name.

export type CheckoutStepKey =
  | 'company-data'
  | 'personal-data'
  | 'operational-standards'
  | 'payment-method';

const STORAGE_PREFIX = 'cybercover:form-state:';

function key(step: CheckoutStepKey): string {
  return `${STORAGE_PREFIX}${step}`;
}

export function saveFormState<T extends object>(step: CheckoutStepKey, values: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key(step), JSON.stringify(values));
  } catch {
    /* ignore quota errors */
  }
}

export function getFormState<T extends object>(step: CheckoutStepKey): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key(step));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearFormState(step?: CheckoutStepKey): void {
  if (typeof window === 'undefined') return;
  if (step) {
    window.sessionStorage.removeItem(key(step));
    return;
  }
  // Clear all checkout form-state keys
  const allSteps: CheckoutStepKey[] = [
    'company-data',
    'personal-data',
    'operational-standards',
    'payment-method',
  ];
  for (const s of allSteps) {
    window.sessionStorage.removeItem(key(s));
  }
}
