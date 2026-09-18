import { describe, it, expect } from 'vitest';
import { grantOrderProblem, noticeVariantForError } from './guards';
import { ApiError } from '../api/types/errors';

function state(over: { isGrant?: boolean; hasOperationalStandards?: boolean } = {}) {
  return {
    isGrant: 'isGrant' in over ? over.isGrant : true,
    progress: {
      hasCompanyData: false,
      hasPersonalData: false,
      hasOperationalStandards: over.hasOperationalStandards ?? true,
      hasPaymentMethod: false,
    },
  };
}

describe('noticeVariantForError', () => {
  it('404 NOT_FOUND_EXCEPTION → zaproszenie nieaktualne', () => {
    expect(noticeVariantForError(new ApiError('NOT_FOUND_EXCEPTION', 404, null))).toBe('invitation-invalid');
  });

  it('422 STANDARD_PLAN_NOT_FOUND → błąd konfiguracji', () => {
    expect(noticeVariantForError(new ApiError('STANDARD_PLAN_NOT_FOUND', 422, null))).toBe('config-error');
  });

  it('INVALID_ORDER_STATE → wznowienie przez link', () => {
    expect(noticeVariantForError(new ApiError('INVALID_ORDER_STATE', 400, null))).toBe('order-state');
  });

  it('ORDER_NOT_FOUND → wznowienie przez link', () => {
    expect(noticeVariantForError(new ApiError('ORDER_NOT_FOUND', 404, null))).toBe('order-state');
  });

  it('niezgodna metoda płatności → niespójne zamówienie', () => {
    expect(noticeVariantForError(new ApiError('SALES_ORDER_GRANT_PAYMENT_METHOD_MISMATCH', 400, null)))
      .toBe('inconsistent-order');
  });

  it('429 wygrywa z kodem błędu', () => {
    expect(noticeVariantForError(new ApiError('INTERNAL_ERROR', 429, null))).toBe('rate-limited');
  });

  it('błędy do obsługi lokalnej zwracają null', () => {
    expect(noticeVariantForError(new ApiError('SALES_ORDER_GRANT_NIP_MISMATCH', 400, null))).toBeNull();
    expect(noticeVariantForError(new ApiError('INVALID_CONSENT', 400, null))).toBeNull();
    expect(noticeVariantForError(new ApiError('NETWORK_ERROR', 0, null))).toBeNull();
    expect(noticeVariantForError(new Error('boom'))).toBeNull();
  });
});

describe('grantOrderProblem', () => {
  it('poprawne zamówienie grantowe nie ma problemu', () => {
    expect(grantOrderProblem(state())).toBeNull();
  });

  it('isGrant === false to twardy stop', () => {
    expect(grantOrderProblem(state({ isGrant: false }))).toBe('inconsistent-order');
  });

  it('brak pola isGrant NIE blokuje lejka', () => {
    expect(grantOrderProblem(state({ isGrant: undefined }))).toBeNull();
  });

  it('nieukończony krok ubezpieczeniowy na grancie to defekt zamówienia', () => {
    expect(grantOrderProblem(state({ hasOperationalStandards: false }))).toBe('inconsistent-order');
  });
});
