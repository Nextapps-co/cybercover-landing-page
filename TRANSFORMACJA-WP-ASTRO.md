# CyberCover Landing Page — Transformacja WordPress → Astro

## O projekcie

Strona landing page dla Cyber Cover sp. z o.o. — usługa cyberbezpieczeństwa dla MŚP. Jedna strona główna (sekcje: hero, zagrożenia, wyzwania, NIS2, ochrona 360, usługi, jak uruchomić) plus 4 podstrony prawne (polityka prywatności, regulamin, cookies, obowiązek informacyjny).

**Domena:** cybercover.pl

**Oryginał:** WordPress z motywem custom + Elementor + WPBakery
**Cel:** statyczna strona Astro — szybsza, tańsza w hostingu, zero zależności od WP

## Stack technologiczny

- **Astro 6** — static site generator, output: static HTML
- **Tailwind CSS v4** — utility-first, konfiguracja przez `@theme` w CSS (nie `tailwind.config.js`)
- **TypeScript** — minimalne użycie, głównie props interfaces
- **@astrojs/sitemap** — automatyczna generacja sitemap.xml
- **@tailwindcss/typography** — plugin `prose` do podstron prawnych
- **Cookie Consent** (orestbida) — RODO-compliant cookie banner
- **GTM + Google Consent Mode v2** — analytics z respektem dla consent

## Struktura projektu

```
cc-strona-landing-astro/
├── astro.config.mjs          # site URL, sitemap, Tailwind Vite plugin
├── src/
│   ├── assets/img/            # obrazki rasterowe (JPG/PNG) — optymalizowane przez Astro
│   ├── components/
│   │   ├── Header.astro       # fixed header + mobile hamburger menu
│   │   ├── Footer.astro       # 4-kolumnowy footer z social links
│   │   ├── Ochrona360.astro   # diagram kołowy z animacją scroll
│   │   └── SectionTag.astro   # reużywalny tag sekcji (żółty/niebieski)
│   ├── layouts/
│   │   ├── BaseLayout.astro   # <head>, GTM, cookie consent, JSON-LD
│   │   └── LegalLayout.astro  # wrapper na podstrony prawne (prose)
│   ├── pages/
│   │   ├── index.astro        # strona główna — wszystkie sekcje
│   │   ├── polityka-prywatnosci.astro
│   │   ├── polityka-plikow-cookies.astro
│   │   ├── regulamin.astro
│   │   └── obowiazek-informacyjny.astro
│   └── styles/
│       └── global.css         # Tailwind import, @theme (design tokens), scroll behavior
└── public/
    └── img/                   # SVG (ikony, loga), favicon — serwowane bez zmian
```

## Proces transformacji

### 1. Ekstrakcja treści z WordPress

Oryginalna strona WP używała mieszanki Elementor, WPBakery i custom PHP. Treści zostały wyciągnięte ręcznie:

- **HTML sekcji** — kopiowanie struktury z DevTools, oczyszczanie z klas WP/Elementor
- **Obrazki** — export z Media Library, oryginalne JPG/PNG
- **SVG** — ikony i loga wyciągnięte z kodu źródłowego
- **Teksty prawne** — skopiowane z podstron WP

### 2. Budowa struktury Astro

**Podejście:** bottom-up, od komponentów do stron.

**BaseLayout.astro** — odpowiednik `header.php` + `footer.php` z WP:
- `<head>` z meta tagami, OG tags, favicon
- GTM i Google Consent Mode v2 (przeniesione 1:1 z WP)
- Cookie Consent — zamieniony z wtyczki WP na bibliotekę JS (orestbida/cookieconsent)
- JSON-LD schema Organization

**Header.astro** — zamiennik nawigacji WP:
- Fixed header z glassmorphism (bg-brand-bg + border + rounded-full)
- Desktop: inline nav z CTA button
- Mobile: hamburger → fullscreen overlay menu
- Animacja hamburgera (3 bars → X) w vanilla JS zamiast jQuery

**Footer.astro** — zamiennik widgetu WP:
- Dane strukturalizowane w kodzie (tablice linków)
- SVG ikony social media inline (zamiast Font Awesome z WP)

**Ochrona360.astro** — najtrudniejszy komponent do migracji:
- Oryginalnie: custom CSS + system animacji „Paula" (WP plugin)
- W Astro: CSS przeniesiony 1:1 z `cc-ochrona360.css`, animacja zastąpiona IntersectionObserver
- Diagram kołowy z 5 elementami, spinning arrows SVG, items pojawiające się z delay

### 3. Tailwind zamiast custom CSS

WordPress używał mieszanki:
- Inline styles z Elementor
- Custom CSS w `style.css` motywu
- Utility classes z WPBakery

**Mapowanie:**
- Kolory z custom CSS → `@theme` design tokens (`--color-brand-*`)
- Font family → `--font-sans` w `@theme`
- Media queries → Tailwind breakpoints (`lg:`, `md:`)
- Custom margins/paddings → Tailwind spacing utilities
- Powtarzające się wartości → design tokens (`--spacing-container`, `--text-section-title`, `--radius-card`)

### 4. Optymalizacja obrazków

**Problem:** WordPress serwował oryginalne JPG (łącznie ~3.6 MB). Brak WebP, brak lazy loading na większości.

**Rozwiązanie Astro:**
- 8 obrazków rasterowych przeniesione do `src/assets/img/`
- Użycie komponentu `<Image />` z `astro:assets`
- Automatyczna konwersja do WebP, kompresja, generowanie width/height

**Wyniki kompresji:**

- `ochrona-twojej-firmy-cena.jpg`: 751 KB → 25 KB (97% mniej)
- `wymagania-nis2x2.jpg`: 882 KB → 46 KB
- `Ocena.jpg`: 454 KB → 51 KB
- `Konsultacje-portal.jpg`: 390 KB → 40 KB
- `Natychmiastowa-pomoc-portal.jpg`: 388 KB → 40 KB
- `Ubezpieczenie-portal.jpg`: 373 KB → 45 KB
- `Monitoring-zagrozen-portal.jpg`: 329 KB → 41 KB
- `picture.png`: 99 KB → 10 KB
- **Suma: ~3.6 MB → ~298 KB**

**Co zostało w `public/img/`:**
- SVG (ikony, loga) — wektorowe, nie potrzebują optymalizacji
- Favicon PNG — wymaga stałego URL

### 5. SEO i performance

**Dodane (brakowało w WP lub było źle skonfigurowane):**
- `<link rel="canonical">` — dynamiczny na podstawie `Astro.url`
- Sitemap XML — `@astrojs/sitemap` z `site: 'https://cybercover.pl'`
- JSON-LD Organization — dane strukturalne dla Google
- Preconnect do Google Fonts — eliminacja render-blocking
- `og:image` wskazujący na zoptymalizowany WebP
- `loading="eager"` na hero image, `loading="lazy"` na reszcie
- `decoding="async"` na wszystkich obrazkach (dodawane automatycznie przez Astro)

**Font loading:**
- WP: `@import url(...)` w CSS — render-blocking
- Astro: `<link rel="preconnect">` + `<link rel="stylesheet">` w `<head>` — nieblokujące

## Design tokens

Wszystkie powtarzające się wartości wyciągnięte do `@theme` w `global.css`:

**Kolory**
- `--color-brand-yellow` (#FFCD20) — CTA, akcenty
- `--color-brand-navy` (#061856) — sekcje ciemne, hover
- `--color-brand-text` (#413F3B) — tekst bazowy
- `--color-brand-bg` (#F8F7F4) — tło sekcji, header
- `--color-brand-border` (#C9C5BB) — obramowania kart
- `--color-brand-blue-light` (#EDF8FF) — tło sekcji wyzwania
- `--color-brand-tag-yellow` / `--color-brand-tag-blue` — tagi sekcji

**Typografia**
- `--text-section-title` (50px) — nagłówki h2 sekcji
- `--text-body-lg` (17px) — tekst opisowy, nav links
- `--text-footer-title` (19px) — nagłówki w footerze

**Rozmiary**
- `--spacing-container` (1410px) — max-width kontenera
- `--radius-card` (10px) — border-radius kart

## Co zostało usunięte z WP

- jQuery i wszystkie skrypty WP (~200 KB JS)
- Elementor CSS/JS (~300 KB)
- WPBakery CSS/JS
- WordPress REST API endpoints
- wp-admin, wp-login
- Wtyczki: Yoast SEO, cookie plugin, contact form
- PHP runtime
- MySQL database
- `functions.php`, `style.css`, cały motyw

## Komendy

```bash
npm run dev      # dev server z hot reload
npm run build    # build produkcyjny → dist/
npm run preview  # podgląd buildu lokalnie
```

## Co dalej (potencjalne ulepszenia)

- Usunięcie `noindex, nofollow` z meta robots (gdy strona gotowa do indeksacji)
- View Transitions API dla smooth page navigation
- Prefetching linków (`<link rel="prefetch">`)
- Critical CSS inlining
- Service Worker dla offline support
