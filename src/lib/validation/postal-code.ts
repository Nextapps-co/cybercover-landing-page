// Polish postal code validation: format XX-XXX (2 digits, dash, 3 digits).

const POSTAL_CODE_REGEX = /^\d{2}-\d{3}$/;

export function normalizePostalCode(input: string): string {
  return input.trim();
}

export function validatePostalCode(input: string): string | null {
  const trimmed = normalizePostalCode(input);
  if (trimmed.length === 0) return 'Kod pocztowy jest wymagany';
  if (!POSTAL_CODE_REGEX.test(trimmed)) return 'Kod pocztowy w formacie XX-XXX (np. 00-001)';
  return null;
}
