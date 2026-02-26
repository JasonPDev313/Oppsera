'use client';

import { useState } from 'react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useVendorLedger } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';

export default function VendorLedgerContent() {
  const [vendorId, setVendorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: rows, meta, isLoading } = useVendorLedger(
    vendorId || null,
    { startDate: startDate || undefined, endDate: endDate || undefined },
  );

  return (
    <AccountingPageShell
      title="Vendor Ledger"
      breadcrumbs={[
        { label: 'Accounts Payable' },
        { label: 'Reports' },
        { label: 'Vendor Ledger' },
      ]}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Vendor <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            placeholder="Select vendor..."
            className="w-64 rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {!vendorId && (
        <div className="text-center py-12 text-muted-foreground">
          Select a vendor to view their ledger.
        </div>
      )}

      {isLoading && vendorId && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && vendorId && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance */}
                <tr className="border-b border-border bg-muted/50">
                  <td colSpan={5} className="px-4 py-2 text-sm font-medium text-muted-foreground">Opening Balance</td>
                  <td className="px-4 py-2 text-right text-sm tabular-nums font-medium text-foreground">
                    {formatAccountingMoney(meta.openingBalance)}
                  </td>
                </tr>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5 text-sm text-foreground">{row.date}</td>
                    <td className="px-4 py-2.5 text-sm capitalize text-foreground">{row.type}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{row.referenceNumber}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                      {row.debit > 0 ? formatAccountingMoney(row.debit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                      {row.credit > 0 ? formatAccountingMoney(row.credit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-foreground">
                      {formatAccountingMoney(row.runningBalance)}
                    </td>
                  </tr>
                ))}
                {/* Closing balance */}
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-foreground">Closing Balance</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                    {formatAccountingMoney(meta.closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            <div className="flex justify-between text-sm font-medium text-muted-foreground">
              <span>Opening Balance</span>
              <span className="tabular-nums">{formatAccountingMoney(meta.openingBalance)}</span>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="rounded border border-border p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{row.date}</span>
                  <span className="capitalize text-foreground">{row.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{row.referenceNumber}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(row.runningBalance)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-foreground border-t pt-2">
              <span>Closing Balance</span>
              <span className="tabular-nums">{formatAccountingMoney(meta.closingBalance)}</span>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
