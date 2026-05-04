// Polish NIP checksum algorithm (Ministerstwo Finansów standard).

const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export function normalizeNip(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function isValidNipChecksum(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  if (nip === '0000000000') return false;
  const digits = nip.split('').map(Number);
  const sum = WEIGHTS.reduce((acc, weight, idx) => acc + weight * digits[idx], 0);
  const checksum = sum % 11;
  if (checksum === 10) return false;
  return checksum === digits[9];
}

export function validateNip(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'NIP jest wymagany';
  const normalized = normalizeNip(trimmed);
  if (!/^\d{10}$/.test(normalized)) return 'NIP musi mieć 10 cyfr';
  if (!isValidNipChecksum(normalized)) return 'Niepoprawny NIP (błędna suma kontrolna)';
  return null;
}
