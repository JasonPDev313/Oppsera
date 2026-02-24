'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Users,
  Package,
  PackageCheck,
  Landmark,
  FileText,
  Receipt,
  UserCircle,
} from 'lucide-react';
import { ReassuranceBanner } from '@/components/import/ReassuranceBanner';
import { useAllImportHistory } from '@/hooks/use-all-import-history';
import type { UnifiedImportLog } from '@/hooks/use-all-import-history';
import { useImportJobs } from '@/hooks/use-import-jobs';
import { BringYourDataHero } from '@/components/import/BringYourDataHero';

// ── Status config ──────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-blue-500', label: 'Pending' },
  analyzing: { icon: Clock, color: 'text-blue-500', label: 'Analyzing' },
  mapping: { icon: Clock, color: 'text-blue-500', label: 'Mapping' },
  validating: { icon: Clock, color: 'text-yellow-500', label: 'Validating' },
  validated: { icon: CheckCircle2, color: 'text-green-500', label: 'Validated' },
  ready: { icon: CheckCircle2, color: 'text-green-500', label: 'Ready' },
  importing: { icon: Clock, color: 'text-indigo-500', label: 'Importing' },
  complete: { icon: CheckCircle2, color: 'text-green-600', label: 'Completed' },
  completed: { icon: CheckCircle2, color: 'text-green-600', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  cancelled: { icon: AlertTriangle, color: 'text-gray-500', label: 'Cancelled' },
};

// ── Module badge config ────────────────────────────────────────
const MODULE_CONFIG: Record<string, { icon: typeof Users; color: string; bg: string }> = {
  customers: { icon: Users, color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  catalog: { icon: Package, color: 'text-green-700 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/20' },
  accounting: { icon: Landmark, color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  transactions: { icon: FileText, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/20' },
};

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Module Badge ───────────────────────────────────────────────
function ModuleBadge({ module, label }: { module: string; label: string }) {
  const config = MODULE_CONFIG[module] ?? MODULE_CONFIG.transactions!;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color} ${config.bg}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── New Import Dropdown ────────────────────────────────────────
function NewImportDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const items = [
    {
      label: 'Import Staff / Employees',
      description: 'Upload staff from a legacy system with intelligent column mapping',
      icon: Users,
      href: '/settings/import/staff',
    },
    {
      label: 'Import Customers',
      description: 'Upload customer CSV with AI column matching',
      icon: UserCircle,
      href: '/customers?import=true',
    },
    {
      label: 'Import Inventory',
      description: 'Upload items, categories, and prices from CSV',
      icon: Package,
      href: '/catalog?import=true',
    },
    {
      label: 'Import Chart of Accounts',
      description: 'Import your existing COA from CSV',
      icon: Landmark,
      href: '/accounting/accounts?import=true',
    },
    {
      label: 'Import Transactions (Legacy)',
      description: 'Import historical POS transactions for reconciliation',
      icon: FileText,
      href: '/settings/import/new',
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Upload className="h-4 w-4" />
        New Import
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-surface shadow-lg dark:border-gray-700">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Import Row ─────────────────────────────────────────────────
function ImportRow({ log }: { log: UnifiedImportLog }) {
  const config = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending!;
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <StatusIcon className={`h-5 w-5 shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {log.fileName}
          </p>
          <ModuleBadge module={log.module} label={log.moduleLabel} />
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {formatDate(log.startedAt)}
        </p>
      </div>
      <div className="text-right">
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        {(log.status === 'complete' || log.status === 'completed') && (
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="text-green-600 dark:text-green-400">{log.successRows.toLocaleString()} ok</span>
            {log.errorRows > 0 && (
              <span className="ml-1 text-red-500">{log.errorRows} errors</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Legacy Transaction Import Row ──────────────────────────────
function LegacyImportRow({ job }: { job: { id: string; name: string; fileName: string; fileSizeBytes: number; sourceSystem: string | null; status: string; importedRows: number; errorRows: number; createdAt: string } }) {
  const router = useRouter();
  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending!;
  const StatusIcon = config.icon;

  return (
    <button
      type="button"
      onClick={() => router.push(`/settings/import/${job.id}`)}
      className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
    >
      <StatusIcon className={`h-5 w-5 shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {job.name}
          </p>
          <ModuleBadge module="transactions" label="Transactions" />
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {job.fileName}
          {job.sourceSystem && ` — ${job.sourceSystem}`}
        </p>
      </div>
      <div className="text-right">
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        <p className="mt-0.5 text-xs text-gray-400">{formatDate(job.createdAt)}</p>
        {job.status === 'completed' && (
          <div className="text-xs text-gray-500">
            <span className="text-green-600 dark:text-green-400">{job.importedRows.toLocaleString()} imported</span>
            {job.errorRows > 0 && (
              <span className="ml-1 text-red-500">{job.errorRows} errors</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Main Content ───────────────────────────────────────────────
export default function ImportContent() {
  const router = useRouter();
  const { items: unifiedLogs, isLoading: unifiedLoading } = useAllImportHistory();
  const { items: legacyJobs, isLoading: legacyLoading, hasMore, loadMore, fetchJobs } = useImportJobs();

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const isLoading = unifiedLoading || legacyLoading;
  const hasAnyData = unifiedLogs.length > 0 || legacyJobs.length > 0;

  // Compute import stats from available data
  const completedLegacy = legacyJobs.filter((j) => j.status === 'completed');
  const completedUnified = unifiedLogs.filter((l) => l.status === 'complete' || l.status === 'completed');
  const totalCompleted = completedLegacy.length + completedUnified.length;
  const totalRecords = completedLegacy.reduce((sum, j) => sum + j.importedRows, 0)
    + completedUnified.reduce((sum, l) => sum + l.successRows, 0);
  const lastImportDate = [...completedLegacy.map((j) => j.createdAt), ...completedUnified.map((l) => l.startedAt)]
    .sort()
    .pop();

  const IMPORT_TYPE_CARDS: Array<{
    label: string;
    description: string;
    icon: typeof Users;
    href: string | null;
    enabled: boolean;
  }> = [
    { label: 'Staff / Employees', description: 'Import users with intelligent column mapping', icon: Users, href: '/settings/import/staff', enabled: true },
    { label: 'Transactions (Legacy)', description: 'Import historical POS transactions', icon: Receipt, href: '/settings/import/new', enabled: true },
    { label: 'Customers', description: 'Import customer records from CSV', icon: UserCircle, href: null, enabled: false },
    { label: 'Catalog / Items', description: 'Import products, categories, and prices', icon: Package, href: null, enabled: false },
    { label: 'Opening Balances', description: 'Import starting inventory quantities', icon: PackageCheck, href: null, enabled: false },
    { label: 'Chart of Accounts', description: 'Import your existing COA', icon: Landmark, href: null, enabled: false },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <BringYourDataHero variant="full" />
        </div>
        <div className="shrink-0 pt-1">
          <NewImportDropdown />
        </div>
      </div>

      {/* Import type cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {IMPORT_TYPE_CARDS.map((card) => {
          const Icon = card.icon;
          if (!card.enabled) {
            return (
              <div
                key={card.label}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 opacity-60 dark:border-gray-700"
              >
                <Icon className="h-7 w-7 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{card.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  Coming soon
                </span>
              </div>
            );
          }
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => router.push(card.href!)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <Icon className="h-7 w-7 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            </button>
          );
        })}
      </div>

      {/* Stats bar */}
      {totalCompleted > 0 && (
        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-gray-500/5 px-4 py-3 text-sm dark:border-gray-700">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Completed imports:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{totalCompleted}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total records imported:</span>{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{totalRecords.toLocaleString()}</span>
          </div>
          {lastImportDate && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Last import:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(lastImportDate)}</span>
            </div>
          )}
        </div>
      )}

      <ReassuranceBanner variant="subtle" />

      {/* Loading skeleton */}
      {isLoading && !hasAnyData && (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasAnyData && (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16 dark:border-gray-600">
          <Upload className="mb-3 h-10 w-10 text-gray-400" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No imports yet</p>
          <p className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
            Import your first data — customers, inventory items, or chart of accounts.
            <br />
            We&apos;ll auto-match columns and you review everything before we import.
          </p>
        </div>
      )}

      {/* Module imports (Customers, Catalog, Accounting) */}
      {unifiedLogs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Recent Imports
          </h2>
          {unifiedLogs.map((log) => (
            <ImportRow key={`${log.module}-${log.id}`} log={log} />
          ))}
        </div>
      )}

      {/* Legacy transaction imports */}
      {legacyJobs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Legacy Transaction Imports
          </h2>
          {legacyJobs.map((job) => (
            <LegacyImportRow key={job.id} job={job} />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={legacyLoading}
              className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {legacyLoading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
