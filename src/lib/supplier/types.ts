/**
 * Ekrany przerywające lejek zaproszeniowy. Renderowane pełnoekranowo zamiast
 * formularza — gdy krok wchodzi w jeden z tych stanów, formularza nie ma po co pokazywać.
 */
export type SupplierNoticeVariant =
  | 'invitation-invalid'
  | 'already-registered'
  | 'config-error'
  | 'order-state'
  | 'no-session'
  | 'inconsistent-order'
  | 'rate-limited'
  | 'storage-blocked';

export type RegistrationOutcome =
  | { kind: 'wizard'; path: string }
  | { kind: 'notice'; variant: SupplierNoticeVariant };
