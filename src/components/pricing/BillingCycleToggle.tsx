import type { BillingCycle } from '../../lib/api/types/money';

interface Props {
  value: BillingCycle;
  onChange: (next: BillingCycle) => void;
}

export function BillingCycleToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] text-[#413f3b] tracking-[-0.14px]">
        Umowa roczna. Wybierz rodzaj płatności.
      </p>
      <div className="inline-flex items-center bg-white rounded-[10px] p-1 border border-[#EAEAE8]">
        <button
          type="button"
          onClick={() => onChange('MONTHLY')}
          className={`px-6 py-2 rounded-[8px] font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] tracking-[-0.14px] transition-all cursor-pointer ${
            value === 'MONTHLY'
              ? 'bg-black text-white'
              : 'bg-transparent text-[#413f3b] hover:text-black'
          }`}
        >
          Miesięczna
        </button>
        <button
          type="button"
          onClick={() => onChange('ANNUAL')}
          className={`px-6 py-2 rounded-[8px] font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[14px] tracking-[-0.14px] transition-all cursor-pointer relative ${
            value === 'ANNUAL'
              ? 'bg-black text-white'
              : 'bg-transparent text-[#413f3b] hover:text-black'
          }`}
        >
          Roczna
          <span className="absolute -top-2 -right-2 bg-[#FED64B] text-black text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
            2 mies. gratis
          </span>
        </button>
      </div>
    </div>
  );
}
