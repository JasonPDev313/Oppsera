'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';

export interface AccountingEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function AccountingEmptyState({
  icon: Icon = FileText,
  title,
  description,
  action,
  actionLabel,
  actionHref,
  onAction,
}: AccountingEmptyStateProps) {
  const btnClass =
    'mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none';

  const resolvedLabel = action?.label ?? actionLabel;
  const resolvedOnClick = action?.onClick ?? onAction;

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 text-center">
      <Icon className="h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {actionHref && resolvedLabel && (
        <Link href={actionHref} className={btnClass}>
          {resolvedLabel}
        </Link>
      )}
      {!actionHref && resolvedOnClick && resolvedLabel && (
        <button type="button" onClick={resolvedOnClick} className={btnClass}>
          {resolvedLabel}
        </button>
      )}
    </div>
  );
}
