// checkout-flow.md §9.1 — Sales Order DTOs.

import type { BillingCycle } from './money';

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PENDING_ALLOCATION'
  | 'PROCESSING'
  | 'FULFILLED'
  | 'CLOSED'
  | 'CANCELLED';

export type PaymentMethod = 'STRIPE_CHECKOUT' | 'BANK_TRANSFER';

// Per spec §5.5.1 — wizard entry step + prefilled fields + order type.
export type WizardEntryStep = 'company-data' | 'personal-data' | 'operational-standards' | 'payment-method';
export type PrefilledField = 'companyData' | 'personalData' | 'operationalStandards';
export type OrderType = 'INITIAL_PURCHASE' | 'PLAN_UPGRADE' | 'REACTIVATION';

export type CheckoutStep = 'COMPANY_DATA' | 'PERSONAL_DATA' | 'OPERATIONAL_STANDARDS' | 'PAYMENT_METHOD';

// §9.1.1 request/response
export interface StartOrderDto {
  catalogEntryId: string;
  billingCycle: BillingCycle;
  partnerCode?: string;
}

export interface StartOrderResponseDto {
  orderId: string;
  /**
   * Od którego kroku FE ma renderować wizard.
   * - Anonymous initial: 'company-data'
   * - Auth + Standard → Optimum/Pro/Ekspert: 'operational-standards'
   * - Auth + Optimum+ → wyższy: 'payment-method'
   * - Auth + reactivation: 'payment-method' (zwykle) lub 'operational-standards' (cross-insurer)
   * Per spec §5.5.1 + decision matrix.
   */
  wizardEntryStep: WizardEntryStep;
  /** Pola które backend już wypełnił z poprzedniego order'u klienta. */
  prefilledFields: PrefilledField[];
  /**
   * Tryb pracy zamówienia. Open question OQ1: BE spec §5.3 DTO nie zawiera tego pola,
   * FE-facing doc §4.2 zawiera. Implementujemy jako optional; gdy brak — treat as INITIAL_PURCHASE.
   */
  orderType?: OrderType;
}

// §9.1.6 checkout state
export interface CheckoutProgressDto {
  hasCompanyData: boolean;
  hasPersonalData: boolean;
  hasOperationalStandards: boolean;
  hasPaymentMethod: boolean;
}

export interface CheckoutStateResponseDto {
  orderId: string;
  progress: CheckoutProgressDto;
  isComplete: boolean;
  nextRequiredStep: CheckoutStep | null;
}

// §9.1.14 order response (fields used in F1; F2-F4 will expand)
export interface OrderLineResponseDto {
  lineId: string;
  catalogEntryId: string;
  planName: string;
  priceNet: number | null;
}

export interface OrderDiscountDto {
  code: string;
  kind:
    | 'CODE_FLAT'
    | 'PARTNER_FLAT'
    | 'PARTNER_COMPOSITE'
    | 'PARTNER_TIMEBOUND'
    | 'PARTNER_TIMEBOUND_COMPOSITE';
  originalAmount: number;       // grosze, before discount
  priceAfterDiscount: number;   // grosze, after discount (== totalPriceNet)
  discountAmount: number;       // grosze, savings
  currency: string;
}

// Per docs/proration-changes.md (CC-353) — rozbicie proracji dla zamówień PLAN_UPGRADE.
// Wszystkie kwoty NETTO, w groszach. `credit` jest DODATNI (FE dokłada znak minus).
// `amountDueNow === fullPrice − credit === totalPriceNet`. Pole jest `null` dla
// zamówień innych niż podniesienie planu (zwykły zakup / odnowienie / reaktywacja).
export interface ProrationDto {
  fullPrice: number;
  credit: number;
  amountDueNow: number;
  currency: string;
}

export interface OrderResponseDto {
  orderId: string;
  status: OrderStatus;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethod | null;
  checkoutProgress: CheckoutProgressDto;
  companyData: CompanyDataResponseDto | null;
  personalData: PersonalDataResponseDto | null;
  lines: OrderLineResponseDto[];
  totalPriceNet: number | null;
  currency: string;
  discount: OrderDiscountDto | null;
  // CC-353 — jedyne źródło rozbicia proracji; null dla zamówień nie-upgrade.
  proration: ProrationDto | null;
  eligibilityResult: EligibilityResultResponseDto | null;
  createdAt: string;
}

// §9.1.5 submit company-data request/response
export interface SubmitCompanyDataDto {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

// Full shape of companyData on OrderResponseDto (replacing Record<string, unknown>)
export interface CompanyDataResponseDto {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string;
}

// §9.1.2 company-lookup response
export interface CompanyLookupDataDto {
  nip: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  industry: string | null;
  source: 'CEIDG' | 'KRS';
}

export interface CompanyLookupResponseDto {
  found: boolean;
  company?: CompanyLookupDataDto;
  nip?: string;
}

// §9.1.3 consent definitions
export interface ExpandedDetailsDto {
  title: string;
  items: string[];
}

export interface ConsentDefinitionDto {
  id: string;
  code: string;
  name: string; // may contain HTML (e.g. <a href=...>)
  description: string;
  type: 'USER' | 'COMPANY';
  isRequired: boolean;
  version: number;
  expandedDetails: ExpandedDetailsDto | null;
}

export interface GetConsentDefinitionsResponseDto {
  consentDefinitions: ConsentDefinitionDto[];
}

// §9.1.7 submit personal-data
export interface ConsentInputDto {
  consentDefinitionId: string;
  accepted: boolean;
  consentVersion: number;
}

export interface SubmitPersonalDataDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // E.164, e.g. +48123456789
  consents: ConsentInputDto[];
}

export interface PersonalDataResponseDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// §9.1.8 operational-standards schema
export interface StandardQuestionDto {
  key: string;
  label: string;
  description?: string;
}

export interface OperationalStandardsSchemaResponseDto {
  orderId: string;
  insurerName: string;
  questions: StandardQuestionDto[];
  answerOptions: string[];
  // §2.6.2: true for plans without `InsuranceCoverage` (Standard).
  // When true, FE must skip the OS step (questions/answerOptions are empty,
  // insurerName is ''). Optional for backward compat with backends pre-2026-05-06.
  skipped?: boolean;
}

// §9.1.9 submit operational-standards
export interface SubmitOperationalStandardsDto {
  answers: Record<string, string>;
}

export interface EligibilityContributionDto {
  key: string;
  met: boolean;
  label: string;
}

export interface EligibilityResultResponseDto {
  eligible: boolean;
  missingRequirements: string[];
  contributions: EligibilityContributionDto[];
}

export interface SubmitOperationalStandardsResponseDto extends EligibilityResultResponseDto {
  orderId: string;
  checkoutProgress: CheckoutProgressDto;
}

// §9.1.10 evaluate-eligibility (mock-only in F2c, but type for future use)
export interface EvaluateEligibilityRequestDto {
  answers: Record<string, string>;
}

// §9.1.11 validate-discount
export interface ValidateDiscountDto {
  discountCode: string;
}

export interface DiscountValidationResponseDto {
  valid: boolean;
  discountType: string | null;       // 'PERCENTAGE' | 'FIXED'
  discountValue: string | null;      // procent or grosze
  originalPriceNet: number | null;   // grosze
  discountedPriceNet: number | null; // grosze
  currency: string | null;
  message: string | null;            // error msg gdy valid=false
}

// §9.1.12 select payment-method
export interface SelectPaymentMethodDto {
  paymentMethod: PaymentMethod;
  discountCode?: string;
}

// §9.1.13 confirm order
export interface ConfirmOrderResponseDto {
  orderId: string;
  status: OrderStatus; // 'CONFIRMED'
  paymentMethod: PaymentMethod;
  confirmationToken: string | null; // only for BANK_TRANSFER
}

// §9.2.1 create stripe checkout session
export interface CreateCheckoutSessionResponseDto {
  sessionId: string;
  url: string;
  paymentId: string;
}

// §9.1.15 confirmation (BANK_TRANSFER)
export interface BankTransferProformaDto {
  invoiceNumber: string;
  pdfUrl: string;
  dueDate: string; // YYYY-MM-DD
}

export interface BankTransferPaymentDto {
  bankAccount: string;
  transferTitle: string;
  grossAmountMinorUnits: number;
  netAmountMinorUnits: number;
  vatAmountMinorUnits: number;
  currency: 'PLN';
}

export interface OrderConfirmationResponseDto {
  type: 'BANK_TRANSFER';
  orderId: string;
  proforma: BankTransferProformaDto;
  payment: BankTransferPaymentDto;
  customerEmail: string;
}

// CC-353 — PATCH /orders/:id/payment-method zwraca teraz tylko checkout-state
// (CheckoutStateResponseDto), bez cen. Rozbicie proracji żyje na GET /orders/:id
// (`OrderResponseDto.proration`). Stare typy CalculatedPricing/PricingBreakdown
// usunięte — proracja jest teraz płaskim obiektem `ProrationDto`.

/**
 * Metadata zwracana w 409 PLAN_CHANGE_PENDING response.
 * UWAGA naming: BE używa `xDone` w 409 metadata, nasze `CheckoutProgressDto` używa `hasX`.
 * Trzymamy oddzielny typ — nie konwertujemy, bo po resume i tak wywołamy `getOrder(existingOrderId)`
 * które zwraca `CheckoutProgressDto` (FE naming). Per spec OQ5.
 */
export interface PlanChangePendingMetadata {
  existingOrderId: string;
  status: 'DRAFT' | 'CONFIRMED';
  wizardEntryStep: WizardEntryStep;
  checkoutProgress: {
    companyDataDone: boolean;
    personalDataDone: boolean;
    operationalStandardsDone: boolean;
    paymentMethodDone: boolean;
  };
  /** Non-null gdy istniejący Stripe Checkout session jeszcze ważny — FE redirectuje tam. */
  checkoutSessionUrl: string | null;
}
