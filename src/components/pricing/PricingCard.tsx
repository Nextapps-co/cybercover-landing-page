import type { SectionIconName } from '../../lib/catalog/comparison-content';
import type { BillingCycle } from '../../lib/api/types/money';
import { AnimatedPrice } from './AnimatedPrice';
import { CardBillingToggle } from './CardBillingToggle';
import { Tooltip } from './Tooltip';

// Task 4 (cennik v6): karta jest teraz projekcją z `COMPARISON` (patrz
// `lib/catalog/render-policy.ts#buildCardSections`), nie z lokalnej listy itemów.
// Zajawka = nagłówek sekcji + czy pakiet ją ma (`included`) + skrócone podlinie
// wyliczone tylko z wierszy, które mają `cardSummary`.
export interface CardSectionProps {
  title: string;
  icon: SectionIconName;
  subtitle?: string; // treść dymka na karcie
  badge?: string; // 'Wkrótce'
  included: boolean; // ptaszek vs kreska + wyszarzenie
  subLines: string[]; // podlinie z **pogrubieniem**; '' = pusta linia wyrównująca
}

// Per spec §5.4.3 — variant decyduje czy karta jest aktywna, greyed-out, czy całkiem niedostępna.
export type PricingCardVariant = 'available' | 'current' | 'unavailable';

export interface PricingCardProps {
  title: string;
  price: string;
  /**
   * Ta sama kwota co `price`, ale w groszach — prosto z `derivePricing`. Karta podaje ją
   * `AnimatedPrice`, który animuje liczbę: odzyskiwanie jej z gotowego tekstu gubiło
   * końcówkę (336,30 zł → 336), więc wartość idzie z projekcji, nie z parsera.
   */
  priceMinorUnits: number;
  yearlyPrice?: string;
  description?: string;
  ctaText?: string;
  ctaStyle?: 'outline' | 'black' | 'primary' | 'yellow';
  features: CardSectionProps[];
  highlighted?: boolean;
  originalPrice?: string;
  originalYearlyPrice?: string;
  hasDiscount?: boolean;
  promoHeader?: string;
  promoSubtext?: string;
  savingsBadge?: string;
  onSelect?: () => void;
  ctaDisabled?: boolean;
  // Auth-aware (optional — anonymous flow nie ustawia):
  /** Default 'available'. 'current' = klient ma ten plan (greyed gdy ACTIVE, klikalne gdy ex). 'unavailable' = plan niższy niż aktualny. */
  variant?: PricingCardVariant;
  /** Badge w prawym górnym rogu — "Twój aktualny plan" (ACTIVE) lub "Poprzedni plan" (po reactivation). */
  currentPlanBadge?: string;
  /** Tekst zamiast CTA gdy variant='unavailable' (np. "Niedostępne — niższy niż aktualny plan"). */
  unavailableReason?: string;
  /**
   * Cykl aktywny dla całej grupy kart — steruje wewnątrz-kartowym `CardBillingToggle`.
   * Opcjonalne: `planToCardProps` (render-policy.ts) tego pola nie ustawia (to czysta
   * projekcja danych, bez UI-callbacków), więc musi zostać strukturalnie zgodne z tym
   * typem bez niego. Gdy caller (`PricingCards`) go nie przekaże, karta zakłada 'ANNUAL'.
   */
  billingCycle?: BillingCycle;
  /** Callback zmiany cyklu — wspólny dla całej grupy kart, ustawiany przez `PricingCards`. */
  onBillingCycleChange?: (cycle: BillingCycle) => void;
  /**
   * Cykl, na który klient nie może przejść (auth-aware). Karta tego NIE wylicza — to wiedza
   * o subskrypcji, którą ma tylko `PricingCards`; karta jedynie przepuszcza ją do przełącznika.
   */
  disabledCycle?: BillingCycle;
  /** Powód blokady cyklu — do `title`/nazwy dostępnej przełącznika. */
  disabledReason?: string;
}

function capitalizeFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Treść dymka na słowie „incydent" w opisie planu — port `DYMEK_INCYDENT` z
// `docs/pricelist32-main/wersje/v6.js:485-494`. To generyczna wiedza o tym, jak wygląda
// incydent — nie opisuje konkretnego planu — więc zostaje hardkodowana jak reszta
// stałego UI copy w tym pliku, a nie ciągnięta z propsów.
const INCIDENT_TOOLTIP_LINES = [
  'ktoś zaszyfrował Wasze pliki i żąda okupu',
  'ktoś przejął skrzynkę e-mail albo konto w banku',
  'wyciekły dane klientów',
  'strona przestała działać po ataku',
  'ktoś podszywa się pod Waszą organizację',
];

// Port `PTASZEK` / `KRESKA` z `docs/pricelist32-main/wspolne.js:58-64`. `stroke="currentColor"`
// — kolor (zielony przy `included`, wyszarzony przy braku) idzie z opakowującego `<span>`.
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14.2222 14.2222" fill="none">
      <path
        d="M11.8543 3.55556L5.33281 10.0771L2.36719 7.11111"
        stroke="currentColor"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7H11" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" />
    </svg>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <span key={i} className="font-bold text-[#0D0D0D]">
              {part.slice(2, -2)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// Opis planu z dymkiem na pierwszym słowie zaczynającym się na „incydent" — port `zDymkiem`
// z v6.js:493-494. `relative` na `<p>` jest wymagany: `.cc-tooltip` ma `position: static`
// (patrz `src/styles/cennik.css`), więc bez najbliższego pozycjonowanego przodka chmurka
// spozycjonowałaby się względem dalekiego ancestora i wyjechała poza kartę.
function PlanDescription({ text }: { text: string }) {
  const match = text.match(/incydent\w*/i);
  if (!match || match.index === undefined) {
    return <p className="relative mb-[18px] min-[1100px]:min-h-[96px] text-[14px] leading-[20px] text-[#6B6965]">{text}</p>;
  }
  const start = match.index;
  const end = start + match[0].length;
  return (
    <p className="relative mb-[18px] min-[1100px]:min-h-[96px] text-[14px] leading-[20px] text-[#6B6965]">
      {text.slice(0, start)}
      <Tooltip
        title="Incydent poznasz po tym, że:"
        lines={INCIDENT_TOOLTIP_LINES}
        className="cc-tooltip--word"
      >
        {match[0]}
      </Tooltip>
      {text.slice(end)}
    </p>
  );
}

// Jedna sekcja „W pakiecie:" — nagłówek (ptaszek/kreska + tytuł + plakietka) z dymkiem
// (`subtitle` gdy included, „Niedostępne w tym pakiecie" gdy nie) + podlinie różnicujące.
// Port `sekcjaKarty` z v6.js:592-610. Cały nagłówek (ikona + tekst) jest wewnątrz jednego
// `<Tooltip>`, tak jak `.pozycja:hover` w mockupie wyzwala dymek z całego wiersza, nie
// tylko z tekstu. Wszystko przy Tooltipie jest `<span>`, nigdy `<div>/<p>` (patrz komentarz
// w `Tooltip.tsx` i `ComparisonCell.tsx` — blokowy element w środku łamie inline-strukturę).
function FeatureSectionRow({ section }: { section: CardSectionProps }) {
  const { title, subtitle, badge, included, subLines } = section;

  const row = (
    <>
      <span
        aria-hidden="true"
        className={`mt-[3px] flex h-[14px] w-[14px] flex-none items-center justify-center ${
          included ? 'text-[#16653C]' : 'text-[#C9C7C1]'
        }`}
      >
        {included ? <CheckIcon /> : <DashIcon />}
      </span>
      <span
        className={`block text-[13.5px] leading-[19px] ${
          included ? 'font-semibold text-[#0D0D0D]' : 'font-normal text-[#B9B7B1]'
        }`}
      >
        {title}
        {badge && (
          <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-[#EFDFA6] bg-brand-tag-yellow px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7A5B00]">
            {badge}
          </span>
        )}
      </span>
    </>
  );

  // `relative` NIE może stać na tym samym elemencie co `.cc-tooltip`: `cennik.css` jest
  // importowane bez `layer()`, więc jego bezwarstwowe `position: static` bije utility
  // `relative` z `@layer utilities` doklejone do TEGO SAMEGO elementu. Chmurka szukałaby
  // wtedy najbliższego pozycjonowanego przodka i trafiała na `.cc-card`, czyli całą kartę —
  // wyskakiwałaby przy jej dolnej krawędzi (na CTA / poza kartą), nie przy swoim wierszu.
  // Dlatego `relative` siedzi na OSOBNYM elemencie okalającym — dokładnie tak, jak w
  // `PlanDescription` wyżej, gdzie ten sam układ działa poprawnie.
  // `cursor-not-allowed` alone would not be enough: `.cc-tooltip`'s own `cursor: help`
  // (`cennik.css`, unlayered) always wins over a Tailwind utility on the same element.
  // `cc-tooltip--blocked` is the unlayered modifier that actually overrides it (see
  // `cennik.css`) — only added for the `!included` ("brak") state, never for `cursor-help`.
  const rowClassName = `grid grid-cols-[14px_1fr] items-start gap-2 ${
    included ? 'cursor-help' : 'cursor-not-allowed cc-tooltip--blocked'
  }`;

  return (
    <div>
      <div className="relative">
        {!included ? (
          <Tooltip text="Niedostępne w tym pakiecie" className={rowClassName}>
            {row}
          </Tooltip>
        ) : subtitle ? (
          <Tooltip text={capitalizeFirst(subtitle)} className={rowClassName}>
            {row}
          </Tooltip>
        ) : (
          <div className={rowClassName}>{row}</div>
        )}
      </div>
      {subLines.map((line, i) =>
        line === '' ? (
          <p key={i} aria-hidden="true" className="invisible ml-[22px] mt-[3px] truncate text-[13px] leading-[18px]">
            &nbsp;
          </p>
        ) : (
          <p key={i} className="ml-[22px] mt-[3px] truncate text-[13px] leading-[18px] text-[#6B6965]">
            <RichText text={line} />
          </p>
        ),
      )}
    </div>
  );
}

export function PricingCard({
  title,
  priceMinorUnits,
  yearlyPrice,
  description,
  ctaText,
  ctaStyle = 'black',
  features,
  highlighted = false,
  originalPrice,
  originalYearlyPrice,
  hasDiscount,
  promoHeader,
  promoSubtext,
  savingsBadge,
  onSelect,
  ctaDisabled = false,
  variant = 'available',
  currentPlanBadge,
  unavailableReason,
  billingCycle,
  onBillingCycleChange,
  disabledCycle,
  disabledReason,
}: PricingCardProps) {
  const isUnavailable = variant === 'unavailable';
  const isCurrentLocked = variant === 'current';
  const isInactive = isUnavailable || isCurrentLocked;
  const ctaEffectivelyDisabled = ctaDisabled || isInactive;
  const cycle = billingCycle ?? 'ANNUAL';
  // §8.2: promoHeader/promoSubtext (np. „0 zł przez 3 mies.") i pigułka „taniej o" mówią
  // o dwóch różnych rzeczach (promo waży vs. rocznie/miesięcznie) — nie mogą stać naraz.
  const isPromo = Boolean(promoHeader && promoSubtext);

  return (
    <div
      aria-disabled={isInactive}
      className={[
        'cc-card relative flex flex-col bg-white',
        'border-l-0 border-t-0 border-brand-rule',
        'px-[22px] pt-[26px] pb-[28px]',
        'min-[1100px]:px-[26px] min-[1100px]:pt-[30px] min-[1100px]:pb-[32px]',
        '[&:not(:first-child)]:border-t',
        'min-[640px]:[&:nth-child(2)]:border-l min-[640px]:[&:nth-child(2)]:border-t-0',
        'min-[640px]:[&:nth-child(4)]:border-l',
        'min-[1100px]:[&:nth-child(3)]:border-l min-[1100px]:[&:nth-child(3)]:border-t-0',
        'min-[1100px]:[&:nth-child(4)]:border-t-0',
        isInactive ? 'opacity-60 grayscale' : '',
      ].join(' ')}
      style={
        highlighted
          ? { backgroundImage: 'linear-gradient(180deg, var(--color-brand-tag-yellow) 0%, #FFFFFF 46%)' }
          : undefined
      }
    >
      {/* Auth-aware badge (Twój aktualny plan / Poprzedni plan) */}
      {currentPlanBadge && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-brand-yellow px-3 py-1 text-[11px] font-semibold text-[#0D0D0D] shadow-sm">
          {currentPlanBadge}
        </div>
      )}

      {/* Nazwa planu */}
      <h3 className="mb-[10px] text-[21px] font-bold tracking-[-0.02em] text-[#0D0D0D]">{title}</h3>

      {/* Cena miesięczna */}
      <div className="mb-[12px] flex items-center">
        {isPromo ? (
          <div>
            <p className="text-[14px] text-[#6B6965] line-through">{promoHeader}</p>
            <div className="flex flex-wrap items-baseline gap-[5px]">
              <p className="text-[38px] font-bold leading-none tracking-[-0.04em] text-[#0D0D0D]">
                <AnimatedPrice minorUnits={priceMinorUnits} />
              </p>
              <span className="text-[17px] font-semibold text-[#0D0D0D]">zł</span>
              <span className="text-[14px] text-[#6B6965]">{promoSubtext}</span>
            </div>
          </div>
        ) : hasDiscount && originalPrice ? (
          <div>
            <p className="text-[14px] text-[#6B6965] line-through">{originalPrice}</p>
            <div className="flex items-baseline gap-[5px]">
              <p className="text-[38px] font-bold leading-none tracking-[-0.04em] text-[#0D0D0D]">
                <AnimatedPrice minorUnits={priceMinorUnits} />
              </p>
              <span className="text-[17px] font-semibold text-[#0D0D0D]">zł</span>
              <span className="text-[14px] text-[#6B6965]">miesięcznie, netto</span>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline gap-[5px]">
            <p className="text-[38px] font-bold leading-none tracking-[-0.04em] text-[#0D0D0D]">
              <AnimatedPrice minorUnits={priceMinorUnits} />
            </p>
            <span className="text-[17px] font-semibold text-[#0D0D0D]">zł</span>
            <span className="text-[14px] text-[#6B6965]">miesięcznie, netto</span>
          </div>
        )}
      </div>

      {/* Przełącznik cyklu (pigułka „taniej o" ukryta w trakcie promo — patrz §8.2) */}
      <CardBillingToggle
        billingCycle={cycle}
        onChange={onBillingCycleChange ?? (() => {})}
        savingsLabel={isPromo ? undefined : savingsBadge}
        disabledCycle={disabledCycle}
        disabledReason={disabledReason}
      />

      {/* Kwota roczna */}
      <p className="mb-[14px] text-[12px] text-[#6B6965]">
        {yearlyPrice ? (
          hasDiscount && originalYearlyPrice ? (
            <>
              <span className="line-through">{originalYearlyPrice}</span> {yearlyPrice}
            </>
          ) : (
            yearlyPrice
          )
        ) : (
          <>&nbsp;</>
        )}
      </p>

      {/* Opis */}
      {description && <PlanDescription text={description} />}

      {/* CTA (lub plakietka/komunikat auth-aware) */}
      {isUnavailable ? (
        <p className="w-full px-[14px] py-[12px] text-center text-[14px] text-[#6B6965]">
          {unavailableReason ?? 'Niedostępne'}
        </p>
      ) : (
        ctaText && (
          <button
            type="button"
            disabled={ctaEffectivelyDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            className={`flex w-full cursor-pointer items-center justify-center rounded-[80px] px-[14px] py-[12px] text-[14.5px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
              ctaStyle === 'yellow'
                ? 'border border-transparent bg-brand-yellow text-[#0D0D0D] shadow-sm hover:bg-brand-yellow-hover'
                : ctaStyle === 'primary'
                  ? 'border border-transparent bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                  : 'border border-brand-rule-strong bg-white text-[#0D0D0D] shadow-sm hover:bg-brand-bg'
            }`}
          >
            {ctaText}
          </button>
        )
      )}

      {/* Zakres pakietu */}
      <div className="mt-7 border-t border-brand-rule pt-[22px]">
        <p className="mb-[14px] text-[13px] font-bold text-[#0D0D0D]">W pakiecie:</p>
        <div className="flex flex-col gap-3">
          {features.map((section) => (
            <FeatureSectionRow key={section.title} section={section} />
          ))}
        </div>
        <a
          href="#porownaj"
          className="group mt-5 inline-block border-b border-brand-rule-strong pb-[2px] text-[13px] font-semibold text-[#0D0D0D] no-underline hover:border-[#0D0D0D]"
        >
          Zobacz pełne porównanie{' '}
          <span className="inline-block transition-transform duration-150 group-hover:translate-y-[3px]">↓</span>
        </a>
      </div>
    </div>
  );
}
