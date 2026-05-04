interface Props {
  onBack?: () => void;
  backLabel?: string;
  submitLabel?: string;
  submitting?: boolean;
  submittingLabel?: string;
  submitDisabled?: boolean;
}

export function FormActions({
  onBack,
  backLabel = 'Cofnij',
  submitLabel = 'Dalej',
  submitting = false,
  submittingLabel = 'Zapisywanie…',
  submitDisabled = false,
}: Props) {
  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[15px] text-[#0D0D0D] hover:bg-[#F8F7F4] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M7.5 1.5L3 6l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </button>
      )}
      <button
        type="submit"
        disabled={submitDisabled || submitting}
        className="inline-flex items-center gap-2 rounded-[80px] bg-[#FED64B] hover:bg-[#FFC107] px-7 py-3 font-['Plus_Jakarta_Sans',sans-serif] font-medium text-[15px] text-[#0D0D0D] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
        {!submitting && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4.5 1.5L9 6l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
