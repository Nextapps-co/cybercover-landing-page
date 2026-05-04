import { describe, it, expect } from 'vitest';
import { validatePaymentMethod } from './payment';

describe('validatePaymentMethod', () => {
  it('returns error when value is empty', () => {
    expect(validatePaymentMethod('')).toBe('Wybierz metodę płatności');
  });

  it('returns null for STRIPE_CHECKOUT', () => {
    expect(validatePaymentMethod('STRIPE_CHECKOUT')).toBeNull();
  });

  it('returns null for BANK_TRANSFER', () => {
    expect(validatePaymentMethod('BANK_TRANSFER')).toBeNull();
  });

  it('returns error for invalid string', () => {
    // @ts-expect-error testing runtime guard for invalid input
    expect(validatePaymentMethod('CASH')).toBe('Niepoprawna metoda');
  });
});
