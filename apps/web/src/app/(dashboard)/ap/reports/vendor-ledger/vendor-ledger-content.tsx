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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Vendor <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            placeholder="Select vendor..."
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {!vendorId && (
        <div className="text-center py-12 text-gray-500">
          Select a vendor to view their ledger.
        </div>
      )}

      {isLoading && vendorId && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && vendorId && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reference</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance */}
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <td colSpan={5} className="px-4 py-2 text-sm font-medium text-gray-600">Opening Balance</td>
                  <td className="px-4 py-2 text-right text-sm tabular-nums font-medium text-gray-900">
                    {formatAccountingMoney(meta.openingBalance)}
                  </td>
                </tr>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-sm text-gray-700">{row.date}</td>
                    <td className="px-4 py-2.5 text-sm capitalize text-gray-700">{row.type}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900">{row.referenceNumber}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">
                      {row.debit > 0 ? formatAccountingMoney(row.debit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">
                      {row.credit > 0 ? formatAccountingMoney(row.credit) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-gray-900">
                      {formatAccountingMoney(row.runningBalance)}
                    </td>
                  </tr>
                ))}
                {/* Closing balance */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-gray-800">Closing Balance</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                    {formatAccountingMoney(meta.closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            <div className="flex justify-between text-sm font-medium text-gray-600">
              <span>Opening Balance</span>
              <span className="tabular-nums">{formatAccountingMoney(meta.openingBalance)}</span>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="rounded border border-gray-100 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{row.date}</span>
                  <span className="capitalize text-gray-700">{row.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-900">{row.referenceNumber}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(row.runningBalance)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-gray-800 border-t pt-2">
              <span>Closing Balance</span>
              <span className="tabular-nums">{formatAccountingMoney(meta.closingBalance)}</span>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
