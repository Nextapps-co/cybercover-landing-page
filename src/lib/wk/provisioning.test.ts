import { describe, it, expect } from 'vitest';
import { nextPollDelayMs, PROVISIONING_SCHEDULE } from './provisioning';

describe('nextPollDelayMs', () => {
  it('odpytuje czesto przez pierwsze 30 sekund', () => {
    expect(nextPollDelayMs(0)).toBe(PROVISIONING_SCHEDULE.fastIntervalMs);
    expect(nextPollDelayMs(29_999)).toBe(PROVISIONING_SCHEDULE.fastIntervalMs);
  });

  it('potem zwalnia', () => {
    expect(nextPollDelayMs(30_000)).toBe(PROVISIONING_SCHEDULE.slowIntervalMs);
    expect(nextPollDelayMs(119_999)).toBe(PROVISIONING_SCHEDULE.slowIntervalMs);
  });

  it('po progu przestaje odpytywac — zaden status nie oznacza "nie powiodlo sie", wiec petla bez konca nic nie wnosi', () => {
    expect(nextPollDelayMs(120_000)).toBeNull();
    expect(nextPollDelayMs(600_000)).toBeNull();
  });
});
