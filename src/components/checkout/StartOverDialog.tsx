interface StartOverDialogProps {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function StartOverDialog({ open, busy = false, onConfirm, onCancel }: StartOverDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-over-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <h2 id="start-over-title" className="text-xl font-semibold text-[#0D0D0D]">
          Zacząć od nowa?
        </h2>
        <p className="mt-3 text-base text-[#6B6965]">
          Twoje zamówienie zostanie anulowane, a wprowadzone dane usunięte. Zaczniesz od wyboru planu.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-7 py-3 text-base font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[80px] bg-[#0D0D0D] px-7 py-3 text-base font-semibold text-white hover:bg-[#262626] disabled:opacity-60"
          >
            {busy ? 'Anulowanie…' : 'Tak, zacznij od nowa'}
          </button>
        </div>
      </div>
    </div>
  );
}
