import type { SelectablePaymentMethod } from '../../lib/api/types/order';
import { PAYMENT_METHOD_META } from './payment-method-meta';

interface Props {
  method: SelectablePaymentMethod;
}

/**
 * Widok tylko-do-odczytu wybranej metody płatności na ekranie podsumowania.
 * Ten sam box co w kroku płatności (`PaymentMethodOption`), ale bez radio,
 * bez hoveru i bez żółtego podświetlenia — biała karta z szarą ramką.
 */
export function PaymentMethodSummaryCard({ method }: Props) {
  const meta = PAYMENT_METHOD_META[method];
  if (!meta) return null;

  return (
    <section className="font-['Plus_Jakarta_Sans',sans-serif]">
      <h3 className="mb-3 text-base font-semibold text-[#0D0D0D]">Metoda płatności</h3>
      <div className="rounded-[8px] border border-[#E4E2DF] bg-white p-4">
        <p className="text-sm font-semibold text-[#0D0D0D]">{meta.title}</p>
        <p className="mt-0.5 text-xs text-[#6B6965]">{meta.description}</p>
        {meta.badges && meta.badges.length > 0 && (
          <div className="mt-2 flex gap-2">
            {meta.badges.map((b) => (
              <span
                key={b}
                className="inline-block rounded border border-[#E4E2DF] bg-[#F8F7F4] px-2 py-0.5 text-xs text-[#6B6965]"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
