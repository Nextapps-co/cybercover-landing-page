import type { PaymentMethod } from '../../lib/api/types/order';

export interface PaymentMethodMeta {
  title: string;
  description: string;
  badges?: string[];
}

/**
 * Jedno źródło prawdy dla treści metod płatności — używane zarówno przez
 * `PaymentMethodStep` (wybór, krok 4) jak i `PaymentMethodSummaryCard`
 * (widok tylko-do-odczytu na podsumowaniu). Trzyma tytuł/opis/plakietki
 * spójne między krokiem wyboru a ekranem potwierdzenia.
 */
export const PAYMENT_METHOD_META: Record<PaymentMethod, PaymentMethodMeta> = {
  STRIPE_CHECKOUT: {
    title: 'Karta płatnicza',
    description: 'Szybka płatność online kartą kredytową lub debetową',
    badges: ['VISA', 'Mastercard'],
  },
  BANK_TRANSFER: {
    title: 'Przelew bankowy',
    description: 'Otrzymasz proformę PDF z numerem konta — opłać w ciągu 14 dni',
  },
};
