import { ApiError, type ApiErrorCode, type BackendApiErrorCode, type BackendExceptionDto } from './types/errors';
import { getAccessToken, clearAll } from '../auth/session';
import { redirectToPortal } from '../auth/portal-redirect';

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Skip Authorization header injection. Use dla endpointów public/anonymous
   * (np. /iam/exchange-handoff sam wystawia tokens — nie ma sensu wysyłać starego JWT).
   * Również wyłącza 401 → portal-redirect (anonymous 401 to "normalny" błąd domeny).
   */
  anonymous?: boolean;
}

const BACKEND_CODES = new Set<BackendApiErrorCode>([
  'INVALID_NIP', 'INVALID_POSTAL_CODE', 'INVALID_COMPANY_DATA', 'INVALID_CONSENT',
  'INCOMPLETE_CHECKOUT', 'INVALID_ROLE_ASSIGNMENT', 'ORDER_NOT_FOUND',
  'INVALID_CONFIRMATION_ACCESS', 'INVALID_ORDER_STATE', 'EMAIL_NOT_AVAILABLE',
  'DISCOUNT_SOURCE_CONFLICT', 'DISCOUNT_CODE_NOT_FOUND', 'COMPANY_LOOKUP_UNAVAILABLE',
  'HANDOFF_TOKEN_INVALID_OR_EXPIRED', 'USER_INACTIVE', 'PLAN_CHANGE_PENDING',
  'DOWNGRADE_NOT_ALLOWED', 'REACTIVATION_DOWNGRADE_NOT_ALLOWED',
  'DISCOUNT_NOT_ALLOWED_FOR_ORDER_TYPE', 'OPERATIONAL_STANDARDS_REQUIRED',
  'PROFORMA_NOT_ISSUED',
]);

function getBaseUrl(): string {
  const base = import.meta.env.PUBLIC_API_BASE_URL;
  if (!base) {
    throw new ApiError('INTERNAL_ERROR', 0, 'PUBLIC_API_BASE_URL is not set');
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = getBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalizedPath}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isBackendCode(code: unknown): code is BackendApiErrorCode {
  return typeof code === 'string' && BACKEND_CODES.has(code as BackendApiErrorCode);
}

function extractMessage(body: BackendExceptionDto | undefined): string | null {
  if (!body?.message) return null;
  return Array.isArray(body.message) ? body.message.join('; ') : body.message;
}

async function parseErrorBody(response: Response): Promise<BackendExceptionDto | undefined> {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined;
    return (await response.json()) as BackendExceptionDto;
  } catch {
    return undefined;
  }
}

async function request<TResponse>(path: string, init: RequestInit, options?: RequestOptions): Promise<TResponse> {
  const url = buildUrl(path, options?.query);

  // Authorization injection per spec §5.2.1.
  // Caller może wymusić anonymous (np. /iam/exchange-handoff) przez options.anonymous = true.
  const baseHeaders: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  const hadTokenAttached = !options?.anonymous && Boolean(getAccessToken());
  if (hadTokenAttached) {
    baseHeaders['Authorization'] = `Bearer ${getAccessToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: baseHeaders, signal: options?.signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    throw new ApiError('NETWORK_ERROR', 0, message);
  }
  if (response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as TResponse;
    }
    return undefined as unknown as TResponse;
  }

  // 401 handling per spec §5.2.2.
  // Tylko gdy wysłaliśmy token (auth-aware request) i NIE jest to anonymous call.
  // Anonymous 401 (np. /iam/exchange-handoff z invalid token) bubbluje normalnie — caller decyduje.
  if (response.status === 401 && hadTokenAttached) {
    clearAll();
    redirectToPortal('session-expired');
    // Throw also — caller's catch zazwyczaj nie zdąży, ale defense-in-depth.
    throw new ApiError('UNKNOWN', 401, 'session expired — redirecting to portal');
  }

  const body = await parseErrorBody(response);
  const code: ApiErrorCode = isBackendCode(body?.code) ? body!.code as BackendApiErrorCode : 'INTERNAL_ERROR';
  throw new ApiError(code, response.status, extractMessage(body), body?.metadata);
}

export function apiGet<TResponse>(path: string, options?: RequestOptions): Promise<TResponse> {
  return request<TResponse>(path, { method: 'GET', headers: { Accept: 'application/json', ...(options?.headers ?? {}) } }, options);
}

export function apiPost<TBody, TResponse>(path: string, body: TBody, options?: RequestOptions): Promise<TResponse> {
  return request<TResponse>(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options?.headers ?? {}) },
      body: JSON.stringify(body),
    },
    options,
  );
}

export function apiPatch<TBody, TResponse>(path: string, body: TBody, options?: RequestOptions): Promise<TResponse> {
  return request<TResponse>(
    path,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options?.headers ?? {}) },
      body: JSON.stringify(body),
    },
    options,
  );
}
