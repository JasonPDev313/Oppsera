'use client';

import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';
import { useAuthContext } from '@/components/auth-provider';
import { useTaxRemittance, useTaxRemittanceExport } from '@/hooks/use-tax-remittance';
import type { TaxRemittanceRow } from '@/types/accounting';

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0) {
    return `($${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  // Default to current month
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
  };
}

const AUTHORITY_LABELS: Record<string, string> = {
  state: 'State',
  county: 'County',
  city: 'City',
  district: 'District',
};

const FILING_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export default function TaxRemittanceContent() {
  const { locations } = useAuthContext();
  const defaultDates = useMemo(() => getDefaultDateRange(), []);

  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [locationId, setLocationId] = useState<string>('');

  const { data: report, isLoading, error } = useTaxRemittance({
    dateFrom,
    dateTo,
    locationId: locationId || undefined,
  });

  const { exportCsv, isExporting } = useTaxRemittanceExport();

  const locationOptions = useMemo(
    () => [
      { value: '', label: 'All Locations' },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ],
    [locations],
  );

  // Group rows by jurisdiction for display
  const groupedRows = useMemo(() => {
    if (!report?.rows) return [];
    const groups = new Map<string, TaxRemittanceRow[]>();
    for (const row of report.rows) {
      const key = row.jurisdictionCode ?? '_unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([key, rows]) => ({
      jurisdictionCode: key === '_unassigned' ? null : key,
      authorityName: rows[0]?.authorityName ?? null,
      authorityType: rows[0]?.authorityType ?? null,
      filingFrequency: rows[0]?.filingFrequency ?? null,
      rows,
      totalTaxable: rows.reduce((s, r) => s + r.taxableSalesCents, 0),
      totalCollected: rows.reduce((s, r) => s + r.taxCollectedCents, 0),
    }));
  }, [report]);

  const handleExport = () => {
    exportCsv({ dateFrom, dateTo, locationId: locationId || undefined });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tax Remittance Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tax collected by jurisdiction and rate for filing purposes.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !report?.rows?.length}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
          <Select
            options={locationOptions}
            value={locationId}
            onChange={(v) => setLocationId(v as string)}
            className="w-full"
          />
        </div>
      </div>

      {/* Summary cards */}
      {report && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-muted-foreground">Taxable Sales</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatMoney(report.totalTaxableSalesCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-muted-foreground">Tax Collected</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatMoney(report.totalTaxCollectedCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-muted-foreground">Exempt Sales</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {formatMoney(report.totalExemptSalesCents)}
            </p>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner label="Loading tax data..." />
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Jurisdiction breakdown */}
      {!isLoading && report && groupedRows.length > 0 && (
        <div className="space-y-6">
          {groupedRows.map((group) => (
            <div key={group.jurisdictionCode ?? '_unassigned'} className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {group.authorityName ?? group.jurisdictionCode ?? 'Unassigned Jurisdiction'}
                </h3>
                {group.authorityType && (
                  <Badge variant="neutral">
                    {AUTHORITY_LABELS[group.authorityType] ?? group.authorityType}
                  </Badge>
                )}
                {group.filingFrequency && (
                  <Badge variant="info">
                    {FILING_LABELS[group.filingFrequency] ?? group.filingFrequency}
                  </Badge>
                )}
              </div>

              <DataTable
                columns={[
                  {
                    key: 'taxRateName',
                    header: 'Tax Rate',
                    render: (row) => (
                      <span className="font-medium text-foreground">{row.taxRateName as string}</span>
                    ),
                  },
                  {
                    key: 'rateDecimal',
                    header: 'Rate',
                    render: (row) => `${(Number(row.rateDecimal) * 100).toFixed(2)}%`,
                  },
                  {
                    key: 'taxType',
                    header: 'Type',
                    render: (row) => {
                      const t = row.taxType as string;
                      return t.charAt(0).toUpperCase() + t.slice(1);
                    },
                  },
                  {
                    key: 'taxableSalesCents',
                    header: 'Taxable Sales',
                    render: (row) => formatMoney(Number(row.taxableSalesCents)),
                  },
                  {
                    key: 'taxCollectedCents',
                    header: 'Tax Collected',
                    render: (row) => (
                      <span className="font-medium text-foreground">
                        {formatMoney(Number(row.taxCollectedCents))}
                      </span>
                    ),
                  },
                  {
                    key: 'orderCount',
                    header: 'Orders',
                    render: (row) => String(row.orderCount),
                  },
                ]}
                data={group.rows as unknown as (Record<string, unknown> & { id: string })[]}
                isLoading={false}
                emptyMessage="No tax data"
              />

              {/* Group subtotal */}
              <div className="flex items-center justify-end gap-6 border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium text-foreground">
                  Taxable {formatMoney(group.totalTaxable)}
                </span>
                <span className="font-semibold text-foreground">
                  Collected {formatMoney(group.totalCollected)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && report && groupedRows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No tax data for the selected period</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tax data is recorded when orders with taxable items are placed.
          </p>
        </div>
      )}
    </div>
  );
}
