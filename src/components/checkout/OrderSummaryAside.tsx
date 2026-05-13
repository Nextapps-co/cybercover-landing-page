import { useEffect, useState } from 'react';
import type { OrderSession } from '../../lib/state/order-session';
import { getOrderSession } from '../../lib/state/order-session';
import { formatMinorUnits } from '../../lib/format/money';
import type { OrderResponseDto } from '../../lib/api/types/order';

interface Props {
  order?: OrderResponseDto | null;
}

export function OrderSummaryAside({ order }: Props = {}) {
  const [session, setSession] = useState<OrderSession | null>(null);

  useEffect(() => {
    setSession(getOrderSession());
  }, []);

  if (!session) {
    return (
      <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6">
        <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B6965]">
          Brak aktywnego zamówienia.
        </p>
      </div>
    );
  }

  const discount = order?.discount ?? null;
  const currency = (order?.currency ?? session.planSnapshot.currency) as 'PLN';
  const cycleLabel = session.billingCycle === 'MONTHLY' ? 'netto miesięcznie' : 'netto miesięcznie (przy rocznym rozliczeniu)';

  const mainPriceGrosze = discount ? discount.priceAfterDiscount : session.planSnapshot.priceMinorUnits;
  const originalPriceGrosze = discount ? discount.originalAmount : null;

  const yearlyTotalGrosze = session.planSnapshot.priceMinorUnits * 12;
  const yearlyMajor = Math.round(yearlyTotalGrosze / 100);
  const yearlyFormatted = new Intl.NumberFormat('pl-PL', { useGrouping: true })
    .format(yearlyMajor)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');

  const discountCode = discount?.code ?? session.partnerCode;

  return (
    <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-6 lg:sticky lg:top-[110px]">
      <h3 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-base text-black mb-4 pb-4 border-b border-[#E4E2DF]">
        Podsumowanie zamówienia
      </h3>

      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b] mb-1">
        Plan:
      </p>
      <h4 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-2xl text-black mb-4">
        {session.planSnapshot.planName}
      </h4>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-3xl text-black">
          {formatMinorUnits(mainPriceGrosze, currency)}
        </span>
        <span className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b]">
          {cycleLabel}
        </span>
      </div>

      {discount && originalPriceGrosze !== null && originalPriceGrosze > mainPriceGrosze && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B6965] line-through">
            {formatMinorUnits(originalPriceGrosze, currency)}
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] inline-flex items-center rounded-full bg-[#FED64B]/20 px-2 py-0.5 text-xs font-semibold text-[#0D0D0D]">
            Oszczędzasz {formatMinorUnits(discount.discountAmount, currency)}
          </span>
        </div>
      )}

      {!discount && (
        <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#6B6965] mb-4">
          {yearlyFormatted} zł netto/rok
        </p>
      )}

      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b] leading-relaxed mt-4">
        {session.planSnapshot.description}
      </p>

      {(discount?.kind === 'PARTNER_TIMEBOUND' || discount?.kind === 'PARTNER_TIMEBOUND_COMPOSITE') && originalPriceGrosze !== null && (
        <p className="mt-4 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
          Cena promocyjna na czas trwania promocji. Po jej zakończeniu naliczymy standardową opłatę
          {' '}{formatMinorUnits(originalPriceGrosze, currency)} {session.billingCycle === 'MONTHLY' ? 'netto/mies.' : 'netto/rok'}.
        </p>
      )}

      {discountCode && (
        <div className="mt-4 pt-4 border-t border-[#E4E2DF]">
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
            {discount ? 'Kod rabatowy' : 'Kod partnera'}: <span className="font-semibold text-[#0D0D0D]">{discountCode}</span>
          </p>
        </div>
      )}
    </div>
  );
}
