'use client';

import { useId, cloneElement, isValidElement } from 'react';

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
  const generatedId = useId();
  const fieldId = `field-${generatedId}`;
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;

  // Clone the child input to inject a11y attributes
  const enhancedChildren = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        id: (children.props.id as string) || fieldId,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? errorId : helpText ? helpId : undefined,
        'aria-required': required ? 'true' : undefined,
      })
    : children;

  const inputId = isValidElement<Record<string, unknown>>(children)
    ? (children.props.id as string) || fieldId
    : fieldId;

  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      {enhancedChildren}
      {helpText && !error && (
        <p id={helpId} className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {error && <p id={errorId} role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
