import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getWkConfig, submitWkPersonalData, completeWkConfig, wkLoginUrl } from './wk-config';

const CONFIG = {
  status: 'IN_PROGRESS',
  entryStep: 'company-data',
  operationalStandardsRequired: false,
  prefill: { companyName: 'WK TEST', firstName: 'Jan', lastName: 'Kowalski', email: 'jan@example.test', phone: null },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('wk-config client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
    import.meta.env.PUBLIC_USE_MOCK_ORDERS = 'false';
    sessionStorage.clear();
  });

  // Klucz musi być DOKŁADNIE ten, którego używa src/lib/auth/session.ts (`ACCESS_KEY`) —
  // patrz analogiczny komentarz w src/lib/api/orders.test.ts. Literówka sprawiłaby, że
  // getAccessToken() i tak zwróciłby null, test przeszedłby z niewłaściwego powodu
  // (bo Authorization nigdy by się nie pojawił, niezależnie od anonymous: true)
  // i nie chroniłby przed regresją usuwającą `anonymous: true` z klienta.
  const ACCESS_KEY = 'cybercover:auth-access';

  it('wola GET /borg/config z orderId w query — bez powtorzonego prefiksu /api', async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse(CONFIG));
    await getWkConfig('75fc532b');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/borg/config?orderId=75fc532b',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('nie wysyla Authorization mimo tokenu w sesji', async () => {
    sessionStorage.setItem(ACCESS_KEY, 'jwt-resztka');
    (globalThis.fetch as any).mockResolvedValue(jsonResponse(CONFIG));
    await getWkConfig('o1');
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('404 zachowuje status — brak pola code w odpowiedzi bramki', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse({ statusCode: 404, message: 'Not Found', error: 'Not Found' }, 404),
    );
    await expect(getWkConfig('zle')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('krok 2 idzie POST-em na trase WK z orderId w ciele', async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse({ ...CONFIG, entryStep: 'ready-to-complete' }, 201));
    await submitWkPersonalData({
      orderId: 'o1', firstName: 'Jan', lastName: 'Kowalski',
      email: 'jan@example.test', phone: '+48500600700',
      consents: [{ consentDefinitionId: 'c1', accepted: true, consentVersion: 1 }],
    });
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/borg/config/personal-data');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).orderId).toBe('o1');
  });

  it('domkniecie wysyla samo orderId i przyjmuje 201 jako powodzenie', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      jsonResponse({ status: 'PROVISIONING', entryStep: 'done', operationalStandardsRequired: false, prefill: null }, 201),
    );
    const res = await completeWkConfig('o1');
    expect(res.status).toBe('PROVISIONING');
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/borg/config/complete');
    expect(JSON.parse(init.body)).toEqual({ orderId: 'o1' });
  });

  it('wkLoginUrl sklada pelny adres wyjscia', () => {
    expect(wkLoginUrl()).toBe('http://localhost:3000/api/borg/login');
  });

  it('wkLoginUrl nie dubluje ukosnika przy bazie z ukosnikiem na koncu', () => {
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api/';
    expect(wkLoginUrl()).toBe('http://localhost:3000/api/borg/login');
  });
});
