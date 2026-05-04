import type { CheckoutProgressDto, CheckoutStep } from '../api/types/order';

export type CheckoutStepNumber = 1 | 2 | 3 | 4;

const STEP_URLS: Record<CheckoutStep, string> = {
  COMPANY_DATA: '/checkout/company-data',
  PERSONAL_DATA: '/checkout/personal-data',
  OPERATIONAL_STANDARDS: '/checkout/operational-standards',
  PAYMENT_METHOD: '/checkout/payment-method',
};

const STEP_NUMBER_TO_ENUM: Record<CheckoutStepNumber, CheckoutStep> = {
  1: 'COMPANY_DATA',
  2: 'PERSONAL_DATA',
  3: 'OPERATIONAL_STANDARDS',
  4: 'PAYMENT_METHOD',
};

export function stepToUrl(step: CheckoutStep): string {
  return STEP_URLS[step];
}

export function checkoutStepNumber(n: CheckoutStepNumber): CheckoutStep {
  return STEP_NUMBER_TO_ENUM[n];
}

/**
 * Returns true if the user may access the given step number based on progress.
 * Rule: step N is accessible iff steps 1..N-1 are all completed.
 */
export function canAccessStep(step: CheckoutStepNumber, progress: CheckoutProgressDto): boolean {
  if (step === 1) return true;
  if (step === 2) return progress.hasCompanyData;
  if (step === 3) return progress.hasCompanyData && progress.hasPersonalData;
  if (step === 4) return progress.hasCompanyData && progress.hasPersonalData && progress.hasOperationalStandards;
  return false;
}
