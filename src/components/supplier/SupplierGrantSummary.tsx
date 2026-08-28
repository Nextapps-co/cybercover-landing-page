interface Props {
  leadingEntityName: string;
  companyName: string;
}

/**
 * Odpowiednik `OrderSummaryAside` dla lejka zaproszeniowego. Świadomie NIE czyta
 * danych cenowych zamówienia (§4.7 specu) — plan, cykl i „0 zł" są stałymi tego wariantu.
 */
export function SupplierGrantSummary({ leadingEntityName, companyName }: Props) {
  const inviter = leadingEntityName.length > 0 ? leadingEntityName : 'firma, która Cię zaprosiła';

  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 lg:sticky lg:top-[110px]">
      <h3 className="mb-4 border-b border-[#E4E2DF] pb-4 font-['Plus_Jakarta_Sans',sans-serif] text-base font-semibold text-black">
        Twoja rejestracja
      </h3>

      <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">Plan:</p>
      <h4 className="mb-1 font-['Plus_Jakarta_Sans',sans-serif] text-2xl font-bold text-black">Standard</h4>
      <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B6965]">rozliczenie roczne</p>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-['Plus_Jakarta_Sans',sans-serif] text-3xl font-bold text-black">0 zł</span>
        <span className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#413f3b]">dla Ciebie</span>
      </div>

      <p className="mt-4 font-['Plus_Jakarta_Sans',sans-serif] text-sm leading-relaxed text-[#413f3b]">
        Plan opłaca <span className="font-semibold text-[#0D0D0D]">{inviter}</span>. Nie podajesz danych
        do płatności i nic Ci nie doliczymy.
      </p>

      {companyName.length > 0 && (
        <div className="mt-4 border-t border-[#E4E2DF] pt-4">
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
            Rejestrujesz: <span className="font-semibold text-[#0D0D0D]">{companyName}</span>
          </p>
        </div>
      )}
    </div>
  );
}
