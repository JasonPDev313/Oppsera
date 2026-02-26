'use client';

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-12 w-12 border-4',
};

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={label || 'Loading'} className="flex flex-col items-center justify-center gap-3">
      <div
        className={`animate-spin rounded-full border-muted border-t-indigo-600 ${sizeClasses[size]}`}
      />
      {label && <p className="text-sm text-muted-foreground" aria-hidden="true">{label}</p>}
    </div>
  );
}
