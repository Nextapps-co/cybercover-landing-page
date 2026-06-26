import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectAndExchangeHandoff } from './handoff';
import { setTokens, getAccessToken } from './session';
import { ApiError } from '../api/types/errors';

// Mock api/iam.exchangeHandoff
vi.mock('../api/iam', () => ({
  exchangeHandoff: vi.fn(),
}));
import { exchangeHandoff } from '../api/iam';

describe('detectAndExchangeHandoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/cennik');
    vi.mocked(exchangeHandoff).mockReset();
  });

  it('returns no-token when ?handoff= absent', async () => {
    const result = await detectAndExchangeHandoff();
    expect(result).toEqual({ kind: 'no-token' });
    expect(exchangeHandoff).not.toHaveBeenCalled();
  });

  it('exchanges token, stores session, strips ?handoff= from URL', async () => {
    window.history.replaceState({}, '', '/cennik?handoff=abc&partner=PARTNER-X');
    vi.mocked(exchangeHandoff).mockResolvedValue({ accessToken: 'jwt-a', refreshToken: 'jwt-r' });

    const result = await detectAndExchangeHandoff();

    expect(exchangeHandoff).toHaveBeenCalledWith('abc');
    expect(result.kind).toBe('exchanged');
    expect(getAccessToken()).toBe('jwt-a');
    expect(window.location.search).toContain('partner=PARTNER-X');
    expect(window.location.search).not.toContain('handoff=');
  });

  it('hard-resets sessionStorage before exchange', async () => {
    window.history.replaceState({}, '', '/cennik?handoff=abc');
    setTokens('OLD-token', 'OLD-refresh');
    window.localStorage.setItem('cybercover:order-session', '{"orderId":"old"}');
    window.sessionStorage.setItem('cybercover:form-state:company-data', 'stale');

    vi.mocked(exchangeHandoff).mockResolvedValue({ accessToken: 'NEW', refreshToken: 'NEW-r' });

    await detectAndExchangeHandoff();

    expect(getAccessToken()).toBe('NEW');
    expect(window.localStorage.getItem('cybercover:order-session')).toBeNull();
    expect(window.sessionStorage.getItem('cybercover:form-state:company-data')).toBeNull();
  });

  it('returns invalid on 401 HANDOFF_TOKEN_INVALID_OR_EXPIRED', async () => {
    window.history.replaceState({}, '', '/cennik?handoff=stale');
    vi.mocked(exchangeHandoff).mockRejectedValue(new ApiError('HANDOFF_TOKEN_INVALID_OR_EXPIRED', 401, null));
    const result = await detectAndExchangeHandoff();
    expect(result).toEqual({ kind: 'invalid' });
    expect(getAccessToken()).toBeNull();
  });

  it('returns user-inactive on 401 USER_INACTIVE', async () => {
    window.history.replaceState({}, '', '/cennik?handoff=ok');
    vi.mocked(exchangeHandoff).mockRejectedValue(new ApiError('USER_INACTIVE', 401, null));
    const result = await detectAndExchangeHandoff();
    expect(result).toEqual({ kind: 'user-inactive' });
  });

  it('returns error on network failure', async () => {
    window.history.replaceState({}, '', '/cennik?handoff=ok');
    vi.mocked(exchangeHandoff).mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'fetch failed'));
    const result = await detectAndExchangeHandoff();
    expect(result.kind).toBe('error');
  });
});
