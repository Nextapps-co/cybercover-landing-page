import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPlans } from './catalog';

describe('catalog client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
  });

  it('returns mock response when PUBLIC_USE_MOCK_CATALOG=true', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'true';
    const plans = await getPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans).toHaveLength(4);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('hits /pricing-catalog endpoint when flag=false', async () => {
    import.meta.env.PUBLIC_USE_MOCK_CATALOG = 'false';
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify([]), {
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
      new Response(JSON.stringify([]), {
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
      new Response(JSON.stringify([]), {
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
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await getPlans('SUMMER10', 'VALVETECH');
    const call = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(call).toContain('discountCode=SUMMER10');
    expect(call).toContain('partnerCode=VALVETECH');
  });
});
