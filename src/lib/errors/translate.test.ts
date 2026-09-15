import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/types/errors';
import { translateApiError } from './translate';

describe('translateApiError', () => {
  it.each([
    ['INVALID_NIP', 'Nieprawidłowy NIP'],
    ['ORDER_NOT_FOUND', 'Zamówienie nie istnieje'],
    ['INVALID_ORDER_STATE', 'Nie można wykonać tej operacji'],
    ['EMAIL_NOT_AVAILABLE', 'email jest już zarejestrowany'],
    ['DISCOUNT_CODE_NOT_FOUND', 'Kod rabatowy nie istnieje'],
    ['COMPANY_LOOKUP_UNAVAILABLE', 'Rejestry firm'],
    ['NETWORK_ERROR', 'Problem z połączeniem'],
    ['INTERNAL_ERROR', 'Coś poszło nie tak'],
    ['UNKNOWN', 'Wystąpił nieznany błąd'],
  ])('returns non-empty PL message for %s', (code, snippet) => {
    const err = new ApiError(code as any, 400, null);
    const result = translateApiError(err);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.message.toLowerCase()).toContain(snippet.toLowerCase());
  });

  it('returns actionable=true for user-correctable errors', () => {
    const err = new ApiError('INVALID_NIP', 400, null);
    expect(translateApiError(err).actionable).toBe(true);
  });

  it('returns actionable=false for server errors', () => {
    const err = new ApiError('INTERNAL_ERROR', 500, null);
    expect(translateApiError(err).actionable).toBe(false);
  });

  it('falls back to UNKNOWN for unknown error class', () => {
    const err = new Error('something');
    const result = translateApiError(err);
    expect(result.title.length).toBeGreaterThan(0);
  });
});

describe('translateApiError — auth-aware codes', () => {
  it.each<[string, { actionable: boolean }]>([
    ['HANDOFF_TOKEN_INVALID_OR_EXPIRED', { actionable: true }],
    ['USER_INACTIVE', { actionable: false }],
    ['PLAN_CHANGE_PENDING', { actionable: true }],
    ['DOWNGRADE_NOT_ALLOWED', { actionable: true }],
    ['REACTIVATION_DOWNGRADE_NOT_ALLOWED', { actionable: true }],
    ['DISCOUNT_NOT_ALLOWED_FOR_ORDER_TYPE', { actionable: true }],
    ['OPERATIONAL_STANDARDS_REQUIRED', { actionable: true }],
    ['PROFORMA_NOT_ISSUED', { actionable: false }],
  ])('translates %s', (code, { actionable }) => {
    const t = translateApiError(new ApiError(code as never, 400, null));
    expect(t.title).toBeTruthy();
    expect(t.message).toBeTruthy();
    expect(t.actionable).toBe(actionable);
  });
});

describe('kody kreatora Wolters Kluwer', () => {
  it('zajęty NIP jest błędem do poprawienia przez użytkownika, nie awarią serwera', () => {
    const t = translateApiError(new ApiError('COMPANY_NIP_ALREADY_REGISTERED', 409, null));
    expect(t.actionable).toBe(true);
    expect(t.message).not.toMatch(/po naszej stronie/i);
  });

  it('tłumaczy wszystkie cztery kody WK_CONFIG_* na konkretne komunikaty, nie na fallback UNKNOWN', () => {
    // `length > 0` niczego by tu nie dowodziło — TRANSLATIONS.UNKNOWN (fallback dla nierozpoznanego
    // kodu) też ma niepuste title/message. Dowodem, że kod ma WŁASNY wpis, jest dokładny tytuł:
    // różni się od tytułu fallbacku ('Nieznany błąd') tylko wtedy, gdy wpis faktycznie istnieje
    // w TRANSLATIONS. Zweryfikowane empirycznie: po chwilowym zakomentowaniu dowolnego z czterech
    // wpisów w translate.ts ten test czerwienieje (patrz task-1-2-report.md, runda poprawek 1).
    const cases = [
      ['WK_CONFIG_PERSONAL_DATA_NOT_SUBMITTED', 'Wróćmy na chwilę do Twoich danych'],
      ['WK_CONFIG_PERSONAL_DATA_MISMATCH', 'Te dane wypełnił ktoś inny'],
      ['WK_CONFIG_CHECKOUT_INCOMPLETE', 'Został jeszcze jeden krok'],
      ['WK_CONFIG_NOT_IN_PROGRESS', 'Konfiguracja jest już zakończona'],
    ] as const;
    for (const [code, expectedTitle] of cases) {
      const t = translateApiError(new ApiError(code, 409, null));
      expect(t.title).toBe(expectedTitle);
      expect(t.actionable).toBe(true);
    }
  });
});
