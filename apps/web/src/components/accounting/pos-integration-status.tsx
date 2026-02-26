'use client';

import Link from 'next/link';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { formatAccountingMoney } from '@/types/accounting';
import type { AccountingSettings, MappingCoverage } from '@/types/accounting';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface RecentPosGLEntry {
  id: string;
  journalNumber: number;
  sourceReferenceId: string;
  businessDate: string;
  totalAmount: number;
  status: string;
}

export function PosIntegrationStatus() {
  const { data: settings } = useQuery({
    queryKey: ['accounting-settings-pos'],
    queryFn: () =>
      apiFetch<{ data: AccountingSettings }>('/api/v1/accounting/settings')
        .then((r) => r.data)
        .catch(() => null),
    staleTime: 30_000,
  });

  const { data: coverage } = useQuery({
    queryKey: ['mapping-coverage-pos'],
    queryFn: () =>
      apiFetch<{ data: MappingCoverage }>('/api/v1/accounting/mappings/coverage')
        .then((r) => r.data)
        .catch(() => null),
    staleTime: 30_000,
  });

  const { data: unmappedCount } = useQuery({
    queryKey: ['unmapped-count-pos'],
    queryFn: () =>
      apiFetch<{ data: { id: string }[]; meta: { hasMore: boolean } }>(
        '/api/v1/accounting/unmapped-events?limit=1',
      )
        .then((r) => (r.meta?.hasMore ? '10+' : String(r.data.length)))
        .catch(() => '0'),
    staleTime: 30_000,
  });

  const { data: recentEntries } = useQuery({
    queryKey: ['pos-gl-entries'],
    queryFn: () =>
      apiFetch<{ data: RecentPosGLEntry[] }>(
        '/api/v1/accounting/journals?sourceModule=pos&limit=10',
      )
        .then((r) => r.data)
        .catch(() => []),
    staleTime: 30_000,
  });

  const isEnabled = settings?.autoPostMode === 'auto_post';

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
          isEnabled
            ? 'border-green-500/30 bg-green-500/10 text-green-500'
            : 'border-border bg-muted text-foreground'
        }`}
      >
        {isEnabled ? (
          <Zap className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <Activity className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1">
          <p className="font-medium">
            POS → GL Posting: {isEnabled ? 'Enabled (Auto-post)' : settings?.autoPostMode === 'draft_only' ? 'Draft Only' : 'Not Configured'}
          </p>
          {!isEnabled && (
            <p className="text-sm opacity-80">
              POS transactions are not being posted to the general ledger.
            </p>
          )}
        </div>
        <Link
          href="/accounting/settings"
          className="text-sm font-medium underline"
        >
          Configure
        </Link>
      </div>

      {/* Mapping Coverage */}
      {coverage && (
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Mapping Coverage</h3>
            <span className="text-sm font-bold text-foreground">{coverage.overallPercentage}%</span>
          </div>
          <div className="space-y-2">
            <MappingRow label="Departments" mapped={coverage.departments.mapped} total={coverage.departments.total} />
            <MappingRow label="Payment Types" mapped={coverage.paymentTypes.mapped} total={coverage.paymentTypes.total} />
            <MappingRow label="Tax Groups" mapped={coverage.taxGroups.mapped} total={coverage.taxGroups.total} />
          </div>
          {coverage.overallPercentage < 100 && (
            <Link
              href="/accounting/mappings"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-500 hover:text-indigo-500"
            >
              Complete mappings <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {/* Unmapped Events */}
      {unmappedCount && unmappedCount !== '0' && (
        <Link
          href="/accounting/mappings"
          className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-500 hover:bg-amber-500/20"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <span>
            <strong>{unmappedCount}</strong> POS transactions skipped GL posting (unmapped)
          </span>
        </Link>
      )}

      {/* Recent POS GL Entries */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent POS Journal Entries</h3>
        {recentEntries && recentEntries.length > 0 ? (
          <div className="space-y-2">
            {recentEntries.map((entry) => (
              <Link
                key={entry.id}
                href={`/accounting/journals/${entry.id}`}
                className="flex items-center gap-3 rounded border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="font-mono text-muted-foreground">#{entry.journalNumber}</span>
                <span className="flex-1 truncate text-muted-foreground">{entry.sourceReferenceId}</span>
                <span className="tabular-nums text-foreground">{formatAccountingMoney(entry.totalAmount)}</span>
                <span className="text-muted-foreground">{entry.businessDate}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No POS entries recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function MappingRow({ label, mapped, total }: { label: string; mapped: number; total: number }) {
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
  const Icon = pct === 100 ? CheckCircle : pct > 0 ? AlertTriangle : XCircle;
  const iconColor = pct === 100 ? 'text-green-500' : pct > 0 ? 'text-amber-500' : 'text-red-400';

  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {mapped}/{total}
      </span>
    </div>
  );
}
