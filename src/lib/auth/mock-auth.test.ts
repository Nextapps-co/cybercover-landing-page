import { describe, it, expect, beforeEach } from 'vitest';
import { consumeMockAuthFromUrl, getMockAuthContext } from './mock-auth';

describe('mock-auth', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/cennik');
  });

  it('returns null when no ?mockAuth= param', () => {
    consumeMockAuthFromUrl();
    expect(getMockAuthContext()).toBeNull();
  });

  it('parses mockAuth and stores opaque token + context', () => {
    window.history.replaceState({}, '', '/cennik?mockAuth=optimum-ACTIVE');
    consumeMockAuthFromUrl();
    expect(window.sessionStorage.getItem('cybercover:auth-access')).toBe('mock-access-optimum-ACTIVE');
    expect(window.sessionStorage.getItem('cybercover:auth-refresh')).toBe('mock-refresh-optimum-ACTIVE');
    expect(getMockAuthContext()).toEqual({ planCode: 'optimum', status: 'ACTIVE' });
  });

  it.each(['ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'CANCELLED'] as const)(
    'accepts status %s',
    (status) => {
      window.sessionStorage.clear();
      window.history.replaceState({}, '', `/cennik?mockAuth=standard-${status}`);
      consumeMockAuthFromUrl();
      expect(getMockAuthContext()).toEqual({ planCode: 'standard', status });
    },
  );

  it('returns null for malformed mockAuth (missing dash)', () => {
    window.history.replaceState({}, '', '/cennik?mockAuth=invalidformat');
    consumeMockAuthFromUrl();
    expect(getMockAuthContext()).toBeNull();
  });

  it('returns null for unknown status', () => {
    window.history.replaceState({}, '', '/cennik?mockAuth=optimum-BOGUS');
    consumeMockAuthFromUrl();
    expect(getMockAuthContext()).toBeNull();
  });
});
