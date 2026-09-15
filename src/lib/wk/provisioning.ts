/**
 * Harmonogram odpytywania ekranu „zakładamy firmę".
 *
 * Odpytujemy `GET /borg/config` — trasa BEZ limitu żądań. `checkout-state` ma
 * wspólny kubełek 60/min na adres IP, dzielony przez wszystkich za jednym NAT-em (§2).
 *
 * Próg istnieje, bo trasa stanu ma trzy wartości i ŻADNA nie oznacza „zakładanie
 * firmy nie powiodło się" (§7.2). Gdy saga się zatnie, rekord zostaje w PROVISIONING
 * na stałe — pętla bez końca kręciłaby animacją, nie dowiadując się niczego.
 */
export const PROVISIONING_SCHEDULE = {
  fastIntervalMs: 2_000,
  fastUntilMs: 30_000,
  slowIntervalMs: 5_000,
  giveUpAfterMs: 120_000,
} as const;

/** `null` = przekroczono próg; przestań odpytywać i pokaż odesłanie do wsparcia. */
export function nextPollDelayMs(elapsedMs: number): number | null {
  if (elapsedMs >= PROVISIONING_SCHEDULE.giveUpAfterMs) return null;
  if (elapsedMs < PROVISIONING_SCHEDULE.fastUntilMs) return PROVISIONING_SCHEDULE.fastIntervalMs;
  return PROVISIONING_SCHEDULE.slowIntervalMs;
}
