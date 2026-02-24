'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { apiFetch } from '@/lib/api-client';

interface CoaHealthReport {
  overallStatus: 'healthy' | 'warning' | 'error';
  errorCount: number;
  warningCount: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  accountDistribution: Record<string, number>;
  totalAccounts: number;
  activeAccounts: number;
  fallbackCount: number;
  systemAccountCount: number;
}

const STATUS_CONFIG = {
  healthy: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Healthy' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Warnings Found' },
  error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Issues Detected' },
};

const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

export default function HealthContent() {
  const [report, setReport] = useState<CoaHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: CoaHealthReport }>('/api/v1/accounting/health');
      setReport(res.data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const statusConfig = report ? STATUS_CONFIG[report.overallStatus] : null;
  const StatusIcon = statusConfig?.icon ?? CheckCircle;

  return (
    <AccountingPageShell
      title="COA Health"
      breadcrumbs={[{ label: 'Chart of Accounts', href: '/accounting/accounts' }, { label: 'Health' }]}
      actions={
        <button
          type="button"
          onClick={fetchHealth}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {isLoading && !report ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* Overall Status Card */}
          <div className={`rounded-lg border ${statusConfig?.border} ${statusConfig?.bg} p-4`}>
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-8 w-8 ${statusConfig?.color}`} />
              <div>
                <h3 className={`text-lg font-semibold ${statusConfig?.color}`}>
                  {statusConfig?.label}
                </h3>
                <p className="text-sm text-gray-600">
                  {report.activeAccounts} active of {report.totalAccounts} total accounts
                </p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {report.accountDistribution[type] ?? 0}
                </p>
              </div>
            ))}
          </div>

          {/* Errors */}
          {report.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h4 className="text-sm font-medium text-red-800">
                {report.errorCount} Error{report.errorCount !== 1 ? 's' : ''}
              </h4>
              <ul className="mt-2 space-y-1">
                {report.errors.map((e, i) => (
                  <li key={i} className="text-sm text-red-700">{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="text-sm font-medium text-amber-800">
                {report.warningCount} Warning{report.warningCount !== 1 ? 's' : ''}
              </h4>
              <ul className="mt-2 space-y-1">
                {report.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700">{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">Fallback Accounts</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{report.fallbackCount}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">System Accounts</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{report.systemAccountCount}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Unable to load health report.</p>
      )}
    </AccountingPageShell>
  );
}
