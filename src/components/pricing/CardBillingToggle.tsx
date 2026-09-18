import type { BillingCycle } from '../../lib/api/types/money';

interface Props {
  billingCycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
  /** Wprost `savingsBadge` z `derivePricing`. Brak → pigułka niewidoczna, ale ZAJMUJE MIEJSCE. */
  savingsLabel?: string;
  /**
   * Cykl rozliczeniowy zablokowany dla aktualnego klienta (auth-aware). Przykład: klient
   * na rocznym abonamencie nie może zejść na miesięczny w ramach wizarda — `PricingCards`
   * przekazuje 'MONTHLY' i przełącznik przestaje być klikalny.
   */
  disabledCycle?: BillingCycle;
  /**
   * Powód blokady. Trafia do `title` i do nazwy dostępnej przycisku; widoczne zdanie
   * renderuje `PricingCards` RAZ pod blokiem kart (przełączników jest tyle, ile kart).
   */
  disabledReason?: string;
}

/**
 * Przełącznik cyklu rozliczeniowego wewnątrz karty planu — port `przelacznikWKarcie`
 * z `docs/pricelist32-main/wersje/v6.js:536-548`. To jeden przycisk (nie dwa osobne
 * dla „miesięczna"/"roczna"): kliknięcie zawsze ustawia cykl PRZECIWNY do obecnego.
 *
 * Dlatego blokada liczy się z CELU kliknięcia, nie ze stanu: przy `disabledCycle`
 * = 'MONTHLY' przycisk jest martwy tylko wtedy, gdy stoi na rocznym (czyli kliknięcie
 * zeszłoby na miesięczny) — w drugą stronę, z miesięcznego na roczny, wolno.
 *
 * Pigułka „taniej o…" zostaje w layoucie nawet bez `savingsLabel` — dostaje
 * `visibility: hidden` (Tailwind `invisible`), nigdy `display: none`, inaczej
 * kwota roczna pod spodem przesuwa się w górę i karty rozjeżdżają się w pionie.
 */
export function CardBillingToggle({ billingCycle, onChange, savingsLabel, disabledCycle, disabledReason }: Props) {
  const roczna = billingCycle === 'ANNUAL';
  const target: BillingCycle = roczna ? 'MONTHLY' : 'ANNUAL';
  const blocked = disabledCycle !== undefined && target === disabledCycle;

  // `aria-label` ZASTĘPUJE treść potomków w drzewie dostępności, więc wszystko, co
  // widać na przycisku, musi się w nim znaleźć — bez tego widoczna pigułka
  // „taniej o 424 zł" nie istniała dla czytnika ekranu. Powód blokady dokładamy tą
  // samą drogą: przy obecnym `aria-label` czytnik i tak nie sięgnie po `title`.
  const ariaLabel = [
    'Przełącz rodzaj płatności',
    savingsLabel ? `płatność roczna taniej o ${savingsLabel}` : null,
    blocked ? disabledReason : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');

  return (
    <button
      type="button"
      onClick={() => {
        if (blocked) return;
        onChange(target);
      }}
      disabled={blocked}
      aria-pressed={roczna}
      aria-disabled={blocked}
      title={blocked ? disabledReason : undefined}
      aria-label={ariaLabel}
      className={`mb-1 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left font-['Plus_Jakarta_Sans',sans-serif] text-[13px] text-brand-text ${
        blocked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[30px] flex-none items-center rounded-full p-[2px] transition-colors duration-150 ${
          roczna ? 'bg-[#16653C]' : 'bg-[#D6D4CF]'
        }`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-full bg-white transition-transform duration-150 ${
            roczna ? 'translate-x-3' : 'translate-x-0'
          }`}
        />
      </span>
      <span>Płatność roczna</span>
      <span
        className={`inline-block whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11.5px] font-semibold tracking-[-0.12px] ${
          savingsLabel ? 'border border-brand-rule text-[#413f3b]' : 'invisible'
        }`}
      >
        taniej o {savingsLabel || '0 zł'}
      </span>
    </button>
  );
}
