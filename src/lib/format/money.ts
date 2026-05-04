import type { BillingCycle, Currency, MoneyDto } from '../api/types/money';

const PL_NUMBER_FORMATTER_INTEGER = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

const PL_NUMBER_FORMATTER_DECIMAL = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const CURRENCY_SYMBOL: Record<Currency, string> = {
  PLN: 'zł',
};

export function formatMinorUnits(amount: number, currency: Currency): string {
  const major = amount / 100;
  const hasFraction = amount % 100 !== 0;
  const formatted = hasFraction
    ? PL_NUMBER_FORMATTER_DECIMAL.format(major)
    : PL_NUMBER_FORMATTER_INTEGER.format(major);
  // Intl may insert narrow no-break space (U+202F) or no-break space (U+00A0) between groups.
  // Normalize to plain ASCII space for test stability.
  const normalized = formatted.replace(/ /g, ' ').replace(/ /g, ' ');
  return `${normalized} ${CURRENCY_SYMBOL[currency]}`;
}

export function formatPricePerCycle(money: MoneyDto, cycle: BillingCycle): string {
  const price = formatMinorUnits(money.amount, money.currency);
  return cycle === 'MONTHLY' ? `${price} / mies.` : `${price} / rok`;
}
