// Minimal email format check — backend performs strict validation.

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export function validateEmail(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'Email jest wymagany';
  if (!EMAIL_REGEX.test(trimmed)) return 'Niepoprawny format emaila';
  return null;
}
