// checkout-flow.md §9.0 — monetary amounts are integer minor units (grosze for PLN).

export type Currency = 'PLN';

export interface MoneyDto {
  amount: number; // integer grosze (minor units)
  currency: Currency;
}

export type BillingCycle = 'MONTHLY' | 'ANNUAL';
