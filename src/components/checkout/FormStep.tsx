import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function FormStep({ title, children }: Props) {
  return (
    <div className="bg-[#f8f7f4] rounded-[12px] p-6">
      <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-lg text-black mb-6">
        {title}
      </h2>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}
