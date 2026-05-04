// checkout-flow.md §9.0.3 — domain error code taxonomy + frontend-only codes.

export type BackendApiErrorCode =
  | 'INVALID_NIP'
  | 'INVALID_POSTAL_CODE'
  | 'INVALID_COMPANY_DATA'
  | 'INVALID_CONSENT'
  | 'INCOMPLETE_CHECKOUT'
  | 'INVALID_ROLE_ASSIGNMENT'
  | 'ORDER_NOT_FOUND'
  | 'INVALID_CONFIRMATION_ACCESS'
  | 'INVALID_ORDER_STATE'
  | 'EMAIL_NOT_AVAILABLE'
  | 'DISCOUNT_SOURCE_CONFLICT'
  | 'DISCOUNT_CODE_NOT_FOUND'
  | 'COMPANY_LOOKUP_UNAVAILABLE';

export type FrontendApiErrorCode = 'NETWORK_ERROR' | 'INTERNAL_ERROR' | 'UNKNOWN';

export type ApiErrorCode = BackendApiErrorCode | FrontendApiErrorCode;

export class ApiError extends Error {
  public readonly name = 'ApiError';

  constructor(
    public readonly code: ApiErrorCode,
    public readonly httpStatus: number,
    public readonly backendMessage: string | null,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(backendMessage ?? code);
  }
}

export interface BackendExceptionDto {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  metadata?: Record<string, unknown>;
}
