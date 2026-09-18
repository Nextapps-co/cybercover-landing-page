import type { ReactNode } from 'react';

interface Props {
  /** Element, na którym wisi dymek (np. słowo w zdaniu albo cały wiersz). */
  children: ReactNode;
  /** Nagłówek chmurki — używany razem z `lines`. */
  title?: string;
  /** Punkty pod nagłówkiem. */
  lines?: string[];
  /** Alternatywa dla `title`/`lines` — jedno zdanie bez wypunktowania. */
  text?: string;
  className?: string;
}

/**
 * Dymek CSS-only (bez bibliotek) — port `.dymek`/`.dymek-tresc` z
 * `docs/pricelist32-main/wersje/v6.js:243-290`. Klasy `.cc-tooltip` /
 * `.cc-tooltip-body` (z `cennik.css`) robią pozycjonowanie chmurki, tło
 * i pokazywanie na hover/focus — zawsze w dół; ten komponent dostarcza
 * tylko strukturę.
 *
 * Wszystko tu jest `<span>`, nie `<div>/<ul>`: dymek bywa wstrzyknięty w
 * środek zdania (np. na słowie „incydent" w opisie planu), a blokowy
 * element wewnątrz `<p>` złamałby otaczający tekst.
 *
 * Wyzwalacz ma `tabIndex={0}`, żeby dymek otwierał się też z klawiatury
 * (`:focus-visible`), nie tylko na hover.
 */
export function Tooltip({ children, title, lines, text, className }: Props) {
  return (
    <span className={`cc-tooltip${className ? ` ${className}` : ''}`} tabIndex={0}>
      {children}
      <span className="cc-tooltip-body">
        {title && <span className="mb-[7px] block text-white/55">{title}</span>}
        {lines && lines.length > 0
          ? lines.map((line, i) => (
              <span
                key={i}
                className="relative block pl-[13px] before:absolute before:left-[2px] before:content-['•'] before:text-white/50 [&+&]:mt-1"
              >
                {line}
              </span>
            ))
          : text
            ? <span className="block">{text}</span>
            : null}
      </span>
    </span>
  );
}
