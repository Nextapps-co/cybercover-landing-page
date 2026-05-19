import { apiGet, apiPost, apiPatch } from './http';
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
  SelectPaymentMethodResponseDto,
  ConfirmOrderResponseDto,
  CreateCheckoutSessionResponseDto,
  OrderConfirmationResponseDto,
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
  selectPaymentMethodMock,
  confirmOrderMock,
  createStripeCheckoutSessionMock,
  getOrderConfirmationMock,
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
  return apiPatch<SubmitPersonalDataDto, CheckoutStateResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/personal-data`,
    dto,
  );
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
 * Per spec §5.6.2 — response shape rozszerzony o `line.pricing` z breakdown[].
 * Dla `orderType=PLAN_UPGRADE` breakdown zawiera 2 linie (charge + credit ujemny),
 * dla `INITIAL_PURCHASE` / `REACTIVATION` — 1 linię (base).
 */
export async function selectPaymentMethod(
  orderId: string,
  dto: SelectPaymentMethodDto,
): Promise<SelectPaymentMethodResponseDto> {
  if (useMock()) return selectPaymentMethodMock(orderId, dto);
  return apiPatch<SelectPaymentMethodDto, SelectPaymentMethodResponseDto>(
    `/orders/${encodeURIComponent(orderId)}/payment-method`,
    dto,
  );
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
