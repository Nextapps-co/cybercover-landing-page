// Per spec §5.4.5 — banner zależny od `subscriptionStatus` z pricing-catalog auth-aware response.
//
// ACTIVE → brak banner (domyślny upgrade flow). Pozostałe statusy: prompt do reactivation.

import type { SubscriptionStatus } from '../../lib/api/types/catalog';

interface BannerCopy {
  title: string;
  message: string;
  tone: 'info' | 'warning';
}

const COPY: Partial<Record<SubscriptionStatus, BannerCopy>> = {
  GRACE_PERIOD: {
    tone: 'warning',
    title: 'Twoja subskrypcja jest nieopłacona',
    message: 'Wybierz plan i opłać żeby kontynuować ochronę.',
  },
  EXPIRED: {
    tone: 'info',
    title: 'Twoja subskrypcja wygasła',
    message: 'Wybierz plan żeby ją wznowić.',
  },
  CANCELLED: {
    tone: 'info',
    title: 'Twoja subskrypcja została anulowana',
    message: 'Wybierz plan żeby ją wznowić.',
  },
  // ACTIVE → null (brak banner)
};

interface Props {
  status?: SubscriptionStatus;
}

export function SubscriptionStatusBanner({ status }: Props) {
  if (!status) return null;
  const copy = COPY[status];
  if (!copy) return null;

  const toneClasses =
    copy.tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-blue-300 bg-blue-50 text-blue-900';

  return (
    <div
      role="status"
      className={`mx-auto mb-8 max-w-2xl rounded-[12px] border p-4 font-['Plus_Jakarta_Sans',sans-serif] ${toneClasses}`}
    >
      <h4 className="text-base font-semibold">{copy.title}</h4>
      <p className="mt-1 text-sm">{copy.message}</p>
    </div>
  );
}
