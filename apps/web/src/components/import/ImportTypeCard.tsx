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
  completed: { bg: 'bg-green-500/20', text: 'text-green-500', label: 'Completed' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-500', label: 'Failed' },
  partial: { bg: 'bg-amber-500/20', text: 'text-amber-500', label: 'Partial' },
  processing: { bg: 'bg-blue-500/20', text: 'text-blue-500', label: 'Processing' },
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
      className={`group flex flex-col rounded-lg border border-border p-5 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-indigo-500/40 hover:bg-indigo-500/10'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold">{label}</h3>
      </div>

      {/* Description */}
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>

      {/* Format pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {acceptedFormats.map((fmt) => (
          <span
            key={fmt}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
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
            <span className="text-muted-foreground">
              {lastImport.records.toLocaleString()} records &middot; {lastImport.date}
            </span>
          </div>
        ) : (
          <p className="mb-3 text-xs italic text-muted-foreground">No imports yet</p>
        )}

        {/* Action */}
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${disabled ? 'text-muted-foreground' : 'text-indigo-500 group-hover:gap-2'} transition-all`}>
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
