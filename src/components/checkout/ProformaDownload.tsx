import type { BankTransferProformaDto } from '../../lib/api/types/order';

interface Props {
  proforma: BankTransferProformaDto;
  customerEmail: string;
}

export function ProformaDownload({ proforma, customerEmail }: Props) {
  return (
    <div className="rounded-[12px] border border-[#E4E2DF] bg-[#F8F7F4] p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <p className="text-sm text-[#0D0D0D]">
        Fakturę pro forma do opłacenia otrzymasz na adres <strong>{customerEmail}</strong>.
      </p>
      {/* Tymczasowo ukryty przycisk pobierania proformy — fakturę klient dostaje mailem.
      <a
        href={proforma.pdfUrl}
        download={`${proforma.invoiceNumber}.pdf`}
        className="mt-4 inline-flex items-center gap-2 rounded-[80px] bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#413f3b]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1v9m0 0L4 6m4 4l4-4M2 13h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Faktura-Pro-forma.pdf
      </a>
      */}
    </div>
  );
}
