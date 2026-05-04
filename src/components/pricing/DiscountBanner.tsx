interface Props {
  promoterName: string;
  promoterLogoUrl: string | null;
  description: string;
}

// Renamed from PartnerBanner — the word "partner" in the file name was matched by
// ad-blocker rule lists (uBlock / AdGuard / Brave Shields) which blocked the dev-mode
// dynamic import with ERR_BLOCKED_BY_CLIENT.
export function DiscountBanner({ promoterName, promoterLogoUrl, description }: Props) {
  return (
    <div className="flex justify-center mb-6">
      <div className="bg-[#DDEEF8] rounded-[12px] px-5 py-3 flex items-center gap-6 transition-opacity duration-300">
        <p className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-[16px] text-[#0D0D0D] tracking-[-0.16px] leading-[24px]">
          {description}
        </p>
        {promoterLogoUrl && (
          <img
            src={promoterLogoUrl}
            alt={promoterName}
            className="h-6 w-auto"
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}
