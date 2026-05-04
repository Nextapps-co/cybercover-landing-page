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
