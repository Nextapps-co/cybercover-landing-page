import { useEffect, useState } from 'react';
import type { OrderSession } from '../../lib/state/order-session';
import { getOrderSession } from '../../lib/state/order-session';
import { formatMinorUnits } from '../../lib/format/money';

export function OrderSummaryAside() {
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

  const cycleLabel = session.billingCycle === 'MONTHLY' ? 'netto miesięcznie' : 'netto miesięcznie (przy rocznym rozliczeniu)';
  const yearlyTotalGrosze = session.planSnapshot.priceMinorUnits * 12;
  const yearlyMajor = Math.round(yearlyTotalGrosze / 100);
  const yearlyFormatted = new Intl.NumberFormat('pl-PL', { useGrouping: true })
    .format(yearlyMajor)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');

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
          {formatMinorUnits(session.planSnapshot.priceMinorUnits, session.planSnapshot.currency)}
        </span>
        <span className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b]">
          {cycleLabel}
        </span>
      </div>

      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#6B6965] mb-4">
        {yearlyFormatted} zł netto/rok
      </p>

      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b] leading-relaxed">
        {session.planSnapshot.description}
      </p>

      {session.partnerCode && (
        <div className="mt-4 pt-4 border-t border-[#E4E2DF]">
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
            Kod partnera: <span className="font-semibold text-[#0D0D0D]">{session.partnerCode}</span>
          </p>
        </div>
      )}
    </div>
  );
}
