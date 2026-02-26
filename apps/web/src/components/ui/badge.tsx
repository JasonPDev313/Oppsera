'use client';

const variantClasses: Record<string, string> = {
  success: 'bg-green-500/10 text-green-500 ring-green-600/20',
  warning: 'bg-amber-500/10 text-amber-500 ring-amber-600/20',
  error: 'bg-red-500/10 text-red-500 ring-red-600/20',
  neutral: 'bg-muted text-muted-foreground ring-gray-500/10',
  info: 'bg-blue-500/10 text-blue-500 ring-blue-600/20',
  indigo: 'bg-indigo-500/10 text-indigo-500 ring-indigo-600/20',
  purple: 'bg-purple-500/10 text-purple-500 ring-purple-600/20',
  orange: 'bg-orange-500/10 text-orange-500 ring-orange-600/20',
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
