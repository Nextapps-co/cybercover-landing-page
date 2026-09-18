interface Partner {
  name: string;
  file: string;
}

// Logotypy w PEŁNYM kolorze - port komentarza z `pasekPartnerow`
// (docs/pricelist32-main/wersje/v6.js:497): na szaro (np. filtr `grayscale`)
// giną w tle, więc renderujemy je bez żadnego filtra/przygaszenia.
const PARTNERS: Partner[] = [
  { name: 'Wolters Kluwer', file: 'wk' },
  { name: 'Resilia', file: 'resilia' },
  { name: 'Crawford', file: 'crawford' },
  { name: 'Colonnade', file: 'colonnade' },
];

/**
 * Pasek partnerów merytorycznych - port `pasekPartnerow` / sekcji `.partnerzy`
 * z `docs/pricelist32-main/wersje/v6.js:496-503` (markup) i tamtejszego
 * `css:` blocka (`.partnerzy*`, w tym samym pliku, sekcja "mostek między
 * kartami a porównaniem").
 *
 * Samodzielny komponent — sam niesie odstęp góra/dół (nie tylko dół jak
 * w oryginale, gdzie górny odstęp dawała sekcja kart), żeby dało się go
 * po prostu wstawić między dwoma blokami bez doklejania marginesów u
 * konsumenta. Logotypy z `public/img/partners/` (root-relative, nie przez
 * Astro asset pipeline).
 */
export function PartnersStrip() {
  return (
    <section className="py-16 text-center md:py-[88px]">
      <p className="mb-[26px] text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6B6965]">
        Nasi partnerzy merytoryczni
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-[36px] gap-y-[24px] md:gap-x-[56px] md:gap-y-[28px]">
        {PARTNERS.map((partner) => (
          <img
            key={partner.file}
            src={`/img/partners/${partner.file}.svg`}
            alt={partner.name}
            title={partner.name}
            loading="lazy"
            className="block h-[24px] w-auto md:h-[30px]"
          />
        ))}
      </div>
    </section>
  );
}
