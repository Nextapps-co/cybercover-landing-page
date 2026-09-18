import type { JSX, ReactNode } from 'react';

interface PricingCardBlockProps {
  groupLabel: string;
  children: ReactNode; // karty
}

/**
 * Pasek grupy + zrośnięty blok kart — port `.grupa` / `.grupa-etykieta` / `.grupa-karty`
 * z `docs/pricelist32-main/wersje/v6.js:83-116,706-709`.
 *
 * Zaokrąglenia narożników bloku kart bierze `.cc-cards` / `.cc-card`
 * (patrz `src/styles/cennik.css`, dostarczone równolegle) — tutaj tylko siatka kolumn
 * i tła. Progi 640px / 1100px muszą zostać identyczne z progami dzielników między
 * kartami w `PricingCard.tsx` (`min-[640px]:` / `min-[1100px]:`), inaczej liczba kolumn
 * i linie dzielące rozjadą się w wąskim zakresie między nimi.
 *
 * Żadnego `overflow: hidden` na żadnym z dwóch kontenerów — inaczej dymek (`Tooltip`)
 * wychodzący poza dolną krawędź karty zostałby ucięty.
 */
export function PricingCardBlock({ groupLabel, children }: PricingCardBlockProps): JSX.Element {
  return (
    <div className="mb-[72px] rounded-[24px] bg-brand-yellow">
      <p className="px-3 py-[11px] text-center font-['Plus_Jakarta_Sans',sans-serif] text-[13.5px] font-semibold tracking-[-0.01em] text-[#0D0D0D]">
        {groupLabel}
      </p>
      <div className="cc-cards grid grid-cols-1 bg-white min-[640px]:grid-cols-2 min-[1100px]:grid-cols-4">
        {children}
      </div>
    </div>
  );
}
