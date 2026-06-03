import { forwardRef, useState } from 'react';
import type { ChangeEventHandler, FocusEventHandler, InputHTMLAttributes } from 'react';
import { lookupCompany } from '../../lib/api/orders';
import { normalizeNip } from '../../lib/validation/nip';
import { translateApiError } from '../../lib/errors/translate';
import type { CompanyLookupDataDto } from '../../lib/api/types/order';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur'> {
  // Current NIP value (so we can decide if lookup button is enabled)
  currentValue: string;
  // Callback when CEIDG/KRS returns company data — parent should populate form fields
  onLookupSuccess: (data: CompanyLookupDataDto) => void;
  error?: string;
  // react-hook-form register output forwards onChange/onBlur as ChangeEvent handlers
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

export const NipLookupField = forwardRef<HTMLInputElement, Props>(function NipLookupField(
  { currentValue, onLookupSuccess, error, ...inputProps },
  ref,
) {
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const normalized = normalizeNip(currentValue ?? '');
  const canLookup = normalized.length === 10 && !lookupLoading;

  const handleLookup = async () => {
    setLookupError(null);
    setLookupLoading(true);
    try {
      const response = await lookupCompany(normalized);
      if (response.found && response.company) {
        onLookupSuccess(response.company);
      } else {
        setLookupError('Nie znaleziono organizacji w CEIDG/KRS. Wypełnij dane ręcznie.');
      }
    } catch (err) {
      const t = translateApiError(err);
      setLookupError(t.message);
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-px">
        <label className="block h-5 font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[13px] text-[#6b6965] uppercase tracking-[0.26px] leading-[1.1]">
          NIP <span className="ml-0.5 text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          <input
            ref={ref}
            type="text"
            placeholder="1234567890"
            className={`flex-1 px-[16px] py-[12px] bg-white border-[1.2px] rounded-[8px] h-[48px] font-['Plus_Jakarta_Sans',sans-serif] text-[14px] text-[#0D0D0D] placeholder:text-[#A2A09C] focus:outline-none focus:ring-2 focus:ring-[#FED64B] ${error ? 'border-red-400' : 'border-[#E4E2DF]'}`}
            {...inputProps}
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={!canLookup}
            className="px-[16px] py-[12px] bg-white border-[1.2px] border-[#E4E2DF] rounded-[8px] h-[48px] font-['Plus_Jakarta_Sans',sans-serif] text-[14px] font-medium text-[#6b6965] hover:bg-[#F8F7F4] hover:border-[#D4D2C9] transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lookupLoading ? 'Szukam…' : 'pobierz dane z GUS'}
          </button>
        </div>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      {lookupError && (
        <p className="text-xs text-orange-700" role="alert">
          {lookupError}
        </p>
      )}
    </div>
  );
});
