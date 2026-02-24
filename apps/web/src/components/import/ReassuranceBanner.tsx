'use client';

import { ShieldCheck } from 'lucide-react';

interface ReassuranceBannerProps {
  /** 'prominent' renders a bordered card, 'subtle' renders inline italic text */
  variant?: 'prominent' | 'subtle';
  /** Override the default message */
  message?: string;
}

const DEFAULT_MESSAGE =
  "Nothing changes until you approve — you'll review all mappings and see a preview before any data is saved.";

export function ReassuranceBanner({
  variant = 'prominent',
  message = DEFAULT_MESSAGE,
}: ReassuranceBannerProps) {
  if (variant === 'subtle') {
    return (
      <p className="text-center text-xs italic text-gray-400 dark:text-gray-500">
        {message}
      </p>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <p className="text-sm text-blue-700 dark:text-blue-300">{message}</p>
    </div>
  );
}
