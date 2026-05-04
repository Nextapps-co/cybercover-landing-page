interface Props {
  planName: string;
  priceNet: number | null; // grosze
  billingCycle: 'MONTHLY' | 'ANNUAL';
  description?: string;
}

function formatGrosze(grosze: number | null): string {
  if (grosze === null) return '—';
  const zlote = grosze / 100;
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(zlote)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

export function SummaryPlanCard({ planName, priceNet, billingCycle, description }: Props) {
  const cycleSuffix = billingCycle === 'ANNUAL' ? 'rocznie' : 'miesięcznie';
  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <p className="text-2xl font-bold text-[#0D0D0D]">{planName}</p>
      <p className="mt-2">
        <span className="text-3xl font-bold text-[#0D0D0D]">{formatGrosze(priceNet)} zł</span>
        <span className="ml-2 text-sm text-[#6B6965]">{cycleSuffix}</span>
      </p>
      {description && <p className="mt-4 text-sm text-[#6B6965]">{description}</p>}
    </div>
  );
}
