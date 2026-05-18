import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPlans } from './catalog';

describe('catalog client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
  });

  it('returns wrapped { plans } shape when PUBLIC_USE_MOCK_CATALOG=true (adapter wraps raw mock)', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'true';
    const response = await getPlans();
    expect(response.plans).toBeInstanceOf(Array);
    expect(response.plans).toHaveLength(4);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('hits /pricing-catalog endpoint when flag=false', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ plans: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await getPlans();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/pricing-catalog',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('forwards discountCode as query param when provided', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ plans: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await getPlans('SUMMER10');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/pricing-catalog?discountCode=SUMMER10',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('forwards partnerCode as query param when provided', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ plans: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await getPlans(undefined, 'VALVETECH');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/pricing-catalog?partnerCode=VALVETECH',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends both discountCode and partnerCode when both provided', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ plans: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await getPlans('SUMMER10', 'VALVETECH');
    const call = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(call).toContain('discountCode=SUMMER10');
    expect(call).toContain('partnerCode=VALVETECH');
  });

  describe('wrapped/raw adapter', () => {
    beforeEach(() => {
      import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    });

    it('returns response as-is when BE returns wrapped shape', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({
            plans: [{ catalogEntryId: 'A', planId: 'p1', planName: 'Standard', displayOrder: 1 }],
            currentPlanCode: 'standard',
            subscriptionStatus: 'ACTIVE',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await getPlans();
      expect(result.plans).toHaveLength(1);
      expect(result.currentPlanCode).toBe('standard');
      expect(result.subscriptionStatus).toBe('ACTIVE');
    });

    it('wraps raw array response in { plans } for backward compat', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify([
            { catalogEntryId: 'A', planId: 'p1', planName: 'Standard', displayOrder: 1 },
            { catalogEntryId: 'B', planId: 'p2', planName: 'Optimum', displayOrder: 2 },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const result = await getPlans();
      expect(result.plans).toHaveLength(2);
      expect(result.currentPlanCode).toBeUndefined();
      expect(result.subscriptionStatus).toBeUndefined();
    });
  });
});
