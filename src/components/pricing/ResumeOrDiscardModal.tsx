import { useEffect } from 'react';

interface ResumeOrDiscardModalProps {
  draftPlanName: string;
  clickedPlanName: string;
  onContinueDraft: () => void;
  onStartNew: () => void;
  onClose: () => void;
}

export function ResumeOrDiscardModal({
  draftPlanName,
  clickedPlanName,
  onContinueDraft,
  onStartNew,
  onClose,
}: ResumeOrDiscardModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const samePlan = draftPlanName === clickedPlanName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-modal-title"
        className="w-full max-w-md rounded-[16px] bg-white p-6 font-['Plus_Jakarta_Sans',sans-serif] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="resume-modal-title" className="text-xl font-bold text-[#0D0D0D]">
          {samePlan
            ? 'Masz już rozpoczęte zamówienie tego planu'
            : `Masz rozpoczęte zamówienie planu ${draftPlanName}`}
        </h2>
        <p className="mt-2 text-sm text-[#6B6965]">
          {samePlan
            ? 'Chcesz je dokończyć, czy zacząć od nowa? Rozpoczęcie nowego porzuci poprzednie.'
            : `Chcesz je dokończyć, czy zacząć nowe zamówienie planu ${clickedPlanName}? Rozpoczęcie nowego porzuci poprzednie.`}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onStartNew}
            className="rounded-[80px] border border-[#A2A09C] bg-white px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-[#F8F7F4]"
          >
            Zacznij nowe
          </button>
          <button
            type="button"
            onClick={onContinueDraft}
            className="rounded-[80px] bg-[#FED64B] px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-[#FFC107]"
          >
            Dokończ rozpoczęte
          </button>
        </div>
      </div>
    </div>
  );
}
