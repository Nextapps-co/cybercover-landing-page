import type { CSSProperties } from 'react';
import { ComparisonCell } from './ComparisonCell';
import { IncidentText } from '../IncidentText';
import type { SectionIconName } from '../../../lib/catalog/comparison-content';
import type { ComparisonSectionProps } from '../../../lib/catalog/render-policy';

interface Props {
  section: ComparisonSectionProps;
  /** Liczba pakietów = liczba kolumn = liczba komórek renderowanych na każdy wiersz. */
  planCount: number;
  /** Indeks (w kolejności planów) pakietu polecanego. */
  recommendedIndex: number;
  /** Indeks pakietu widocznego na telefonie — resztę kolumn chowa `ComparisonCell`. */
  mobileIndex: number;
}

// Duplikat przełącznika ikon z `PricingCard.tsx` (ten plik jest równolegle przepisywany
// przez inny task, więc nie importujemy z niego — patrz task-8-brief.md). Te same 7 ikon,
// SVG 1:1, tylko `width`/`height` zmniejszone z 20 na 17 (per `.sek-naglowek > svg` w
// `docs/pricelist32-main/wersje/v6.js:346`) — `viewBox` zostaje, więc skaluje się proporcjonalnie.
function SectionIcon({ icon }: { icon: SectionIconName }) {
  switch (icon) {
    case 'shield':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <svg x="1.75" y="1.75" width="16.5" height="16.5" viewBox="0 0 16.5 16.5" overflow="visible">
            <path d="M1.75482 4.5C0.929337 5.92978 0.598691 7.59199 0.81416 9.22883C1.02963 10.8657 1.77918 12.3857 2.94655 13.5531C4.11393 14.7206 5.6339 15.4702 7.27073 15.6858C8.90756 15.9014 10.5698 15.5708 11.9996 14.7454C13.4295 13.92 14.547 12.6459 15.1789 11.1206C15.8108 9.5954 15.9218 7.90426 15.4946 6.30951C15.0675 4.71476 14.126 3.30551 12.8163 2.30033C11.5067 1.29515 9.90188 0.750199 8.25091 0.75V5.125C8.9388 5.12515 9.60742 5.35228 10.1531 5.77114C10.6987 6.19001 11.0909 6.77722 11.2689 7.4417C11.4468 8.10618 11.4005 8.8108 11.1372 9.44629C10.8738 10.0818 10.4082 10.6126 9.81241 10.9565C9.21664 11.3004 8.52405 11.4381 7.84206 11.3482C7.16006 11.2584 6.52676 10.946 6.04038 10.4596C5.554 9.97315 5.2417 9.33981 5.15194 8.65781C5.06217 7.9758 5.19994 7.28323 5.54388 6.6875L1.75482 4.5Z" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg x="9.25" y="12.38" width="1.5" height="5.87" viewBox="0 0 1.5 5.875" overflow="visible">
            <path d="M0.75 0.75V5.125" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg x="2" y="10.06" width="5.73" height="2.63" viewBox="0 0 5.72693 2.6324" overflow="visible">
            <path d="M4.97675 0.750186L0.750186 1.88222" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </svg>
      );
    case 'pulse':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <svg x="1.875" y="3.125" width="16.25" height="13.125" viewBox="0 0 17.75 14.625" overflow="visible">
            <path d="M0.75 7.625H3.25L6.375 0.750002L11.375 13.875L14.5 7.625H17" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </svg>
      );
    case 'chat':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <svg x="2.5" y="3.125" width="11.25" height="10.625" viewBox="0 0 12.75 12.125" overflow="visible">
            <path d="M3.84219 8.875L0.75 11.375V1.375C0.75 1.20924 0.815848 1.05027 0.933058 0.933058C1.05027 0.815848 1.20924 0.75 1.375 0.75H11.375C11.5408 0.75 11.6997 0.815848 11.8169 0.933058C11.9342 1.05027 12 1.20924 12 1.375V8.25C12 8.41576 11.9342 8.57473 11.8169 8.69194C11.6997 8.80915 11.5408 8.875 11.375 8.875H3.84219Z" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg x="6.875" y="6.875" width="11.25" height="10.625" viewBox="0 0 12.75 12.125" overflow="visible">
            <path d="M0.75 5.125V8.25C0.75 8.41576 0.815848 8.57473 0.933058 8.69194C1.05027 8.80915 1.20924 8.875 1.375 8.875H8.90781L12 11.375V1.375C12 1.20924 11.9342 1.05027 11.8169 0.933058C11.6997 0.815848 11.5408 0.75 11.375 0.75H8.25" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </svg>
      );
    case 'alert':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <svg x="2.5" y="2.5" width="15" height="15" viewBox="0 0 15 15" overflow="visible">
            <circle cx="7.5" cy="7.5" r="6.75" stroke="#0D0D0D" strokeWidth="1.5"/>
            <circle cx="7.5" cy="7.5" r="3.75" stroke="#0D0D0D" strokeWidth="1.5"/>
            <rect x="6.66667" y="0.5" width="2.08333" height="3" fill="#0D0D0D"/>
            <rect x="3.61979" y="8.9974" width="2.08333" height="3" transform="rotate(45 3.61979 8.9974)" fill="#0D0D0D"/>
            <rect x="11.1198" y="8.9974" width="3" height="2.08333" transform="rotate(45 11.1198 8.9974)" fill="#0D0D0D"/>
          </svg>
        </svg>
      );
    case 'insurance':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <svg x="2.5" y="1.75" width="15" height="16.5" viewBox="0 0 14.335 16.5" overflow="visible">
            <path d="M7.16752 15.7379C14.4191 11.9698 13.5528 2.72501 13.5528 2.72501C9.19094 3.37323 7.16752 0.750046 7.16752 0.750046V0.762162C7.16752 0.762162 5.14409 3.37929 0.78222 2.73712C0.78222 2.73712 -0.0840968 11.9819 7.16752 15.75V15.7379Z" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round"/>
          </svg>
          <svg x="6" y="7" width="8" height="6" viewBox="0 0 8.07043 5.89992" overflow="visible">
            <path d="M7.00977 1.06066L2.92052 5.14992L1.06066 3.29006" stroke="#0D0D0D" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round"/>
          </svg>
        </svg>
      );
    case 'education':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.99479 5.41683C5.91562 5.41683 6.66146 4.671 6.66146 3.75016C6.66146 2.82933 5.91562 2.0835 4.99479 2.0835C4.07396 2.0835 3.32812 2.82933 3.32812 3.75016C3.32812 4.671 4.07396 5.41683 4.99479 5.41683Z" stroke="#0D0D0D" strokeWidth="1.8" strokeMiterlimit="10"/>
          <path d="M17.9141 11.2503V4.58366C17.9141 3.66318 17.1678 2.91699 16.2474 2.91699H10.4141" stroke="#0D0D0D" strokeWidth="1.8" strokeMiterlimit="10" strokeLinecap="square"/>
          <path d="M19.5807 14.5835H10.4141" stroke="#0D0D0D" strokeWidth="1.8" strokeMiterlimit="10" strokeLinecap="square"/>
          <path d="M15.4141 18.3335L12.9141 14.5835L13.1918 15.0002" stroke="#0D0D0D" strokeWidth="1.8" strokeMiterlimit="10" strokeLinecap="square"/>
          <path d="M7.4974 11.2503L6.66456 18.7503H3.3309L2.99753 13.3337L1.66406 12.6566L2.13395 9.98408C2.34413 8.78874 3.38249 7.91699 4.59619 7.91699H11.2479" stroke="#0D0D0D" strokeWidth="1.8" strokeMiterlimit="10" strokeLinecap="square"/>
        </svg>
      );
    case 'users':
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.5625 12.5C8.80616 12.5 10.625 10.6812 10.625 8.4375C10.625 6.19384 8.80616 4.375 6.5625 4.375C4.31884 4.375 2.5 6.19384 2.5 8.4375C2.5 10.6812 4.31884 12.5 6.5625 12.5Z" stroke="#0D0D0D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1.01562 15.3125C1.65405 14.4407 2.489 13.7316 3.45275 13.2428C4.41649 12.754 5.48189 12.4993 6.5625 12.4993C7.64311 12.4993 8.70851 12.754 9.67225 13.2428C10.636 13.7316 11.4709 14.4407 12.1094 15.3125" stroke="#0D0D0D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.4375 12.5C14.5182 12.499 15.5839 12.7533 16.5477 13.242C17.5116 13.7307 18.3465 14.4401 18.9844 15.3125" stroke="#0D0D0D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.3906 4.51094C12.949 4.36274 13.5326 4.33534 14.1025 4.43058C14.6723 4.52582 15.2152 4.74151 15.6951 5.06324C16.175 5.38498 16.5807 5.80536 16.8852 6.29634C17.1897 6.78731 17.386 7.33759 17.4609 7.91044C17.5359 8.48329 17.4878 9.06555 17.3198 9.61834C17.1519 10.1711 16.868 10.6817 16.4871 11.1161C16.1061 11.5505 15.637 11.8986 15.1108 12.1372C14.5847 12.3759 14.0137 12.4995 13.4359 12.5" stroke="#0D0D0D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Sekcja siatki porównania — port `sekcjaPorownania` z
 * `docs/pricelist32-main/wersje/v6.js:667-679`.
 *
 * Nagłówek (`<h3>`): ikona + nazwa + opcjonalna plakietka („Wkrótce”) + opcjonalny podtytuł.
 * Na wąskim ekranie nazwa i podtytuł są w dwóch liniach; od `lg` (1024px, jak w mockupie —
 * `docs/pricelist32-main/wersje/v6.js:349`) stoją w jednej, podtytuł poprzedzony półpauzą.
 *
 * Wiersze renderują się jako `planCount` kolumn *na wiersz* — każdy wiersz to własny grid
 * (`--plan-count` jako custom property, bo `grid-template-columns` z dynamiczną liczbą kolumn
 * nie da się wyrazić statyczną klasą Tailwinda), więc `ComparisonCell` może bezpiecznie liczyć
 * na to, że jest (lub nie jest) dosłownym `:first-child` w SWOIM wierszu — nie musi znać
 * `planCount`, żeby zdjąć lewą ramkę pierwszej kolumnie.
 */
export function ComparisonSection({ section, planCount, recommendedIndex, mobileIndex }: Props) {
  return (
    <section className="border-t border-brand-rule first-of-type:border-t-0">
      <h3 className="relative m-0 flex min-h-[56px] items-center gap-[9px] bg-brand-bg p-4 text-[14px] font-normal leading-[1.25]">
        <span className="mt-[1px] flex-none self-start lg:mt-0 lg:self-center">
          <SectionIcon icon={section.icon} />
        </span>
        <span className="flex flex-col gap-[3px] lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-2 lg:gap-y-1">
          <span className="font-semibold text-[#0D0D0D]">
            <IncidentText text={section.title} />
            {section.badge && (
              <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-[#EFDFA6] bg-brand-tag-yellow px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7A5B00]">
                {section.badge}
              </span>
            )}
          </span>
          {section.subtitle && (
            <span className="text-[13px] font-normal leading-[18px] text-[#6B6965]">
              <span aria-hidden="true" className="hidden lg:inline">&ndash; </span>
              {section.subtitle}
            </span>
          )}
        </span>
      </h3>

      {section.rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="grid grid-cols-[repeat(var(--cc-plan-count),minmax(0,1fr))] max-[767px]:grid-cols-1"
          style={{ '--cc-plan-count': planCount } as CSSProperties}
        >
          {row.cells.map((cell, i) => (
            <ComparisonCell
              key={i}
              row={row}
              cell={cell}
              hiddenOnMobile={i !== mobileIndex}
              recommended={i === recommendedIndex}
            />
          ))}
        </div>
      ))}

      {section.footnote && (
        <p className="mx-[2px] mt-[10px] pb-[18px] text-center text-[12px] leading-[17px] text-[#6B6965]">
          {section.footnote}
        </p>
      )}
    </section>
  );
}
