import { useEffect, useState } from 'react';
import type { BillingCycle } from '../../lib/api/types/money';
import type { PlanCatalogEntryDto, PlanCatalogResponseDto } from '../../lib/api/types/catalog';
import { getPlans } from '../../lib/api/catalog';
import { startOrder } from '../../lib/api/orders';
import { setFromStartOrderResponse } from '../../lib/state/order-session';
import { getPartnerFromUrl } from '../../lib/format/partner';
import { getDiscountCodeFromUrl, clearDiscountCode } from '../../lib/format/discount-code';
import { translateApiError } from '../../lib/errors/translate';
import { planToCardProps } from '../../lib/catalog/render-policy';
import { BillingCycleToggle } from './BillingCycleToggle';
import { DiscountBanner } from './DiscountBanner';
import { PricingCard } from './PricingCard';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; plans: PlanCatalogResponseDto }
  | { kind: 'error'; title: string; message: string };

export function PricingCards() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('ANNUAL');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [ctaError, setCtaError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    // URL is the source of truth on /cennik. If `?discountCode=` is absent, drop any
    // stale sessionStorage entry left from a previous visit so the user does not see
    // a discount they did not request. Partner attribution (`?partner=`) stays sticky
    // through the session — that is the standard pattern for affiliate links.
    const params = new URLSearchParams(window.location.search);
    if (!params.has('discountCode')) {
      clearDiscountCode();
    }

    const partnerCode = getPartnerFromUrl() ?? undefined;
    const discountCode = getDiscountCodeFromUrl() ?? undefined;

    getPlans(discountCode, partnerCode)
      .then(plans => {
        if (cancelled) return;
        const sorted = [...plans].sort((a, b) => a.displayOrder - b.displayOrder);
        setState({ kind: 'ready', plans: sorted });
      })
      .catch(err => {
        if (cancelled) return;
        const t = translateApiError(err);
        setState({ kind: 'error', title: t.title, message: t.message });
      });

    return () => { cancelled = true; };
  }, []);

  const onCtaClick = async (plan: PlanCatalogEntryDto) => {
    setLoadingPlanId(plan.planId);
    setCtaError(null);

    try {
      // Resolve which value to send as `partnerCode` to /orders/start.
      // - ?partner= URL param is canonical partner channel — always treated as partnerCode.
      // - ?discountCode= preview tells us actual kind via plan.discount.kind:
      //     PARTNER_FLAT / PARTNER_COMPOSITE / PARTNER_TIMEBOUND → must auto-attach as
      //         partnerCode (otherwise previewed price disappears at /start).
      //     CODE_FLAT → stays in sessionStorage and pre-fills Step 4 input.
      //     null → don't auto-attach.
      const partnerFromUrl = getPartnerFromUrl();
      const discountCodeFromUrl = getDiscountCodeFromUrl();
      const previewKind = plan.discount?.kind ?? null;
      const isPartnerKindPreview =
        previewKind === 'PARTNER_FLAT' ||
        previewKind === 'PARTNER_COMPOSITE' ||
        previewKind === 'PARTNER_TIMEBOUND';

      let partnerCode: string | undefined = partnerFromUrl ?? undefined;
      if (!partnerCode && discountCodeFromUrl && isPartnerKindPreview) {
        partnerCode = discountCodeFromUrl;
        // Move from "discount-code prefill" to "partner attribution" channel.
        clearDiscountCode();
      }

      const response = await startOrder({
        catalogEntryId: plan.catalogEntryId,
        billingCycle,
        partnerCode,
      });

      // Save Polish-display name to sessionStorage so OrderSummaryAside reads what user saw on /cennik
      const cardProps = planToCardProps(plan, billingCycle);
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

      window.location.assign(`/checkout/company-data?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (err) {
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
  const promoterPlan = state.plans.find(p => p.discount?.partnerName);
  const discountBanner = promoterPlan?.discount?.partnerName
    ? {
        promoterName: promoterPlan.discount.partnerName,
        promoterLogoUrl: promoterPlan.discount.partnerLogoUrl,
        description: promoterPlan.discount.description,
      }
    : null;

  return (
    <>
      {discountBanner && <DiscountBanner {...discountBanner} />}

      <div className="flex justify-center mb-12">
        <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
      </div>

      {ctaError && (
        <div role="alert" className="mx-auto mb-8 max-w-md rounded-[12px] border border-red-300 bg-red-50 p-4 text-center font-['Plus_Jakarta_Sans',sans-serif]">
          <h4 className="text-sm font-semibold text-red-700">{ctaError.title}</h4>
          <p className="text-xs text-red-700">{ctaError.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 justify-items-center">
        {state.plans.map(plan => {
          const props = planToCardProps(plan, billingCycle);
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
