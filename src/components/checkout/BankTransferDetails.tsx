import { useState } from 'react';
import type { BankTransferProformaDto, BankTransferPaymentDto } from '../../lib/api/types/order';

interface Props {
  payment: BankTransferPaymentDto;
  proforma: BankTransferProformaDto;
}

function formatGrosze(grosze: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(grosze / 100)
    .replace(/ /g, ' ')
    .replace(/ /g, ' ');
}

function formatDateISO(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function BankTransferDetails({ payment, proforma }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // best-effort
    }
  };

  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <h3 className="text-base font-semibold text-[#0D0D0D]">Dane do przelewu</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <CopyRow label="Numer konta" value={payment.bankAccount} copyKey="bankAccount" copied={copied} onCopy={handleCopy} />
        <CopyRow label="Tytuł przelewu" value={payment.transferTitle} copyKey="transferTitle" copied={copied} onCopy={handleCopy} />
        <div className="flex justify-between border-t border-[#E4E2DF] pt-3">
          <dt className="text-[#6B6965]">Termin płatności</dt>
          <dd className="font-semibold text-[#0D0D0D]">{formatDateISO(proforma.dueDate)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#6B6965]">Kwota netto</dt>
          <dd className="text-[#0D0D0D]">{formatGrosze(payment.netAmountMinorUnits)} {payment.currency}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#6B6965]">VAT</dt>
          <dd className="text-[#0D0D0D]">{formatGrosze(payment.vatAmountMinorUnits)} {payment.currency}</dd>
        </div>
        <div className="flex justify-between border-t border-[#E4E2DF] pt-3">
          <dt className="text-base font-semibold text-[#0D0D0D]">Kwota brutto</dt>
          <dd className="text-base font-bold text-[#0D0D0D]">{formatGrosze(payment.grossAmountMinorUnits)} {payment.currency}</dd>
        </div>
      </dl>
    </div>
  );
}

interface CopyRowProps {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}

function CopyRow({ label, value, copyKey, copied, onCopy }: CopyRowProps) {
  return (
    <div>
      <dt className="text-[#6B6965]">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-[#F8F7F4] px-2 py-1 font-mono text-xs text-[#0D0D0D]">{value}</code>
        <button
          type="button"
          onClick={() => onCopy(copyKey, value)}
          className="rounded border border-[#E4E2DF] px-2 py-1 text-xs text-[#0D0D0D] hover:bg-[#F8F7F4]"
        >
          {copied === copyKey ? 'Skopiowano!' : 'Kopiuj'}
        </button>
      </dd>
    </div>
  );
}
