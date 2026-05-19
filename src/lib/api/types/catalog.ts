// Real backend contract for GET /api/pricing-catalog
// Response: array of 4 plans, no wrapping object.
//
// Reflects backend changes documented in `docs/pricing-catalog-changes.md`:
// - § 4.2: `tier` field on PlanCatalogEntryDto
// - § 4.4: `partnerName` and `partnerLogoUrl` on DiscountPreviewDto
// - § 4.5: `ctaLabel` as top-level field (fallback to features.ctaLabel preserved)

import type { BillingCycle, MoneyDto } from './money';

export type FeatureMap = Record<string, string>;

export type DiscountKind =
  | 'CODE_FLAT'
  | 'PARTNER_FLAT'
  | 'PARTNER_COMPOSITE'
  | 'PARTNER_TIMEBOUND'
  | 'PARTNER_TIMEBOUND_COMPOSITE';

export type PlanTier = 'entry' | 'mid' | 'high' | 'top';

export type RelativeToCurrent = 'CURRENT' | 'UPGRADE_AVAILABLE' | 'NOT_AVAILABLE';
export type SubscriptionStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'CANCELLED';

export interface PromotionalDurationDto {
  months: number;
  applicableBillingCycle: 'MONTHLY';
}

export interface DiscountPreviewDto {
  code: string;
  description: string;
  kind: DiscountKind;
  eligible: boolean;
  annualPriceAfterDiscount: MoneyDto | null;
  monthlyPriceAfterDiscount: MoneyDto | null;
  annualDiscountAmount: MoneyDto | null;
  monthlyDiscountAmount: MoneyDto | null;
  promotionalDuration: PromotionalDurationDto | null;
  partnerName: string | null;       // null when kind === 'CODE_FLAT'
  partnerLogoUrl: string | null;
}

export interface PlanCatalogEntryDto {
  catalogEntryId: string;          // "CATALOG-<uuid>"
  planId: string;                  // UUID
  code: string;                    // Stable: 'standard' | 'optimum' | 'professional' | 'expert' (legacy may be empty)
  planName: string;                // English: "Standard" | "Optimum" | "Professional" | "Expert" (frontend maps to PL via render-policy)
  description: string;
  displayOrder: number;
  recommended: boolean;
  tier: PlanTier;                  // Drives highlight emphasis in render-policy
  ctaLabel?: string;               // Optional top-level; fallback to features.ctaLabel
  annualPrice: MoneyDto;           // monthly rate when billed annually (grosze)
  monthlyPrice: MoneyDto;          // monthly rate when billed monthly (grosze)
  features: FeatureMap;            // keys: `feature.<name>` per docs/pricing-catalog-changes.md § 4.1
  /**
   * Per-cycle pozycja względem aktualnego planu klienta (auth-aware response only).
   * Anonymous request lub klient bez sub → fields nieobecne.
   *
   * BE rozróżnia, bo upgrade/downgrade może być różny dla każdego cyklu — np. klient
   * na standard@MONTHLY widzi:
   *   - monthlyRelativeToCurrent: "CURRENT"        (jego aktualny plan)
   *   - annualRelativeToCurrent:  "NOT_AVAILABLE"  (zmiana cyklu nie jest dopuszczalna w wizardzie)
   *
   * Frontend wybiera odpowiedni field zgodnie z aktywnym billingCycle togglem.
   */
  monthlyRelativeToCurrent?: RelativeToCurrent;
  annualRelativeToCurrent?: RelativeToCurrent;
  discount: DiscountPreviewDto | null;
}

/**
 * Backend wraps array w obiekt zarówno w anonymous jak i auth mode.
 * Adapter w `catalog.ts` akceptuje też raw array (legacy) — bumpuje na nowy shape.
 */
export interface PlanCatalogResponseDto {
  plans: PlanCatalogEntryDto[];
  /** Code aktualnego planu klienta — tylko w auth mode z sub. */
  currentPlanCode?: string;
  /** Status subskrypcji klienta — tylko w auth mode z sub. */
  subscriptionStatus?: SubscriptionStatus;
  /** Billing cycle aktualnej subskrypcji — auto-select togglem przy mount. */
  currentBillingCycle?: BillingCycle;
}
