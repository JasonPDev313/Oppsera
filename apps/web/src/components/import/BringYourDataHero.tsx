'use client';

import { FileText, Sparkles, ShieldCheck, RotateCcw } from 'lucide-react';

interface BringYourDataHeroProps {
  variant?: 'full' | 'compact';
  /** Hide the bullet points (e.g. for returning users) */
  hideBullets?: boolean;
}

const BULLETS = [
  { icon: FileText, text: 'Any format works — CSV, TSV, or Excel from any legacy system' },
  { icon: Sparkles, text: 'Intelligent auto-matching maps your columns to ours' },
  { icon: ShieldCheck, text: 'Nothing changes until you approve every mapping' },
  { icon: RotateCcw, text: 'Import anytime — re-run with updated files whenever you need' },
] as const;

export function BringYourDataHero({
  variant = 'full',
  hideBullets,
}: BringYourDataHeroProps) {
  if (variant === 'compact') {
    return (
      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <p className="text-sm text-indigo-700 dark:text-indigo-300">
          <Sparkles className="mr-1.5 inline-block h-4 w-4" />
          Bring your data with you — we auto-match columns and show a preview before anything changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Bring Your Data With You
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Moving from another system? We make it easy to import your existing data.
      </p>
      {!hideBullets && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BULLETS.map((b) => {
            const Icon = b.icon;
            return (
              <li
                key={b.text}
                className="flex items-start gap-2.5 rounded-lg bg-gray-500/5 px-3 py-2.5"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{b.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
