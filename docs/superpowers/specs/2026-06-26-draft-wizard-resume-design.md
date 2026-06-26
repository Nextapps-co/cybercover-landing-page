# Wznawianie niedokończonego wizardu (DRAFT) — design

**Data:** 2026-06-26
**Status:** Zaakceptowany do implementacji
**Zakres:** Frontend only (zero zmian backendu)
**Powiązane:** rozszerza `2026-06-26-payment-resume-design.md` (resume płatności CONFIRMED). Ten dokument dotyczy zamówień w stanie `DRAFT` (wizard rozpoczęty, niedokończony).

## Problem

Anonimowy użytkownik rozpoczyna zakup (wybiera plan → `startOrder` tworzy `DRAFT`), wypełnia część wizardu (np. dane firmy) i wychodzi. Po powrocie na `/cennik`:
- nic nie sygnalizuje, że ma niedokończone zamówienie,
- kliknięcie planu tworzy **nowe** zamówienie, osierocając poprzedni `DRAFT` (utrata wpisanych danych).

Dodatkowo `OrderSession` (wskaźnik `orderId`) żyje w `sessionStorage`, więc **znika po zamknięciu karty** — wznowienie nie zadziała nawet dla resume płatności z poprzedniego feature'u.

## Cel

Umożliwić anonimowemu użytkownikowi wznowienie niedokończonego wizardu (`DRAFT`) po powrocie na `/cennik`, w tym po zamknięciu i ponownym otwarciu przeglądarki na tym samym urządzeniu.

## Decyzje (z brainstormingu)

| Pytanie | Decyzja |
|---|---|
| Trwałość wskaźnika zamówienia | `localStorage` (przetrwa zamknięcie karty), TTL 7 dni |
| Co user widzi na `/cennik` przy DRAFT | banner „dokończ zamówienie" z [Dokończ] [Odrzuć], user zostaje na cenniku |
| Dokąd kieruje „Dokończ" | pierwszy niewypełniony krok (z `checkoutProgress`); wszystkie gotowe → `/checkout/confirm` |
| Klik CTA planu przy istniejącym DRAFT | modal potwierdzenia (Dokończ / Zacznij nowe) |
| Backend | bez zmian |

## Zakres — co JEST i czego NIE MA

**JEST:**
- Migracja `OrderSession` z `sessionStorage` do `localStorage` + wygasanie po TTL.
- Banner na `/cennik` dla `DRAFT` (anonimowy flow).
- Modal przy kliknięciu CTA planu, gdy istnieje `DRAFT`.
- Helper `resumeStepPath(progress)` — jedno miejsce liczenia kroku powrotu.

**NIE MA (poza zakresem):**
- Wznawiania DRAFT w trybie auth-aware (`?handoff=`/`?mockAuth=`) — ma własną obsługę `409 PLAN_CHANGE_PENDING`; banner/modal celowo pomijane w tym trybie.
- Backendowego anulowania DRAFT przy „Odrzuć"/„Zacznij nowe" (tylko czyszczenie lokalne; osierocony DRAFT serwer może GC-ować).
- Wznawiania przez e-mail / inne urządzenie (wymaga BE).
- Przenoszenia form-draftów (`cybercover:form-state:*`) do `localStorage` — zostają w `sessionStorage` (ulotne, niewysłane klawiszowanie; wysłane dane są na serwerze i re-hydratowane przez `getOrder`).

## Architektura (Podejście A)

### 1. Migracja storage — `src/lib/state/order-session.ts`

- Zamień wszystkie `window.sessionStorage` → `window.localStorage` (3 miejsca: `loadFromStorage`, `persistToStorage`, `clearSession`).
- Dodaj stałą `export const ORDER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;` (7 dni).
- W `loadFromStorage()` po pomyślnym `isValidSession`: jeśli `createdAt` jest parsowalny i `Date.now() - Date.parse(session.createdAt) > ORDER_SESSION_TTL_MS` → `clearSession()` + zwróć `null`. Gdy `createdAt` nieparsowalny (NaN) → nie wygaszaj (traktuj jak ważny — nie psujemy istniejących wpisów).
- Form-persistence (`form-persistence.ts`) bez zmian (`sessionStorage`).

> Efekt uboczny (pożądany): `resolvePendingOrder` z poprzedniego feature'u zaczyna działać po zamknięciu karty (resume płatności CONFIRMED również).

### 2. Helper kroku powrotu — `src/lib/state/checkout-navigation.ts`

Nowa czysta funkcja:

```ts
export function resumeStepPath(progress: CheckoutProgressDto): string {
  if (!progress.hasCompanyData) return '/checkout/company-data';
  if (!progress.hasPersonalData) return '/checkout/personal-data';
  if (!progress.hasOperationalStandards) return '/checkout/operational-standards';
  if (!progress.hasPaymentMethod) return '/checkout/payment-method';
  return '/checkout/confirm';
}
```

> OS-skip (plany bez `InsuranceCoverage`, np. Standard): jeśli serwer raportuje `hasOperationalStandards: true` dla takich planów, helper sam pominie ten krok. Jeśli skieruje na `/checkout/operational-standards`, istniejący auto-skip tego kroku przeniesie dalej. Helper używa flag `checkoutProgress` wprost — bez dodatkowej logiki OS.

### 3. Rozszerzenie resolvera — `src/lib/state/pending-order.ts`

`PendingOrderResolution` dla `kind: 'draft'` niesie też pobrany `order`:

```ts
export type PendingOrderResolution =
  | { kind: 'none' }
  | { kind: 'resumable' | 'paid' | 'dead'; orderId: string }
  | { kind: 'draft'; orderId: string; order: OrderResponseDto };
```

W `resolvePendingOrder()`: gdy `classifyOrder(order) === 'draft'` zwróć `{ kind: 'draft', orderId: order.orderId, order }`; pozostałe kindy bez zmian (`{ kind, orderId }`). `classifyOrder` bez zmian.

### 4. Banner — `src/components/pricing/DraftResumeBanner.tsx` (nowy)

Props:
```ts
{ planName: string; resumeHref: string; onDiscard: () => void }
```
Render: pasek u góry siatki cennika (PL, prosto):
- Tekst: „Masz niedokończone zamówienie planu **{planName}**. Możesz je dokończyć albo zacząć od nowa."
- Przycisk primary: „Dokończ zamówienie" → `<a href={resumeHref}>`
- Przycisk secondary: „Odrzuć" → `onClick={onDiscard}`

### 5. Modal — `src/components/pricing/ResumeOrDiscardModal.tsx` (nowy)

Props:
```ts
{
  draftPlanName: string;
  clickedPlanName: string;
  onContinueDraft: () => void;
  onStartNew: () => void;
  onClose: () => void;
}
```
Render: accessible modal (`role="dialog"`, `aria-modal="true"`, backdrop `fixed inset-0`, Escape/backdrop → `onClose`):
- Gdy `draftPlanName === clickedPlanName`: nagłówek „Masz już rozpoczęte zamówienie tego planu", tekst zachęcający do dokończenia.
- Gdy różne: nagłówek „Masz rozpoczęte zamówienie planu {draftPlanName}", tekst „Chcesz je dokończyć, czy zacząć nowe zamówienie planu {clickedPlanName}? Rozpoczęcie nowego porzuci poprzednie."
- Przyciski: „Dokończ rozpoczęte" → `onContinueDraft`; „Zacznij nowe" → `onStartNew`.

### 6. Integracja — `src/components/pricing/PricingCards.tsx`

**Stan:** dodaj
```ts
const [draft, setDraft] = useState<{ orderId: string; planName: string; resumeHref: string } | null>(null);
const [pendingPlan, setPendingPlan] = useState<{ plan: PlanCatalogEntryDto; clickedPlanName: string } | null>(null);
```

**Mount (rozszerzenie istniejącego bloku detekcji):** w bloku `if (!entryParams.has('handoff') && !entryParams.has('mockAuth'))`, po obecnych gałęziach `resumable`/`paid`/`dead`, dodaj obsługę `draft`:
```ts
if (pending.kind === 'draft') {
  const planName = pending.order.lines[0]?.planName ?? getOrderSession()?.planSnapshot.planName ?? 'Twój plan';
  setDraft({
    orderId: pending.orderId,
    planName,
    resumeHref: `${resumeStepPath(pending.order.checkoutProgress)}?orderId=${encodeURIComponent(pending.orderId)}`,
  });
}
// 'none' → bez zmian; cennik renderuje się normalnie
```
(Import `resumeStepPath` z `checkout-navigation`, `getOrderSession` z `order-session`.)

**Refaktor `onCtaClick`:** wydziel obecne ciało (od `setLoadingPlanId` po `catch`) do `proceedStartOrder(plan: PlanCatalogEntryDto)`. Nowe `onCtaClick`:
```ts
const onCtaClick = (plan: PlanCatalogEntryDto) => {
  // Tryb auth-aware ma własną obsługę 409 — modal/banner tylko dla anonimowego DRAFT.
  if (draft && !authSession.hasToken) {
    const authContext = state.kind === 'ready' ? { currentPlanCode: state.currentPlanCode, subscriptionStatus: state.subscriptionStatus, currentBillingCycle: state.currentBillingCycle } : undefined;
    setPendingPlan({ plan, clickedPlanName: planToCardProps(plan, billingCycle, authContext).title });
    return;
  }
  void proceedStartOrder(plan);
};
```

**Render modala** gdy `pendingPlan && draft`:
```tsx
<ResumeOrDiscardModal
  draftPlanName={draft.planName}
  clickedPlanName={pendingPlan.clickedPlanName}
  onContinueDraft={() => window.location.assign(draft.resumeHref)}
  onStartNew={() => { clearOrderSession(); clearFormState(); setPendingPlan(null); setDraft(null); void proceedStartOrder(pendingPlan.plan); }}
  onClose={() => setPendingPlan(null)}
/>
```

**Render bannera** w widoku `ready` (nad siatką kart) gdy `draft && !pendingPlan`:
```tsx
<DraftResumeBanner
  planName={draft.planName}
  resumeHref={draft.resumeHref}
  onDiscard={() => { clearOrderSession(); clearFormState(); setDraft(null); }}
/>
```
(Import `clearOrderSession`, `clearFormState`.)

## Przepływ danych

```
/cennik mount → resolvePendingOrder()
  ├─ draft  → setDraft(...) → render <DraftResumeBanner> (zostań na cenniku)
  ├─ resumable/paid → redirect (poprzedni feature, bez zmian)
  └─ none/dead → cennik normalny

klik CTA planu:
  ├─ draft && !hasToken → setPendingPlan → <ResumeOrDiscardModal>
  │     ├─ Dokończ rozpoczęte → assign(draft.resumeHref)
  │     └─ Zacznij nowe → clearOrderSession+clearFormState → proceedStartOrder(clicked)
  └─ brak draft (lub auth) → proceedStartOrder(clicked) [jak dziś]

banner „Odrzuć" → clearOrderSession+clearFormState → setDraft(null) → cennik normalny
```

## Obsługa stanów brzegowych

- **DRAFT, ale `ORDER_NOT_FOUND`** (serwer GC-ował) → `resolvePendingOrder` zwraca `none` + `clearOrderSession()` → brak bannera.
- **Wpis przeterminowany (TTL 7 dni)** → `loadFromStorage` zwraca `null` + czyści → `resolvePendingOrder` `none`.
- **`createdAt` nieparsowalny** → nie wygaszamy (wpis traktowany jak ważny).
- **Po dokończeniu zakupu** → `SuccessStatus` woła `clearOrderSession()` (już istnieje) → wskaźnik znika z `localStorage`.
- **Auth-aware (`?handoff=`/`?mockAuth=`)** → detekcja draftu pominięta (blok `!handoff && !mockAuth`); `onCtaClick` modal pominięty (`!authSession.hasToken`).
- **Plan klikniętego = plan draftu** → modal z wariantem „tego samego planu".

## Komponenty i pliki

| Plik | Zmiana |
|---|---|
| `src/lib/state/order-session.ts` | `sessionStorage`→`localStorage`; `ORDER_SESSION_TTL_MS`; wygasanie w `loadFromStorage` |
| `src/lib/state/order-session.test.ts` | przepisać na `localStorage`; testy TTL |
| `src/lib/state/checkout-navigation.ts` | **nowa** `resumeStepPath(progress)` |
| `src/lib/state/checkout-navigation.test.ts` | testy `resumeStepPath` |
| `src/lib/state/pending-order.ts` | `draft` resolution niesie `order` |
| `src/lib/state/pending-order.test.ts` | asercja `ORDER_NOT_FOUND` → `localStorage`; test `draft` niesie `order` |
| `src/components/pricing/DraftResumeBanner.tsx` | **nowy** |
| `src/components/pricing/ResumeOrDiscardModal.tsx` | **nowy** |
| `src/components/pricing/PricingCards.tsx` | stan draft/pendingPlan; detekcja draft na mount; refaktor `onCtaClick` → `proceedStartOrder`; render bannera + modala |

## Testowanie (vitest, tylko `src/lib/`)

- `order-session.test.ts` — round-trip na `localStorage`; wpis przeterminowany (`createdAt` > 7 dni temu) → `loadFromStorage` `null` i wpis wyczyszczony; `createdAt` świeży → zwraca sesję; `createdAt` nieparsowalny → zwraca sesję (nie wygasza).
- `checkout-navigation.test.ts` — `resumeStepPath`: brak company → company-data; company → personal-data; +personal → operational-standards; +OS → payment-method; wszystko → `/checkout/confirm`.
- `pending-order.test.ts` — `ORDER_NOT_FOUND` czyści `localStorage` (zmiana z sessionStorage); `draft` order → `{ kind:'draft', orderId, order }` z dołączonym `order`.
- `DraftResumeBanner` / `ResumeOrDiscardModal` / `PricingCards` — bez testów jednostkowych (konwencja repo, brak `@vitejs/plugin-react`); weryfikacja manualna z `PUBLIC_USE_MOCK_ORDERS=true`.

## Język / treści (PL, prosto)

- Banner: „Masz niedokończone zamówienie planu {plan}. Możesz je dokończyć albo zacząć od nowa." · „Dokończ zamówienie" · „Odrzuć"
- Modal: „Masz rozpoczęte zamówienie planu {plan}." · „Dokończ rozpoczęte" · „Zacznij nowe"

## Otwarte kwestie

- TTL 7 dni — wartość do akceptacji (łatwa do zmiany, stała w jednym miejscu).
- „Odrzuć"/„Zacznij nowe" zostawiają osierocony DRAFT na BE (świadomie, zgodnie z decyzją „tylko czyszczenie lokalne"). Jeśli BE doda endpoint anulowania, można podpiąć później.
