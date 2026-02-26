'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock, AlertTriangle, FileText } from 'lucide-react';
import { BringYourDataHero } from '@/components/import/BringYourDataHero';
import { ImportTypeCard } from '@/components/import/ImportTypeCard';
import { RecentImportsTable } from '@/components/import/RecentImportsTable';
import { ReassuranceBanner } from '@/components/import/ReassuranceBanner';
import { useImportDashboard } from '@/hooks/use-import-dashboard';

export function DataImportsContent() {
  const {
    grouped,
    recentImports,
    typeLabels,
    isLoading,
    error,
    refresh,
  } = useImportDashboard();

  // Aggregate stats from recent imports
  const stats = useMemo(() => {
    const completed = recentImports.filter((r) => r.status === 'completed').length;
    const inProgress = recentImports.filter((r) => r.status === 'processing').length;
    const withErrors = recentImports.filter((r) => r.status === 'failed' || r.status === 'partial').length;
    const totalRecords = recentImports.reduce((sum, r) => sum + r.successRows, 0);
    return { completed, inProgress, withErrors, totalRecords };
  }, [recentImports]);

  const hasAnyImports = recentImports.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Hero */}
      <BringYourDataHero
        variant={hasAnyImports ? 'compact' : 'full'}
        hideBullets={hasAnyImports}
      />

      {/* API error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-500">
            Failed to load import history: {error}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Try again
          </button>
        </div>
      )}

      {/* Stats row — only show if any imports exist */}
      {hasAnyImports && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={CheckCircle2}
            label="Completed"
            value={stats.completed}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={stats.inProgress}
            color="blue"
          />
          <StatCard
            icon={AlertTriangle}
            label="Need Attention"
            value={stats.withErrors}
            color={stats.withErrors > 0 ? 'amber' : 'gray'}
          />
          <StatCard
            icon={FileText}
            label="Records Imported"
            value={stats.totalRecords}
            color="indigo"
            format="number"
          />
        </div>
      )}

      {/* Reassurance */}
      <ReassuranceBanner />

      {/* Import type cards grouped by category */}
      {grouped.map((group) => (
        <section key={group.category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.categoryLabel}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.types.map((t) => (
              <ImportTypeCard
                key={t.key}
                icon={t.icon}
                label={t.label}
                description={t.description}
                href={t.href}
                acceptedFormats={t.acceptedFormats}
                lastImport={
                  t.lastImport
                    ? {
                        status: t.lastImport.status as 'completed' | 'failed' | 'partial' | 'processing',
                        date: formatRelativeDate(t.lastImport.date),
                        records: t.lastImport.records,
                      }
                    : null
                }
              />
            ))}
          </div>
        </section>
      ))}

      {/* Recent imports table */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Imports
        </h2>
        <div className="rounded-lg border border-border p-4">
          <RecentImportsTable
            imports={recentImports}
            isLoading={isLoading}
            typeLabels={typeLabels}
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  format,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  format?: 'number';
}) {
  const colorMap: Record<string, string> = {
    green: 'text-green-500 bg-green-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    gray: 'text-muted-foreground bg-gray-500/10',
    indigo: 'text-indigo-600 bg-indigo-500/10',
  };
  const cls = colorMap[color] ?? colorMap.gray!;
  const [textCls, bgCls] = cls.split(' ');

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${bgCls}`}>
          <Icon className={`h-4 w-4 ${textCls}`} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold tabular-nums ${textCls}`}>
        {format === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
