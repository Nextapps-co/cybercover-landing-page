import { describe, it, expect, beforeEach } from 'vitest';
import { getDiscountCodeFromUrl, clearDiscountCode } from './discount-code';

describe('discount-code helper', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/cennik');
  });

  it('returns null when no URL param and no sessionStorage', () => {
    expect(getDiscountCodeFromUrl()).toBeNull();
  });

  it('reads from URL query and persists to sessionStorage', () => {
    window.history.replaceState({}, '', '/cennik?discountCode=SUMMER10');
    expect(getDiscountCodeFromUrl()).toBe('SUMMER10');
    expect(sessionStorage.getItem('cybercover:discount-code')).toBe('SUMMER10');
  });

  it('URL param overrides sessionStorage', () => {
    sessionStorage.setItem('cybercover:discount-code', 'OLD');
    window.history.replaceState({}, '', '/cennik?discountCode=NEW');
    expect(getDiscountCodeFromUrl()).toBe('NEW');
    expect(sessionStorage.getItem('cybercover:discount-code')).toBe('NEW');
  });

  it('falls back to sessionStorage when URL param missing', () => {
    sessionStorage.setItem('cybercover:discount-code', 'FALLBACK');
    expect(getDiscountCodeFromUrl()).toBe('FALLBACK');
  });

  it('treats empty string as null', () => {
    window.history.replaceState({}, '', '/cennik?discountCode=');
    expect(getDiscountCodeFromUrl()).toBeNull();
  });

  it('clearDiscountCode removes sessionStorage entry', () => {
    sessionStorage.setItem('cybercover:discount-code', 'X');
    clearDiscountCode();
    expect(sessionStorage.getItem('cybercover:discount-code')).toBeNull();
  });
});
