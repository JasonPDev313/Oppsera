'use client';

import { useState, useMemo, Fragment } from 'react';
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
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Coverage by Category</h3>
          <div className="space-y-2">
            {coverage.items.map((item) => (
              <div key={item.category} className="flex items-center gap-4">
                <span className="w-40 text-sm text-muted-foreground">{item.label}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted">
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
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {item.coveragePercent}%
                </span>
                {item.gapCount > 0 && (
                  <span className="text-xs text-red-500">{item.gapCount} gaps</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); refresh(); }}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); refresh(); }}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Action</label>
          <select
            value={actionPrefix}
            onChange={(e) => { setActionPrefix(e.target.value); refresh(); }}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          >
            {ACTION_PREFIXES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Entity</label>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); refresh(); }}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          >
            {ENTITY_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Search Entity ID</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refresh()}
              placeholder="Entity ID..."
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Audit Entries Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Timestamp</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">User</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entity</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Terminal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && entries.length === 0 && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))
            )}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
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
                <Fragment key={entry.id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="px-3 py-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {entry.actorType === 'system' ? 'System' : entry.actorUserId?.slice(0, 8) ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-muted-foreground">{entry.entityType}</span>
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{entry.entityId.slice(0, 12)}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs text-foreground">
                      {amountCents != null
                        ? `$${(amountCents / 100).toFixed(2)}`
                        : amountDollars != null
                          ? `$${Number(amountDollars).toFixed(2)}`
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {terminalId ?? '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-muted px-6 py-3">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Full Details</h4>
                            <dl className="space-y-1 text-xs">
                              <div className="flex gap-2">
                                <dt className="font-medium text-muted-foreground">ID:</dt>
                                <dd className="font-mono text-foreground">{entry.id}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-muted-foreground">Entity ID:</dt>
                                <dd className="font-mono text-foreground">{entry.entityId}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-muted-foreground">Actor:</dt>
                                <dd className="text-foreground">
                                  {entry.actorUserId ?? 'system'} ({entry.actorType})
                                </dd>
                              </div>
                              {managerApprover && (
                                <div className="flex gap-2">
                                  <dt className="font-medium text-muted-foreground">Manager Approver:</dt>
                                  <dd className="text-foreground">{managerApprover}</dd>
                                </div>
                              )}
                              {entry.locationId && (
                                <div className="flex gap-2">
                                  <dt className="font-medium text-muted-foreground">Location:</dt>
                                  <dd className="font-mono text-foreground">{entry.locationId}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                          {(entry.changes || entry.metadata) && (
                            <div>
                              {entry.changes && Object.keys(entry.changes).length > 0 && (
                                <>
                                  <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Changes</h4>
                                  <dl className="space-y-1 text-xs">
                                    {Object.entries(entry.changes).map(([field, diff]) => (
                                      <div key={field} className="flex gap-2">
                                        <dt className="font-medium text-muted-foreground">{field}:</dt>
                                        <dd className="text-foreground">
                                          <span className="text-red-500 line-through">{String(diff.old)}</span>
                                          {' → '}
                                          <span className="text-green-500">{String(diff.new)}</span>
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                </>
                              )}
                              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                <>
                                  <h4 className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">Metadata</h4>
                                  <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs text-foreground">
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
                </Fragment>
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
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
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
      ? 'border-green-500/30'
      : status === 'warning'
        ? 'border-amber-500/30'
        : status === 'error'
          ? 'border-red-500/30'
          : 'border-border';
  const iconColor =
    status === 'good'
      ? 'text-green-500'
      : status === 'warning'
        ? 'text-amber-500'
        : status === 'error'
          ? 'text-red-500'
          : 'text-muted-foreground';

  return (
    <div className={`rounded-lg border ${borderColor} bg-surface p-4`}>
      <div className="flex items-center gap-2">
        {status === 'good' && <ShieldCheck className={`h-4 w-4 ${iconColor}`} />}
        {status === 'warning' && <AlertTriangle className={`h-4 w-4 ${iconColor}`} />}
        {status === 'error' && <AlertTriangle className={`h-4 w-4 ${iconColor}`} />}
        {status === 'neutral' && <Clock className={`h-4 w-4 ${iconColor}`} />}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const prefix = action.split('.')[0];
  const colors: Record<string, string> = {
    accounting: 'bg-indigo-500/10 text-indigo-500',
    payment: 'bg-green-500/10 text-green-500',
    order: 'bg-blue-500/10 text-blue-500',
    ap: 'bg-purple-500/10 text-purple-500',
    ar: 'bg-orange-500/10 text-orange-500',
    inventory: 'bg-teal-500/10 text-teal-500',
    catalog: 'bg-muted text-muted-foreground',
  };
  const colorClass = colors[prefix ?? ''] ?? 'bg-muted text-muted-foreground';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {action}
    </span>
  );
}
