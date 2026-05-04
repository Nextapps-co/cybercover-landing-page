import { forwardRef } from 'react';
import type { ChangeEvent, FocusEventHandler } from 'react';

interface Props {
  value: string;
  onChange: (digits: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  error?: string;
  required?: boolean;
}

export const PhoneField = forwardRef<HTMLInputElement, Props>(function PhoneField(
  { value, onChange, onBlur, error, required },
  ref,
) {
  const hasError = Boolean(error);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, 9);
    onChange(digits);
  };

  return (
    <div>
      <label className="block font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[13px] text-[#6b6965] uppercase tracking-[0.26px] leading-[1.1] mb-2">
        Numer telefonu
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="flex">
        <span
          aria-hidden="true"
          className={`inline-flex items-center rounded-l-[8px] border-[1.2px] border-r-0 bg-[#F8F7F4] px-3 h-[48px] font-['Plus_Jakarta_Sans',sans-serif] text-sm font-semibold text-[#0D0D0D] ${hasError ? 'border-red-400' : 'border-[#E4E2DF]'}`}
        >
          +48
        </span>
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder="123456789"
          className={`flex-1 px-[16px] py-[12px] bg-white border-[1.2px] rounded-r-[8px] h-[48px] font-['Plus_Jakarta_Sans',sans-serif] text-[14px] text-[#0D0D0D] placeholder:text-[#A2A09C] focus:outline-none focus:ring-2 focus:ring-[#FED64B] ${hasError ? 'border-red-400' : 'border-[#E4E2DF]'}`}
        />
      </div>
      {hasError && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
