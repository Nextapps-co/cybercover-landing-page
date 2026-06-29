interface DraftResumeBannerProps {
  planName: string;
  resumeHref: string;
  onDiscard: () => void;
  /**
   * 'draft' — wizard niedokończony (resumeHref → krok wizardu).
   * 'resumable' — zamówienie potwierdzone, czeka na opłacenie przez Stripe
   *               (resumeHref → /checkout/resume). Patrz pending-order.ts.
   */
  variant?: 'draft' | 'resumable';
}

export function DraftResumeBanner({ planName, resumeHref, onDiscard, variant = 'draft' }: DraftResumeBannerProps) {
  const isResumable = variant === 'resumable';
  return (
    <div
      role="status"
      className="mx-auto mb-8 max-w-3xl rounded-[12px] border border-[#FED64B] bg-[#FFF9E6] p-4 font-['Plus_Jakarta_Sans',sans-serif] sm:flex sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="text-sm text-[#0D0D0D]">
        {isResumable ? (
          <>
            Masz niedokończoną płatność za plan <span className="font-semibold">{planName}</span>. Możesz ją dokończyć albo zacząć od nowa.
          </>
        ) : (
          <>
            Masz niedokończone zamówienie planu <span className="font-semibold">{planName}</span>. Możesz je dokończyć albo zacząć od nowa.
          </>
        )}
      </p>
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <a
          href={resumeHref}
          className="rounded-[80px] bg-[#FED64B] px-5 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
        >
          {isResumable ? 'Dokończ płatność' : 'Dokończ zamówienie'}
        </a>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-[80px] border border-[#A2A09C] bg-white px-5 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
        >
          Odrzuć
        </button>
      </div>
    </div>
  );
}
