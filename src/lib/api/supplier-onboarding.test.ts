import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInvitation, registerSupplier } from './supplier-onboarding';
import { ApiError } from './types/errors';

const INVITATION = {
  nip: '5252248481',
  contactEmail: 'kontakt@acme.pl',
  organization: { legalName: 'Acme Sp. z o.o.', industry: null, address: null },
  leadingEntityName: 'Selgros Sp. z o.o.',
  invitedRelationshipsCount: 2,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('supplier-onboarding client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    import.meta.env.PUBLIC_API_BASE_URL = 'http://localhost:3000/api';
  });

  describe('getInvitation', () => {
    it('woła GET /supplier-onboarding/invitation z tokenem w query', async () => {
      (globalThis.fetch as any).mockResolvedValue(jsonResponse(INVITATION));
      const invitation = await getInvitation('tok_123');
      expect(invitation.nip).toBe('5252248481');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/supplier-onboarding/invitation?token=tok_123',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('nie wysyła nagłówka Authorization (anonymous)', async () => {
      (globalThis.fetch as any).mockResolvedValue(jsonResponse(INVITATION));
      await getInvitation('tok_123');
      const [, init] = (globalThis.fetch as any).mock.calls[0];
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('mapuje 404 na kod NOT_FOUND_EXCEPTION', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ statusCode: 404, message: 'not found', error: 'Not Found', code: 'NOT_FOUND_EXCEPTION' }, 404),
      );
      await expect(getInvitation('zly')).rejects.toMatchObject({ code: 'NOT_FOUND_EXCEPTION' });
    });
  });

  describe('registerSupplier', () => {
    it('woła POST /supplier-onboarding/register z samym tokenem w body', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ orderId: 'ord_1', outcome: 'STARTED', wizardEntryStep: 'company-data', orderType: 'INITIAL_PURCHASE' }, 201),
      );
      const res = await registerSupplier('tok_123');
      expect(res.outcome).toBe('STARTED');
      const [url, init] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/supplier-onboarding/register');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ token: 'tok_123' });
    });

    it('zwraca ALREADY_REGISTERED z wizardEntryStep = null', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ orderId: 'ord_1', outcome: 'ALREADY_REGISTERED', wizardEntryStep: null, orderType: 'INITIAL_PURCHASE' }, 201),
      );
      const res = await registerSupplier('tok_123');
      expect(res.outcome).toBe('ALREADY_REGISTERED');
      expect(res.wizardEntryStep).toBeNull();
    });

    it('mapuje 422 na STANDARD_PLAN_NOT_FOUND', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ statusCode: 422, message: 'no plan', error: 'Unprocessable', code: 'STANDARD_PLAN_NOT_FOUND' }, 422),
      );
      await expect(registerSupplier('tok_123')).rejects.toBeInstanceOf(ApiError);
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ statusCode: 422, message: 'no plan', error: 'Unprocessable', code: 'STANDARD_PLAN_NOT_FOUND' }, 422),
      );
      await expect(registerSupplier('tok_123')).rejects.toMatchObject({
        code: 'STANDARD_PLAN_NOT_FOUND',
        httpStatus: 422,
      });
    });

    it('zachowuje status 429 przy przekroczeniu limitu', async () => {
      (globalThis.fetch as any).mockResolvedValue(
        jsonResponse({ statusCode: 429, message: 'Too many requests', error: 'Too Many Requests' }, 429),
      );
      await expect(registerSupplier('tok_123')).rejects.toMatchObject({ httpStatus: 429 });
    });
  });
});
