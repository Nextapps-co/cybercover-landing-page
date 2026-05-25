import { useEffect, useState } from 'react';
import type { BillingCycle } from '../../lib/api/types/money';
import type { PlanCatalogEntryDto, SubscriptionStatus } from '../../lib/api/types/catalog';
import type { PlanChangePendingMetadata } from '../../lib/api/types/order';
import { getPlans } from '../../lib/api/catalog';
import { startOrder } from '../../lib/api/orders';
import { setFromStartOrderResponse } from '../../lib/state/order-session';
import { getPartnerFromUrl } from '../../lib/format/partner';
import { getDiscountCodeFromUrl, clearDiscountCode } from '../../lib/format/discount-code';
import { translateApiError } from '../../lib/errors/translate';
import { planToCardProps, type AuthContext } from '../../lib/catalog/render-policy';
import { ApiError } from '../../lib/api/types/errors';
import { detectAndExchangeHandoff } from '../../lib/auth/handoff';
import { redirectToPortal } from '../../lib/auth/portal-redirect';
import { consumeMockAuthFromUrl } from '../../lib/auth/mock-auth';
import { useAuthSession } from '../../lib/auth/use-auth-session';
import { BillingCycleToggle } from './BillingCycleToggle';
import { DiscountBanner } from './DiscountBanner';
import { SubscriptionStatusBanner } from './SubscriptionStatusBanner';
import { PricingCard } from './PricingCard';

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

export function PricingCards() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('ANNUAL');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [ctaError, setCtaError] = useState<{ title: string; message: string } | null>(null);
  const authSession = useAuthSession();

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
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
        // żeby klient od razu widział kartę CURRENT na właściwym togglem.
        if (response.currentBillingCycle) {
          setBillingCycle(response.currentBillingCycle);
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

  const onCtaClick = async (plan: PlanCatalogEntryDto) => {
    setLoadingPlanId(plan.planId);
    setCtaError(null);

    try {
      // Resolve which value to send as `partnerCode` to /orders/start.
      // - ?partner= URL param is canonical partner channel — always treated as partnerCode.
      // - ?discountCode= preview tells us actual kind via plan.discount.kind:
      //     PARTNER_FLAT / PARTNER_COMPOSITE / PARTNER_TIMEBOUND / PARTNER_TIMEBOUND_COMPOSITE
      //         → must auto-attach as partnerCode (otherwise previewed price disappears at /start).
      //     CODE_FLAT → stays in sessionStorage and pre-fills Step 4 input.
      //     null → don't auto-attach.
      const partnerFromUrl = getPartnerFromUrl();
      const discountCodeFromUrl = getDiscountCodeFromUrl();
      const previewKind = plan.discount?.kind ?? null;
      const isPartnerKindPreview =
        previewKind === 'PARTNER_FLAT' ||
        previewKind === 'PARTNER_COMPOSITE' ||
        previewKind === 'PARTNER_TIMEBOUND' ||
        previewKind === 'PARTNER_TIMEBOUND_COMPOSITE';

      let partnerCode: string | undefined = partnerFromUrl ?? undefined;
      if (!partnerCode && discountCodeFromUrl && isPartnerKindPreview) {
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

      const authContext: AuthContext | undefined =
        state.kind === 'ready'
          ? {
              currentPlanCode: state.currentPlanCode,
              subscriptionStatus: state.subscriptionStatus,
              currentBillingCycle: state.currentBillingCycle,
            }
          : undefined;
      const cardProps = planToCardProps(plan, billingCycle, authContext);
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
          const authContext: AuthContext | undefined =
            state.kind === 'ready'
              ? {
                  currentPlanCode: state.currentPlanCode,
                  subscriptionStatus: state.subscriptionStatus,
                  currentBillingCycle: state.currentBillingCycle,
                }
              : undefined;
          const cardProps = planToCardProps(plan, billingCycle, authContext);
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

  const authContext: AuthContext = {
    currentPlanCode: state.currentPlanCode,
    subscriptionStatus: state.subscriptionStatus,
    currentBillingCycle: state.currentBillingCycle,
  };

  return (
    <>
      {/* Auth-aware: banner per subscriptionStatus (GRACE/EXPIRED/CANCELLED). */}
      <SubscriptionStatusBanner status={state.subscriptionStatus} />

      {discountBanner && <DiscountBanner {...discountBanner} />}

      <div className="flex justify-center mb-12">
        <BillingCycleToggle
          value={billingCycle}
          onChange={setBillingCycle}
          // Klient na rocznym abonamencie nie może przejść na miesięczny w ramach wizard'a
          // (downgrade cyklu wymaga osobnej operacji po stronie BOK). Blokujemy toggle.
          disabledCycle={state.currentBillingCycle === 'ANNUAL' ? 'MONTHLY' : undefined}
          disabledReason={
            state.currentBillingCycle === 'ANNUAL'
              ? 'Zmiana z cyklu rocznego na miesięczny jest niedostępna.'
              : undefined
          }
        />
      </div>

      {ctaError && (
        <div
          role="alert"
          className="mx-auto mb-8 max-w-md rounded-[12px] border border-red-300 bg-red-50 p-4 text-center font-['Plus_Jakarta_Sans',sans-serif]"
        >
          <h4 className="text-sm font-semibold text-red-700">{ctaError.title}</h4>
          <p className="text-xs text-red-700">{ctaError.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {state.plans.map((plan) => {
          const props = planToCardProps(plan, billingCycle, authContext);
          const isThisLoading = loadingPlanId === plan.planId;
          return (
            <PricingCard
              key={plan.planId}
              {...props}
              ctaText={isThisLoading ? 'Ładowanie…' : props.ctaText}
              ctaDisabled={isThisLoading}
              onSelect={() => onCtaClick(plan)}
            />
          );
        })}
      </div>
    </>
  );
}
