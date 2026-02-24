'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface LastImportInfo {
  status: 'completed' | 'failed' | 'partial' | 'processing';
  date: string;
  records: number;
}

interface ImportTypeCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  acceptedFormats: string[];
  lastImport?: LastImportInfo | null;
  disabled?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Completed' },
  failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Failed' },
  partial: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Partial' },
  processing: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Processing' },
};

export function ImportTypeCard({
  icon: Icon,
  label,
  description,
  href,
  acceptedFormats,
  lastImport,
  disabled,
}: ImportTypeCardProps) {
  const content = (
    <div
      className={`group flex flex-col rounded-lg border border-gray-200 p-5 transition-colors dark:border-gray-700 ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/10'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold">{label}</h3>
      </div>

      {/* Description */}
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{description}</p>

      {/* Format pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {acceptedFormats.map((fmt) => (
          <span
            key={fmt}
            className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          >
            {fmt}
          </span>
        ))}
      </div>

      {/* Spacer pushes bottom content down */}
      <div className="mt-auto">
        {/* Last import info */}
        {lastImport ? (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[lastImport.status]?.bg ?? ''} ${STATUS_STYLES[lastImport.status]?.text ?? ''}`}>
              {STATUS_STYLES[lastImport.status]?.label ?? lastImport.status}
            </span>
            <span className="text-gray-400 dark:text-gray-500">
              {lastImport.records.toLocaleString()} records &middot; {lastImport.date}
            </span>
          </div>
        ) : (
          <p className="mb-3 text-xs italic text-gray-400 dark:text-gray-500">No imports yet</p>
        )}

        {/* Action */}
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${disabled ? 'text-gray-400' : 'text-indigo-600 group-hover:gap-2 dark:text-indigo-400'} transition-all`}>
          Start Import <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
