import type { CSSProperties } from 'react';
import { StickyPlanBar } from './StickyPlanBar';
import { ComparisonSection } from './ComparisonSection';
import type { ComparisonGridProps } from '../../../lib/catalog/render-policy';

interface Props {
  grid: ComparisonGridProps;
  mobileIndex: number;
  onMobileIndexChange: (i: number) => void;
  onSelectPlan: (code: string) => void;
  loadingPlanCode: string | null;
}

/**
 * Sekcja "Porownaj pakiety" - zlozenie calej siatki porownania. Port struktury z
 * `docs/pricelist32-main/wersje/v6.js:713-723` (`<section class="porownanie" id="porownaj">`)
 * plus sekcja "Dlaczego ten pakiet?" (`sekcjaPowodow`, v6.js:682-689).
 *
 * `id="porownaj"` na zewnetrznej `<section>` jest kotwica linku "Zobacz pelne porownanie"
 * z duzej karty (`docs/pricelist32-main/wersje/v6.js:622`) - nie zmieniac bez aktualizacji
 * tamtego linku. `class="cc-grid"` idzie na WEWNETRZNY `<div>` (nie na `<section>`), zgodnie
 * z mockupem: `h2` i zamykajacy `<p>` animuja/wygladaja sie inaczej niz sam blok siatki - patrz
 * dwie ODREBNE reguly `#porownaj:target h2` / `#porownaj:target .cc-grid` w `cennik.css`.
 *
 * `.cc-grid` dostaje zaokrojenie + `overflow-clip` 1:1 z mockupowej `.siatka` (v6.js:291-296:
 * `border-radius: var(--promien-karty); overflow: clip;`) - to bezpieczne tu inaczej niz na
 * `.cc-cards` (patrz komentarz w `cennik.css` przy `.cc-cards`, ktore NIE maja overflow:hidden
 * wlasnie z powodu dymkow): jedyne dymki w tej siatce to te z `.cc-cell--absent`, ktore
 * OTWIERAJA SIE DO GORY (`cennik.css` `.cc-cell--absent .cc-tooltip-body`), w strone wnetrza
 * `.cc-grid`, nie poza jej dolna/gorna krawedz, i to na kolumnie o szerokosci liczonej z
 * ~1360px kontenera / max 4 kolumny (~300+px) - dymek `max-width:min(300px,100%)` zaczepiony
 * `left:16px` miesci sie w obrebie wlasnej kolumny, nie dobija do prawej krawedzi `.cc-grid`.
 *
 * Zero wartosci o planach na sztywno: `planCount` i `recommendedIndex` sa WYLICZONE z
 * `grid.plans`, nie zalozone z gory (przy np. 3 planach dziala tak samo jak przy 4).
 */
export function ComparisonGrid({ grid, mobileIndex, onMobileIndexChange, onSelectPlan, loadingPlanCode }: Props) {
  const planCount = grid.plans.length;
  // Katalog puste (np. blad backendu przed pierwszym poprawnym fetchem) - `repeat(0, ...)`
  // w gridzie nizej jest CSS-owo niewazne (przeglądarka odrzuca cala deklaracje), a
  // `(mobileIndex ± 1) % 0` w `StickyPlanBar` dalby `NaN`. Zero planow = nic do porownania.
  if (planCount === 0) return null;
  const recommendedIndex = grid.plans.findIndex((p) => p.recommended);

  return (
    <section id="porownaj" className="mt-16">
      <h2 className="m-0 mb-6 text-[30px] font-bold tracking-[-0.02em] text-[#0D0D0D] md:text-[36px]">
        Porównaj pakiety
      </h2>

      <div className="cc-grid overflow-clip rounded-[22px] border border-brand-rule bg-white">
        <StickyPlanBar
          plans={grid.plans}
          mobileIndex={mobileIndex}
          onMobileIndexChange={onMobileIndexChange}
          onSelectPlan={onSelectPlan}
          loadingPlanCode={loadingPlanCode}
        />

        {/* "Dlaczego ten pakiet?" - port `sekcjaPowodow` z v6.js:682-689. Nie jest to
            `ComparisonSection` - jedno zdanie z `plan.reason` na kolumne, bez ikony, bez
            ptaszka, bez pogrubionej etykiety cechy (ComparisonCell zaklada, ze KAZDA komorka
            opisuje jakas "cecha" - tu opisujemy caly pakiet jednym zdaniem, wiec komorka jest
            wlasna, prostsza). Naglowek uzywa tych samych wymiarow co `<h3 class="sek-naglowek">`
            w `ComparisonSection.tsx`, zeby wszystkie naglowki sekcji w siatce mialy jednakowa
            wysokosc; ta sekcja jest pierwszym `<section>` w `.cc-grid`, wiec `first-of-type`
            zdejmuje jej gorna ramke, a pierwsza prawdziwa `ComparisonSection` (druga `<section>`
            po kolei) dostaje swoja ramke normalnie - dokladnie tak, jak w mockupie. */}
        <section className="border-t border-brand-rule first-of-type:border-t-0">
          <h3 className="m-0 flex min-h-[56px] items-center bg-brand-bg p-4 text-[14px] font-normal leading-[1.25]">
            <span className="font-semibold text-[#0D0D0D]">Dlaczego ten pakiet?</span>
          </h3>
          <div
            className="grid grid-cols-[repeat(var(--cc-plan-count),minmax(0,1fr))] max-[767px]:grid-cols-1"
            style={{ '--cc-plan-count': planCount } as CSSProperties}
          >
            {grid.plans.map((plan, i) => (
              <div
                key={plan.code}
                className={
                  'flex min-h-[118px] items-start border-t border-l border-[#F1F0ED] p-4 text-[13.5px] leading-[19px] text-[#6B6965] first:border-l-0 max-[767px]:border-l-0' +
                  (plan.recommended ? ' bg-[#FFFEF6]' : '') +
                  (i === mobileIndex ? '' : ' max-[767px]:hidden')
                }
              >
                <span>{plan.reason}</span>
              </div>
            ))}
          </div>
        </section>

        {grid.sections.map((section, i) => (
          <ComparisonSection
            key={i}
            section={section}
            planCount={planCount}
            recommendedIndex={recommendedIndex}
            mobileIndex={mobileIndex}
          />
        ))}
      </div>

      <p className="cc-grid-note mx-auto mt-4 max-w-[720px] text-center text-[13px] leading-[18px] text-[#6B6965]">
        Umowa roczna. Wybierz rodzaj płatności: co miesiąc lub z góry za rok.
      </p>
    </section>
  );
}
