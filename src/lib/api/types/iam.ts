// src/lib/api/types/iam.ts
// Per spec §5.3 (IAM endpoint wrapper).

export interface ExchangeHandoffRequest {
  handoffToken: string;
}

export interface ExchangeHandoffResponse {
  accessToken: string;
  refreshToken: string;
}
