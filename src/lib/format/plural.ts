/**
 * Polska liczba mnoga: 1 → „zaproszenie", 2-4 → „zaproszenia", 5+ → „zaproszeń".
 * Reguła obejmuje wyjątek dla nastek (12-14 idą jak 5+).
 */
export function pluralPl(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;
  const lastTwo = abs % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return many;
  const last = abs % 10;
  return last >= 2 && last <= 4 ? few : many;
}
