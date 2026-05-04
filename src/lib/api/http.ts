import { ApiError, type ApiErrorCode, type BackendApiErrorCode, type BackendExceptionDto } from './types/errors';

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const BACKEND_CODES = new Set<BackendApiErrorCode>([
  'INVALID_NIP', 'INVALID_POSTAL_CODE', 'INVALID_COMPANY_DATA', 'INVALID_CONSENT',
  'INCOMPLETE_CHECKOUT', 'INVALID_ROLE_ASSIGNMENT', 'ORDER_NOT_FOUND',
  'INVALID_CONFIRMATION_ACCESS', 'INVALID_ORDER_STATE', 'EMAIL_NOT_AVAILABLE',
  'DISCOUNT_SOURCE_CONFLICT', 'DISCOUNT_CODE_NOT_FOUND', 'COMPANY_LOOKUP_UNAVAILABLE',
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
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: options?.signal });
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
