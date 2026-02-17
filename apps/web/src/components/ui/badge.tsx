'use client';

const variantClasses: Record<string, string> = {
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  error: 'bg-red-50 text-red-700 ring-red-600/20',
  neutral: 'bg-gray-50 text-gray-600 ring-gray-500/10',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const classes = variantClasses[variant] || variantClasses.neutral;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classes} ${className}`}
    >
      {children}
    </span>
  );
}
