# Lista zadań — bezpieczeństwo (cybercover-landing-page)

Wynik przeglądu bezpieczeństwa kodu z 2026-06-01. Brak znalezisk krytycznych i brak hardkodowanych sekretów. Poniżej zadania posortowane wg priorytetu.

Kontekst ryzyka: to checkout zbierający dane osobowe (NIP, dane firmy) z płatnością Stripe; JWT trzymany jest w `sessionStorage`. Każde wykonanie obcego JS na stronach `/checkout/*` daje dostęp do tokenu i PII.

---

## WYSOKI priorytet

### SEC-1 — XSS przez treść zgód z API (`dangerouslySetInnerHTML`)
- **Plik:** `src/components/checkout/ConsentCheckbox.tsx:28`
- **Problem:** `consent.name` (z `GET /orders/consent-definitions`) jest wstrzykiwany jako surowy HTML bez sanityzacji. Typ `ConsentDefinitionDto.name` (`src/lib/api/types/order.ts:149`) wprost dopuszcza HTML. Jeśli backend/CMS pozwoli wpisać w nazwę zgody dowolny HTML (np. `<img src=x onerror=...>`, `<a href="javascript:...">`), wykona się on na stronie checkoutu — tam, gdzie w `sessionStorage` leży JWT i podawane są dane osobowe. To stored XSS zależny od zaufania do treści zgód.
- **Rekomendacja:** sanityzować przed renderem — whitelist tagów (`a, strong, em, b, i`) i atrybutów (tylko `href` z walidacją `https:`/relatywny), wymusić `rel="noopener noreferrer"` na linkach, odrzucić `javascript:`/`data:`. Najlepiej DOMPurify (standard branżowy). Alternatywa docelowa: backend zwraca strukturę (tekst + lista linków) zamiast surowego HTML.

### SEC-2 — Brak SRI na skryptach third-party z CDN (cookie consent)
- **Pliki:** `src/layouts/BaseLayout.astro:64` (CSS), `:178` (JS); `src/layouts/CheckoutLayout.astro:36` (CSS), `:140` (JS)
- **Problem:** cookie-consent ładowany z `cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/...` (serwowanie wprost z repo GitHub) bez atrybutu `integrity` (SRI). To wykonywalny JS na stronie z tokenem i PII. Kompromitacja CDN lub repo źródłowego = arbitrary JS u każdego użytkownika. Ścieżka `gh/` jest gorsza niż `npm/`, bo wskazuje na żywy tag repo.
- **Rekomendacja:** dodać `integrity="sha384-..."` + `crossorigin="anonymous"` do `<script>` i `<link>` w obu layoutach (wersja jest już przypięta na `@3.1.0`). Alternatywa: przejść na ścieżkę `npm/` z pinem, lub zhostować plik lokalnie w `src/`/`public/`.

---

## ŚREDNI priorytet

### SEC-3 — Open redirect przez Stripe `session.url` / `checkoutSessionUrl`
- **Pliki:** `src/components/checkout/ConfirmStep.tsx:130`, `src/components/checkout/StripeCancelledRetry.tsx:59`, `src/components/pricing/PricingCards.tsx:176`
- **Problem:** wartości `session.url` i `meta.checkoutSessionUrl` (typ `string`) są bez walidacji przekierowywane przez `window.location.href`. Gdyby atakujący zdołał zwrócić kontrolowany URL z backendu (podatność w BE lub MITM na `PUBLIC_API_BASE_URL`), użytkownik trafia na dowolną domenę phishingową w trakcie płatności — wysokiej wartości moment na phishing danych kartowych.
- **Rekomendacja:** przed redirectem zwalidować, że URL ma `https:` i host należy do allowlisty (`checkout.stripe.com` / `*.stripe.com`). Odrzucać `javascript:`/`data:`/cross-host. Wzór parsowania: istniejący `src/lib/auth/portal-redirect.ts` (`new URL()`).

### SEC-4 — Token w URL query (`?token=`) wycieka przez nagłówek Referer
- **Pliki:** `src/components/checkout/ConfirmStep.tsx:142`, `src/components/checkout/BankTransferConfirmation.tsx:30,38`, `src/lib/api/orders.ts:153-168`
- **Problem:** `confirmationToken` trafia do URL `/checkout/bank-transfer?orderId=…&token=…` i do download-URL proformy. Tokeny w query stringu wyciekają przez historię przeglądarki, nagłówek `Referer` (do GTM/Google przy ładowaniu third-party na tej samej stronie) i logi proxy. Na stronie bank-transfer ładuje się GTM → `Referer` z tokenem może pójść do Google.
- **Rekomendacja:** ustawić `Referrer-Policy: no-referrer` (lub `strict-origin-when-cross-origin`) globalnie — najprościej `<meta name="referrer" content="no-referrer">` w obu layoutach. Rozważyć token w fragmencie (`#`) zamiast query, oraz potwierdzić po stronie backendu, że token jest single-use / krótko żyjący.

### SEC-5 — Token cookie access-gate jest deterministyczny i nieodwoływalny
- **Pliki:** `src/lib/server/access-gate.ts:24-26`, `src/pages/api/access.ts:33`
- **Problem:** token w cookie `cc_access` to stała funkcja klucza (`sha256(key+salt)`) — bez losowości/nonce/timestampu. Skutki: (a) identyczny token dla wszystkich znających hasło — wyciek jednego cookie = trwały dostęp; (b) nieodwoływalny bez zmiany `CHECKOUT_ACCESS_KEY` (wylogowuje wszystkich); (c) `maxAge` 12h jest egzekwowane tylko po stronie przeglądarki. Uwaga: gate to wyłącznie zasłona pre-launch UI, nie chroni backendu — ryzyko ograniczone tym kontekstem.
- **Rekomendacja:** jeśli gate ma realnie chronić — podpisany token z `exp` (HMAC nad expiry), weryfikowany serwerowo, żeby `maxAge` był wymuszany serwerowo i token był odwoływalny.

### SEC-6 — Access gate fail-open bez sygnału
- **Pliki:** `src/middleware.ts:20-23`, `src/pages/api/access.ts:21-24`
- **Problem:** brak `CHECKOUT_ACCESS_KEY` = gate całkowicie wyłączony (świadoma decyzja). Ryzyko operacyjne: jeśli na produkcji klucz nie zostanie ustawiony (literówka w env na Railway, reset zmiennej), cały flow `/cennik` + `/checkout/*` staje się publiczny bez żadnego sygnału błędu.
- **Rekomendacja:** dodać do startup-logu / health-checku jednoznaczny komunikat „ACCESS GATE: ENABLED/DISABLED", żeby deploy bez klucza był widoczny. Ewentualnie wymóg jawnego `CHECKOUT_ACCESS_KEY=__OPEN__` do świadomego wyłączenia.

---

## NISKI priorytet

### SEC-7 — `?mockAuth=` działa też poza dev (staging/preview/prod)
- **Plik:** `src/lib/auth/mock-auth.ts:24-42` (wołane w `src/components/pricing/PricingCards.tsx:47`)
- **Problem:** `consumeMockAuthFromUrl()` jest wołane bezwarunkowo i wstrzykuje fałszywą sesję (`mock-access-...`) na każdym środowisku, jeśli ktoś doda `?mockAuth=optimum-ACTIVE`. To NIE jest realny bypass autoryzacji (token opaque, backend zwróci 401), ale myli auth-aware UI na produkcji (banner „zalogowany", ukryty nav).
- **Rekomendacja:** zamknąć za `import.meta.env.DEV` lub jawnym `PUBLIC_USE_MOCK_*`, żeby na prod URL `?mockAuth=` był ignorowany.

### SEC-8 — JWT i refresh token w `sessionStorage`
- **Plik:** `src/lib/auth/session.ts:13-15,53-59`
- **Problem:** access + refresh token w `sessionStorage` (dostępne dla JS). Standardowy trade-off SPA/islands, ale dowolny XSS (np. SEC-1) daje pełny exfil tokenów. Refresh token jest szczególnie wrażliwy; obecnie refresh flow jest nieużywany, więc ekspozycja mniejsza.
- **Rekomendacja:** docelowo httpOnly cookie dla tokenów; minimum — nie persystować refresh tokenu skoro jest nieużywany. Naprawa SEC-1 i SEC-2 redukuje ten wektor.

### SEC-9 — Brak nagłówków bezpieczeństwa (CSP, X-Content-Type-Options, X-Frame-Options)
- **Obserwacja globalna** (middleware / `railway.toml`): brak CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`. CSP istotnie ograniczyłby skutki SEC-1 i SEC-2 (blokada inline/`javascript:`, whitelist `cdn.jsdelivr.net`/`googletagmanager.com`/Stripe). Strony mają `noindex,nofollow` (pre-launch) — OK.
- **Rekomendacja:** dodać CSP (na start w trybie `report-only`), `Referrer-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` — w middleware albo na poziomie Railway/proxy. Wymaga przetestowania whitelisty third-party (GTM, jsdelivr, fonts.google, Stripe), żeby nic nie zablokować.

---

## Zweryfikowane jako bezpieczne (bez działań)

- `safeEqual` jest stałoczasowe (`crypto.timingSafeEqual` na hashach) — `access-gate.ts:33-37`. Hasło w `api/access.ts:26` też przez `safeEqual`, nie `===`.
- Cookie `cc_access`: `httpOnly`, `secure` (za proxy https), `sameSite: 'lax'`, `path: '/'` — flagi poprawne.
- `safeReturnPath` (`access-gate.ts:50-53`) blokuje open redirect (odrzuca brak `/` i `//`). Drobna sugestia: dodać odrzucenie `\` dla pewności.
- `CHECKOUT_ACCESS_KEY` nie wycieka do klienta (czytany serwerowo przez `process.env`, brak prefiksu `PUBLIC_`).
- Brak hardkodowanych sekretów w `src/` (brak kluczy Stripe/API/haseł). `.env` zawiera tylko `PUBLIC_*` + mock toggles.
- Tokeny nie są logowane.
- `set:html` na JSON-LD i cytatach (`BaseLayout.astro:111`, `zagrozenia-i-mity.astro` itd.) — źródła statyczne, brak user-inputu, XSS nierealny.
- `detectAndExchangeHandoff` (`handoff.ts`): handoff token z URL idzie tylko jako body POST, jest strippowany z URL po wymianie — brak injekcji.
- 401 handling (`http.ts:98-103`): czyści tokeny i redirectuje do portalu tylko gdy token był wysłany — poprawne.
- `encodeURIComponent` stosowany konsekwentnie przy budowaniu URL-i z `orderId`/`token`.

---

## Sugerowana kolejność realizacji

1. SEC-1 (sanityzacja zgód) + SEC-2 (SRI) — dwa realne wektory wykonania obcego JS na stronie z PII i tokenem.
2. SEC-3 (allowlist Stripe) + SEC-4 (Referrer-Policy) — szybkie utwardzenia ścieżki płatności.
3. SEC-5 / SEC-6 — jeśli access gate ma być traktowany jako realna kontrola, a nie tylko zasłona pre-launch.
4. SEC-7, SEC-8, SEC-9 — defense-in-depth.
