// Per spec §5.4.2 — backend zmienia shape z raw array na wrapped object
// `{ plans, currentPlanCode?, subscriptionStatus? }`. Adapter akceptuje też raw array
// dla backward compat (jeśli BE jeszcze nie dotarł z nowym shape'em).

import { apiGet } from './http';
import type { PlanCatalogResponseDto, PlanCatalogEntryDto } from './types/catalog';
import { getMockPlans } from './__mocks__/catalog.mock';

function normalize(raw: PlanCatalogResponseDto | PlanCatalogEntryDto[]): PlanCatalogResponseDto {
  if (Array.isArray(raw)) return { plans: raw };
  return raw;
}

export async function getPlans(
  discountCode?: string,
  partnerCode?: string,
): Promise<PlanCatalogResponseDto> {
  if (import.meta.env.PUBLIC_USE_MOCK_CATALOG === 'true') {
    const mock = await getMockPlans(discountCode, partnerCode);
    return normalize(mock);
  }
  const query: Record<string, string> = {};
  if (discountCode) query.discountCode = discountCode;
  if (partnerCode) query.partnerCode = partnerCode;
  const raw = await apiGet<PlanCatalogResponseDto | PlanCatalogEntryDto[]>('/pricing-catalog', {
    query: Object.keys(query).length > 0 ? query : undefined,
  });
  return normalize(raw);
}
