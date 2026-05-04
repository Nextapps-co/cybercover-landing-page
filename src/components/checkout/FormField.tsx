import { forwardRef, useId } from 'react';
import type { ChangeEventHandler, FocusEventHandler, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export interface FormFieldOption {
  value: string;
  label: string;
}

interface BaseProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  options?: FormFieldOption[];
}

// We want to accept the spread output of react-hook-form's `register(...)` —
// which includes `ref`, `name`, `onChange`, `onBlur`. So extend native input/select props.
type InputProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur'> & {
    onChange?: ChangeEventHandler<HTMLInputElement>;
    onBlur?: FocusEventHandler<HTMLInputElement>;
  };

type SelectProps = BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'onBlur'> & {
    onChange?: ChangeEventHandler<HTMLSelectElement>;
    onBlur?: FocusEventHandler<HTMLSelectElement>;
    options: FormFieldOption[];
  };

const LABEL_CLS =
  "block font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[13px] text-[#6b6965] uppercase tracking-[0.26px] leading-[1.1] mb-2";
const INPUT_BASE_CLS =
  "w-full px-[16px] py-[12px] bg-white border-[1.2px] rounded-[8px] h-[48px] font-['Plus_Jakarta_Sans',sans-serif] text-[14px] text-[#0D0D0D] placeholder:text-[#A2A09C] focus:outline-none focus:ring-2 focus:ring-[#FED64B] disabled:bg-[#F8F7F4] disabled:cursor-not-allowed";

export const FormField = forwardRef<HTMLInputElement | HTMLSelectElement, InputProps | SelectProps>(
  function FormField(props, ref) {
    const fallbackId = useId();
    const id = props.id ?? fallbackId;
    const hasError = Boolean(props.error);
    const stateClass = hasError ? 'border-red-400' : 'border-[#E4E2DF]';

    if ('options' in props && props.options) {
      const { label, error, helperText, required, options, className, options: _optsRetained, ...selectProps } = props as SelectProps;
      void _optsRetained;
      return (
        <div className={className ?? 'mb-0'}>
          <label htmlFor={id} className={LABEL_CLS}>
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <select
            ref={ref as React.Ref<HTMLSelectElement>}
            id={id}
            className={`${INPUT_BASE_CLS} ${stateClass}`}
            {...selectProps}
          >
            <option value="" disabled>
              {props.placeholder ?? 'Wybierz...'}
            </option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {hasError && <p className="text-red-500 text-xs mt-1">{error}</p>}
          {!hasError && helperText && <p className="text-[#6b6965] text-xs mt-1">{helperText}</p>}
        </div>
      );
    }

    const { label, error, helperText, required, type = 'text', className, ...inputProps } = props as InputProps;

    return (
      <div className={className ?? 'mb-0'}>
        <label htmlFor={id} className={LABEL_CLS}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          id={id}
          type={type}
          className={`${INPUT_BASE_CLS} ${stateClass}`}
          {...inputProps}
        />
        {hasError && <p className="text-red-500 text-xs mt-1">{error}</p>}
        {!hasError && helperText && <p className="text-[#6b6965] text-xs mt-1">{helperText}</p>}
      </div>
    );
  },
);
