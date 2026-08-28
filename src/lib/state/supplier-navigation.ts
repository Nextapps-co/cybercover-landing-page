import type { CheckoutProgressDto, CheckoutStateResponseDto, CheckoutStep } from '../api/types/order';

export const SUPPLIER_BASE_PATH = '/supplier-registration';

export const SUPPLIER_STEP_PATHS: Record<CheckoutStep, string> = {
  COMPANY_DATA: `${SUPPLIER_BASE_PATH}/company-data`,
  PERSONAL_DATA: `${SUPPLIER_BASE_PATH}/personal-data`,
  // Krok ubezpieczeniowy jest na grancie zrobiony już przy tworzeniu zamówienia (§5.4),
  // więc backend nie powinien go nigdy zwrócić. Mapowanie istnieje wyłącznie po to,
  // żeby nieoczekiwana wartość nie wpuściła nas w stan niezdefiniowany.
  OPERATIONAL_STANDARDS: `${SUPPLIER_BASE_PATH}/confirm`,
  // Metoda płatności jest wysyłana w tle na ekranie potwierdzenia — nie ma własnej strony.
  PAYMENT_METHOD: `${SUPPLIER_BASE_PATH}/confirm`,
};

export const SUPPLIER_CONFIRM_PATH = `${SUPPLIER_BASE_PATH}/confirm`;
export const SUPPLIER_SUCCESS_PATH = `${SUPPLIER_BASE_PATH}/success`;
export const INVITATION_PATH = '/monitoring-invitation';

/**
 * Punkt wejścia przy wznowieniu. Liczony z `nextRequiredStep`, NIE z `wizardEntryStep`
 * (ten drugi jest kebab-case i nie potrafi wyrazić `personal-data` — §5.6).
 */
export function entryPathFromState(state: Pick<CheckoutStateResponseDto, 'nextRequiredStep'>): string {
  const step = state.nextRequiredStep;
  return step ? SUPPLIER_STEP_PATHS[step] : SUPPLIER_CONFIRM_PATH;
}

export type SupplierStepNumber = 1 | 2 | 3;

export type StepGuardResult = { ok: true } | { ok: false; redirectTo: string };

/** Krok N jest dostępny wtedy, gdy wszystkie wcześniejsze są ukończone. */
export function guardStep(step: SupplierStepNumber, progress: CheckoutProgressDto): StepGuardResult {
  if (step === 1) return { ok: true };
  if (!progress.hasCompanyData) return { ok: false, redirectTo: SUPPLIER_STEP_PATHS.COMPANY_DATA };
  if (step === 2) return { ok: true };
  if (!progress.hasPersonalData) return { ok: false, redirectTo: SUPPLIER_STEP_PATHS.PERSONAL_DATA };
  return { ok: true };
}
