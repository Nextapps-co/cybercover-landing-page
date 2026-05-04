interface Props {
  letter: string;       // 'A' | 'B' | 'C'
  label: string;        // 'Tak' | 'Nie' | 'Nie wiem'
  selected: boolean;
  onClick: () => void;
  name: string;         // group name (questionKey)
}

export function AnswerTile({ letter, label, selected, onClick, name }: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-name={name}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-[8px] border px-4 py-3 font-['Plus_Jakarta_Sans',sans-serif] text-sm transition-colors cursor-pointer ${
        selected
          ? 'border-[#FED64B] bg-[#FFFFE7] font-semibold text-[#0D0D0D]'
          : 'border-[#E4E2DF] bg-white hover:border-[#A2A09C] text-[#0D0D0D]'
      }`}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-black bg-black text-white text-xs font-bold">
        {letter}
      </span>
      <span>{label}</span>
    </button>
  );
}
