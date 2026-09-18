import { useEffect, useMemo, useRef, useState } from 'react';
import type { BillingCycle } from '../../lib/api/types/money';
import type { PlanCatalogEntryDto, SubscriptionStatus } from '../../lib/api/types/catalog';
import type { PlanChangePendingMetadata } from '../../lib/api/types/order';
import { getPlans } from '../../lib/api/catalog';
import { startOrder } from '../../lib/api/orders';
import { setFromStartOrderResponse, clearOrderSession, getOrderSession } from '../../lib/state/order-session';
import { resolvePendingOrder } from '../../lib/state/pending-order';
import { resumeStepPath } from '../../lib/state/checkout-navigation';
import { clearFormState } from '../../lib/state/form-persistence';
import { DraftResumeBanner } from './DraftResumeBanner';
import { ResumeOrDiscardModal } from './ResumeOrDiscardModal';
import { getPartnerFromUrl } from '../../lib/format/partner';
import { getDiscountCodeFromUrl, clearDiscountCode } from '../../lib/format/discount-code';
import { translateApiError } from '../../lib/errors/translate';
import { planToCardProps, buildComparisonGrid, discountAppliesToCycle, discountDrivenBillingCycle, type AuthContext } from '../../lib/catalog/render-policy';
import { ApiError } from '../../lib/api/types/errors';
import { detectAndExchangeHandoff } from '../../lib/auth/handoff';
import { redirectToPortal } from '../../lib/auth/portal-redirect';
import { consumeMockAuthFromUrl } from '../../lib/auth/mock-auth';
import { useAuthSession } from '../../lib/auth/use-auth-session';
import { DiscountBanner } from './DiscountBanner';
import { SubscriptionStatusBanner } from './SubscriptionStatusBanner';
import { PricingCard } from './PricingCard';
import { PricingCardBlock } from './PricingCardBlock';
import { PartnersStrip } from './PartnersStrip';
import { ComparisonGrid } from './comparison/ComparisonGrid';

type State =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      plans: PlanCatalogEntryDto[];
      currentPlanCode?: string;
      subscriptionStatus?: SubscriptionStatus;
      currentBillingCycle?: BillingCycle;
    }
  | { kind: 'error'; title: string; message: string };

// Stała referencja — wchodzi do zależności `useMemo` zanim katalog się wczyta,
// więc nowa tablica przy każdym renderze psułaby memoizację.
const EMPTY_PLANS: PlanCatalogEntryDto[] = [];

/**
 * Auth-aware: klient rozliczany rocznie nie zejdzie na miesięczny w wizardzie — backend
 * takiego zamówienia nie przyjmie. Jedno zdanie obsługuje trzy miejsca: `title` przełącznika
 * w karcie, widoczną notkę pod blokiem kart i komunikat błędu, gdyby mimo to doszło do
 * wywołania `/orders/start`.
 */
const ANNUAL_TO_MONTHLY_BLOCKED = 'Zmiana z rozliczenia rocznego na miesięczne wymaga kontaktu z obsługą.';

export function PricingCards() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('ANNUAL');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [ctaError, setCtaError] = useState<{ title: string; message: string } | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{
    kind: 'draft' | 'resumable';
    orderId: string;
    planName: string;
    resumeHref: string;
  } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ plan: PlanCatalogEntryDto; clickedPlanName: string } | null>(null);
  const authSession = useAuthSession();
  // `null` = klient jeszcze nie wybrał kolumny, więc obowiązuje plan polecany. Wyliczamy to
  // przy renderze (niżej), nie efektem po zamontowaniu: efekt najpierw pokazywał pakiet #1
  // i dopiero potem przeskakiwał na polecany.
  const [mobileIndex, setMobileIndex] = useState<number | null>(null);
  const ctaErrorRef = useRef<HTMLDivElement>(null);

  // Drugie miejsce, z którego klikalny jest CTA, to mini-karty w przyklejonym pasku siatki —
  // kilka tysięcy pikseli pod komunikatem. Bez przewinięcia i focusu błąd („sieć padła",
  // „funkcja niedostępna") byłby dla klikającego tam klienta niewidoczny.
  useEffect(() => {
    if (!ctaError) return;
    const el = ctaErrorRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [ctaError]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      // Resume porzuconej płatności: jeśli w tej sesji jest niedokończone zamówienie,
      // pokazujemy cennik z banerem wznowienia (nie blokujemy — user może dokończyć
      // ALBO zacząć nowe zamówienie). Pomijamy dla auth-aware entry (?handoff= / ?mockAuth=),
      // które ma własną obsługę 409 PLAN_CHANGE_PENDING w onCtaClick.
      const entryParams = new URLSearchParams(window.location.search);
      if (!entryParams.has('handoff') && !entryParams.has('mockAuth')) {
        const resolution = await resolvePendingOrder();
        if (cancelled) return;
        // 'paid' (opłacone/processing) → nie ma czego wybierać, kieruj na status zamówienia.
        if (resolution.kind === 'paid') {
          window.location.assign(`/checkout/success?orderId=${encodeURIComponent(resolution.orderId)}`);
          return;
        }
        if (resolution.kind === 'dead') {
          clearOrderSession();
        }
        // 'resumable' (CONFIRMED + STRIPE, porzucona płatność) → baner „Dokończ płatność"
        // zamiast twardego redirectu na /checkout/resume, żeby cennik był dostępny.
        if (resolution.kind === 'resumable') {
          setPendingOrder({
            kind: 'resumable',
            orderId: resolution.orderId,
            planName: getOrderSession()?.planSnapshot.planName ?? 'Twój plan',
            resumeHref: `/checkout/resume?orderId=${encodeURIComponent(resolution.orderId)}`,
          });
        }
        if (resolution.kind === 'draft') {
          const planName =
            resolution.order.lines[0]?.planName ??
            getOrderSession()?.planSnapshot.planName ??
            'Twój plan';
          setPendingOrder({
            kind: 'draft',
            orderId: resolution.orderId,
            planName,
            resumeHref: `${resumeStepPath(resolution.order.checkoutProgress)}?orderId=${encodeURIComponent(resolution.orderId)}`,
          });
        }
        // 'none' → renderuj cennik normalnie (bez zmian)
      }

      // 0. Dev shortcut — ?mockAuth= w URL ustawia fake auth session (przed handoff detection,
      //    bo handoff i mock-auth używają tych samych session storage keys).
      consumeMockAuthFromUrl();

      // 1. Handoff detection — jeśli portal redirectował z ?handoff=<token>, wymień na JWT.
      const outcome = await detectAndExchangeHandoff();
      if (cancelled) return;
      if (outcome.kind === 'invalid') {
        redirectToPortal('token-invalid');
        return;
      }
      if (outcome.kind === 'user-inactive') {
        redirectToPortal('user-inactive');
        return;
      }
      // 'no-token', 'exchanged', 'error' → fall-through. 'error' = anonymous mode
      // (per BE spec §8: malformed/missing handoff renderuje stronę anonimową).

      // 2. URL discount/partner handling (status quo).
      const params = new URLSearchParams(window.location.search);
      if (!params.has('discountCode')) clearDiscountCode();
      const partnerCode = getPartnerFromUrl() ?? undefined;
      const discountCode = getDiscountCodeFromUrl() ?? undefined;

      // 3. Fetch catalog — http.ts dokleja Authorization gdy session token istnieje.
      try {
        const response = await getPlans(discountCode, partnerCode);
        if (cancelled) return;
        const sorted = [...response.plans].sort((a, b) => a.displayOrder - b.displayOrder);
        // Auto-select toggle na cykl aktualnej subskrypcji (auth-aware) — UX nicety,
        // żeby klient od razu widział kartę CURRENT na właściwym togglem. Ma pierwszeństwo
        // nad zniżką; jeśli brak kontekstu auth, a zniżka wskazuje jeden cykl — zaznacz ten cykl
        // (np. promo tylko na MONTHLY → toggle „Miesięczna"). Inaczej zostaje domyślny 'ANNUAL'.
        const discountCycle = discountDrivenBillingCycle(sorted);
        if (response.currentBillingCycle) {
          setBillingCycle(response.currentBillingCycle);
        } else if (discountCycle) {
          setBillingCycle(discountCycle);
        }
        setState({
          kind: 'ready',
          plans: sorted,
          currentPlanCode: response.currentPlanCode,
          subscriptionStatus: response.subscriptionStatus,
          currentBillingCycle: response.currentBillingCycle,
        });
      } catch (err) {
        if (cancelled) return;
        const t = translateApiError(err);
        setState({ kind: 'error', title: t.title, message: t.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Rozpakowane ze stanu, żeby wejść do zależności `useMemo` jako proste wartości —
  // i żeby oba memo liczyły się przed wczesnymi `return` (hooki muszą lecieć bezwarunkowo).
  const readyPlans = state.kind === 'ready' ? state.plans : EMPTY_PLANS;
  const currentPlanCode = state.kind === 'ready' ? state.currentPlanCode : undefined;
  const subscriptionStatus = state.kind === 'ready' ? state.subscriptionStatus : undefined;
  const currentBillingCycle = state.kind === 'ready' ? state.currentBillingCycle : undefined;

  const authContext = useMemo<AuthContext>(
    () => ({ currentPlanCode, subscriptionStatus, currentBillingCycle }),
    [currentPlanCode, subscriptionStatus, currentBillingCycle],
  );

  // Cała siatka to ~40 wierszy razy 4 pakiety wywołań `resolveCell` plus komplet świeżych
  // obiektów. Bez memo przeliczała się przy KAŻDYM renderze — także przy tapnięciu strzałki
  // na telefonie, przy `ctaError` i przy zmianie `loadingPlanId`, które jej nie dotyczą.
  const comparisonGrid = useMemo(
    () => buildComparisonGrid(readyPlans, billingCycle, authContext),
    [readyPlans, billingCycle, authContext],
  );

  const onCtaClick = (plan: PlanCatalogEntryDto) => {
    // Tryb auth-aware ma własną obsługę 409 — modal tylko dla anonimowego pending order.
    if (pendingOrder && !authSession.hasToken) {
      const plans = state.kind === 'ready' ? state.plans : [plan];
      setPendingPlan({ plan, clickedPlanName: planToCardProps(plan, billingCycle, authContext, plans).title });
      return;
    }
    void proceedStartOrder(plan);
  };

  const proceedStartOrder = async (plan: PlanCatalogEntryDto) => {
    // Pas bezpieczeństwa przy wywołaniu API, nie przy kliknięciu: przełączników cyklu jest
    // teraz tyle, ile kart, a zablokowany cykl wystarczy wyłapać w jednym miejscu — tuż przed
    // `/orders/start`, którego backend i tak by nie przyjął.
    if (currentBillingCycle === 'ANNUAL' && billingCycle === 'MONTHLY') {
      setCtaError({
        title: 'Nie można przejść na rozliczenie miesięczne',
        message: ANNUAL_TO_MONTHLY_BLOCKED,
      });
      return;
    }

    setLoadingPlanId(plan.planId);
    setCtaError(null);

    try {
      // Resolve which value to send as `partnerCode` to /orders/start.
      // WYSIWYG: kod partnerski (z któregokolwiek kanału) doklejamy TYLKO gdy wybrany
      // plan+cykl faktycznie pokazuje tę zniżkę (discountAppliesToCycle). Inaczej — np. kod
      // promocyjny ważny tylko dla MONTHLY, a user wybrał ANNUAL — flow idzie bez zniżki,
      // zamiast wysyłać kod, który BE odrzuci ("requires billing cycle MONTHLY, but order has ANNUAL").
      // - ?partner= URL param — kanoniczny kanał partnerski (traktowany jako partnerCode).
      // - ?discountCode= — preview.kind rozróżnia: PARTNER_* → doklejamy jako partnerCode;
      //     CODE_FLAT → zostaje w sessionStorage i pre-fill'uje input w kroku 4; null → nie doklejamy.
      const partnerFromUrl = getPartnerFromUrl();
      const discountCodeFromUrl = getDiscountCodeFromUrl();
      const previewKind = plan.discount?.kind ?? null;
      const isPartnerKindPreview =
        previewKind === 'PARTNER_FLAT' ||
        previewKind === 'PARTNER_COMPOSITE' ||
        previewKind === 'PARTNER_TIMEBOUND' ||
        previewKind === 'PARTNER_TIMEBOUND_COMPOSITE' ||
        previewKind === 'PARTNER_INTRO_THEN_PERCENT';
      const appliesToCycle = discountAppliesToCycle(plan.discount, billingCycle);

      let partnerCode: string | undefined;
      if (partnerFromUrl && appliesToCycle) {
        partnerCode = partnerFromUrl;
      } else if (discountCodeFromUrl && isPartnerKindPreview && appliesToCycle) {
        partnerCode = discountCodeFromUrl;
        clearDiscountCode();
      }

      const response = await startOrder({
        catalogEntryId: plan.catalogEntryId,
        billingCycle,
        partnerCode,
      });

      // Graceful degradation per spec §6.1: klient z JWT dostał INITIAL_PURCHASE.
      // Sygnał że BE flag PLAN_CHANGE_VIA_WIZARD_ENABLED jest OFF — zatrzymujemy flow
      // żeby nie przepuścić upgrade przez initial-purchase ścieżkę cascade.
      if (authSession.hasToken && response.orderType === 'INITIAL_PURCHASE') {
        setCtaError({
          title: 'Funkcja niedostępna',
          message:
            'Zmiana planu jest w trakcie wdrażania. Spróbuj ponownie później lub skontaktuj się z pomocą techniczną.',
        });
        setLoadingPlanId(null);
        return;
      }

      const plans = state.kind === 'ready' ? state.plans : [plan];
      const cardProps = planToCardProps(plan, billingCycle, authContext, plans);
      const price = billingCycle === 'MONTHLY' ? plan.monthlyPrice : plan.annualPrice;

      setFromStartOrderResponse(response, {
        catalogEntryId: plan.catalogEntryId,
        billingCycle,
        partnerCode,
        plan: {
          planName: cardProps.title,
          priceMinorUnits: price.amount,
          currency: price.currency,
          description: plan.description,
        },
      });

      // wizardEntryStep dictates landing route per spec §5.5.
      const targetStep = response.wizardEntryStep ?? 'company-data';
      window.location.assign(`/checkout/${targetStep}?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (err) {
      // 409 PLAN_CHANGE_PENDING auto-resume per spec §5.7.2 / D6.
      if (err instanceof ApiError && err.code === 'PLAN_CHANGE_PENDING') {
        const meta = err.metadata as PlanChangePendingMetadata | undefined;
        if (meta?.checkoutSessionUrl) {
          // Stripe Checkout session jeszcze żywa — kontynuujemy płatność.
          window.location.href = meta.checkoutSessionUrl;
          return;
        }
        if (meta?.existingOrderId && meta.wizardEntryStep) {
          // Resume — populate session z dostępnych danych. checkoutProgress jest
          // re-fetched przez getOrder() w wizard step, więc prefilledFields nie znamy.
          const plans = state.kind === 'ready' ? state.plans : [plan];
          const cardProps = planToCardProps(plan, billingCycle, authContext, plans);
          const price = billingCycle === 'MONTHLY' ? plan.monthlyPrice : plan.annualPrice;
          setFromStartOrderResponse(
            {
              orderId: meta.existingOrderId,
              wizardEntryStep: meta.wizardEntryStep,
              prefilledFields: [],
              orderType: 'PLAN_UPGRADE', // 409 jest exclusively dla PLAN_UPGRADE per spec OQ6
            },
            {
              catalogEntryId: plan.catalogEntryId,
              billingCycle,
              partnerCode: getPartnerFromUrl() ?? undefined,
              plan: {
                planName: cardProps.title,
                priceMinorUnits: price.amount,
                currency: price.currency,
                description: plan.description,
              },
            },
          );
          window.location.assign(
            `/checkout/${meta.wizardEntryStep}?orderId=${encodeURIComponent(meta.existingOrderId)}`,
          );
          return;
        }
        // Metadata corrupt / niespodziewany shape — fall-through do generic error display.
      }
      const t = translateApiError(err);
      setCtaError({ title: t.title, message: t.message });
      setLoadingPlanId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="py-20 text-center font-['Plus_Jakarta_Sans',sans-serif] text-[#6B6965]" role="status">
        Ładowanie cennika…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-[12px] border border-red-300 bg-red-50 p-6 text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <h3 className="text-lg font-semibold text-red-700">{state.title}</h3>
        <p className="mt-2 text-sm text-red-700">{state.message}</p>
      </div>
    );
  }

  // Resolve discount banner from any plan that exposes partnerName
  const promoterPlan = state.plans.find((p) => p.discount?.partnerName);
  const discountBanner = promoterPlan?.discount?.partnerName
    ? {
        promoterName: promoterPlan.discount.partnerName,
        promoterLogoUrl: promoterPlan.discount.partnerLogoUrl,
        description: promoterPlan.discount.description,
      }
    : null;

  // Auth-aware blokada cyklu. Przełącznik w karcie jest JEDNYM przyciskiem przełączającym,
  // więc podajemy mu cykl DOCELOWY, którego ma nie wpuścić — nie stan, w którym stoi.
  const disabledCycle: BillingCycle | undefined = state.currentBillingCycle === 'ANNUAL' ? 'MONTHLY' : undefined;
  const disabledCycleReason = disabledCycle ? ANNUAL_TO_MONTHLY_BLOCKED : undefined;

  // Kolumna widoczna na telefonie: dopóki klient nie przesunie strzałkami, pokazujemy plan
  // polecany. Wyliczane przy renderze, więc pierwsze malowanie od razu trafia we właściwą
  // kolumnę (efekt po zamontowaniu dawał przeskok z pakietu #1).
  const recommendedIndex = Math.max(
    state.plans.findIndex((p) => p.recommended),
    0,
  );
  const activeMobileIndex = mobileIndex ?? recommendedIndex;

  return (
    <>
      {/* Auth-aware: banner per subscriptionStatus (GRACE/EXPIRED/CANCELLED). */}
      <SubscriptionStatusBanner status={state.subscriptionStatus} />

      {discountBanner && <DiscountBanner {...discountBanner} />}

      {pendingOrder && !pendingPlan && (
        <DraftResumeBanner
          variant={pendingOrder.kind}
          planName={pendingOrder.planName}
          resumeHref={pendingOrder.resumeHref}
          onDiscard={() => {
            // Czyszczenie lokalne. Dla 'resumable' zostawia zamówienie CONFIRMED
            // osierocone na backendzie (świadoma decyzja — patrz design payment-resume).
            clearOrderSession();
            clearFormState();
            setPendingOrder(null);
          }}
        />
      )}

      {/* `tabIndex={-1}` jest po to, żeby dało się tu przestawić focus — komunikat bywa
          kilka ekranów nad przyciskiem klikniętym w siatce porównania. */}
      {ctaError && (
        <div
          ref={ctaErrorRef}
          role="alert"
          tabIndex={-1}
          className="mx-auto mb-8 max-w-md rounded-[12px] border border-red-300 bg-red-50 p-4 text-center font-['Plus_Jakarta_Sans',sans-serif]"
        >
          <h4 className="text-sm font-semibold text-red-700">{ctaError.title}</h4>
          <p className="text-xs text-red-700">{ctaError.message}</p>
        </div>
      )}

      <PricingCardBlock groupLabel="Natychmiastowa pomoc w razie incydentu cyberbezpieczeństwa w każdym pakiecie">
        {state.plans.map((plan) => {
          const props = planToCardProps(plan, billingCycle, authContext, state.plans);
          const isThisLoading = loadingPlanId === plan.planId;
          return (
            <PricingCard
              key={plan.planId}
              {...props}
              ctaText={isThisLoading ? 'Ładowanie…' : props.ctaText}
              ctaDisabled={isThisLoading}
              onSelect={() => onCtaClick(plan)}
              billingCycle={billingCycle}
              onBillingCycleChange={setBillingCycle}
              disabledCycle={disabledCycle}
              disabledReason={disabledCycleReason}
            />
          );
        })}
      </PricingCardBlock>

      {/* Powód blokady cyklu — RAZ pod blokiem kart, nie w każdej z czterech kart. */}
      {disabledCycleReason && (
        <p
          role="note"
          className="mx-auto -mt-14 mb-14 max-w-2xl text-center font-['Plus_Jakarta_Sans',sans-serif] text-[13px] leading-[18px] text-[#6B6965]"
        >
          {disabledCycleReason}
        </p>
      )}

      <PartnersStrip />

      <ComparisonGrid
        grid={comparisonGrid}
        mobileIndex={activeMobileIndex}
        onMobileIndexChange={setMobileIndex}
        onSelectPlan={(code) => {
          const plan = state.plans.find((p) => p.code === code);
          if (plan) onCtaClick(plan);
        }}
        loadingPlanCode={state.plans.find((p) => p.planId === loadingPlanId)?.code ?? null}
      />

      {pendingPlan && pendingOrder && (
        <ResumeOrDiscardModal
          draftPlanName={pendingOrder.planName}
          clickedPlanName={pendingPlan.clickedPlanName}
          onContinueDraft={() => window.location.assign(pendingOrder.resumeHref)}
          onStartNew={() => {
            clearOrderSession();
            clearFormState();
            setPendingPlan(null);
            setPendingOrder(null);
            void proceedStartOrder(pendingPlan.plan);
          }}
          onClose={() => setPendingPlan(null)}
        />
      )}
    </>
  );
}
