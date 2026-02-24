'use client';

import { Check, X } from 'lucide-react';
import { MappingDropdown } from './MappingDropdown';
import type { ItemMapping } from '@/hooks/use-import-jobs';

const STRATEGY_OPTIONS = [
  { value: 'auto', label: 'Auto Match' },
  { value: 'mapped', label: 'Map to Existing' },
  { value: 'placeholder', label: 'Create Placeholder' },
  { value: 'skip', label: 'Skip' },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ItemMappingTableProps {
  mappings: ItemMapping[];
  onChange: (
    mappingId: string,
    updates: { strategy?: string; oppseraCatalogItemId?: string; isConfirmed: boolean },
  ) => void;
}

export function ItemMappingTable({ mappings, onChange }: ItemMappingTableProps) {
  // Show top 50 by revenue
  const sorted = [...mappings].sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
  const displayed = sorted.slice(0, 50);
  const remaining = sorted.length - displayed.length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left dark:border-gray-700">
              <th className="px-3 py-2 font-medium">Legacy Item</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Occurrences</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">Strategy</th>
              <th className="w-16 px-3 py-2 font-medium">OK</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="max-w-[200px] truncate px-3 py-2">{m.legacyItemName}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {m.legacyItemSku ?? '-'}
                </td>
                <td className="px-3 py-2 text-gray-500">{m.occurrenceCount.toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-500">{formatCents(m.totalRevenueCents)}</td>
                <td className="px-3 py-2">
                  <MappingDropdown
                    value={m.strategy}
                    options={STRATEGY_OPTIONS}
                    onChange={(val) => onChange(m.id, { strategy: val, isConfirmed: true })}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onChange(m.id, { isConfirmed: !m.isConfirmed })}
                    className={`rounded p-1 ${
                      m.isConfirmed
                        ? 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30'
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {m.isConfirmed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {remaining > 0 && (
        <p className="text-center text-xs text-gray-500">
          Showing top 50 items by revenue. {remaining} additional items will use their auto-detected strategy.
        </p>
      )}

      {mappings.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">
          No item columns detected. You can skip this step.
        </p>
      )}
    </div>
  );
}
