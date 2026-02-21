'use client';

import { formatAccountingMoney } from '@/types/accounting';
import type { JournalLine } from '@/types/accounting';

interface JournalLinesTableProps {
  lines: JournalLine[];
  className?: string;
}

export function JournalLinesTable({ lines, className = '' }: JournalLinesTableProps) {
  const totalDebits = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01;

  return (
    <div className={`overflow-hidden rounded-lg border border-gray-200 bg-surface ${className}`}>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Account
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Memo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Location
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Debit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Credit
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.id ?? i} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {line.accountNumber && (
                    <span className="mr-1.5 font-mono text-xs text-gray-500">
                      {line.accountNumber}
                    </span>
                  )}
                  {line.accountName ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {line.memo ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {line.locationId ? line.locationId.slice(0, 8) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                  {line.debitAmount > 0 ? formatAccountingMoney(line.debitAmount) : ''}
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                  {line.creditAmount > 0 ? formatAccountingMoney(line.creditAmount) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
              <td colSpan={3} className="px-4 py-3 text-sm text-gray-700">
                Totals
              </td>
              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                {formatAccountingMoney(totalDebits)}
              </td>
              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                {formatAccountingMoney(totalCredits)}
              </td>
            </tr>
            {!isBalanced && (
              <tr className="bg-red-50">
                <td colSpan={3} className="px-4 py-2 text-sm font-medium text-red-700">
                  Difference
                </td>
                <td colSpan={2} className="px-4 py-2 text-right text-sm font-medium tabular-nums text-red-700">
                  {formatAccountingMoney(difference)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 p-4 md:hidden">
        {lines.map((line, i) => (
          <div key={line.id ?? i} className="rounded-lg border border-gray-100 p-3 space-y-1">
            <div className="text-sm font-medium text-gray-900">
              {line.accountNumber && (
                <span className="mr-1.5 font-mono text-xs text-gray-500">
                  {line.accountNumber}
                </span>
              )}
              {line.accountName ?? '—'}
            </div>
            {line.memo && (
              <div className="text-xs text-gray-500">{line.memo}</div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                {line.debitAmount > 0 ? 'Debit' : 'Credit'}
              </span>
              <span className="font-medium tabular-nums text-gray-900">
                {formatAccountingMoney(line.debitAmount > 0 ? line.debitAmount : line.creditAmount)}
              </span>
            </div>
          </div>
        ))}
        {/* Totals */}
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 space-y-1">
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Debits</span>
            <span className="tabular-nums">{formatAccountingMoney(totalDebits)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Credits</span>
            <span className="tabular-nums">{formatAccountingMoney(totalCredits)}</span>
          </div>
          {!isBalanced && (
            <div className="flex justify-between text-sm font-semibold text-red-700">
              <span>Difference</span>
              <span className="tabular-nums">{formatAccountingMoney(difference)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
