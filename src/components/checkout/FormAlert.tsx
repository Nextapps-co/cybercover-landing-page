interface Props {
  variant?: 'error' | 'warning' | 'info';
  title?: string;
  message: string;
}

const VARIANT_CLASSES: Record<NonNullable<Props['variant']>, string> = {
  error: 'border-red-300 bg-red-50 text-red-700',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-700',
  info: 'border-blue-300 bg-blue-50 text-blue-700',
};

export function FormAlert({ variant = 'error', title, message }: Props) {
  return (
    <div
      role="alert"
      className={`mb-6 rounded-[12px] border p-4 font-['Plus_Jakarta_Sans',sans-serif] ${VARIANT_CLASSES[variant]}`}
    >
      {title && <h4 className="text-sm font-semibold">{title}</h4>}
      <p className={`text-sm ${title ? 'mt-1' : ''}`}>{message}</p>
    </div>
  );
}
