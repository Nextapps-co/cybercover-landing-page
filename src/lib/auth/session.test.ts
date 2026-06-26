import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  getSession,
  clearAll,
  hasSession,
  clearAllCheckoutState,
} from './session';

describe('auth/session', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('returns null for getters when no session', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getSession()).toBeNull();
    expect(hasSession()).toBe(false);
  });

  it('setTokens persists access + refresh + storedAt', () => {
    setTokens('access-x', 'refresh-y');
    expect(getAccessToken()).toBe('access-x');
    expect(getRefreshToken()).toBe('refresh-y');
    const session = getSession();
    expect(session?.accessToken).toBe('access-x');
    expect(session?.refreshToken).toBe('refresh-y');
    expect(session?.storedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(hasSession()).toBe(true);
  });

  it('clearAll removes only auth keys', () => {
    setTokens('a', 'r');
    window.sessionStorage.setItem('cybercover:order-session', '{"orderId":"x"}');
    clearAll();
    expect(getAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:order-session')).toBe('{"orderId":"x"}');
  });

  it('clearAllCheckoutState removes auth keys + order-session + form-state keys', () => {
    setTokens('a', 'r');
    window.localStorage.setItem('cybercover:order-session', 'x');
    window.sessionStorage.setItem('cybercover:form-state:company-data', 'y');
    window.sessionStorage.setItem('cybercover:form-state:payment-method', 'z');
    window.sessionStorage.setItem('cybercover:mock-auth-context', 'm');
    window.sessionStorage.setItem('cybercover:pricing-snapshot', 'p');
    window.sessionStorage.setItem('cybercover:other-unrelated-key', 'keep');
    clearAllCheckoutState();
    expect(getAccessToken()).toBeNull();
    expect(window.localStorage.getItem('cybercover:order-session')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:form-state:company-data')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:form-state:payment-method')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:mock-auth-context')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:pricing-snapshot')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:other-unrelated-key')).toBe('keep');
  });

  it('returns null when malformed entry in storage', () => {
    window.sessionStorage.setItem('cybercover:auth-access', '');
    expect(getAccessToken()).toBeNull();
    expect(hasSession()).toBe(false);
  });
});
