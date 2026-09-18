import { useEffect, useRef, useState } from 'react';
import { formatMinorUnits } from '../../lib/format/money';

// `formatMinorUnits` zwraca kwotę razem z symbolem waluty („336,30 zł"), a karta
// renderuje „zł" osobnym `<span>` (inny rozmiar i waga). Zdejmujemy więc sam symbol,
// zamiast budować w tym pliku drugie, własne formatowanie liczby — to właśnie ono
// rozjeżdżało się z resztą strony (`Intl.NumberFormat('pl-PL')` bez `useGrouping`
// nie grupuje czterech cyfr: 1595 → „1595", podczas gdy mini-karta w siatce
// pokazywała „1 595").
const CURRENCY_SUFFIX_RE = /\s*zł$/;

/**
 * Doliczanie ceny przy zmianie cyklu — jak u Surfera. Port `poRenderze`
 * z `docs/pricelist32-main/wersje/v6.js:443-462` (easeOutCubic, 420 ms),
 * przepisany z globalnego `data-licznik` + `requestAnimationFrame` na
 * lokalny efekt Reactowy per instancja.
 *
 * Animujemy GROSZE — surową wartość z `derivePricing` (`priceMinorUnits`), nigdy
 * liczby odzyskanej z gotowego tekstu. Grosze są całkowite, więc `Math.round` na
 * klatce niczego nie gubi, a klatka końcowa trafia dokładnie w `minorUnits`, czyli
 * w tę samą kwotę, którą pokazuje `price`. Parsowanie sformatowanego stringa ucinało
 * końcówkę (336,30 zł → 336) i karta pokazywała cenę o 30 gr niższą niż rachunek.
 *
 * Przy `prefers-reduced-motion: reduce` wartość po prostu się podmienia bez animacji.
 */
export function AnimatedPrice({ minorUnits, className }: { minorUnits: number; className?: string }) {
  const [shown, setShown] = useState(minorUnits);
  const from = useRef(minorUnits);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    from.current = minorUnits;
    if (reduce || start === minorUnits) { setShown(minorUnits); return; }

    const DURATION = 420;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - t0) / DURATION, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (minorUnits - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [minorUnits]);

  // Licznik w mockupie tyka pełnymi złotówkami (`maximumFractionDigits: 0`,
  // `docs/pricelist32-main/wspolne.js:68`). Gdy kwota docelowa jest pełnymi złotówkami,
  // trzymamy ten sam rytm — inaczej w locie migałyby grosze, których w cenie końcowej
  // nie ma. Na ostatniej klatce `shown === minorUnits`, więc zaokrąglenie jej nie rusza.
  const display = minorUnits % 100 === 0 ? Math.round(shown / 100) * 100 : shown;

  return <span className={className}>{formatMinorUnits(display, 'PLN').replace(CURRENCY_SUFFIX_RE, '')}</span>;
}
