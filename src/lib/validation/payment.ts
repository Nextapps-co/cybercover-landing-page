import type { PaymentMethod } from '../api/types/order';

export function validatePaymentMethod(value: PaymentMethod | ''): string | null {
  if (!value) return 'Wybierz metodę płatności';
  if (value !== 'STRIPE_CHECKOUT' && value !== 'BANK_TRANSFER') return 'Niepoprawna metoda';
  return null;
}
