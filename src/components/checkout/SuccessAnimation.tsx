export function SuccessAnimation() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <svg width="120" height="120" viewBox="0 0 120 120" className="text-[#FED64B]">
        <circle
          cx="60"
          cy="60"
          r="56"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="352"
          strokeDashoffset="352"
          className="checkmark-circle"
        />
        <path
          d="M40 62 L54 76 L82 46"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="80"
          strokeDashoffset="80"
          className="checkmark-tick"
        />
        <style>
          {`
            @keyframes drawCircle { to { stroke-dashoffset: 0; } }
            @keyframes drawTick { to { stroke-dashoffset: 0; } }
            .checkmark-circle { animation: drawCircle 0.6s ease-out forwards; }
            .checkmark-tick { animation: drawTick 0.4s ease-out 0.6s forwards; }
          `}
        </style>
      </svg>
    </div>
  );
}
