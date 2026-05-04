import { describe, it, expect } from 'vitest';
import { validateOperationalStandards } from './operational-standards';
import type { StandardQuestionDto } from '../api/types/order';

const QUESTIONS: StandardQuestionDto[] = [
  { key: 'A', label: 'Question A' },
  { key: 'B', label: 'Question B' },
  { key: 'C', label: 'Question C' },
];

describe('validateOperationalStandards', () => {
  it('returns errors for every question when answers empty', () => {
    const errors = validateOperationalStandards({}, QUESTIONS);
    expect(Object.keys(errors)).toHaveLength(3);
    expect(errors.A).toBe('Wybierz odpowiedź');
    expect(errors.B).toBe('Wybierz odpowiedź');
    expect(errors.C).toBe('Wybierz odpowiedź');
  });

  it('returns errors only for missing answers (partial)', () => {
    const errors = validateOperationalStandards({ A: 'YES' }, QUESTIONS);
    expect(errors.A).toBeUndefined();
    expect(errors.B).toBe('Wybierz odpowiedź');
    expect(errors.C).toBe('Wybierz odpowiedź');
  });

  it('returns empty object when all answers provided', () => {
    const errors = validateOperationalStandards(
      { A: 'YES', B: 'NO', C: 'DONT_KNOW' },
      QUESTIONS,
    );
    expect(errors).toEqual({});
  });

  it('treats whitespace-only answers as missing', () => {
    const errors = validateOperationalStandards({ A: '   ', B: 'YES', C: 'YES' }, QUESTIONS);
    expect(errors.A).toBe('Wybierz odpowiedź');
    expect(errors.B).toBeUndefined();
    expect(errors.C).toBeUndefined();
  });

  it('returns empty object when there are no questions', () => {
    const errors = validateOperationalStandards({}, []);
    expect(errors).toEqual({});
  });
});
