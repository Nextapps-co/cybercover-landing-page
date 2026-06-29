import { ApiError } from '../types/errors';
import type {
  CheckoutStateResponseDto,
  OrderDiscountDto,
  OrderResponseDto,
  OrderStatus,
  OrderType,
  PrefilledField,
  ProrationDto,
  StartOrderDto,
  StartOrderResponseDto,
  WizardEntryStep,
} from '../types/order';
import type { BillingCycle } from '../types/money';
import { getMockAuthContext } from '../../auth/mock-auth';

const ordersById = new Map<string, OrderResponseDto>();

// Per spec §5.9.2 — mock auth-aware hints per order: orderType + previousPlanCode dla proration calc.
interface MockAuthMeta {
  orderType: OrderType;
  previousPlanCode?: string;
  previousMonthlyPrice?: number;
  previousAnnualPrice?: number;
}
const orderAuthMeta = new Map<string, MockAuthMeta>();

// Mock proracji per docs/proration-changes.md (CC-353):
//   fullPrice    = pełna cena nowego planu za cykl (== totalPriceNet z cennika)
//   credit       = prorata niewykorzystanego okresu poprzedniego planu (dodatnia)
//   amountDueNow = fullPrice − credit
// Zwraca null gdy zamówienie nie jest podniesieniem planu (proration == null po stronie BE).
const MOCK_PRORATION_FACTOR = 0.33;
function computeMockProration(
  fullPrice: number,
  billingCycle: BillingCycle,
  meta: MockAuthMeta | undefined,
): ProrationDto | null {
  if (!meta || meta.orderType !== 'PLAN_UPGRADE') return null;
  const prevPriceForCycle =
    billingCycle === 'MONTHLY' ? meta.previousMonthlyPrice : meta.previousAnnualPrice;
  if (!prevPriceForCycle) return null;
  const credit = Math.round(prevPriceForCycle * MOCK_PRORATION_FACTOR);
  const amountDueNow = Math.max(0, fullPrice - credit);
  return { fullPrice, credit, amountDueNow, currency: 'PLN' };
}

// Helper — mapuje code → mock catalog prices (musi pasować do catalog.mock MOCK_PLANS).
const PLAN_BY_CODE: Record<string, { monthly: number; annual: number }> = {
  standard: { monthly: 35400, annual: 29500 },
  optimum: { monthly: 59400, annual: 49500 },
  professional: { monthly: 107400, annual: 89500 },
  expert: { monthly: 191400, annual: 159500 },
};

function generateOrderId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ord_mock_${rand}`;
}

const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  ce_mock_standard: { monthly: 35400, annual: 29500 },
  ce_mock_optimum: { monthly: 59400, annual: 49500 },
  ce_mock_professional: { monthly: 107400, annual: 89500 },
  ce_mock_expert: { monthly: 191400, annual: 159500 },
  // Also accept the catalog mock's CATALOG- prefix
  'CATALOG-mock-standard': { monthly: 35400, annual: 29500 },
  'CATALOG-mock-optimum': { monthly: 59400, annual: 49500 },
  'CATALOG-mock-professional': { monthly: 107400, annual: 89500 },
  'CATALOG-mock-expert': { monthly: 191400, annual: 159500 },
};

function getOriginalAmount(catalogEntryId: string, billingCycle: BillingCycle): number {
  const p = PLAN_PRICES[catalogEntryId];
  if (!p) return 0;
  return billingCycle === 'MONTHLY' ? p.monthly : p.annual;
}

function buildOrderDiscount(
  partnerCode: string | undefined,
  catalogEntryId: string,
  originalAmount: number,
): OrderDiscountDto | null {
  if (!partnerCode || originalAmount === 0) return null;
  const code = partnerCode.trim().toUpperCase();
  const isStandard = catalogEntryId.endsWith('standard');
  const flat = (rate: number, kind: OrderDiscountDto['kind']): OrderDiscountDto => {
    const after = Math.round(originalAmount * (1 - rate));
    return {
      code,
      kind,
      originalAmount,
      priceAfterDiscount: after,
      discountAmount: originalAmount - after,
      currency: 'PLN',
    };
  };
  if (code === 'SUMMER10') return flat(0.1, 'CODE_FLAT');
  if (code === 'VALVETECH') return flat(0.05, 'PARTNER_FLAT');
  if (code === 'COMPOSITE_DEMO') {
    return isStandard
      ? { code, kind: 'PARTNER_COMPOSITE', originalAmount, priceAfterDiscount: 0, discountAmount: originalAmount, currency: 'PLN' }
      : flat(0.1, 'PARTNER_COMPOSITE');
  }
  if (code === 'TIMEBOUND_DEMO') {
    return isStandard
      ? { code, kind: 'PARTNER_TIMEBOUND', originalAmount, priceAfterDiscount: 0, discountAmount: originalAmount, currency: 'PLN' }
      : null; // non-target
  }
  return null;
}

function prettyPlanName(catalogEntryId: string): string {
  // English names matching the new catalog contract (frontend translates to PL via render-policy).
  if (catalogEntryId.endsWith('standard')) return 'Standard';
  if (catalogEntryId.endsWith('optimum')) return 'Optimum';
  if (catalogEntryId.endsWith('professional')) return 'Professional';
  if (catalogEntryId.endsWith('expert')) return 'Expert';
  return 'Plan';
}

export async function startOrderMock(dto: StartOrderDto): Promise<StartOrderResponseDto> {
  const orderId = generateOrderId();
  const originalAmount = getOriginalAmount(dto.catalogEntryId, dto.billingCycle);
  const discount = buildOrderDiscount(dto.partnerCode, dto.catalogEntryId, originalAmount);
  const finalAmount = discount?.priceAfterDiscount ?? originalAmount;
  const order: OrderResponseDto = {
    orderId,
    status: 'DRAFT',
    billingCycle: dto.billingCycle,
    paymentMethod: null,
    checkoutProgress: {
      hasCompanyData: false,
      hasPersonalData: false,
      hasOperationalStandards: false,
      hasPaymentMethod: false,
    },
    companyData: null,
    personalData: null,
    lines: [
      {
        lineId: `line_${orderId}`,
        catalogEntryId: dto.catalogEntryId,
        planName: prettyPlanName(dto.catalogEntryId),
        priceNet: finalAmount,
      },
    ],
    totalPriceNet: finalAmount,
    currency: 'PLN',
    discount,
    proration: null, // ustawiane poniżej dla PLAN_UPGRADE (per CC-353 — już na DRAFT-cie)
    eligibilityResult: null,
    createdAt: new Date().toISOString(),
  };
  ordersById.set(orderId, order);

  // Per spec §5.9.2 — decyzja orderType/wizardEntryStep/prefilledFields z mock auth context.
  const authContext = getMockAuthContext();
  let orderType: OrderType = 'INITIAL_PURCHASE';
  let wizardEntryStep: WizardEntryStep = 'company-data';
  let prefilledFields: PrefilledField[] = [];

  if (authContext) {
    const targetPlanCode = inferPlanCodeFromCatalogEntry(dto.catalogEntryId);

    if (authContext.status === 'ACTIVE') {
      orderType = 'PLAN_UPGRADE';
      // Standard ma insurerId=null; Optimum/Pro/Ekspert mają default insurer.
      // Standard → Optimum/Pro/Expert: cross-insurer — wymaga ops capture.
      // Optimum → wyższy: ten sam insurer, ops już są w previous order.
      if (authContext.planCode === 'standard' && targetPlanCode !== 'standard') {
        wizardEntryStep = 'operational-standards';
        prefilledFields = ['companyData', 'personalData'];
      } else {
        wizardEntryStep = 'payment-method';
        prefilledFields = ['companyData', 'personalData', 'operationalStandards'];
      }
    } else {
      // GRACE_PERIOD / EXPIRED / CANCELLED → reactivation
      orderType = 'REACTIVATION';
      wizardEntryStep = 'payment-method';
      prefilledFields = ['companyData', 'personalData', 'operationalStandards'];
    }

    // Cache meta dla proration calc (start + getOrder).
    const prevPrices = PLAN_BY_CODE[authContext.planCode];
    orderAuthMeta.set(orderId, {
      orderType,
      previousPlanCode: authContext.planCode,
      previousMonthlyPrice: prevPrices?.monthly,
      previousAnnualPrice: prevPrices?.annual,
    });

    // Per CC-353 — proracja jest wypełniona już na DRAFT-cie, więc boks pokazuje
    // właściwą kwotę od pierwszego ekranu. totalPriceNet == amountDueNow dla upgrade.
    const proration = computeMockProration(finalAmount, order.billingCycle, orderAuthMeta.get(orderId));
    if (proration) {
      order.proration = proration;
      order.totalPriceNet = proration.amountDueNow;
      if (order.lines[0]) order.lines[0].priceNet = proration.amountDueNow;
    }

    // Auto-populate checkoutProgress dla prefilled fields (BE robi to dla nas).
    if (prefilledFields.includes('companyData')) {
      order.checkoutProgress = { ...order.checkoutProgress, hasCompanyData: true };
      order.companyData = {
        nip: '5260001246',
        name: 'ACME Sp. z o.o.',
        street: 'ul. Przykładowa 15',
        city: 'Warszawa',
        postalCode: '00-123',
        industry: 'IT',
      };
    }
    if (prefilledFields.includes('personalData')) {
      order.checkoutProgress = { ...order.checkoutProgress, hasPersonalData: true };
      order.personalData = {
        firstName: 'Jan',
        lastName: 'Kowalski',
        email: 'jan@acme.pl',
        phone: '+48123456789',
      };
    }
    if (prefilledFields.includes('operationalStandards')) {
      order.checkoutProgress = { ...order.checkoutProgress, hasOperationalStandards: true };
      order.eligibilityResult = {
        eligible: true,
        missingRequirements: [],
        contributions: [],
      };
    }
    ordersById.set(orderId, order);
  } else {
    orderAuthMeta.set(orderId, { orderType: 'INITIAL_PURCHASE' });
  }

  return {
    orderId,
    wizardEntryStep,
    prefilledFields,
    orderType,
  };
}

function inferPlanCodeFromCatalogEntry(catalogEntryId: string): string {
  if (catalogEntryId.endsWith('standard')) return 'standard';
  if (catalogEntryId.endsWith('optimum')) return 'optimum';
  if (catalogEntryId.endsWith('professional')) return 'professional';
  if (catalogEntryId.endsWith('expert')) return 'expert';
  return 'unknown';
}

// Counts get-order calls per order so we can simulate the BC3 → BC4 → BC5 cascade
// (CONFIRMED → PENDING_ALLOCATION → PROCESSING → FULFILLED) for SuccessStatus polling.
const fulfillmentCallCounts = new Map<string, number>();

// Zamówienia faktycznie opłacone — tylko one awansują w kaskadzie fulfillment.
// CONFIRMED-niepłacone (ekran cancelled/resume, /cennik resume) zostaje stabilne.
const paidOrderIds = new Set<string>();
// orderId -> confirmationToken (proforma), wystawiany przy przejściu na przelew.
const confirmationTokens = new Map<string, string>();

export function markOrderPaidMock(orderId: string): void {
  paidOrderIds.add(orderId);
}

const FULFILLMENT_PROGRESSION: OrderStatus[] = [
  'CONFIRMED',
  'PENDING_ALLOCATION',
  'PROCESSING',
  'FULFILLED',
];

export async function getOrderMock(orderId: string): Promise<OrderResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) {
    throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  }
  const fulfillmentIndex = FULFILLMENT_PROGRESSION.indexOf(order.status);
  if (fulfillmentIndex >= 0 && order.status !== 'FULFILLED' && paidOrderIds.has(orderId)) {
    const next = (fulfillmentCallCounts.get(orderId) ?? 0) + 1;
    fulfillmentCallCounts.set(orderId, next);
    const targetIndex = Math.min(fulfillmentIndex + next, FULFILLMENT_PROGRESSION.length - 1);
    order.status = FULFILLMENT_PROGRESSION[targetIndex];
    ordersById.set(orderId, order);
  }
  return order;
}

export async function getCheckoutStateMock(orderId: string): Promise<CheckoutStateResponseDto> {
  const order = await getOrderMock(orderId);
  return {
    orderId,
    progress: order.checkoutProgress,
    isComplete: Object.values(order.checkoutProgress).every(Boolean),
    nextRequiredStep: !order.checkoutProgress.hasCompanyData
      ? 'COMPANY_DATA'
      : !order.checkoutProgress.hasPersonalData
        ? 'PERSONAL_DATA'
        : !order.checkoutProgress.hasOperationalStandards
          ? 'OPERATIONAL_STANDARDS'
          : !order.checkoutProgress.hasPaymentMethod
            ? 'PAYMENT_METHOD'
            : null,
  };
}

export function resetOrdersMock(): void {
  ordersById.clear();
  fulfillmentCallCounts.clear();
  orderAuthMeta.clear();
  paidOrderIds.clear();
  confirmationTokens.clear();
}

import type { CompanyLookupResponseDto, SubmitCompanyDataDto } from '../types/order';

// Whitelisted mock NIPs for CEIDG/KRS lookup simulation
const NIP_FIXTURES: Record<string, { name: string; street: string; city: string; postalCode: string; source: 'CEIDG' | 'KRS' }> = {
  '5260001246': { name: 'ACME Sp. z o.o.', street: 'ul. Przykładowa 15', city: 'Warszawa', postalCode: '00-123', source: 'CEIDG' },
  '7010000000': { name: 'Firma Testowa S.A.', street: 'ul. Inna 9', city: 'Kraków', postalCode: '30-001', source: 'KRS' },
};

export async function lookupCompanyMock(nip: string): Promise<CompanyLookupResponseDto> {
  const normalized = nip.replace(/[\s-]/g, '');
  const fixture = NIP_FIXTURES[normalized];
  if (!fixture) {
    return { found: false, nip: normalized };
  }
  return {
    found: true,
    company: {
      nip: normalized,
      ...fixture,
      industry: null,
    },
  };
}

export async function submitCompanyDataMock(orderId: string, dto: SubmitCompanyDataDto) {
  const order = ordersById.get(orderId);
  if (!order) {
    throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  }
  order.companyData = {
    nip: dto.nip,
    name: dto.name,
    street: dto.street,
    city: dto.city,
    postalCode: dto.postalCode,
    industry: dto.industry,
  };
  order.checkoutProgress = { ...order.checkoutProgress, hasCompanyData: true };
  ordersById.set(orderId, order);
  return {
    orderId,
    progress: order.checkoutProgress,
    isComplete: Object.values(order.checkoutProgress).every(Boolean),
    nextRequiredStep: !order.checkoutProgress.hasPersonalData
      ? ('PERSONAL_DATA' as const)
      : !order.checkoutProgress.hasOperationalStandards
        ? ('OPERATIONAL_STANDARDS' as const)
        : !order.checkoutProgress.hasPaymentMethod
          ? ('PAYMENT_METHOD' as const)
          : null,
  };
}

import type { ConsentDefinitionDto, SubmitPersonalDataDto } from '../types/order';

// Zsynchronizowane z dev API (/orders/consent-definitions) — 3 zgody.
// Dawne SERVICE_START_BEFORE_WITHDRAWAL i RODO_CLAUSE_ACKNOWLEDGMENT zostały usunięte po stronie backendu.
const MOCK_CONSENT_DEFINITIONS: ConsentDefinitionDto[] = [
  {
    id: 'mock-consent-tos',
    code: 'TERMS_OF_SERVICE',
    name: 'Zapoznałem/-am się z <a target="_blank" href="https://cybercover.pl/regulamin-swiadczenia-uslug/">Regulaminem świadczenia usług</a> drogą elektroniczną i akceptuję jego postanowienia.',
    description: '',
    type: 'USER',
    isRequired: true,
    version: 1,
    expandedDetails: null,
  },
  {
    id: 'mock-consent-withdrawal-waiver',
    code: 'WITHDRAWAL_RIGHT_WAIVER_ACKNOWLEDGMENT',
    name: 'Żądam rozpoczęcia świadczenia usługi przed upływem terminu do odstąpienia od umowy oraz przyjmuję do wiadomości, że po całkowitym wykonaniu usługi utracę prawo odstąpienia od umowy zgodnie z art. 38 ustawy o prawach konsumenta.',
    description: '',
    type: 'COMPANY',
    isRequired: true,
    version: 1,
    expandedDetails: null,
  },
  {
    id: 'mock-consent-marketing',
    code: 'MARKETING_CONSENT',
    name: 'Wyrażam zgodę na otrzymywanie drogą elektroniczną informacji handlowych od Cyber Cover sp. z o.o. dotyczących produktów i usług.',
    description: '',
    type: 'USER',
    isRequired: false,
    version: 1,
    expandedDetails: null,
  },
];

export async function fetchConsentDefinitionsMock(): Promise<ConsentDefinitionDto[]> {
  return MOCK_CONSENT_DEFINITIONS.map((d) => ({
    ...d,
    expandedDetails: d.expandedDetails
      ? { ...d.expandedDetails, items: [...d.expandedDetails.items] }
      : null,
  }));
}

export async function submitPersonalDataMock(orderId: string, dto: SubmitPersonalDataDto) {
  const order = ordersById.get(orderId);
  if (!order) {
    throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  }
  order.personalData = {
    firstName: dto.firstName,
    lastName: dto.lastName,
    email: dto.email,
    phone: dto.phone,
  };
  order.checkoutProgress = { ...order.checkoutProgress, hasPersonalData: true };
  ordersById.set(orderId, order);
  return {
    orderId,
    progress: order.checkoutProgress,
    isComplete: Object.values(order.checkoutProgress).every(Boolean),
    nextRequiredStep: !order.checkoutProgress.hasOperationalStandards
      ? ('OPERATIONAL_STANDARDS' as const)
      : !order.checkoutProgress.hasPaymentMethod
        ? ('PAYMENT_METHOD' as const)
        : null,
  };
}

import type {
  OperationalStandardsSchemaResponseDto,
  SubmitOperationalStandardsDto,
  SubmitOperationalStandardsResponseDto,
  EligibilityResultResponseDto,
  EvaluateEligibilityRequestDto,
} from '../types/order';

const MOCK_OPS_QUESTIONS: OperationalStandardsSchemaResponseDto = {
  orderId: '',
  insurerName: 'Colonnade',
  questions: [
    { key: 'OS_UPDATES', label: 'Regularnie aktualizujemy systemy operacyjne oraz kluczowe oprogramowanie.', description: 'Aktualizacje obejmują systemy operacyjne, antywirusy, firewall, aplikacje biurowe.' },
    { key: 'BACKUP', label: 'Posiadamy kopie zapasowe najważniejszych danych i przechowujemy je w innym miejscu niż oryginały (np. w chmurze lub na zewnętrznym dysku).', description: 'Backup powinien być wykonywany co najmniej raz na tydzień.' },
    { key: 'MFA', label: 'Korzystamy z uwierzytelniania wieloskładnikowego (MFA) w kluczowych systemach.', description: 'MFA = drugie potwierdzenie tożsamości (SMS, aplikacja, klucz USB).' },
    { key: 'TRAINING', label: 'Pracownicy przechodzą szkolenia z cyberbezpieczeństwa.', description: 'Szkolenia obejmują phishing, hasła, postępowanie z danymi.' },
    { key: 'INCIDENT_PLAN', label: 'Mamy plan reagowania na incydenty cyberbezpieczeństwa.', description: 'Plan określa kogo zawiadomić i jakie kroki podjąć w razie ataku.' },
    { key: 'ANNUAL_REVENUE_UNDER_500M_PLN', label: 'Potwierdzam, że łączne roczne przychody mojej organizacji nie przekraczają 500 mln złotych.' },
  ],
  answerOptions: ['YES', 'NO', 'DONT_KNOW'],
};

export async function getOperationalStandardsSchemaMock(orderId: string): Promise<OperationalStandardsSchemaResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  return { ...MOCK_OPS_QUESTIONS, orderId, questions: MOCK_OPS_QUESTIONS.questions.map((q) => ({ ...q })) };
}

export async function submitOperationalStandardsMock(
  orderId: string,
  dto: SubmitOperationalStandardsDto,
): Promise<SubmitOperationalStandardsResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  // Mock eligibility logic: eligible if all required answers are YES.
  const contributions = MOCK_OPS_QUESTIONS.questions.map((q) => ({
    key: q.key,
    met: dto.answers[q.key] === 'YES',
    label: q.label,
  }));
  const missingRequirements = contributions.filter((c) => !c.met).map((c) => c.key);
  const eligible = missingRequirements.length === 0;

  order.checkoutProgress = { ...order.checkoutProgress, hasOperationalStandards: true };
  order.eligibilityResult = { eligible, missingRequirements, contributions };
  ordersById.set(orderId, order);

  return {
    orderId,
    eligible,
    missingRequirements,
    contributions,
    checkoutProgress: order.checkoutProgress,
  };
}

export async function evaluateEligibilityMock(
  _orderId: string,
  dto: EvaluateEligibilityRequestDto,
): Promise<EligibilityResultResponseDto> {
  const contributions = MOCK_OPS_QUESTIONS.questions.map((q) => ({
    key: q.key,
    met: dto.answers[q.key] === 'YES',
    label: q.label,
  }));
  const missingRequirements = contributions.filter((c) => !c.met).map((c) => c.key);
  return {
    eligible: missingRequirements.length === 0,
    missingRequirements,
    contributions,
  };
}

import type {
  ValidateDiscountDto, DiscountValidationResponseDto,
  SelectPaymentMethodDto,
  ConfirmOrderResponseDto,
  CreateCheckoutSessionResponseDto,
  ChangePaymentMethodDto,
  ChangePaymentMethodResponseDto,
  CancelOrderResponseDto,
} from '../types/order';

const MOCK_DISCOUNTS: Record<string, { type: 'PERCENTAGE' | 'FIXED'; value: string }> = {
  CYBER10: { type: 'PERCENTAGE', value: '10' },
  SAVE100: { type: 'FIXED', value: '10000' }, // 100 PLN in grosze
};

function applyDiscount(originalGrosze: number, type: 'PERCENTAGE' | 'FIXED', value: string): number {
  if (type === 'PERCENTAGE') {
    const pct = Number(value);
    return Math.round(originalGrosze * (1 - pct / 100));
  }
  return Math.max(0, originalGrosze - Number(value));
}

export async function validateDiscountCodeMock(
  orderId: string,
  dto: ValidateDiscountDto,
): Promise<DiscountValidationResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  const code = dto.discountCode.trim().toUpperCase();
  const discount = MOCK_DISCOUNTS[code];
  const originalPriceNet = order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0;
  if (!discount) {
    return {
      valid: false,
      discountType: null,
      discountValue: null,
      originalPriceNet: null,
      discountedPriceNet: null,
      currency: null,
      message: 'Kod nieaktywny lub nie istnieje.',
    };
  }
  const discountedPriceNet = applyDiscount(originalPriceNet, discount.type, discount.value);
  return {
    valid: true,
    discountType: discount.type,
    discountValue: discount.value,
    originalPriceNet,
    discountedPriceNet,
    currency: order.currency,
    message: null,
  };
}

const PARTNER_DISCOUNT_KINDS: ReadonlyArray<OrderDiscountDto['kind']> = [
  'PARTNER_FLAT',
  'PARTNER_COMPOSITE',
  'PARTNER_TIMEBOUND',
  'PARTNER_TIMEBOUND_COMPOSITE',
];

export async function selectPaymentMethodMock(
  orderId: string,
  dto: SelectPaymentMethodDto,
): Promise<CheckoutStateResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  if (dto.discountCode) {
    if (order.discount && PARTNER_DISCOUNT_KINDS.includes(order.discount.kind)) {
      throw new ApiError('DISCOUNT_SOURCE_CONFLICT', 409, 'Partner discount already applied (mock)');
    }
    const code = dto.discountCode.trim().toUpperCase();
    if (!MOCK_DISCOUNTS[code]) {
      throw new ApiError('DISCOUNT_CODE_NOT_FOUND', 400, 'Discount code not found (mock)');
    }
  }
  order.paymentMethod = dto.paymentMethod;
  order.checkoutProgress = { ...order.checkoutProgress, hasPaymentMethod: true };
  ordersById.set(orderId, order);

  // CC-353 — PATCH /payment-method zwraca tylko checkout-state (bez cen). Proracja/kwoty
  // żyją na GET /orders/:id; ConfirmStep robi świeży getOrder po tym kroku.
  // (Realny BE przelicza tu amountDueNow z uwzględnieniem kodu rabatowego; mock zostawia
  //  proracje zaseedowaną przy starcie — wystarcza do demonstracji boksu.)
  return {
    orderId,
    progress: order.checkoutProgress,
    isComplete: Object.values(order.checkoutProgress).every(Boolean),
    nextRequiredStep: !order.checkoutProgress.hasCompanyData
      ? 'COMPANY_DATA'
      : !order.checkoutProgress.hasPersonalData
        ? 'PERSONAL_DATA'
        : !order.checkoutProgress.hasOperationalStandards
          ? 'OPERATIONAL_STANDARDS'
          : !order.checkoutProgress.hasPaymentMethod
            ? 'PAYMENT_METHOD'
            : null,
  };
}

function generateMockToken(): string {
  return 'mock-token-' + Math.random().toString(36).slice(2, 11);
}

export async function confirmOrderMock(orderId: string): Promise<ConfirmOrderResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  const cp = order.checkoutProgress;
  if (!cp.hasCompanyData || !cp.hasPersonalData || !cp.hasOperationalStandards || !cp.hasPaymentMethod) {
    throw new ApiError('INCOMPLETE_CHECKOUT', 400, 'Checkout not complete (mock)');
  }
  if (order.status !== 'DRAFT') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order not in DRAFT (mock)');
  }
  if (!order.paymentMethod) {
    throw new ApiError('INCOMPLETE_CHECKOUT', 400, 'Payment method missing (mock)');
  }
  // Flow C — promotional zero-amount: atomic single-step DRAFT → PENDING_ALLOCATION.
  // Bank transfer doesn't issue a confirmation token here (no ProForma in this path).
  const isPromoZero =
    order.discount?.priceAfterDiscount === 0 &&
    PARTNER_DISCOUNT_KINDS.includes(order.discount.kind);
  const nextStatus: OrderStatus = isPromoZero ? 'PENDING_ALLOCATION' : 'CONFIRMED';
  order.status = nextStatus;
  ordersById.set(orderId, order);
  return {
    orderId,
    status: nextStatus,
    paymentMethod: order.paymentMethod,
    confirmationToken:
      !isPromoZero && order.paymentMethod === 'BANK_TRANSFER' ? generateMockToken() : null,
  };
}

export async function changePaymentMethodMock(
  orderId: string,
  dto: ChangePaymentMethodDto,
): Promise<ChangePaymentMethodResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  // 400 — akceptowana tylko BANK_TRANSFER
  if (dto.paymentMethod !== 'BANK_TRANSFER') {
    throw new ApiError('INVALID_ORDER_STATE', 400, 'Only BANK_TRANSFER allowed (mock)');
  }
  // 409 — przełączalne tylko CONFIRMED + STRIPE (nie: już przelew / już opłacone / nie CONFIRMED)
  if (order.status !== 'CONFIRMED' || order.paymentMethod !== 'STRIPE_CHECKOUT') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order not switchable to bank transfer (mock)');
  }
  order.paymentMethod = 'BANK_TRANSFER'; // status zostaje CONFIRMED — proforma wystawiona
  ordersById.set(orderId, order);
  const token = generateMockToken();
  confirmationTokens.set(orderId, token);
  return { orderId, status: order.status, paymentMethod: 'BANK_TRANSFER', confirmationToken: token };
}

export async function cancelOrderMock(orderId: string): Promise<CancelOrderResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  if (order.status === 'CANCELLED') return { orderId, status: 'CANCELLED' }; // idempotentne
  // 409 — opłacone (PENDING_ALLOCATION / PROCESSING / FULFILLED / CLOSED)
  if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order already paid (mock)');
  }
  order.status = 'CANCELLED';
  ordersById.set(orderId, order);
  return { orderId, status: 'CANCELLED' };
}

import type { OrderConfirmationResponseDto } from '../types/order';

function plus14Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getOrderConfirmationMock(
  orderId: string,
  token: string,
): Promise<OrderConfirmationResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  if (order.paymentMethod !== 'BANK_TRANSFER') {
    throw new ApiError('INVALID_CONFIRMATION_ACCESS', 404, 'Not a BANK_TRANSFER order (mock)');
  }
  if (order.status !== 'CONFIRMED') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order not confirmed (mock)');
  }
  if (!token || token === 'EXPIRED') {
    throw new ApiError('INVALID_CONFIRMATION_ACCESS', 404, 'Token invalid or expired (mock)');
  }
  const gross = order.totalPriceNet ?? order.lines[0]?.priceNet ?? 0;
  const net = Math.round(gross / 1.23);
  const vat = gross - net;
  const invoiceNumber = `PF/${orderId.slice(-5).toUpperCase()}/2026`;
  const customerEmail = order.personalData?.email ?? 'unknown@example.com';
  const pdfText = `Faktura pro forma (mock) — ${invoiceNumber}`;
  const pdfBytes = new TextEncoder().encode(pdfText);
  const pdfUrl = `data:text/plain;charset=utf-8;base64,${btoa(String.fromCharCode(...pdfBytes))}`;
  return {
    type: 'BANK_TRANSFER',
    orderId,
    proforma: {
      invoiceNumber,
      pdfUrl,
      dueDate: plus14Days(),
    },
    payment: {
      bankAccount: '12 3456 7890 1234 5678 9012 3456',
      transferTitle: invoiceNumber,
      grossAmountMinorUnits: gross,
      netAmountMinorUnits: net,
      vatAmountMinorUnits: vat,
      currency: 'PLN',
    },
    customerEmail,
  };
}

export async function createStripeCheckoutSessionMock(
  orderId: string,
): Promise<CreateCheckoutSessionResponseDto> {
  const order = ordersById.get(orderId);
  if (!order) throw new ApiError('ORDER_NOT_FOUND', 404, 'Order not found (mock)');
  // Accept CONFIRMED (Flow A) AND PENDING_ALLOCATION (Flow C setup-mode after confirmAsPaid).
  if (order.status !== 'CONFIRMED' && order.status !== 'PENDING_ALLOCATION') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'Order not confirmed (mock)');
  }
  if (order.paymentMethod !== 'STRIPE_CHECKOUT') {
    throw new ApiError('INVALID_ORDER_STATE', 409, 'paymentMethod != STRIPE_CHECKOUT (mock)');
  }
  const sessionId = 'cs_mock_' + Math.random().toString(36).slice(2, 11);
  // Mock URL points to our /checkout/success so dev flow works without real Stripe.
  const url = `/checkout/success?orderId=${encodeURIComponent(orderId)}&sessionId=${sessionId}&mock=true`;
  return { sessionId, url, paymentId: 'pay_mock_' + sessionId.slice(8) };
}
