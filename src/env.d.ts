/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE_URL: string;
  readonly PUBLIC_USE_MOCK_CATALOG?: string;
  readonly PUBLIC_USE_MOCK_ORDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
