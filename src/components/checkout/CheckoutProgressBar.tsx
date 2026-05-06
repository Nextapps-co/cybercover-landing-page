interface Step {
  number: number;        // canonical (1=CompanyData, 2=PersonalData, 3=OS, 4=Payment, 5=Confirm)
  label: string;
  path: string;
}

interface CheckoutProgressBarProps {
  // Canonical step number (1..5). The bar maps to display position when osSkipped hides step 3.
  currentStep: number;
  // §2.6 — when true, the OS step is filtered out and remaining steps are renumbered (4 total).
  osSkipped?: boolean;
}

const STEPS: Step[] = [
  { number: 1, label: 'Dane firmy',          path: '/checkout/company-data' },
  { number: 2, label: 'Dane osobiste',       path: '/checkout/personal-data' },
  { number: 3, label: 'Standardy',           path: '/checkout/operational-standards' },
  { number: 4, label: 'Płatność',            path: '/checkout/payment-method' },
  { number: 5, label: 'Potwierdzenie',       path: '/checkout/confirm' },
];

export function CheckoutProgressBar({ currentStep, osSkipped }: CheckoutProgressBarProps) {
  const visibleSteps = (osSkipped ? STEPS.filter(s => s.number !== 3) : STEPS)
    .map((s, i) => ({ ...s, displayNumber: i + 1 }));

  const currentVisible = visibleSteps.find(s => s.number === currentStep);
  const currentDisplay = currentVisible?.displayNumber ?? currentStep;
  const totalDisplay = visibleSteps.length;

  return (
    <div className="mb-12">
      <div className="max-w-4xl mx-auto">
        {/* Desktop */}
        <div className="hidden md:flex items-start justify-between">
          {visibleSteps.map((step, index) => (
            <div key={step.number} className="flex items-start flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] font-bold text-sm transition-colors ${
                    step.number < currentStep
                      ? 'bg-[#268E55] text-white'
                      : step.number === currentStep
                      ? 'bg-[#FED64B] text-black'
                      : 'bg-[#f8f7f4] text-[#6b6966] border-2 border-[#EAEAE8]'
                  }`}
                >
                  {step.number < currentStep ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.displayNumber
                  )}
                </div>
                <span
                  className={`mt-2 font-['Plus_Jakarta_Sans',sans-serif] text-xs whitespace-nowrap ${
                    step.number === currentStep
                      ? 'font-semibold text-black'
                      : 'font-normal text-[#6b6966]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < visibleSteps.length - 1 && (
                <div className="flex-1 flex items-center h-10">
                  <div className="w-full h-0.5 mx-4 bg-[#EAEAE8] relative">
                    <div
                      className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                        step.number < currentStep ? 'bg-[#268E55] w-full' : 'bg-transparent w-0'
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-sm text-black">
              Krok {currentDisplay} z {totalDisplay}
            </span>
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-normal text-sm text-[#6b6966]">
              {currentVisible?.label}
            </span>
          </div>
          <div className="w-full h-2 bg-[#f8f7f4] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FED64B] transition-all duration-300"
              style={{ width: `${(currentDisplay / totalDisplay) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
