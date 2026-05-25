import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function FormStep({ title, children }: Props) {
  return (
    <div className="bg-[#f8f7f4] rounded-[12px] p-6 flex flex-col gap-6">
      <h2 className="font-['Plus_Jakarta_Sans',sans-serif] font-semibold text-[18px] leading-6 text-black">
        {title}
      </h2>
      <div className="flex flex-col gap-5">
        {children}
      </div>
    </div>
  );
}
