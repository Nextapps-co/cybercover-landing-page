import type { PaymentMethod } from '../../lib/api/types/order';
import { PAYMENT_METHOD_META } from './payment-method-meta';

interface Props {
  method: PaymentMethod;
}

/**
 * Widok tylko-do-odczytu wybranej metody płatności na ekranie podsumowania.
 * Ta sama obudowa co `SummaryDataCard` („Zamawiający"/„Osoba kontaktowa") —
 * biała karta z tytułem w środku — a w treści nazwa metody, opis i plakietki
 * (VISA/Mastercard). Bez radio i bez żółtego podświetlenia.
 */
export function PaymentMethodSummaryCard({ method }: Props) {
  const meta = PAYMENT_METHOD_META[method];
  if (!meta) return null;

  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <h3 className="text-base font-semibold text-[#0D0D0D]">Metoda płatności</h3>
      <div className="mt-4">
        <p className="text-sm font-semibold text-[#0D0D0D]">{meta.title}</p>
        <p className="mt-1 text-sm text-[#6B6965]">{meta.description}</p>
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
    </div>
  );
}
