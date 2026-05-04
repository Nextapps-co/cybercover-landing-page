import { apiGet } from './http';
import type { PlanCatalogResponseDto } from './types/catalog';
import { getMockPlans } from './__mocks__/catalog.mock';

export async function getPlans(
  discountCode?: string,
  partnerCode?: string,
): Promise<PlanCatalogResponseDto> {
  if (import.meta.env.PUBLIC_USE_MOCK_CATALOG === 'true') {
    return getMockPlans(discountCode, partnerCode);
  }
  const query: Record<string, string> = {};
  if (discountCode) query.discountCode = discountCode;
  if (partnerCode) query.partnerCode = partnerCode;
  return apiGet<PlanCatalogResponseDto>('/pricing-catalog', {
    query: Object.keys(query).length > 0 ? query : undefined,
  });
}
