import { useEffect, useState } from 'react';

export type DiscountState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'applied'; code: string; originalPriceNet: number; discountedPriceNet: number }
  | { status: 'error'; message: string };

interface Props {
  state: DiscountState;
  onApply: (code: string) => Promise<void>;
  onRemove: () => void;
  /** When the order already has a partner discount attached (mutual exclusivity). */
  partnerActive?: { code: string } | null;
  /** Optional initial value (e.g. from ?discountCode= persisted in sessionStorage). */
  initialCode?: string | null;
  /** Trwa request usuwania rabatu (DELETE) — blokuje przycisk „Usuń" na czas operacji. */
  removing?: boolean;
}

function formatGrosze(grosze: number): string {
  return new Intl.NumberFormat('pl-PL', { useGrouping: true })
    .format(Math.round(grosze / 100))
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

export function DiscountCodeField({ state, onApply, onRemove, partnerActive, initialCode, removing }: Props) {
  const [input, setInput] = useState(initialCode ?? '');
  const isApplied = state.status === 'applied';
  const isValidating = state.status === 'validating';

  useEffect(() => {
    if (initialCode && input.length === 0 && !isApplied) {
      setInput(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  if (partnerActive) {
    return (
      <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-4 font-['Plus_Jakarta_Sans',sans-serif]" role="status">
        <p className="text-sm font-medium text-amber-900">
          Masz aktywną zniżkę partnerską <span className="font-mono font-semibold">{partnerActive.code}</span>.
        </p>
        <p className="mt-1 text-xs text-amber-900">
          Zniżki partnerskiej i kodu rabatowego nie można łączyć. Aby wpisać własny kod, najpierw przejdź na{' '}
          <a href="/cennik" className="underline">cennik bez kodu partnera</a>.
        </p>
      </div>
    );
  }

  const value = isApplied ? state.code : input;

  const handleApply = () => {
    if (input.trim().length === 0) return;
    void onApply(input.trim());
  };

  const handleRemove = () => {
    setInput('');
    onRemove();
  };

  return (
    <div className="rounded-[12px] bg-[#f8f7f4] p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <label className="block text-sm font-medium text-[#0D0D0D]">Kod zniżkowy (opcjonalnie)</label>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={value}
          disabled={isApplied || isValidating}
          onChange={e => setInput(e.currentTarget.value)}
          placeholder="Wpisz kod rabatowy"
          className="flex-1 rounded-[8px] border border-[#E4E2DF] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FED64B] disabled:opacity-60"
        />
        {isApplied ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-4 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {removing ? 'Usuwam…' : 'Usuń'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            disabled={isValidating || input.trim().length === 0}
            className="rounded-[80px] bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-[#413f3b] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Sprawdzam…' : 'Zastosuj'}
          </button>
        )}
      </div>
      {state.status === 'applied' && (
        <p className="mt-2 text-xs text-green-700" role="status">
          Rabat zaaplikowany. Zaoszczędzisz {formatGrosze(state.originalPriceNet - state.discountedPriceNet)} zł.
        </p>
      )}
      {state.status === 'error' && (
        <p className="mt-2 text-xs text-red-500" role="alert">{state.message}</p>
      )}
    </div>
  );
}
