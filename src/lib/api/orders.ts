import { apiGet, apiPost, apiPatch, apiDelete } from './http';
import { ApiError } from './types/errors';
import type {
  CheckoutStateResponseDto,
  CompanyLookupResponseDto,
  OrderResponseDto,
  StartOrderDto,
  StartOrderResponseDto,
  SubmitCompanyDataDto,
  ConsentDefinitionDto,
  GetConsentDefinitionsResponseDto,
  SubmitPersonalDataDto,
  OperationalStandardsSchemaResponseDto,
  SubmitOperationalStandardsDto,
  SubmitOperationalStandardsResponseDto,
  EligibilityResultResponseDto,
  EvaluateEligibilityRequestDto,
  ValidateDiscountDto,
  DiscountValidationResponseDto,
  SelectPaymentMethodDto,
  ConfirmOrderResponseDto,
  CreateCheckoutSessionResponseDto,
  OrderConfirmationResponseDto,
  ChangePaymentMethodDto,
  ChangePaymentMethodResponseDto,
  CancelOrderResponseDto,
} from './types/order';
import {
  getCheckoutStateMock,
  getOrderMock,
  startOrderMock,
  lookupCompanyMock,
  submitCompanyDataMock,
  fetchConsentDefinitionsMock,
  submitPersonalDataMock,
  getOperationalStandardsSchemaMock,
  submitOperationalStandardsMock,
  evaluateEligibilityMock,
  validateDiscountCodeMock,
  removeDiscountMock,
  selectPaymentMethodMock,
  confirmOrderMock,
  createStripeCheckoutSessionMock,
  getOrderConfirmationMock,
  changePaymentMethodMock,
  cancelOrderMock,
  markOrderPaidMock,
} from './__mocks__/orders.mock';

function useMock(): boolean {
  return import.meta.env.PUBLIC_USE_MOCK_ORDERS === 'true';
}

export async function startOrder(dto: StartOrderDto): Promise<StartOrderResponseDto> {
  if (useMock()) return startOrderMock(dto);
  return apiPost<StartOrderDto, StartOrderResponseDto>('/orders/start', dto);
}

export async function getOrder(orderId: string): Promise<OrderResponseDto> {
  if (useMock()) return getOrderMock(orderId);
  return apiGet<OrderResponseDto>(`/orders/${encodeURIComponent(orderId)}`);
}

export async function getCheckoutState(orderId: string): Promise<CheckoutStateResponseDto> {
  if (useMock()) return getCheckoutStateMock(orderId);
  return apiGet<CheckoutStateResponseDto>(`/orders/${encodeURIComponent(orderId)}/checkout-state`);
}

export async function submitCompanyData(orderId: string, dto: SubmitCompanyDataDto) {
  if (useMock()) return submitCompanyDataMock(orderId, dto);
  return apiPatch<SubmitCompanyDataDto, CheckoutStateResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/company-data`,
    dto,
  );
}

export async function lookupCompany(nip: string): Promise<CompanyLookupResponseDto> {
  if (useMock()) return lookupCompanyMock(nip);
  return apiGet<CompanyLookupResponseDto>('/orders/company-lookup', { query: { nip } });
}

export async function fetchConsentDefinitions(): Promise<ConsentDefinitionDto[]> {
  if (useMock()) return fetchConsentDefinitionsMock();
  const res = await apiGet<GetConsentDefinitionsResponseDto>('/orders/consent-definitions');
  return res.consentDefinitions;
}

export async function submitPersonalData(orderId: string, dto: SubmitPersonalDataDto) {
  if (useMock()) return submitPersonalDataMock(orderId, dto);
  try {
    return await apiPatch<SubmitPersonalDataDto, CheckoutStateResponseDto>(
      `/orders/${encodeURIComponent(orderId)}/personal-data`,
      dto,
    );
  } catch (err) {
    // BE zwraca 409 dla zajętego emaila BEZ pola `code` (tylko `message` + `metadata.email`),
    // więc http.ts — który klasyfikuje wyłącznie po `body.code` — mapuje go na INTERNAL_ERROR
    // ("Błąd serwera"). Jedyny konflikt biznesowy tego endpointu to zajęty email, więc
    // nierozpoznany 409 re-mapujemy na kanoniczny EMAIL_NOT_AVAILABLE (zachowując status,
    // message i metadata). Gdyby BE zaczął wysyłać poprawny `code`, http.ts rozpozna go sam
    // i ten warunek (code === 'INTERNAL_ERROR') już nie zadziała — nic nie nadpiszemy.
    if (err instanceof ApiError && err.httpStatus === 409 && err.code === 'INTERNAL_ERROR') {
      throw new ApiError('EMAIL_NOT_AVAILABLE', err.httpStatus, err.backendMessage, err.metadata);
    }
    throw err;
  }
}

export async function getOperationalStandardsSchema(orderId: string) {
  if (useMock()) return getOperationalStandardsSchemaMock(orderId);
  return apiGet<OperationalStandardsSchemaResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/operational-standards-schema`,
  );
}

export async function submitOperationalStandards(orderId: string, dto: SubmitOperationalStandardsDto) {
  if (useMock()) return submitOperationalStandardsMock(orderId, dto);
  return apiPatch<SubmitOperationalStandardsDto, SubmitOperationalStandardsResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/operational-standards`,
    dto,
  );
}

export async function evaluateEligibility(orderId: string, dto: EvaluateEligibilityRequestDto) {
  if (useMock()) return evaluateEligibilityMock(orderId, dto);
  return apiPost<EvaluateEligibilityRequestDto, EligibilityResultResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/evaluate-eligibility`,
    dto,
  );
}

export async function validateDiscountCode(orderId: string, dto: ValidateDiscountDto) {
  if (useMock()) return validateDiscountCodeMock(orderId, dto);
  return apiPost<ValidateDiscountDto, DiscountValidationResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/validate-discount`,
    dto,
  );
}

/**
 * CC-522 — usuwa nałożony kod rabatowy z zamówienia. Zwraca pełny, zaktualizowany
 * `OrderResponseDto` (`discount: null`, `totalPriceNet` wraca do pełnej ceny).
 * Idempotentny: gdy nie ma czego usuwać, backend i tak zwraca 200 z niezmienionym zamówieniem.
 * Rabatów partnerskich/promocyjnych NIE usuwa → 409 `DISCOUNT_REMOVAL_NOT_ALLOWED`.
 */
export async function removeDiscount(orderId: string): Promise<OrderResponseDto> {
  if (useMock()) return removeDiscountMock(orderId);
  return apiDelete<OrderResponseDto>(`/orders/${encodeURIComponent(orderId)}/discount`);
}

/**
 * CC-353 — PATCH /payment-method zwraca tylko checkout-state (postęp kroków), BEZ cen.
 * Kwoty/proracja są wyłącznie na GET /orders/:id; po tym PATCH ConfirmStep robi świeży
 * `getOrder`, który zwraca przeliczoną `proration` (np. po kodzie rabatowym).
 */
export async function selectPaymentMethod(
  orderId: string,
  dto: SelectPaymentMethodDto,
): Promise<CheckoutStateResponseDto> {
  if (useMock()) return selectPaymentMethodMock(orderId, dto);
  return apiPatch<SelectPaymentMethodDto, CheckoutStateResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/payment-method`,
    dto,
  );
}

export async function changePaymentMethod(
  orderId: string,
  dto: ChangePaymentMethodDto,
): Promise<ChangePaymentMethodResponseDto> {
  if (useMock()) return changePaymentMethodMock(orderId, dto);
  return apiPatch<ChangePaymentMethodDto, ChangePaymentMethodResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/change-payment-method`,
    dto,
  );
}

export async function cancelOrder(orderId: string): Promise<CancelOrderResponseDto> {
  if (useMock()) return cancelOrderMock(orderId);
  return apiPost<undefined, CancelOrderResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    undefined,
  );
}

// Mock-only: oznacza zamówienie jako opłacone (symulacja sukcesu płatności kartą).
// W realnym trybie no-op — sygnał płatności daje backend. Wołane przez SuccessStatus.
export function markOrderPaidForMock(orderId: string): void {
  if (useMock()) markOrderPaidMock(orderId);
}

export async function confirmOrder(orderId: string): Promise<ConfirmOrderResponseDto> {
  if (useMock()) return confirmOrderMock(orderId);
  return apiPost<undefined, ConfirmOrderResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/confirm`,
    undefined,
  );
}

export async function createStripeCheckoutSession(orderId: string): Promise<CreateCheckoutSessionResponseDto> {
  if (useMock()) return createStripeCheckoutSessionMock(orderId);
  // NOTE: this endpoint lives under /sales-order/, NOT /orders/
  return apiPost<undefined, CreateCheckoutSessionResponseDto>(
    `/sales-order/${encodeURIComponent(orderId)}/stripe-checkout-session`,
    undefined,
  );
}

export async function getOrderConfirmation(orderId: string, token: string): Promise<OrderConfirmationResponseDto> {
  if (useMock()) return getOrderConfirmationMock(orderId, token);
  return apiGet<OrderConfirmationResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/confirmation`,
    { query: { token } },
  );
}

export function buildProformaDownloadUrl(orderId: string, token: string): string {
  if (useMock()) {
    const text = `Faktura pro forma (mock) — orderId=${orderId} token=${token}`;
    const bytes = new TextEncoder().encode(text);
    return `data:text/plain;charset=utf-8;base64,${btoa(String.fromCharCode(...bytes))}`;
  }
  const base = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/orders/${encodeURIComponent(orderId)}/proforma/download?token=${encodeURIComponent(token)}`;
}
