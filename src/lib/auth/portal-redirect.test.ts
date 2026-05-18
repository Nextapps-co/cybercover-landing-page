import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redirectToPortal } from './portal-redirect';

describe('portal-redirect', () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignSpy = vi.fn();
    warnSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { assign: assignSpy } as unknown as Location,
    });
    vi.spyOn(console, 'warn').mockImplementation(warnSpy);
  });

  it('redirects to PUBLIC_PORTAL_URL with reason param', () => {
    import.meta.env.PUBLIC_PORTAL_URL = 'https://portal.example.com';
    redirectToPortal('session-expired');
    expect(assignSpy).toHaveBeenCalledWith('https://portal.example.com/?returnReason=session-expired');
  });

  it('preserves portal path if URL has one', () => {
    import.meta.env.PUBLIC_PORTAL_URL = 'https://portal.example.com/auth';
    redirectToPortal('user-inactive');
    expect(assignSpy).toHaveBeenCalledWith('https://portal.example.com/auth?returnReason=user-inactive');
  });

  it('falls back to /cennik when PUBLIC_PORTAL_URL unset', () => {
    import.meta.env.PUBLIC_PORTAL_URL = '';
    redirectToPortal('token-invalid');
    expect(warnSpy).toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('/cennik');
  });

  it('falls back to /cennik when PUBLIC_PORTAL_URL is invalid URL', () => {
    import.meta.env.PUBLIC_PORTAL_URL = 'not a url';
    redirectToPortal('manual');
    expect(warnSpy).toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('/cennik');
  });
});
