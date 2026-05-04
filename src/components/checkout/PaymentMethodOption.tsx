interface Props {
  id: string;
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  badges?: string[];
}

export function PaymentMethodOption({
  id, name, value, selected, onSelect, title, description, badges,
}: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer gap-3 rounded-[8px] border p-4 transition-colors ${
        selected ? 'border-[#FED64B] bg-[#FFFFE7]' : 'border-[#E4E2DF] bg-white hover:border-[#A2A09C]'
      }`}
    >
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="mt-1 h-4 w-4 accent-[#FED64B] cursor-pointer"
      />
      <div className="flex-1">
        <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm font-semibold text-[#0D0D0D]">{title}</p>
        <p className="mt-0.5 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]">{description}</p>
        {badges && badges.length > 0 && (
          <div className="mt-2 flex gap-2">
            {badges.map(b => (
              <span
                key={b}
                className="inline-block rounded border border-[#E4E2DF] bg-[#F8F7F4] px-2 py-0.5 font-['Plus_Jakarta_Sans',sans-serif] text-xs text-[#6B6965]"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}
