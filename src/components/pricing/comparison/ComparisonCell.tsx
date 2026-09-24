import { Tooltip } from '../Tooltip';
import type { CellState } from '../../../lib/catalog/comparison-content';
import type { ComparisonRowProps } from '../../../lib/catalog/render-policy';

interface Props {
  row: ComparisonRowProps;
  cell: CellState;
  /** Kolumna inna niż aktualnie wybrany pakiet na telefonie — `display:none` tam. */
  hiddenOnMobile: boolean;
  /** Kolumna pakietu polecanego — delikatnie inne tło. */
  recommended: boolean;
}

// Port `PTASZEK` z `docs/pricelist32-main/wspolne.js:58-60` — `stroke="currentColor"`,
// żeby kolor (zielony przy obecności, `inherit` przy `brak`) szedł z opakowującego <span>.
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

// Port `KROPKA` z `docs/pricelist32-main/wersje/v6.js:506` — wiersz podrzędny (`subItem`)
// dostaje kropkę zamiast ptaszka.
function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="2.5" fill="currentColor" />
    </svg>
  );
}

// Krzyżyk przy cesze niedostępnej w pakiecie — samo wyszarzenie było za słabym sygnałem.
// Kolor dziedziczy z `.cc-cell--absent` (szary).
function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Jedna komórka siatki porównania — port `komorka` z `docs/pricelist32-main/wersje/v6.js:642-665`.
 *
 * To NIE jest tabela: nazwa cechy powtarza się w każdej kolumnie (układ Surfera), więc
 * `row.label`/`row.explanation` renderują się tu, w każdej wywołanej instancji, nie jeden
 * raz w osobnej kolumnie z lewej.
 *
 * `kind: 'absent'` (`brak` w oryginale) zostaje wyszarzone przez klasę CSS `.cc-cell--absent`
 * (kolor tekstu + `cursor:not-allowed`) — tu dokładamy tylko rzeczy, których czysty CSS nie
 * wyrazi: krzyżyk zamiast ptaszka, wyłączenie pogrubienia, i owinięcie treści w `<Tooltip>` z dymkiem
 * „Niedostępne w tym pakiecie” (dymek otwiera się w górę dzięki `.cc-cell--absent .cc-tooltip-body`
 * w `cennik.css` — wymaga tylko, żeby `.cc-cell` (ma `position:relative`) było przodkiem `<Tooltip>`,
 * co jest tu zapewnione strukturalnie).
 *
 * Wszystko poniżej `<Tooltip>`/obok niego jest `<span>`, nigdy `<div>` — Tooltip (patrz jego
 * własny komentarz) zakłada dzieci bezpieczne w kontekście inline; stackowanie na kolejne
 * linie robi Tailwindowe `block` na poszczególnych `<span>`ach, nie zmiana tagu.
 */
export function ComparisonCell({ row, cell, hiddenOnMobile, recommended }: Props) {
  const absent = cell.kind === 'absent';
  const rawDisplay = cell.kind === 'present' ? cell.display : undefined;
  const hasValueText = !absent && rawDisplay !== undefined && rawDisplay !== true;
  const valueText = hasValueText ? String(rawDisplay) : '';
  const isList = hasValueText && valueText.includes('\n');

  const cellClassName =
    'cc-cell flex items-start gap-2 min-h-[56px] pt-4 pr-4 pb-4' +
    (absent ? ' cc-cell--absent' : '') +
    (row.subItem ? ' cc-cell--sub' : ' pl-4') +
    ' border-t border-l border-[#F1F0ED] first:border-l-0 max-[767px]:border-l-0' +
    (recommended ? ' bg-[#FFFEF6]' : '') +
    (hiddenOnMobile ? ' max-[767px]:hidden' : '') +
    ' text-[13.5px] leading-[19px]';

  const iconClassName =
    'mt-[2px] flex h-[14px] w-[14px] flex-none items-center justify-center' +
    (absent ? '' : row.subItem ? ' text-brand-text' : ' text-[#16653C]');

  // PREZENT: nazwa cechy pogrubiona, opcjonalne wyjaśnienie, opcjonalna wartość
  // (zwykła — pogrubiona; lista z `\n` — nie pogrubiona, żeby nie przeważyła nad nazwą).
  const presentContent = (
    <span className="block min-w-0 flex-1">
      <span className="block font-bold text-[#0D0D0D]">{row.label}</span>
      {row.explanation && (
        <span className="block mt-[2px] text-[12.5px] leading-[17px] text-[#6B6965]">
          {row.explanation}
        </span>
      )}
      {hasValueText &&
        (isList ? (
          <span className="block mt-[4px] font-normal text-[#6B6965]">
            {valueText.split('\n').map((line, i) => (
              <span key={i} className="relative block pl-[13px] before:absolute before:left-[2px] before:content-['•'] [&+&]:mt-[3px]">
                {line}
              </span>
            ))}
          </span>
        ) : (
          <span className={`block font-bold text-[#0D0D0D]${row.emphasize ? ' text-[15px]' : ''}`}>
            {valueText}
          </span>
        ))}
    </span>
  );

  // BRAK: sama nazwa (+ wyjaśnienie) bez wartości, nie pogrubione, owinięte w Tooltip —
  // kolor i cursor:not-allowed idą z `.cc-cell--absent` na przodku (`color`/`font-weight`
  // dziedziczą się przez `Tooltip`'s `.cc-tooltip { color:inherit; font-weight:inherit }`).
  const absentContent = (
    // `cc-tooltip--blocked` (cennik.css) forces `cursor: not-allowed` on this trigger.
    // `.cc-cell--absent` on the ancestor cell sets the same cursor too, but this span
    // is the shared `Tooltip`'s own trigger element, which specifies its own
    // `cursor: help` (`.cc-tooltip`) — that wins over an inherited value from any
    // ancestor regardless of layers, so the trigger needs its own explicit override.
    <Tooltip text="Niedostępne w tym pakiecie" className="block min-w-0 flex-1 cc-tooltip--blocked">
      <span className="block">{row.label}</span>
      {row.explanation && (
        <span className="block mt-[2px] text-[12.5px] leading-[17px]">{row.explanation}</span>
      )}
    </Tooltip>
  );

  return (
    <div className={cellClassName}>
      <span aria-hidden="true" className={iconClassName}>
        {absent ? <CrossIcon /> : row.subItem ? <DotIcon /> : <CheckIcon />}
      </span>
      {absent ? absentContent : presentContent}
    </div>
  );
}
