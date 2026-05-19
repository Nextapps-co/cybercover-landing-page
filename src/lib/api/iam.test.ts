import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exchangeHandoff } from './iam';

describe('iam.exchangeHandoff', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
    window.sessionStorage.clear();
  });

  it('POSTs handoffToken to /iam/exchange-handoff anonymously', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'jwt-x', refreshToken: 'jwt-y' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await exchangeHandoff('handoff-abc');
    expect(result).toEqual({ accessToken: 'jwt-x', refreshToken: 'jwt-y' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/iam/exchange-handoff',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handoffToken: 'handoff-abc' }),
      }),
    );
  });

  it('does not send Authorization header even when stale token in storage', async () => {
    window.sessionStorage.setItem('cybercover:auth-access', 'stale-token');
    window.sessionStorage.setItem('cybercover:auth-refresh', 'stale-refresh');
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'jwt-x', refreshToken: 'jwt-y' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await exchangeHandoff('handoff-abc');
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('throws ApiError on 401 HANDOFF_TOKEN_INVALID_OR_EXPIRED', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, code: 'HANDOFF_TOKEN_INVALID_OR_EXPIRED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(exchangeHandoff('bad')).rejects.toMatchObject({
      code: 'HANDOFF_TOKEN_INVALID_OR_EXPIRED',
    });
  });

  it('throws ApiError on 401 USER_INACTIVE', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, code: 'USER_INACTIVE' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(exchangeHandoff('ok')).rejects.toMatchObject({
      code: 'USER_INACTIVE',
    });
  });
});
