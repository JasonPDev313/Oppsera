'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck, Sparkles, RotateCcw } from 'lucide-react';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { ImportTypeCard } from '@/components/import/ImportTypeCard';
import { getEnabledImportTypes } from '@/lib/import-registry';
import { useAllImportHistory } from '@/hooks/use-all-import-history';

const REASSURANCE_POINTS = [
  { icon: ShieldCheck, text: 'Nothing changes until you approve every mapping' },
  { icon: Sparkles, text: 'AI auto-matches your columns — you just review' },
  { icon: RotateCcw, text: 'Re-import anytime with updated files' },
] as const;

/**
 * Inline content for the "Choose Data to Import" onboarding step.
 * Shows reassurance messaging, import type cards, and progress tracking.
 */
export function ImportDataSection() {
  const { isModuleEnabled } = useEntitlementsContext();
  const types = getEnabledImportTypes(isModuleEnabled);
  const { items: history } = useAllImportHistory();

  // Count completed imports by type
  const completedTypes = new Set<string>(
    history.filter((h) => h.status === 'completed' || h.status === 'done').map((h) => h.module),
  );
  const totalEnabled = types.length;
  const completedCount = types.filter((t) => completedTypes.has(t.key)).length;

  return (
    <div className="space-y-4">
      {/* Reassurance banner */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <p className="mb-3 text-sm font-medium text-blue-700 dark:text-blue-300">
          Bring your data with you — we make switching easy.
        </p>
        <ul className="space-y-1.5">
          {REASSURANCE_POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.text} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {p.text}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Import progress summary */}
      {completedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2.5">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              {completedCount} of {totalEnabled} data types imported
            </p>
          </div>
          <div className="h-1.5 w-24 rounded-full bg-green-500/15">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${totalEnabled > 0 ? (completedCount / totalEnabled) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Import type cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {types.slice(0, 4).map((t) => (
          <ImportTypeCard
            key={t.key}
            icon={t.icon}
            label={t.label}
            description={t.description}
            href={t.href}
            acceptedFormats={t.acceptedFormats}
          />
        ))}
      </div>

      {types.length > 4 && (
        <Link
          href="/settings/data-imports"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          View all {types.length} import types <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      <div className="pt-2">
        <Link
          href="/settings/data-imports"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Go to Import Dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
