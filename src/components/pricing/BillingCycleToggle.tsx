import type { BillingCycle } from '../../lib/api/types/money';

interface Props {
  value: BillingCycle;
  onChange: (next: BillingCycle) => void;
  /**
   * Cykl rozliczeniowy zablokowany dla aktualnego klienta. Przykład: klient na rocznym
   * abonamencie nie może zejść na miesięczny w ramach wizard'a — przekazujemy 'MONTHLY'
   * żeby button był disabled + tooltip wyjaśniał czemu.
   */
  disabledCycle?: BillingCycle;
  disabledReason?: string;
}

export function BillingCycleToggle({ value, onChange, disabledCycle, disabledReason }: Props) {
  const monthlyDisabled = disabledCycle === 'MONTHLY';
  const annualDisabled = disabledCycle === 'ANNUAL';

  const baseBtn =
    "px-6 py-2 rounded-[8px] font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] tracking-[-0.14px] transition-all";
  const enabledClasses = (active: boolean) =>
    `${baseBtn} cursor-pointer ${active ? 'bg-black text-white' : 'bg-transparent text-[#413f3b] hover:text-black'}`;
  const disabledClasses = `${baseBtn} cursor-not-allowed bg-transparent text-[#9CA3AF] opacity-60`;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] text-[#413f3b] tracking-[-0.14px]">
        Umowa roczna. Wybierz rodzaj płatności.
      </p>
      <div className="inline-flex items-center bg-white rounded-[10px] p-1 border border-[#EAEAE8]">
        <button
          type="button"
          onClick={() => !monthlyDisabled && onChange('MONTHLY')}
          disabled={monthlyDisabled}
          aria-disabled={monthlyDisabled}
          title={monthlyDisabled ? disabledReason : undefined}
          className={monthlyDisabled ? disabledClasses : enabledClasses(value === 'MONTHLY')}
        >
          Miesięczna
        </button>
        <button
          type="button"
          onClick={() => !annualDisabled && onChange('ANNUAL')}
          disabled={annualDisabled}
          aria-disabled={annualDisabled}
          title={annualDisabled ? disabledReason : undefined}
          className={`${annualDisabled ? disabledClasses : enabledClasses(value === 'ANNUAL')} relative`}
        >
          Roczna
          <span className="absolute -top-2 -right-2 bg-[#FED64B] text-black text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
            2 mies. gratis
          </span>
        </button>
      </div>
      {disabledReason && disabledCycle && (
        <p
          className="font-['Plus_Jakarta_Sans',sans-serif] text-[12px] text-[#6B6965]"
          role="note"
        >
          {disabledReason}
        </p>
      )}
    </div>
  );
}
