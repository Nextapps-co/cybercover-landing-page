import { useId, useState } from 'react';
import type { ConsentDefinitionDto } from '../../lib/api/types/order';

interface Props {
  consent: ConsentDefinitionDto;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export function ConsentCheckbox({ consent, checked, onChange, error }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const hasDetails = consent.expandedDetails !== null;

  return (
    <div className="flex gap-3 py-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.currentTarget.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-[#E4E2DF] accent-[#FED64B] cursor-pointer"
      />
      <div className="flex-1">
        <label htmlFor={id} className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#0D0D0D] leading-snug cursor-pointer [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-black">
          {consent.isRequired && <span aria-hidden="true" className="mr-0.5 text-red-500">*</span>}
          <span dangerouslySetInnerHTML={{ __html: consent.name }} />
        </label>
        {consent.description && (
          <p className="mt-1 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">{consent.description}</p>
        )}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-1 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#0D0D0D] underline hover:text-black"
          >
            {expanded ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
          </button>
        )}
        {expanded && consent.expandedDetails && (
          <div className="mt-2 rounded-[8px] bg-white border border-[#E4E2DF] p-3">
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-xs font-semibold text-[#0D0D0D]">
              {consent.expandedDetails.title}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">
              {consent.expandedDetails.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-500" role="alert">{error}</p>}
      </div>
    </div>
  );
}
