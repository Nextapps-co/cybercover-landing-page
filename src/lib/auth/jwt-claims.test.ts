import { describe, it, expect } from 'vitest';
import { parseClaims, isExpired, type JwtClaims } from './jwt-claims';

// Helper żeby zbudować fake JWT (header.payload.signature, base64url-encoded)
function buildJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.sig`;
}

describe('jwt-claims', () => {
  describe('parseClaims', () => {
    it('parses valid JWT payload', () => {
      const token = buildJwt({ sub: 'user-123', companyId: 'co-x', role: 'OWNER', exp: 9999999999 });
      const claims = parseClaims(token);
      expect(claims).toEqual({ sub: 'user-123', companyId: 'co-x', role: 'OWNER', exp: 9999999999 });
    });

    it('returns null for malformed token (no dots)', () => {
      expect(parseClaims('not-a-jwt')).toBeNull();
    });

    it('returns null for token with non-JSON payload', () => {
      expect(parseClaims('header.not-base64-json.sig')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseClaims('')).toBeNull();
    });

    it('returns null for mock-style opaque token (dev fake auth)', () => {
      // Mock layer używa 'mock-access-optimum-ACTIVE' jako opaque token.
      // parseClaims musi tolerować ten format zwracając null.
      expect(parseClaims('mock-access-optimum-ACTIVE')).toBeNull();
    });

    it('returns null when payload lacks required sub field', () => {
      const token = buildJwt({ companyId: 'x' });
      expect(parseClaims(token)).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('returns true when exp in past', () => {
      const claims: JwtClaims = { sub: 'x', exp: 1000 };
      expect(isExpired(claims, 5000 * 1000)).toBe(true);
    });

    it('returns false when exp in future', () => {
      const claims: JwtClaims = { sub: 'x', exp: 9999999999 };
      expect(isExpired(claims, Date.now())).toBe(false);
    });

    it('returns false when exp not present', () => {
      expect(isExpired({ sub: 'x' }, Date.now())).toBe(false);
    });
  });
});
