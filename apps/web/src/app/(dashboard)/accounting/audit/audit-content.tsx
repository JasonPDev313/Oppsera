'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  User,
  FileSpreadsheet,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { usePaginatedAuditTrail, useAuditCoverage } from '@/hooks/use-audit';

// ── Filter bar ──────────────────────────────────────────────

const ACTION_PREFIXES = [
  { value: '', label: 'All Actions' },
  { value: 'accounting.', label: 'Accounting' },
  { value: 'payment.', label: 'Payments' },
  { value: 'order.', label: 'Orders' },
  { value: 'ap.', label: 'Accounts Payable' },
  { value: 'ar.', label: 'Accounts Receivable' },
  { value: 'inventory.', label: 'Inventory' },
  { value: 'catalog.', label: 'Catalog' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'gl_journal_entry', label: 'Journal Entry' },
  { value: 'tender', label: 'Tender' },
  { value: 'order', label: 'Order' },
  { value: 'ap_bill', label: 'AP Bill' },
  { value: 'ap_payment', label: 'AP Payment' },
  { value: 'ar_invoice', label: 'AR Invoice' },
  { value: 'ar_receipt', label: 'AR Receipt' },
  { value: 'deposit_slip', label: 'Deposit Slip' },
  { value: 'tip_payout', label: 'Tip Payout' },
  { value: 'drawer_session', label: 'Drawer Session' },
  { value: 'voucher', label: 'Voucher' },
];

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// ── Main Content ─────────────────────────────────────────────

export default function AuditContent() {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [actionPrefix, setActionPrefix] = useState('');
  const [entityType, setEntityType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filters = useMemo(() => {
    const f: Record<string, string | undefined> = {
      from: dateFrom,
      to: dateTo,
      limit: '50',
    };
    if (actionPrefix) f.action = actionPrefix;
    if (entityType) f.entityType = entityType;
    if (searchText) f.entityId = searchText;
    return f;
  }, [dateFrom, dateTo, actionPrefix, entityType, searchText]);

  const { entries, hasMore, loadMore, isLoading, refresh } = usePaginatedAuditTrail(filters);

  const { data: coverage } = useAuditCoverage({ from: dateFrom, to: dateTo });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AccountingPageShell title="Audit Trail" subtitle="Financial transaction audit log and coverage analysis">
      {/* Coverage Cards */}
      {coverage && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CoverageCard
            label="Overall Coverage"
            value={`${coverage.overallCoveragePercent}%`}
            detail={`${coverage.totalAuditEntries} audit / ${coverage.totalTransactions} txns`}
            status={coverage.overallCoveragePercent >= 95 ? 'good' : coverage.overallCoveragePercent >= 80 ? 'warning' : 'error'}
          />
          <CoverageCard
            label="Total Transactions"
            value={coverage.totalTransactions.toLocaleString()}
            detail="Financial events in period"
            status="neutral"
          />
          <CoverageCard
            label="Audit Entries"
            value={coverage.totalAuditEntries.toLocaleString()}
            detail="Logged to audit trail"
            status="neutral"
          />
          <CoverageCard
            label="Gaps Detected"
            value={coverage.totalGaps.toLocaleString()}
            detail={coverage.totalGaps === 0 ? 'No gaps found' : 'Transactions without audit entry'}
            status={coverage.totalGaps === 0 ? 'good' : 'error'}
          />
        </div>
      )}

      {/* Per-Category Breakdown */}
      {coverage && coverage.items.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Coverage by Category</h3>
          <div className="space-y-2">
            {coverage.items.map((item) => (
              <div key={item.category} className="flex items-center gap-4">
                <span className="w-40 text-sm text-gray-600">{item.label}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.coveragePercent >= 95
                          ? 'bg-green-500'
                          : item.coveragePercent >= 80
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${item.coveragePercent}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-gray-500">
                  {item.coveragePercent}%
                </span>
                {item.gapCount > 0 && (
                  <span className="text-xs text-red-600">{item.gapCount} gaps</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); refresh(); }}
            className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); refresh(); }}
            className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Action</label>
          <select
            value={actionPrefix}
            onChange={(e) => { setActionPrefix(e.target.value); refresh(); }}
            className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
          >
            {ACTION_PREFIXES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Entity</label>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); refresh(); }}
            className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm"
          >
            {ENTITY_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Search Entity ID</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refresh()}
              placeholder="Entity ID..."
              className="w-full rounded-md border border-gray-300 bg-surface py-1.5 pl-8 pr-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Audit Entries Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left font-medium text-gray-600">Timestamp</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">User</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Action</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Entity</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Amount</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Terminal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && entries.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))
            )}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2">No audit entries found for this filter</p>
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const isExpanded = expandedIds.has(entry.id);
              const meta = entry.metadata as Record<string, unknown> | null;
              const amountCents = meta?.amountCents as number | undefined;
              const amountDollars = meta?.amountDollars as string | undefined;
              const terminalId = meta?.terminalId as string | undefined;
              const managerApprover = meta?.managerApprover as string | undefined;

              return (
                <>
                  <tr
                    key={entry.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="px-3 py-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs text-gray-600">
                          {entry.actorType === 'system' ? 'System' : entry.actorUserId?.slice(0, 8) ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-gray-500">{entry.entityType}</span>
                      <span className="ml-1 font-mono text-xs text-gray-400">{entry.entityId.slice(0, 12)}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs text-gray-700">
                      {amountCents != null
                        ? `$${(amountCents / 100).toFixed(2)}`
                        : amountDollars != null
                          ? `$${Number(amountDollars).toFixed(2)}`
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {terminalId ?? '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${entry.id}-detail`}>
                      <td colSpan={7} className="bg-gray-50 px-6 py-3">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <h4 className="mb-1 text-xs font-semibold text-gray-500">Full Details</h4>
                            <dl className="space-y-1 text-xs">
                              <div className="flex gap-2">
                                <dt className="font-medium text-gray-500">ID:</dt>
                                <dd className="font-mono text-gray-700">{entry.id}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-gray-500">Entity ID:</dt>
                                <dd className="font-mono text-gray-700">{entry.entityId}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-gray-500">Actor:</dt>
                                <dd className="text-gray-700">
                                  {entry.actorUserId ?? 'system'} ({entry.actorType})
                                </dd>
                              </div>
                              {managerApprover && (
                                <div className="flex gap-2">
                                  <dt className="font-medium text-gray-500">Manager Approver:</dt>
                                  <dd className="text-gray-700">{managerApprover}</dd>
                                </div>
                              )}
                              {entry.locationId && (
                                <div className="flex gap-2">
                                  <dt className="font-medium text-gray-500">Location:</dt>
                                  <dd className="font-mono text-gray-700">{entry.locationId}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                          {(entry.changes || entry.metadata) && (
                            <div>
                              {entry.changes && Object.keys(entry.changes).length > 0 && (
                                <>
                                  <h4 className="mb-1 text-xs font-semibold text-gray-500">Changes</h4>
                                  <dl className="space-y-1 text-xs">
                                    {Object.entries(entry.changes).map(([field, diff]) => (
                                      <div key={field} className="flex gap-2">
                                        <dt className="font-medium text-gray-500">{field}:</dt>
                                        <dd className="text-gray-700">
                                          <span className="text-red-500 line-through">{String(diff.old)}</span>
                                          {' → '}
                                          <span className="text-green-600">{String(diff.new)}</span>
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                </>
                              )}
                              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                <>
                                  <h4 className="mb-1 mt-2 text-xs font-semibold text-gray-500">Metadata</h4>
                                  <pre className="max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700">
                                    {JSON.stringify(entry.metadata, null, 2)}
                                  </pre>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Load more
          </button>
        </div>
      )}
    </AccountingPageShell>
  );
}

// ── Sub-components ───────────────────────────────────────────

function CoverageCard({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: 'good' | 'warning' | 'error' | 'neutral';
}) {
  const borderColor =
    status === 'good'
      ? 'border-green-200'
      : status === 'warning'
        ? 'border-amber-200'
        : status === 'error'
          ? 'border-red-200'
          : 'border-gray-200';
  const iconColor =
    status === 'good'
      ? 'text-green-500'
      : status === 'warning'
        ? 'text-amber-500'
        : status === 'error'
          ? 'text-red-500'
          : 'text-gray-400';

  return (
    <div className={`rounded-lg border ${borderColor} bg-surface p-4`}>
      <div className="flex items-center gap-2">
        {status === 'good' && <ShieldCheck className={`h-4 w-4 ${iconColor}`} />}
        {status === 'warning' && <AlertTriangle className={`h-4 w-4 ${iconColor}`} />}
        {status === 'error' && <AlertTriangle className={`h-4 w-4 ${iconColor}`} />}
        {status === 'neutral' && <Clock className={`h-4 w-4 ${iconColor}`} />}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split('.')[0];
  const colors: Record<string, string> = {
    accounting: 'bg-indigo-50 text-indigo-700',
    payment: 'bg-green-50 text-green-700',
    order: 'bg-blue-50 text-blue-700',
    ap: 'bg-purple-50 text-purple-700',
    ar: 'bg-orange-50 text-orange-700',
    inventory: 'bg-teal-50 text-teal-700',
    catalog: 'bg-gray-100 text-gray-700',
  };
  const colorClass = colors[prefix ?? ''] ?? 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {action}
    </span>
  );
}
