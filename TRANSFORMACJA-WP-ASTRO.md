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

---

## Migracja kolejnych podstron WP → Astro (sesja maj 2026)

Druga iteracja: dodawanie kolejnych podstron (Kontakt, w przyszłości O nas, Komu pomagamy, Ochrona 360, Zagrożenia, 5× usług) na bazie pełnego backupu WP z hostingu LH.pl.

### Które źródło użyć (i czego unikać)

**Używamy (`Cyber/cybercover.pl-WP-all-z-LH.pl/`):**
- **`wp-content/themes/paula/`** — PHP templates, Sass, CSS bloków Pauli. Czyste źródło bez śmieci.
- **`wp-content/themes/paula/css/main.css`** — referencja klas (np. `paula-text-border` to pill badge: `inline-block`, `border-radius:1.5em`, `padding:6px .7em`, bg z `--tb-background-color`)
- **`wp-content/plugins/cyber-cover/`** — custom plugin z patternami (np. `ochrona360`)
- **`wp-content/uploads/<year>/<month>/`** — oryginalne obrazki w pełnej rozdzielczości + warianty responsywne wygenerowane przez WP
- **Duplicator SQL dump** w `wp-content/backups-dup-lite/cybercover_*_archive.zip`, w środku `dup-installer/dup-database__*.sql` (~155 MB rozpakowany) — **prawdziwa treść każdej strony**, bo Paula's PHP template (`contact.php`, `page.php`) renderuje tylko skielet + `the_content()` z DB

**NIE używamy:**
- `Cyber/CC - all WP page/` — saved HTML ("Save Page As") — **zatrute przez Chrome extension** (`plasmo-csui`), fonty wskazują na `chrome-extension://...`, mojibake, bezużyteczne jako wzorzec
- Statyczny render SQL + Paula CSS bez PHP — Paula's custom bloki (`paula/grid`, `paula/grid-box`, `paula/step`, `paula/timeline-event`) mają **render callbacki w PHP** (`paula_grid_box_render()` itp.) które czytają atrybuty z komentarza Gutenberg i wstrzykują inline style. Bez PHP komentarz `<!-- wp:paula/grid-box {...} -->` jest niewidoczny → custom bloki nie rendrują się
- Live `cybercover.pl/<slug>` — produkcja ma tylko tymczasowy landing, prawdziwy WP jest na ukrytym staging

### Workflow per podstrona (przepis)

1. **Znajdź post w SQL** — `INSERT INTO \`wp_posts\` VALUES(...)` gdzie position 11 (slug) = target, position 20 = "page", position 7 = "publish"
2. **Wyciągnij Gutenberg HTML** z position 4 (`post_content`) — to **specyfikacja designu** (rozmiary, kolory, paddingi w JSON atrybutach komentarzy `<!-- wp:* {} -->`)
3. **Skopiuj obrazki** z `wp-content/uploads/<year>/<month>/` do `public/img/` (SVG) lub `src/assets/img/` (raster, dla Astro Image)
4. **Zoptymalizuj obrazki** — patrz "Optymalizacja obrazków" poniżej
5. **Zbuduj stronę** używając `<Hero>` + `<Section>` z `src/components/` (patrz "System komponentów")
6. **Dodaj JSON-LD per strona** przez `<slot name="head-extra" />` w `BaseLayout`
7. **Sprawdź a11y** — `<address>` dla danych firmy, `<aside aria-labelledby="...">` dla side info, `alt=""` + `aria-hidden="true"` dla obrazków dekoracyjnych, `tel:+48...` (nie samo `tel:22...`)

Helper skrypt: `render-page.mjs` w katalogu WP root robi pre-render Gutenberg HTML jako sanity check (CSS z Paula da się załadować, ale custom bloki nie renderują się bez PHP — używać tylko do podglądu treści, nie wyglądu).

### Gotchas: WP / Paula vs Astro

- **Gutenberg block JSON to spec designu** — `fontSize`, `customOverlayColor`, `paddingTop`, `borderRadius`, `width: "50%"`, `contentSize: "1410px"`, `minHeightUnit: "vh"` itd. są bezpośrednio w komentarzach. Czytaj te wartości literalnie zamiast zgadywać z DevTools.
- **Theme vars w PHP, nie CSS** — Paula używa `--h1-font-size`, `--basic-font-size`, `--basic-font-weight-mobile` itp., ale ustawia je w **WP Customizer** (theme_mods w bazie), nie w plikach `.css`. Statyczne otworzenie main.css pokaże tylko `font-size: var(--h1-font-size)` bez konkretnej wartości
- **Custom classes mogą nie mieć CSS** — np. `paula-title-lil` i `site-intro-lil` istnieją w HTML ale nie mają reguł w `main.css` — styling pochodzi z inline `style="fontSize:..."` w Gutenberg HTML. Czyli: bierz wartości z atrybutów Gutenberg, nie szukaj klasy w CSS
- **`paula-text-border` jednak ma CSS** — to pill badge z `--tb-background-color` (np. `#ddeef8` na Kontakcie) — w Astro odwzorowane przez `bg-brand-tag-blue border border-brand-tag-blue px-4 py-1 rounded-full`
- **`alignfull` / `alignwide` / `is-layout-flex`** — WP wstrzykuje je przez `theme.json` + PHP. W Astro: ręcznie ekwiwalent (np. `alignwide` ≈ `max-w-container mx-auto`)
- **Tło hero z Pauli (`wp:cover` z parallax)** — `minHeightUnit: "vh"` oznacza że hero ma być na 100vh w WP; w Astro decydujemy o sensownej `min-h-[480px] lg:min-h-[608px]` (proporcja 1513:608 wg Figmy)
- **Treść w `wp_posts.post_content` używa absolutnych URL** `https://cybercover.pl/wp-content/...` — przy renderowaniu trzeba rewrite na `/wp-content/...` lub kopiować obrazki lokalnie i podmieniać ścieżki

### System komponentów (Hero + Section)

Dwa centralne komponenty pokrywają ~90% layoutu podstron.

**`src/components/Hero.astro`** — uniwersalne hero:
- propsy: `badge?`, `title`, `intro?`, `image?` (raster split layout) **xor** `bgImage?` (SVG cover), `bg='white'|'yellow'`, `introSize='lg'|'xl'`, `minHeight?` (override)
- slot `cta` na przycisk pod intro
- 3 warianty: split (text+image jak Start), simple text-only, text+bgImage (jak Kontakt)
- `bgImage`: `background-position: center bottom; background-size: cover` + `min-h-[480px] lg:min-h-[608px]` (proporcja Figma 1513:608) żeby SVG nie był rozciągany

**`src/components/Section.astro`** — standardowy wrapper:
- propsy: `padding='default'|'tight'|'none'`, `bg?`, `narrow?` (1000px container zamiast 1410px), `fullBleed?`, `class?`
- default padding: `py-16 lg:py-24`, tight: `py-12 lg:py-16`
- container: `max-w-container mx-auto px-6`

**Wzorzec strony:**
```astro
<BaseLayout title="..." description="...">
  <Fragment slot="head-extra">
    <link rel="preload" as="image" href="/img/..." type="image/svg+xml" />
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
  </Fragment>
  <Hero badge="..." title="..." intro="..." bg="yellow" bgImage="/img/..." />
  <Section>...kolumny / karty / grid...</Section>
  <Section padding="none" class="pb-16 lg:pb-24">
    <aside aria-labelledby="...">...</aside>
  </Section>
</BaseLayout>
```

### Design tokens (rozszerzone w `global.css @theme`)

```css
/* Typografia */
--text-page-title: 58px;       /* H1 — tytuł strony (Kontakt, Ochrona 360...) */
--text-section-title: 50px;    /* H2 — tytuł sekcji */
--text-card-title: 30px;       /* H3 — duża linkowana wartość (email/tel) */
--text-card-heading: 22px;     /* H3 mniejszy — tytuł karty info (np. 24/7) */
--text-footer-title: 19px;
--text-body-lg: 17px;
--text-body: 15px;             /* tekst w kolumnach / kartach */

/* Line-height */
--leading-cozy: 1.6;           /* gęsty body w kolumnach / adresach */

/* Border radius */
--radius-card: 10px;

/* Kolory (uzupełnione, brand-tag-yellow = tło hero stron) */
--color-brand-tag-blue: #DDEEF8;   /* badge background nad H1 */
--color-brand-tag-yellow: #FEFFE0; /* tło hero z dekoracyjnymi strzałkami */
--color-brand-blue-light: #EDF8FF; /* tło kart info */
```

### Optymalizacja obrazków (przepis dla raster-in-SVG)

Avatary i ilustracje z WP są często **SVG z osadzonym base64 PNG** w wysokiej rozdzielczości (1-2 MB na plik). Workflow:

1. Wyodrębnij base64 z SVG (`data:image/png;base64,...`)
2. Zdekoduj do PNG → resize do max 2× display size (np. 220px dla avataru wyświetlanego 87px)
3. Konwertuj do WebP (`cwebp -q 80`)
4. Zakoduj z powrotem do `data:image/webp;base64,...` i wklej do SVG

Wynik typowy: **1.9 MB → 6 KB** (99.7% redukcji).

Skrypty: `/tmp/optimize-avatar.mjs` (resize) i `/tmp/png-to-webp.mjs` (konwersja na WebP) — Node.js zero-dep, używają `sips` (macOS) + `cwebp` (`brew install webp`).

### A11y + SEO checklist per strona

- **`<title>` i `<meta name="description">`** zawsze przez `BaseLayout` propsy
- **JSON-LD** dla typu strony — np. `ContactPage` z `mainEntity: LocalBusiness` (telefon, adres, openingHours, NIP/REGON/KRS jako `identifier[]`) — przez `head-extra` slot
- **`<link rel="preload" as="image">`** dla obrazka LCP (np. hero bg-image)
- **`tel:+48...`** zawsze z prefiksem kraju
- **Obrazki dekoracyjne**: `alt=""` + `aria-hidden="true"`
- **`<address class="not-italic">`** dla danych firmy
- **`<aside aria-labelledby="id-tytułu">`** dla side info (karty 24/7, callouty)
- **Focus styles** — globalne w `@layer base`: `a:focus-visible, button:focus-visible, [role="button"]:focus-visible { outline: 2px solid var(--color-brand-navy); outline-offset: 2px; }`

### Responsywność — siatki w kolumnach

3-kolumnowy info-grid (jak na Kontakcie) — pattern responsywny:
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-10">
  <div class="md:col-span-2 lg:col-span-1">...kolumna 1 (najszersza)...</div>
  <div>...kolumna 2...</div>
  <div>...kolumna 3...</div>
</div>
```

Mobile (1 kol) → tablet 768-1023px (2 kol, pierwsza na całą szerokość) → desktop ≥1024px (3 kol 50%/25%/25%).
