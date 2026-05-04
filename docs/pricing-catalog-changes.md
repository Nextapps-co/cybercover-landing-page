# Pricing Catalog — wymagane zmiany po stronie backendu

> **Status:** propozycja do uzgodnienia z backend teamem
> **Data:** 2026-04-30
> **Kontekst:** integracja aktualnego designu cennika (`/cennik`) z istniejącym endpointem `GET /api/pricing-catalog`. Frontend przechodzi na model **catalog-driven UI** (Model 3 — split semantic/presentation).
> **Powiązane dokumenty:**
> - `docs/cc-strona-landing-astro/docs/pricing-catalog-endpoint.md` — obecny kontrakt endpointu (referencja)
> - `docs/cc-strona-landing-astro/docs/checkout-flow.md` — pełny flow zakupowy
> - `src/app/pages/PricingPage.tsx` — aktualny hardcoded UI (źródło wymagań treściowych)

---

## 1. Cel biznesowy

Cennik (`/cennik`) musi być **w pełni sterowany danymi z katalogu produktów**. Konsekwencje:

- **Nowy plan** (np. „Premium" jako 5. tier) → tylko zmiana w katalogu, **zero deploymentu frontendu**.
- **Zmiana wartości feature'a** (np. „Profesjonalny: konsultacje 20 → 25 razy w roku") → tylko zmiana w katalogu.
- **Korekta cen / nowy kod rabatowy / nowa promocja** → tylko zmiana w katalogu (już dziś działa).
- **Refaktor designu kafelka** (kolory, układ, ikony, kolejność sekcji) → tylko zmiana we frontendzie.
- **i18n (np. wersja EN)** → frontend ma templates, backend zwraca semantyczne wartości neutralne językowo (nie stringi UI).

## 2. Decyzja architektoniczna — Model 3 (semantic / presentation split)

| Warstwa | Odpowiedzialność |
|---|---|
| **Backend** (`/api/pricing-catalog`) | **WHAT** — semantyczne fakty: jakie plany istnieją, jakie mają cechy (klucze + wartości), ceny, rabaty, kolejność, czy są polecane |
| **Frontend** (`src/lib/catalog/render-policy.ts`) | **HOW** — prezentacja: ikony sekcji, kolory highlightów per tier, kolejność wyświetlania, templates tekstów (`**{X}x w roku**`), spacery dla wyrównania |

**Mental model:**
> Backend mówi „plan Profesjonalny ma `feature.consultation.timesPerYear=20`".
> Frontend mówi „klucz `feature.consultation.timesPerYear` renderuję w sekcji „Konsultacje z ekspertami" z ikoną `chat`, jako pojedynczy item z tekstem `**{X}x w roku**`, podświetlony żółtym dla planu o `tier='high'`".

## 3. Aktualny stan endpointu (skrót)

`GET /api/pricing-catalog?discountCode=X` zwraca `CatalogPageReadModel[]` z polami:

```ts
{
  catalogEntryId: string;
  planId: string;
  code: 'standard' | 'optimum' | 'professional' | 'expert';
  planName: string;
  description: string;
  displayOrder: number;
  recommended: boolean;
  annualPrice: { amount: number; currency: 'PLN' };
  monthlyPrice: { amount: number; currency: 'PLN' };
  features: Record<string, string>;
  discount: DiscountPreview | null;
}
```

Discount preview obsługuje już 4 kindy (`CODE_FLAT`, `PARTNER_FLAT`, `PARTNER_COMPOSITE`, `PARTNER_TIMEBOUND`) z polami `eligible`, `*PriceAfterDiscount`, `*DiscountAmount`, `promotionalDuration`. **To zostaje bez zmian.**

## 4. Wymagane zmiany — przegląd

| # | Zmiana | Priorytet | Breaking? |
|---|---|---|---|
| 4.1 | Ujednolicenie kontraktu kluczy `features` (lista 30+ semantycznych kluczy) | **must-have** | tak — refaktor seedów + aktualizacja testów |
| 4.2 | Dodanie pola `tier: 'entry' \| 'mid' \| 'high' \| 'top'` na poziomie planu | **must-have** | nie (nowe pole, dodawane addytywnie) |
| 4.3 | Wsparcie `?partnerCode=` (dziś jest tylko `?discountCode=`) | **should-have** | nie (nowy parametr) |
| 4.4 | Dodanie `partnerName` i `partnerLogoUrl` do `DiscountPreview` | **should-have** | nie (pola opcjonalne) |
| 4.5 | Dodanie `ctaLabel` jako osobnego pola (nie w `features`) | **nice-to-have** | nie (pole opcjonalne) |
| 4.6 | Wyrównanie nazewnictwa: `professional` zamiast `Professional` w `planName` (PL: „Profesjonalny") | **must-have** | tak — już dziś w referencji jest „Professional" zamiast „Profesjonalny" |
| 4.7 | Wsparcie billing cycle preview w queryparams (ANNUAL / MONTHLY) — opcjonalne | **nice-to-have** | nie (parametr opcjonalny, default = oba) |

---

## 4.1 Kontrakt kluczy `features` — must-have

### Problem
Dzisiaj `features` to swobodna `Record<string, string>` wyciągana z metadanych `CatalogEntry` po przefiltrowaniu `INFRASTRUCTURE_METADATA_KEYS`. Frontend nie wie z góry **jakich kluczy się spodziewać** — co prowadzi do tego, że albo (a) frontend tworzy własną listę kluczy i robi hardcoded mapping (co tracimy w Modelu 3), albo (b) backend dostarcza dokładnie tyle ile UI potrzebuje (Model 1, ale traci elastyczność).

### Rozwiązanie
Definiujemy **stabilny kontrakt kluczy semantycznych**. Dokumentacja staje się referencją wspólną dla backendu (seed data) i frontendu (render-policy). Każdy klucz ma:
- typ wartości (`'true'` / `'false'` / liczbę / enum / string)
- znaczenie biznesowe
- mapowanie na sekcję UI (po stronie frontendu, nie backendu)

### Zaproponowany zestaw kluczy

> Wszystkie wartości w `features: Record<string, string>` przekazywane jako **stringi** (zgodnie z aktualnym typem). Frontend parsuje na docelowy typ.

#### Sekcja 1 — Ocena bezpieczeństwa
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.securityAssessment.legal` | bool | `'true'` \| nieobecny | Zgodność z prawem |
| `feature.securityAssessment.technical` | bool | `'true'` \| nieobecny | Odporność techniczna |
| `feature.securityAssessment.people` | bool | `'true'` \| nieobecny | Świadomi ludzie (Optimum+) |
| `feature.securityAssessment.report` | enum | `'general'` \| `'detailed'` | Raport ogólny vs szczegółowy |

#### Sekcja 2 — Monitoring zagrożeń
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.monitoring.email` | bool | `'true'` \| nieobecny | Sprawdzanie e-maili i danych osobistych |
| `feature.monitoring.web` | bool | `'true'` \| nieobecny | Monitoring strony www |

#### Sekcja 3 — Konsultacje z ekspertami
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.consultation.timesPerYear` | int \| enum | `'10'`, `'20'`, ... \| `'unlimited'` | Liczba konsultacji rocznie |

#### Sekcja 4 — Natychmiastowa pomoc 24h
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.incidentResponse` | bool | `'true'` \| nieobecny | Włącza całą sekcję (subitemy: koordynacja, prawna, PR — frontend hardcoded jako stała treść tej sekcji) |

#### Sekcja 5 — Ubezpieczenie
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.insurance.coverageAmount` | int (PLN, **nie grosze**) | `'1000000'` itd. | Wysokość ubezpieczenia |
| `feature.insurance.deductible` | int (PLN, **nie grosze**) | `'0'`, `'5000'` itd. | Udział własny |
| `feature.insurance.includesThirdPartyClaims` | bool | `'true'` \| nieobecny | Roszczenia stron trzecich |
| `feature.insurance.includesAdminProceedings` | bool | `'true'` \| nieobecny | Postępowania przed organami nadzoru |
| `feature.insurance.includesGdprFines` | bool | `'true'` \| nieobecny | Kary administracyjne RODO |
| `feature.insurance.includesRansomCosts` | bool | `'true'` \| nieobecny | Koszty okupu i wymuszeń |
| `feature.insurance.includesLostProfit` | bool | `'true'` \| nieobecny | Utracony zysk (Profesjonalny+) |

#### Sekcja 6 — Szkolenia bezpieczeństwa
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.training.online.timesPerYear` | int | `'2'` itd. | Liczba szkoleń online rocznie |
| `feature.training.vipTraining` | bool | `'true'` \| nieobecny | Szkolenia VIP dla kadry zarządzającej (rezerwa na przyszłość) |

#### Sekcja 7 — Wielodostęp
| Klucz | Typ | Wartości | Notatka |
|---|---|---|---|
| `feature.multiUser.accountSwitching` | bool | `'true'` \| nieobecny | Przełączanie się między kontami |
| `feature.multiUser.partnerDataView` | bool | `'true'` \| nieobecny | Wgląd w dane i konfigurację partnerów |

### Mapowanie obecnych planów

| Klucz | Standard | Optimum | Profesjonalny | Ekspert |
|---|---|---|---|---|
| `feature.securityAssessment.legal` | ✅ | ✅ | ✅ | ✅ |
| `feature.securityAssessment.technical` | ✅ | ✅ | ✅ | ✅ |
| `feature.securityAssessment.people` | — | ✅ | ✅ | ✅ |
| `feature.securityAssessment.report` | `general` | `detailed` | `detailed` | `detailed` |
| `feature.monitoring.email` | ✅ | ✅ | ✅ | ✅ |
| `feature.monitoring.web` | ✅ | ✅ | ✅ | ✅ |
| `feature.consultation.timesPerYear` | — | `10` | `20` | `unlimited` |
| `feature.incidentResponse` | — | ✅ | ✅ | ✅ |
| `feature.insurance.coverageAmount` | — | `1000000` | `2500000` | `5000000` |
| `feature.insurance.deductible` | — | `5000` | `0` | `0` |
| `feature.insurance.includesThirdPartyClaims` | — | ✅ | ✅ | ✅ |
| `feature.insurance.includesAdminProceedings` | — | ✅ | ✅ | ✅ |
| `feature.insurance.includesGdprFines` | — | ✅ | ✅ | ✅ |
| `feature.insurance.includesRansomCosts` | — | ✅ | ✅ | ✅ |
| `feature.insurance.includesLostProfit` | — | — | ✅ | ✅ |
| `feature.training.online.timesPerYear` | — | — | `2` | `2` |
| `feature.multiUser.accountSwitching` | — | — | — | ✅ |
| `feature.multiUser.partnerDataView` | — | — | — | ✅ |

### Konsekwencje dla backendu

1. **Migracja seedów** (`seed-data.service.ts` lub plik z definicjami planów) — stara lista kluczy zostaje zastąpiona nową, dla każdego planu wpisujemy odpowiednie wartości.
2. **Aktualizacja testów** — `get-pricing-catalog.handler.spec.ts` powinien asercjonować obecność oczekiwanych kluczy per plan.
3. **Filtrowanie infrastruktury** — `INFRASTRUCTURE_METADATA_KEYS` dalej filtruje pricingComponentId, tier, insurerId, recommended (tier dostaje teraz osobne pole, p. 4.2).
4. **Dokument kontraktu** — ten plik staje się **single source of truth** dla nazw i znaczeń kluczy. Zmiana / dodanie klucza wymaga aktualizacji tu + we frontendowym `render-policy.ts`.

---

## 4.2 Pole `tier` na poziomie planu — must-have

### Problem
Frontend potrzebuje sterować **kolorem highlightów** w wyróżnionych itemach per plan:
- Optimum → highlight `'blue'` (`#EDF8FF`)
- Profesjonalny → highlight `'yellow'` (`#FEFFE0`)
- Ekspert → highlight `'red'` (`#FBEAEA`)
- Standard → bez highlightów

Dziś frontend mógłby to wywodzić z `code` (`'standard'/'optimum'/...`), ale to wiąże logikę prezentacyjną z konkretnymi nazwami planów. Lepszy abstrakt: **tier**.

### Rozwiązanie
Dodać do `CatalogPageReadModel`:

```ts
tier: 'entry' | 'mid' | 'high' | 'top';
```

Mapowanie dla obecnych planów: Standard → `entry`, Optimum → `mid`, Profesjonalny → `high`, Ekspert → `top`.

### Konsekwencje dla backendu
- Pole pochodzi z metadanych `CatalogEntry` (lub z konfiguracji Plan aggregate'u). Aktualnie w referencji jest pole `tier` w `INFRASTRUCTURE_METADATA_KEYS` które filtruje się z `features` — wystarczy je **wyciągnąć osobno do read modelu** zamiast filtrować.
- Brak breaking change — to addytywne pole.

### Konsekwencje dla frontendu
- `lib/catalog/render-policy.ts` ma stałą `TIER_HIGHLIGHT: Record<PlanTier, 'yellow'|'blue'|'red'|null>`.
- Dodanie 5. planu z `tier='top'` będzie współdzielić styl z Ekspertem; dodanie nowego tieru wymaga rozszerzenia mapy.

---

## 4.3 Wsparcie `?partnerCode=` — should-have

### Problem
Aktualnie endpoint przyjmuje tylko `?discountCode=`. Frontend referencyjny obsługuje **dwa kanały** atrybucji:
- `?partner=VALVETECH` w URL → kanał partnerski (atrybucja w `Order._discountSource = PARTNER`)
- `?discountCode=VALVETECH` w URL → kanał generyczny (preview tylko)

Logika w `PricingCards.tsx` (referencja) rozpoznaje czy `discountCode` ma kind `PARTNER_*` i wtedy przekazuje go jako `partnerCode` do `POST /orders/start` — to działa. Ale **w fazie podglądu** (cennik) endpoint katalogu i tak dostaje to samo pod nazwą `discountCode`.

### Rozwiązanie
Dodać opcjonalny parametr `?partnerCode=` do `GET /api/pricing-catalog`. Logika:
- `?partnerCode=X` → backend traktuje X jako kod partnerski, ewaluuje go po stronie planów (jak dziś `discountCode`), zwraca `discount` z odpowiednim `kind: 'PARTNER_*'`. Dodatkowo zwraca `partnerName` / `partnerLogoUrl` (p. 4.4).
- `?discountCode=X` → bez zmian (jak dziś).
- Oba parametry naraz → `partnerCode` ma pierwszeństwo (lub błąd 400 — do uzgodnienia; sugeruję pierwszeństwo + warning w response).

### Konsekwencje
- `GetPricingCatalogQuery` przyjmuje dodatkowy `partnerCode?: string`.
- Handler ewaluuje zniżkę z odpowiednim flagiem źródła (do telemetrii) — **nie zmienia** sposobu kalkulacji ceny per plan.
- Frontend deeplinku `https://cybercover.pl/cennik?partner=VALVETECH` w czystej formie idzie jako `partnerCode` do API.

---

## 4.4 Pola `partnerName` i `partnerLogoUrl` w `DiscountPreview` — should-have

### Problem
Aktualny design cennika pokazuje pasek nad kafelkami:

> _„Rabat **5%** na wszystkie plany od **ValveTech**"_ + logo ValveTech

Tekst i logo są dziś hardcoded we frontendzie, podpięte pod toggle w UI (rabat partner / standard / combined). W modelu data-driven musi to przyjść z backendu.

### Rozwiązanie
Rozszerzyć `DiscountPreview`:

```ts
{
  // ... istniejące pola ...
  partnerName: string | null;       // np. "ValveTech" (null gdy kind === 'CODE_FLAT')
  partnerLogoUrl: string | null;    // np. "https://cdn.cybercover.pl/partners/valvetech.svg"
}
```

### Konsekwencje
- Discount aggregate dostaje opcjonalne metadane `partnerName` i `partnerLogoUrl`. Dla `kind === 'CODE_FLAT'` oba są null.
- Asset hosting — logo partnerów żyje gdzieś w CDN, frontend tylko odczytuje URL.

---

## 4.5 `ctaLabel` jako osobne pole — nice-to-have

### Problem
Referencja używa `plan.features.ctaLabel` jako CTA tekstu (np. „Wybierz Optimum"). To jest wartość prezentacyjna (nie semantyczna cecha planu) i nie powinna być w `features`.

### Rozwiązanie
Dodać do `CatalogPageReadModel`:

```ts
ctaLabel: string;   // np. "Wybierz Optimum", "Rozpocznij ze Standard"
```

I wycofać klucz `ctaLabel` z `features` (lub zostawić oba dla wstecznej kompatybilności, frontend preferuje pole top-level).

### Konsekwencje
- Pole pochodzi z metadanych `CatalogEntry`.
- Niski priorytet — można obejść po stronie frontendu (czytać `features.ctaLabel` jak dziś referencja). Ale czysto pojęciowo lepiej osobno.

---

## 4.6 Polskie nazwy planów w `planName` — must-have

### Problem
Aktualny seed backendu ma `planName: 'Professional'` (angielsko), a UI pokazuje „Profesjonalny" (polsko). Referencja również ma „Standard | Optimum | Professional | Expert" w `planName`.

### Rozwiązanie
Ustalić **język `planName`**:
- **Opcja A (preferowana):** `planName` jest **w języku interfejsu** — dla pl-PL: „Standard | Optimum | Profesjonalny | Ekspert". Wymaga to wsparcia i18n na poziomie endpointu (header `Accept-Language` lub query `?locale=`).
- **Opcja B:** `planName` zawsze po angielsku (jak dziś), frontend tłumaczy lokalnie. Plus: prostota. Minus: tracimy „dane backendu jako źródło prawdy".

**Sugestia:** zaczynamy od **Opcji B** (prosta), z planem migracji do A gdy dochodzi i18n. W praktyce: backend zwraca `'Professional'`, frontend ma mapę `{'Professional': 'Profesjonalny'}` w `render-policy.ts`. To jest jedyne miejsce gdzie frontend ma „twardą wiedzę" o nazwach planów — uznajemy to za akceptowalną cenę.

### Konsekwencje
- Decyzja do zatwierdzenia z product/biznesem.
- Jeśli A: dodać i18n na poziomie `CatalogEntry.metadata` (np. `planName.pl`, `planName.en`).
- Jeśli B: **żadne zmiany backendowe**, frontend ma mapping.

---

## 4.7 Billing cycle preview parameter — nice-to-have

### Problem
Endpoint zwraca obie ceny (`monthlyPrice`, `annualPrice`). Frontend przełącza widok lokalnie. To działa dobrze.

### Rozwiązanie (opcjonalne)
Możliwość zawężenia response do jednego cyklu via `?billingCycle=ANNUAL|MONTHLY` jeśli kiedykolwiek będzie potrzeba zmniejszenia payloadu.

**Decyzja:** odkładamy. Aktualne 2 ceny per plan × 4 plany = 8 obiektów `MoneyDto` w response — payload jest minimalny.

---

## 5. Kontrakt finalny — `CatalogPageReadModel` po zmianach

```ts
interface CatalogPageReadModel {
  // ── Identyfikacja (bez zmian) ──────────────────────────────────
  catalogEntryId: string;
  planId: string;
  code: 'standard' | 'optimum' | 'professional' | 'expert';

  // ── Treść (planName, description bez zmian; tier nowy; ctaLabel nowy) ─
  planName: string;                   // EN dla teraz, p. 4.6
  description: string;
  displayOrder: number;
  recommended: boolean;
  tier: 'entry' | 'mid' | 'high' | 'top';   // ← NOWE (4.2)
  ctaLabel: string;                   // ← NOWE, opcjonalne fallback do features.ctaLabel (4.5)

  // ── Ceny (bez zmian) ───────────────────────────────────────────
  annualPrice:  { amount: number; currency: 'PLN' };
  monthlyPrice: { amount: number; currency: 'PLN' };

  // ── Features — ujednolicony kontrakt kluczy (4.1) ─────────────
  features: Record<string, string>;   // klucze z sekcji 4.1, tabela kontraktu

  // ── Discount preview (rozszerzone partnerName/partnerLogoUrl) ─
  discount: DiscountPreview | null;
}

interface DiscountPreview {
  // ── Bez zmian ──────────────────────────────────────────────────
  code: string;
  description: string;
  kind: 'CODE_FLAT' | 'PARTNER_FLAT' | 'PARTNER_COMPOSITE' | 'PARTNER_TIMEBOUND';
  eligible: boolean;
  annualPriceAfterDiscount:  MoneyDto | null;
  monthlyPriceAfterDiscount: MoneyDto | null;
  annualDiscountAmount:      MoneyDto | null;
  monthlyDiscountAmount:     MoneyDto | null;
  promotionalDuration: { months: number; applicableBillingCycle: 'MONTHLY' } | null;

  // ── NOWE (4.4) ────────────────────────────────────────────────
  partnerName:    string | null;      // null gdy kind === 'CODE_FLAT'
  partnerLogoUrl: string | null;
}
```

### Query params

```
GET /api/pricing-catalog
  ?discountCode=SUMMER10        // (bez zmian)
  ?partnerCode=VALVETECH        // ← NOWE (4.3)
```

---

## 6. Plan wdrożenia (sugerowane fazy)

### Faza 1 — kontrakt kluczy + tier (must-have, blokuje frontend)
- Migracja seedów planów do nowych kluczy `feature.*` (4.1)
- Dodanie pola `tier` do read modelu (4.2)
- Aktualizacja `get-pricing-catalog.handler.spec.ts` — asercje na obecność kluczy
- Dokumentacja: ten plik staje się referencją dla frontendu

### Faza 2 — partner attribution (should-have)
- Wsparcie `?partnerCode=` w queryparams (4.3)
- Pola `partnerName` / `partnerLogoUrl` w `DiscountPreview` + asset upload do CDN (4.4)
- Aktualizacja seedów discountów: dla każdego `PARTNER_*` discountu uzupełnić `partnerName` i `partnerLogoUrl`

### Faza 3 — czystki i polerowanie (nice-to-have)
- `ctaLabel` jako osobne pole (4.5)
- Decyzja i18n `planName` (4.6)

**Estymacja:** Faza 1 — kontrakt jest precyzyjny, więc to głównie praca migracyjna seedów + testy. Fazy 2-3 — mniejsze, można robić wsadowo.

## 7. Przykładowe response po zmianach

`GET /api/pricing-catalog?partnerCode=VALVETECH`

```json
[
  {
    "catalogEntryId": "CATALOG-...",
    "planId": "...",
    "code": "standard",
    "planName": "Standard",
    "description": "Podstawowa ochrona dla małych firm...",
    "displayOrder": 1,
    "recommended": false,
    "tier": "entry",
    "ctaLabel": "Rozpocznij ze Standard",
    "annualPrice":  { "amount": 29500, "currency": "PLN" },
    "monthlyPrice": { "amount": 35400, "currency": "PLN" },
    "features": {
      "feature.securityAssessment.legal": "true",
      "feature.securityAssessment.technical": "true",
      "feature.securityAssessment.report": "general",
      "feature.monitoring.email": "true",
      "feature.monitoring.web": "true"
    },
    "discount": {
      "code": "VALVETECH",
      "description": "Rabat partnerski ValveTech 5%",
      "kind": "PARTNER_FLAT",
      "eligible": true,
      "annualPriceAfterDiscount":  { "amount": 28025, "currency": "PLN" },
      "monthlyPriceAfterDiscount": { "amount": 33630, "currency": "PLN" },
      "annualDiscountAmount":      { "amount": 1475, "currency": "PLN" },
      "monthlyDiscountAmount":     { "amount": 1770, "currency": "PLN" },
      "promotionalDuration": null,
      "partnerName": "ValveTech",
      "partnerLogoUrl": "https://cdn.cybercover.pl/partners/valvetech.svg"
    }
  },
  {
    "catalogEntryId": "CATALOG-...",
    "planId": "...",
    "code": "optimum",
    "planName": "Optimum",
    "description": "Kompletna ochrona z pomocą 24/7 i ubezpieczeniem...",
    "displayOrder": 2,
    "recommended": true,
    "tier": "mid",
    "ctaLabel": "Wybierz Optimum",
    "annualPrice":  { "amount": 49500, "currency": "PLN" },
    "monthlyPrice": { "amount": 59400, "currency": "PLN" },
    "features": {
      "feature.securityAssessment.legal": "true",
      "feature.securityAssessment.technical": "true",
      "feature.securityAssessment.people": "true",
      "feature.securityAssessment.report": "detailed",
      "feature.monitoring.email": "true",
      "feature.monitoring.web": "true",
      "feature.consultation.timesPerYear": "10",
      "feature.incidentResponse": "true",
      "feature.insurance.coverageAmount": "1000000",
      "feature.insurance.deductible": "5000",
      "feature.insurance.includesThirdPartyClaims": "true",
      "feature.insurance.includesAdminProceedings": "true",
      "feature.insurance.includesGdprFines": "true",
      "feature.insurance.includesRansomCosts": "true"
    },
    "discount": {
      "code": "VALVETECH",
      "description": "Rabat partnerski ValveTech 5%",
      "kind": "PARTNER_FLAT",
      "eligible": true,
      "annualPriceAfterDiscount":  { "amount": 47025, "currency": "PLN" },
      "monthlyPriceAfterDiscount": { "amount": 56430, "currency": "PLN" },
      "annualDiscountAmount":      { "amount": 2475, "currency": "PLN" },
      "monthlyDiscountAmount":     { "amount": 2970, "currency": "PLN" },
      "promotionalDuration": null,
      "partnerName": "ValveTech",
      "partnerLogoUrl": "https://cdn.cybercover.pl/partners/valvetech.svg"
    }
  }
  // ... professional, expert
]
```

---

## 8. Checklist akceptacyjna dla backend teamu

Przed mergem zmian, sprawdzić:

- [ ] **4.1** — `get-pricing-catalog.handler.spec.ts` ma asercje na obecność dokładnie zdefiniowanych kluczy `feature.*` per plan (zgodnie z tabelą mapowania w 4.1).
- [ ] **4.1** — żaden plan nie zwraca kluczy spoza zdefiniowanego kontraktu (filtry infrastruktury obejmują nowe klucze niesemantyczne, jeśli istnieją).
- [ ] **4.2** — `tier` jest zwracany dla każdego planu, nie ma go w `features`.
- [ ] **4.3** — `?partnerCode=VALVETECH` zwraca te same wyniki cenowe co `?discountCode=VALVETECH` (ale z `partnerName` / `partnerLogoUrl` set).
- [ ] **4.4** — dla `kind === 'CODE_FLAT'` (`SUMMER10`), `partnerName` i `partnerLogoUrl` są `null`.
- [ ] **4.4** — assety logo partnerów są dostępne pod URL-em z `partnerLogoUrl` (HTTP 200, content-type `image/svg+xml` lub `image/*`).
- [ ] Endpoint dalej `AuthType.None` (publiczny, bez nagłówka `Authorization`).
- [ ] Sortowanie po `displayOrder` zachowane.
- [ ] Performance: response time < 200ms na localhost (jak dziś).
- [ ] Dokumentacja `pricing-catalog-endpoint.md` zaktualizowana o nowe pola.

---

## 9. Pytania otwarte

1. **`planName` — i18n czy hardcoded EN?** — sugeruję EN + mapping we frontendzie (Opcja B w 4.6); pytanie do biznesu.
2. **`partnerLogoUrl` hosting** — gdzie hostujemy assety? CDN cybercover.pl? S3 z aliasem? Backend team decyduje.
3. **`partnerCode` vs `discountCode` priorytet** — gdy oba podane w URL, który ma pierwszeństwo? Sugeruję `partnerCode`, ale do uzgodnienia.
4. **Inne kanały atrybucji** — czy będą kiedyś `affiliateCode`, `referralCode` itp.? Jeśli tak, warto teraz zaprojektować generic `?attributionCode=` zamiast nazwanego `?partnerCode=`. Decyzja produktowa.
5. **Klucze `feature.*` jako enum w typach TS** — czy backend chce eksportować union type `FeatureKey` jako część contract package'u (do importu we frontendzie via shared-types)? Mile widziane, ale opcjonalne.
