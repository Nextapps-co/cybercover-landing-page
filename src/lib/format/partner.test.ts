import { describe, it, expect, beforeEach } from 'vitest';
import { getPartnerFromUrl, clearPartner } from './partner';

describe('partner helper', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/cennik');
  });

  it('returns null when no URL param and no sessionStorage', () => {
    expect(getPartnerFromUrl()).toBeNull();
  });

  it('reads from URL query and persists to sessionStorage', () => {
    window.history.replaceState({}, '', '/cennik?partner=VALVETECH');
    expect(getPartnerFromUrl()).toBe('VALVETECH');
    expect(sessionStorage.getItem('cybercover:partner-code')).toBe('VALVETECH');
  });

  it('URL param overrides sessionStorage', () => {
    sessionStorage.setItem('cybercover:partner-code', 'OLD');
    window.history.replaceState({}, '', '/cennik?partner=NEW');
    expect(getPartnerFromUrl()).toBe('NEW');
    expect(sessionStorage.getItem('cybercover:partner-code')).toBe('NEW');
  });

  it('falls back to sessionStorage when URL param missing', () => {
    sessionStorage.setItem('cybercover:partner-code', 'FALLBACK');
    expect(getPartnerFromUrl()).toBe('FALLBACK');
  });

  it('normalizes whitespace', () => {
    window.history.replaceState({}, '', '/cennik?partner=%20VALVETECH%20');
    expect(getPartnerFromUrl()).toBe('VALVETECH');
  });

  it('treats empty string as null', () => {
    window.history.replaceState({}, '', '/cennik?partner=');
    expect(getPartnerFromUrl()).toBeNull();
  });

  it('clearPartner removes sessionStorage entry', () => {
    sessionStorage.setItem('cybercover:partner-code', 'X');
    clearPartner();
    expect(sessionStorage.getItem('cybercover:partner-code')).toBeNull();
  });
});
