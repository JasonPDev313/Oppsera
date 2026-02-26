'use client';

import { useState, useCallback } from 'react';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { useGolfCustomers, useGolfCustomerKpis, downloadGolfExport } from '@/hooks/use-golf-reports';
import { formatGolfMoney, formatRoundCount, formatDateShort } from '@/lib/golf-formatters';

const COLUMNS = [
  { key: 'customerName', header: 'Customer' },
  { key: 'totalRounds', header: 'Rounds' },
  {
    key: 'totalRevenue',
    header: 'Revenue',
    render: (row: Record<string, unknown>) => formatGolfMoney(row.totalRevenue as number),
  },
  {
    key: 'lastPlayedAt',
    header: 'Last Played',
    render: (row: Record<string, unknown>) =>
      row.lastPlayedAt ? formatDateShort(row.lastPlayedAt as string) : '—',
  },
  {
    key: 'avgPartySize',
    header: 'Avg Party',
    render: (row: Record<string, unknown>) => (row.avgPartySize as number).toFixed(1),
  },
];

export function CustomersTab() {
  const [sortBy, setSortBy] = useState<'totalRounds' | 'totalRevenue' | 'lastPlayedAt' | 'customerName'>('totalRevenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const customers = useGolfCustomers({
    cursor: currentCursor,
    limit: 25,
    sortBy,
    sortDir,
  });
  const kpis = useGolfCustomerKpis();

  const handleSort = useCallback((col: string) => {
    const validCols = ['totalRounds', 'totalRevenue', 'lastPlayedAt', 'customerName'] as const;
    const matched = validCols.find((c) => c === col);
    if (!matched) return;

    if (matched === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(matched);
      setSortDir('desc');
    }
    setCursorStack([]);
    setCurrentCursor(undefined);
  }, [sortBy]);

  const handleNextPage = useCallback(() => {
    if (!customers.cursor) return;
    setCursorStack((prev) => [...prev, currentCursor ?? '']);
    setCurrentCursor(customers.cursor);
  }, [customers.cursor, currentCursor]);

  const handlePrevPage = useCallback(() => {
    setCursorStack((prev) => {
      const next = [...prev];
      const popped = next.pop();
      setCurrentCursor(popped || undefined);
      return next;
    });
  }, []);

  const handleExport = async () => {
    await downloadGolfExport('/api/v1/reports/golf/customers/export', {
      sortBy,
      sortDir,
    });
  };

  return (
    <div className="space-y-6">
      {/* KPI Mini Cards */}
      {kpis.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniCard label="Total Customers" value={formatRoundCount(kpis.data.totalCustomers)} />
          <MiniCard label="Avg Rounds / Customer" value={kpis.data.avgRoundsPerCustomer.toFixed(1)} />
          <MiniCard label="Avg Revenue / Customer" value={formatGolfMoney(kpis.data.avgRevenuePerCustomer)} />
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        {[
          { key: 'totalRevenue', label: 'Revenue' },
          { key: 'totalRounds', label: 'Rounds' },
          { key: 'lastPlayedAt', label: 'Last Played' },
          { key: 'customerName', label: 'Name' },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleSort(opt.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              sortBy === opt.key
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {opt.label}
            {sortBy === opt.key && (
              <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={customers.data as unknown as Record<string, unknown>[]}
        isLoading={customers.isLoading}
        emptyMessage="No customer data available"
      />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={cursorStack.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!customers.hasMore}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Export */}
        {customers.data.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-gray-950/5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
