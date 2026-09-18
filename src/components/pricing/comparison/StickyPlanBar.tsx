import type { CSSProperties } from 'react';
import type { ComparisonPlanProps } from '../../../lib/catalog/render-policy';

interface Props {
  plans: ComparisonPlanProps[];
  /** Indeks pakietu widocznego na telefonie - reszta kolumn jest `display:none`. */
  mobileIndex: number;
  onMobileIndexChange: (i: number) => void;
  onSelectPlan: (code: string) => void;
  /** `code` pakietu, dla ktorego trwa `startOrder` - jego CTA pokazuje "Ladowanie...". */
  loadingPlanCode: string | null;
}

// Ta sama para stylow CTA co w `PricingCard.tsx` (duza karta), tylko w skali mini-karty -
// mockup: `.mini .cta { padding: 9px 12px; font-size: 13px; }` (v6.js:317), reszta stylu
// przycisku (`.cta--outline` / `.cta--zolty`, v6.js:178-180) 1:1 z duza karta.
const CTA_STYLE: Record<string, string> = {
  outline: 'border border-brand-rule-strong bg-white text-[#0D0D0D] hover:bg-brand-bg',
  yellow: 'border border-transparent bg-brand-yellow text-[#0D0D0D] hover:bg-brand-yellow-hover',
  primary: 'border border-transparent bg-[#7C3AED] text-white hover:bg-[#6D28D9]',
  black: 'border border-brand-rule-strong bg-white text-[#0D0D0D] hover:bg-brand-bg',
};

/**
 * Przyklejony pasek mini-kart nad siatka porownania - port `pasek`/`miniKarta` z
 * `docs/pricelist32-main/wersje/v6.js:301-322` (CSS) i `:630-639` (markup).
 *
 * Kazda mini-karta niesie: nazwe, cene (tak jak duza karta - `ComparisonPlanProps.price`
 * przychodzi juz sformatowana z `derivePricing`, wiec renderuje sie jako zwykly tekst, NIE
 * przez `<AnimatedPrice>`: ten komponent liczy na surowy `number`, a tu do dyspozycji jest
 * tylko gotowy string typu "1 234,50 zl" - parsowanie go z powrotem na liczbe ryzykowaloby
 * utrata grosza przy zaokraglaniu w trakcie animacji, a big-karta dzis rowniez nie animuje
 * ceny, wiec plain-text jest zgodny z "cena tak samo jak duza karta" z komentarza przy
 * `ComparisonPlanProps.price` w `render-policy.ts`), i CTA.
 *
 * `variant` NIE jest tu liczony drugi raz - dwa stany z `buildComparisonGrid` mapuja sie na
 * "slot" pod cena: `unavailable` -> tekst `unavailableReason`, `available`/`current` -> przycisk
 * CTA (disabled dla `current`, bo to juz posiadany plan - klik nie powinien nic robic; szare
 * tlo idzie z `isInactive` na calej mini-karcie, nie z osobnego stylu przycisku).
 * `currentPlanBadge` (fix code review #2) renderuje sie WYZEJ, nad tym slotem, niezaleznie od
 * `variant` - dawniej byl czytany tylko w galezi `current`, wiec `available` + `currentPlanBadge`
 * (reaktywacja po GRACE/EXPIRED/CANCELLED - patrz `deriveVariant`) gubil plakietke calkowicie.
 * Duza karta (`PricingCard.tsx`) ma na plakietke miejsce w plywajacym rogu; tu na waskim pasku
 * miejsca na rog nie ma, wiec plakietka stoi w normalnym flow, tuz nad rzedem CTA - dzieki temu
 * mini-karta juz NIE rozjezdza sie z duza karta tak, jak rozjezdzala sie przed tym fixem.
 *
 * Strzalki < / > sa czescia KAZDEJ mini-karty (jak w mockupie - `miniKarta` renderuje je
 * bezwarunkowo w kazdej instancji), ale widoczne tylko na telefonie (`max-[767px]:inline-flex`,
 * mockup: `.strzalka{display:none} @media(max-width:767px){.strzalka{display:inline-flex}}`)
 * - i tylko jedna mini-karta jest w ogole widoczna na telefonie na raz, wiec efektywnie widac
 * jedna pare. Licza sasiada WZGLEDEM globalnego `mobileIndex`, nie wzgledem wlasnej kolumny -
 * dokladnie jak `sasiad(kierunek)` w v6.js:477, ktore rowniez liczy od globalnego `iWybrany`.
 */
export function StickyPlanBar({ plans, mobileIndex, onMobileIndexChange, onSelectPlan, loadingPlanCode }: Props) {
  const planCount = plans.length;
  const prevIndex = (mobileIndex - 1 + planCount) % planCount;
  const nextIndex = (mobileIndex + 1) % planCount;

  return (
    <div className="cc-sticky-bar border-b border-brand-rule bg-white">
      <div
        className="grid grid-cols-[repeat(var(--cc-plan-count),minmax(0,1fr))] max-[767px]:grid-cols-1"
        style={{ '--cc-plan-count': planCount } as CSSProperties}
      >
        {plans.map((plan, i) => {
          const isInactive = plan.variant === 'current' || plan.variant === 'unavailable';
          const isLoading = loadingPlanCode === plan.code;

          return (
            <div
              key={plan.code}
              className={
                'flex flex-col gap-2 border-l border-[#F1F0ED] px-[18px] py-5 first:border-l-0 max-[767px]:border-l-0' +
                (i === mobileIndex ? '' : ' max-[767px]:hidden') +
                (isInactive ? ' opacity-60 grayscale' : '')
              }
              style={
                plan.recommended
                  ? { background: 'linear-gradient(180deg, rgb(255,255,241) 0%, rgb(255,255,255) 100%)' }
                  : undefined
              }
            >
              <h3 className="m-0 text-[16px] font-bold tracking-[-0.02em] text-[#0D0D0D]">{plan.title}</h3>

              {plan.promoHeader ? (
                <div className="flex flex-col">
                  <span className="text-[12px] font-normal text-[#6B6965] line-through">{plan.promoHeader}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[20px] font-semibold text-[#0D0D0D]">{plan.price}</span>
                    <span className="text-[12px] font-normal text-[#6B6965]">{plan.promoSubtext}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  {plan.hasDiscount && plan.originalPrice && (
                    <span className="text-[12px] font-normal text-[#6B6965] line-through">{plan.originalPrice}</span>
                  )}
                  <span className="text-[20px] font-semibold text-[#0D0D0D]">{plan.price}</span>
                  <span className="text-[12px] font-normal text-[#6B6965]">miesięcznie, netto</span>
                </div>
              )}

              {/* Plakietka auth-aware - RENDEROWANA ZAWSZE (nie tylko gdy `currentPlanBadge`
                  jest ustawione), przed rozgałęzieniem po `variant` niżej (patrz komentarz
                  funkcji powyżej). Mini-karty są kolumnami JEDNEJ siatki - gdyby ten element
                  istniał w DOM tylko dla karty z plakietką, jej wysokość podbijałaby
                  zawartość tylko TEJ kolumny i rząd CTA pod nią przestawałby stać w jednej
                  linii z sąsiadami. Duża karta (`PricingCard.tsx`) tego problemu nie ma - tam
                  plakietka jest `position: absolute`, więc nie zajmuje miejsca w normalnym
                  przepływie; tu, na wąskim pasku, stoi w normalnym flow, więc musi
                  zarezerwować SLOT tym samym wzorcem co pigułka "taniej o" w
                  `CardBillingToggle` i puste podlinie w `PricingCard.tsx`: `invisible`
                  (nigdy `display: none`) + placeholder ("&nbsp;"), żeby wysokość linii
                  została zachowana nawet bez tekstu. `aria-hidden="true"` idzie TYLKO na
                  wariant-placeholder, żeby czytnik ekranu nie usłyszał pustej plakietki, ale
                  usłyszał prawdziwą. */}
              {plan.currentPlanBadge ? (
                <span className="self-start rounded-full bg-brand-yellow px-2.5 py-1 text-[11px] font-semibold text-[#0D0D0D]">
                  {plan.currentPlanBadge}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="invisible self-start rounded-full bg-brand-yellow px-2.5 py-1 text-[11px] font-semibold text-[#0D0D0D]"
                >
                  &nbsp;
                </span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Poprzedni pakiet"
                  onClick={() => onMobileIndexChange(prevIndex)}
                  className="hidden h-10 w-10 flex-none items-center justify-center rounded-full border border-brand-rule-strong bg-white text-[18px] leading-none text-[#0D0D0D] hover:bg-brand-bg max-[767px]:inline-flex"
                >
                  &#8249;
                </button>

                {plan.variant === 'unavailable' ? (
                  <p className="m-0 flex-1 px-3 py-[9px] text-center text-[12.5px] leading-[17px] text-[#6B6965]">
                    {plan.unavailableReason ?? 'Niedostępne'}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={isLoading || isInactive}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlan(plan.code);
                    }}
                    className={
                      'flex-1 rounded-full px-3 py-[9px] text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
                      (CTA_STYLE[plan.ctaStyle ?? 'outline'] ?? CTA_STYLE.outline)
                    }
                  >
                    {isLoading ? 'Ładowanie...' : plan.ctaText}
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Następny pakiet"
                  onClick={() => onMobileIndexChange(nextIndex)}
                  className="hidden h-10 w-10 flex-none items-center justify-center rounded-full border border-brand-rule-strong bg-white text-[18px] leading-none text-[#0D0D0D] hover:bg-brand-bg max-[767px]:inline-flex"
                >
                  &#8250;
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
