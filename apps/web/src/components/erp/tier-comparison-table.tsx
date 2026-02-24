'use client';

import { Check, X } from 'lucide-react';
import { TierBadge } from './tier-badge';

const COMPARISON_ROWS = [
  { label: 'Journal Posting', smb: 'Auto', mid: 'Auto', ent: 'Draft + Approval' },
  { label: 'Period Close', smb: 'Auto', mid: 'Manual', ent: 'Manual + Approval' },
  { label: 'Bank Reconciliation', smb: 'Auto', mid: 'Manual', ent: 'Manual' },
  { label: 'Settlement Matching', smb: 'Auto', mid: 'Auto', ent: 'Manual' },
  { label: 'Bill Approval', smb: 'Auto', mid: 'Auto', ent: 'Approval Required' },
  { label: 'Accounting Visible', smb: false, mid: true, ent: true },
  { label: 'Approval Workflows', smb: false, mid: false, ent: true },
  { label: 'Full GL Visibility', smb: false, mid: true, ent: true },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-green-600" />
    ) : (
      <X className="mx-auto h-4 w-4 text-gray-300" />
    );
  }
  return <span className="text-sm text-gray-700">{value}</span>;
}

export function TierComparisonTable({ currentTier }: { currentTier: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Feature
            </th>
            {(['SMB', 'MID_MARKET', 'ENTERPRISE'] as const).map((tier) => (
              <th
                key={tier}
                className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 ${
                  tier === currentTier ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <TierBadge tier={tier} />
                  {tier === currentTier && (
                    <span className="text-xs font-normal normal-case text-indigo-600">(current)</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-surface">
          {COMPARISON_ROWS.map((row) => (
            <tr key={row.label}>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                {row.label}
              </td>
              <td className={`px-4 py-3 text-center ${currentTier === 'SMB' ? 'bg-indigo-50/50' : ''}`}>
                <CellValue value={row.smb} />
              </td>
              <td className={`px-4 py-3 text-center ${currentTier === 'MID_MARKET' ? 'bg-indigo-50/50' : ''}`}>
                <CellValue value={row.mid} />
              </td>
              <td className={`px-4 py-3 text-center ${currentTier === 'ENTERPRISE' ? 'bg-indigo-50/50' : ''}`}>
                <CellValue value={row.ent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
