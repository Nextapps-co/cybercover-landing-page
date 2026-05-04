export interface SummaryDataCardRow {
  label: string;
  value: string;
}

interface Props {
  title: string;
  editLabel?: string;
  editHref?: string;
  rows: SummaryDataCardRow[];
}

export function SummaryDataCard({ title, editLabel, editHref, rows }: Props) {
  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-[#0D0D0D]">{title}</h3>
        {editHref && editLabel && (
          <a
            href={editHref}
            className="rounded-full bg-[#FED64B] px-3 py-1 text-xs font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
          >
            {editLabel}
          </a>
        )}
      </div>
      <dl className="mt-4 space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex gap-2 text-sm">
            <dt className="font-semibold text-[#0D0D0D]">{r.label}:</dt>
            <dd className="text-[#6B6965]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
