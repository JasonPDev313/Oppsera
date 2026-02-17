'use client';

interface FormFieldProps {
  label: string;
  error?: string;
  helpText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  helpText,
  required,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {helpText && !error && (
        <p className="text-xs text-gray-500">{helpText}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
