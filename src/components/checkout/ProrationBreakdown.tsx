// Per spec §5.6.3 — renderuje 2-line breakdown (charge + credit) dla PLAN_UPGRADE.
//
// Backend zwraca breakdown w PATCH /payment-method response (line.pricing.breakdown).
// PaymentMethodStep zapisuje to do sessionStorage (klucz cybercover:pricing-snapshot),
// ConfirmStep czyta i renderuje ten komponent gdy orderType === 'PLAN_UPGRADE'.

import type { PricingBreakdownItemDto } from '../../lib/api/types/order';
import type { MoneyDto } from '../../lib/api/types/money';
import { formatMinorUnits } from '../../lib/format/money';

interface Props {
  breakdown: PricingBreakdownItemDto[];
  totalPrice: MoneyDto;
}

export function ProrationBreakdown({ breakdown, totalPrice }: Props) {
  return (
    <div className="rounded-[12px] bg-[#f8f7f4] p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <h3 className="mb-4 text-lg font-semibold text-black">Rozliczenie zmiany planu</h3>
      <ul className="space-y-2">
        {breakdown.map((item, idx) => (
          <li key={idx} className="flex items-start justify-between">
            <span className="text-sm text-[#6B6965]">{item.label}</span>
            <span
              className={`font-medium ${item.amount.amount < 0 ? 'text-green-700' : 'text-black'}`}
            >
              {formatMinorUnits(item.amount.amount, item.amount.currency)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-[#E8E5DF] pt-4">
        <span className="font-semibold text-black">Razem do zapłaty</span>
        <span className="text-lg font-bold text-black">
          {formatMinorUnits(totalPrice.amount, totalPrice.currency)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#6B6965]">
        Kwoty netto. VAT 23% doliczony w fakturze.
      </p>
    </div>
  );
}
