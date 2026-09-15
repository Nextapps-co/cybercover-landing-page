import { describe, it, expect } from 'vitest';
import { nextPollDelayMs } from './provisioning';

// Oczekiwania celowo jako literały (2_000 / 5_000), nie PROVISIONING_SCHEDULE.xIntervalMs:
// odczyt stałej po nazwie z tego samego obiektu, który testujemy, nie wychwyciłby
// zamiany wartości fastIntervalMs/slowIntervalMs miejscami — test i implementacja
// czytałyby wtedy tę samą, już błędną liczbę i zestaw zostałby zielony (recenzja).
describe('nextPollDelayMs', () => {
  it('odpytuje czesto przez pierwsze 30 sekund', () => {
    expect(nextPollDelayMs(0)).toBe(2_000);
    expect(nextPollDelayMs(29_999)).toBe(2_000);
  });

  it('potem zwalnia', () => {
    expect(nextPollDelayMs(30_000)).toBe(5_000);
    expect(nextPollDelayMs(119_999)).toBe(5_000);
  });

  it('po progu przestaje odpytywac — zaden status nie oznacza "nie powiodlo sie", wiec petla bez konca nic nie wnosi', () => {
    expect(nextPollDelayMs(120_000)).toBeNull();
    expect(nextPollDelayMs(600_000)).toBeNull();
  });
});
