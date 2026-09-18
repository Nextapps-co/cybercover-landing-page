import { describe, it, expect } from 'vitest';
import {
  SUPPLIER_CONFIRM_PATH,
  SUPPLIER_STEP_PATHS,
  entryPathFromState,
  guardStep,
} from './supplier-navigation';
import type { CheckoutProgressDto } from '../api/types/order';

function progress(over: Partial<CheckoutProgressDto> = {}): CheckoutProgressDto {
  return {
    hasCompanyData: false,
    hasPersonalData: false,
    // Na grancie ten krok jest zrobiony od pierwszego odczytu.
    hasOperationalStandards: true,
    hasPaymentMethod: false,
    ...over,
  };
}

describe('entryPathFromState', () => {
  it('COMPANY_DATA → krok 1', () => {
    expect(entryPathFromState({ nextRequiredStep: 'COMPANY_DATA' })).toBe(SUPPLIER_STEP_PATHS.COMPANY_DATA);
  });

  it('PERSONAL_DATA → krok 2', () => {
    expect(entryPathFromState({ nextRequiredStep: 'PERSONAL_DATA' })).toBe(SUPPLIER_STEP_PATHS.PERSONAL_DATA);
  });

  it('PAYMENT_METHOD → potwierdzenie (krok bez własnej strony)', () => {
    expect(entryPathFromState({ nextRequiredStep: 'PAYMENT_METHOD' })).toBe(SUPPLIER_CONFIRM_PATH);
  });

  it('OPERATIONAL_STANDARDS → potwierdzenie (nie powinno wystąpić, ale nie wpadamy w undefined)', () => {
    expect(entryPathFromState({ nextRequiredStep: 'OPERATIONAL_STANDARDS' })).toBe(SUPPLIER_CONFIRM_PATH);
  });

  it('null (checkout kompletny) → potwierdzenie', () => {
    expect(entryPathFromState({ nextRequiredStep: null })).toBe(SUPPLIER_CONFIRM_PATH);
  });
});

describe('guardStep', () => {
  it('krok 1 jest zawsze dostępny', () => {
    expect(guardStep(1, progress())).toEqual({ ok: true });
  });

  it('krok 2 bez danych firmy cofa na krok 1', () => {
    expect(guardStep(2, progress())).toEqual({ ok: false, redirectTo: SUPPLIER_STEP_PATHS.COMPANY_DATA });
  });

  it('krok 2 z danymi firmy jest dostępny', () => {
    expect(guardStep(2, progress({ hasCompanyData: true }))).toEqual({ ok: true });
  });

  it('krok 3 bez danych osobowych cofa na krok 2', () => {
    expect(guardStep(3, progress({ hasCompanyData: true }))).toEqual({
      ok: false,
      redirectTo: SUPPLIER_STEP_PATHS.PERSONAL_DATA,
    });
  });

  it('krok 3 bez danych firmy cofa na krok 1 (pierwszy brakujący)', () => {
    expect(guardStep(3, progress({ hasPersonalData: true }))).toEqual({
      ok: false,
      redirectTo: SUPPLIER_STEP_PATHS.COMPANY_DATA,
    });
  });

  it('krok 3 z kompletem danych jest dostępny — metoda płatności nie jest warunkiem wejścia', () => {
    expect(guardStep(3, progress({ hasCompanyData: true, hasPersonalData: true }))).toEqual({ ok: true });
  });
});
