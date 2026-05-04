import type { StandardQuestionDto } from '../api/types/order';

export type OpStandardsFieldErrors = Record<string, string>;

export function validateOperationalStandards(
  answers: Record<string, string>,
  questions: StandardQuestionDto[],
): OpStandardsFieldErrors {
  const errors: OpStandardsFieldErrors = {};
  for (const q of questions) {
    const raw = answers[q.key];
    if (!raw || raw.trim() === '') {
      errors[q.key] = 'Wybierz odpowiedź';
    }
  }
  return errors;
}
