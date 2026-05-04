import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiGet, apiPost, apiPatch } from './http';

describe('http client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
  });

  describe('apiGet', () => {
    it('hits base URL + path, parses JSON', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      const result = await apiGet<{ ok: boolean }>('/foo');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/foo',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual({ ok: true });
    });

    it('serializes query params', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      await apiGet('/foo', { query: { a: '1', b: 'hello world' } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/foo?a=1&b=hello+world',
        expect.any(Object),
      );
    });

    it('throws ApiError with backend code on 4xx with body.code', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(
          JSON.stringify({ statusCode: 404, message: 'gone', error: 'OrderNotFoundError', code: 'ORDER_NOT_FOUND' }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        ),
      );
      await expect(apiGet('/foo')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
        httpStatus: 404,
        backendMessage: 'gone',
      });
    });

    it('throws INTERNAL_ERROR on 500 without code', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 500, message: 'boom', error: 'Error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await expect(apiGet('/foo')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', httpStatus: 500 });
    });

    it('throws NETWORK_ERROR on fetch throw', async () => {
      (globalThis.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(apiGet('/foo')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    it('throws NETWORK_ERROR on AbortError', async () => {
      (globalThis.fetch as any).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await expect(apiGet('/foo')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });
  });

  describe('apiPost', () => {
    it('sends JSON body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ id: 'x' }), { status: 201, headers: { 'content-type': 'application/json' } }),
      );
      await apiPost<{ a: number }, { id: string }>('/orders', { a: 1 });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ a: 1 }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });
  });

  describe('apiPatch', () => {
    it('uses PATCH method', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      await apiPatch('/foo', { x: 1 });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/foo',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
