import { useEffect, useState } from 'react';
import type { OrderSession } from '../../lib/state/order-session';
import { getOrderSession } from '../../lib/state/order-session';
import { formatMinorUnits } from '../../lib/format/money';
import type { OrderResponseDto, OrderDiscountDto } from '../../lib/api/types/order';
import { computeUpgradeDueNow } from '../../lib/checkout/upgrade-pricing';

interface Props {
  order?: OrderResponseDto | null;
  /** Podgląd rabatu po „Zastosuj", zanim utrwali go selectPaymentMethod — pokazuje zdyskontowaną cenę od razu. */
  previewDiscount?: { code: string; originalPriceNet: number; discountedPriceNet: number } | null;
}

export function OrderSummaryAside({ order, previewDiscount }: Props = {}) {
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

  const currency = (order?.currency ?? session.planSnapshot.currency) as 'PLN';
  const proration = order?.proration ?? null;

  // CC-533 — źródło rabatu wspólne dla obu gałęzi (proracja i zwykła cena):
  // rabat utrwalony na zamówieniu ma pierwszeństwo; inaczej podgląd z pola po „Zastosuj".
  const previewAsDiscount: OrderDiscountDto | null =
    !order?.discount && previewDiscount
      ? {
          code: previewDiscount.code,
          kind: 'CODE_FLAT',
          originalAmount: previewDiscount.originalPriceNet,
          priceAfterDiscount: previewDiscount.discountedPriceNet,
          discountAmount: previewDiscount.originalPriceNet - previewDiscount.discountedPriceNet,
          currency,
        }
      : null;
  const discount = order?.discount ?? previewAsDiscount;

  // CC-353 — dla zamówień podniesienia planu boks pokazuje rozbicie proracji
  // (pełna cena → −kredyt → do zapłaty teraz) zamiast ceny „z metki" z cennika.
  // Jedyne źródło prawdy: order.proration (kwoty już za właściwy cykl, bez ×12).
  if (proration) {
    // Podgląd rabatu (jeszcze nieutrwalony) obniża amountDueNow; utrwalony rabat jest
    // już wliczony w proration.amountDueNow, więc previewDiscountAmount = 0.
    const previewDiscountAmount = !order?.discount && previewDiscount
      ? previewDiscount.originalPriceNet - previewDiscount.discountedPriceNet
      : 0;
    const dueNow = computeUpgradeDueNow(proration.amountDueNow, previewDiscountAmount);
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

        <ul className="space-y-2">
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Pełna cena planu</span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-black whitespace-nowrap">
              {formatMinorUnits(proration.fullPrice, currency)}
            </span>
          </li>
          {/* CC-533 — tylko rabat CODE_FLAT (kod klienta) pokazujemy osobną linią: dla niego
              proration.fullPrice to cena bazowa planu, więc pełna cena − rabat − kredyt = dueNow.
              Rabat partnerski jest już wtopiony w proration.fullPrice na starcie — osobna linia
              podwajałaby zniżkę i nie zgadzałaby się z „Do zapłaty teraz". */}
          {discount?.kind === 'CODE_FLAT' && discount.discountAmount > 0 && (
            <li className="flex items-start justify-between gap-2">
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">
                Rabat ({discount.code})
              </span>
              <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-green-700 whitespace-nowrap">
                −{formatMinorUnits(discount.discountAmount, currency)}
              </span>
            </li>
          )}
          <li className="flex items-start justify-between gap-2">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Kredyt za obecny plan</span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium text-green-700 whitespace-nowrap">
              −{formatMinorUnits(proration.credit, currency)}
            </span>
          </li>
        </ul>

        <div className="mt-4 pt-4 border-t border-[#E4E2DF] flex items-baseline justify-between gap-2">
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-base text-black">
            Do zapłaty teraz
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-2xl text-black whitespace-nowrap">
            {formatMinorUnits(dueNow, currency)}
          </span>
        </div>

        <p className="mt-3 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
          Kwoty netto. VAT 23% doliczymy na fakturze.
        </p>
      </div>
    );
  }

  const isAnnual = session.billingCycle === 'ANNUAL';

  // Dwa źródła ceny mają RÓŻNE jednostki — nie wolno ich mieszać:
  // • order.discount.* to kwoty ZA CAŁY CYKL (== totalPriceNet; dla ANNUAL już zawierają ×12)
  //   → renderujemy as-is, BEZ ×12 (tak jak gałąź proracji wyżej i SuccessStatus).
  // • session.planSnapshot.priceMinorUnits to stawka MIESIĘCZNA z cennika
  //   → dla ANNUAL mnożymy ×12, żeby pokazać sumę roczną.
  const displayPriceGrosze = discount
    ? discount.priceAfterDiscount
    : isAnnual
      ? session.planSnapshot.priceMinorUnits * 12
      : session.planSnapshot.priceMinorUnits;
  const displayOriginalGrosze = discount ? discount.originalAmount : null;
  const displayLabel = isAnnual ? 'netto rocznie' : 'netto miesięcznie';

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
        <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-3xl text-black whitespace-nowrap">
          {formatMinorUnits(displayPriceGrosze, currency)}
        </span>
        <span className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b]">
          {displayLabel}
        </span>
      </div>

      {discount && displayOriginalGrosze !== null && displayOriginalGrosze > displayPriceGrosze && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B6965] line-through whitespace-nowrap">
            {formatMinorUnits(displayOriginalGrosze, currency)}
          </span>
          <span className="font-['Plus_Jakarta_Sans',sans-serif] inline-flex items-center rounded-full bg-[#FED64B]/20 px-2 py-0.5 text-xs font-semibold text-[#0D0D0D]">
            Oszczędzasz {formatMinorUnits(discount.discountAmount, currency)}
          </span>
        </div>
      )}

      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#413f3b] leading-relaxed mt-4">
        {session.planSnapshot.description}
      </p>

      {(discount?.kind === 'PARTNER_TIMEBOUND' || discount?.kind === 'PARTNER_TIMEBOUND_COMPOSITE') && displayOriginalGrosze !== null && (
        <p className="mt-4 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
          Cena promocyjna na czas trwania promocji. Po jej zakończeniu naliczymy standardową opłatę
          {' '}{formatMinorUnits(displayOriginalGrosze, currency)} {isAnnual ? 'netto/rok' : 'netto/mies.'}.
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
