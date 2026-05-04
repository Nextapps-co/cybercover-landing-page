import { useState } from 'react';
import { AnswerTile } from './AnswerTile';
import type { StandardQuestionDto } from '../../lib/api/types/order';

const ANSWER_LABELS: Record<string, string> = {
  YES: 'Tak',
  NO: 'Nie',
  DONT_KNOW: 'Nie wiem',
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface Props {
  question: StandardQuestionDto;
  answerOptions: string[];
  answer: string | undefined;
  onChange: (answer: string) => void;
  error?: string;
  required?: boolean;
}

export function StandardQuestion({
  question, answerOptions, answer, onChange, error, required,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasDescription = Boolean(question.description?.trim());

  return (
    <div className="rounded-[12px] bg-[#f8f7f4] p-5">
      <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#0D0D0D]">
        {question.label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </p>
      {hasDescription && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#0D0D0D] underline hover:text-black"
        >
          {expanded ? 'Ukryj wyjaśnienie' : 'Pokaż wyjaśnienie'}
        </button>
      )}
      {expanded && hasDescription && (
        <p className="mt-2 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">{question.description}</p>
      )}
      <div role="radiogroup" aria-label={question.label} className="mt-4 flex flex-wrap gap-2">
        {answerOptions.map((opt, i) => (
          <AnswerTile
            key={opt}
            name={question.key}
            letter={LETTERS[i] ?? String(i + 1)}
            label={ANSWER_LABELS[opt] ?? opt}
            selected={answer === opt}
            onClick={() => onChange(opt)}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-500" role="alert">{error}</p>}
    </div>
  );
}
