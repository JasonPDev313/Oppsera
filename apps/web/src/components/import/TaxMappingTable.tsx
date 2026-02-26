'use client';

import { Check, X } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MappingDropdown } from './MappingDropdown';
import type { TaxMapping } from '@/hooks/use-import-jobs';

const TAX_MODE_OPTIONS = [
  { value: 'exclusive', label: 'Tax-Exclusive (added on top)' },
  { value: 'inclusive', label: 'Tax-Inclusive (already included)' },
];

interface TaxMappingTableProps {
  mappings: TaxMapping[];
  taxGroups: Array<{ id: string; name: string }>;
  onChange: (
    mappingId: string,
    updates: { oppseraTaxGroupId?: string; taxMode?: string; isConfirmed: boolean },
  ) => void;
}

export function TaxMappingTable({ mappings, taxGroups, onChange }: TaxMappingTableProps) {
  const taxGroupOptions = taxGroups.map((tg) => ({
    value: tg.id,
    label: tg.name,
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 font-medium">Legacy Column</th>
            <th className="px-3 py-2 font-medium">Detected Rate</th>
            <th className="px-3 py-2 font-medium">OppsEra Tax Group</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="w-16 px-3 py-2 font-medium">OK</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => (
            <tr key={m.id} className="border-b border-border">
              <td className="px-3 py-2 font-mono text-xs">{m.legacyColumn}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {m.legacyRate != null ? `${m.legacyRate}%` : '-'}
              </td>
              <td className="px-3 py-2">
                <MappingDropdown
                  value={m.oppseraTaxGroupId ?? ''}
                  options={taxGroupOptions}
                  onChange={(val) =>
                    onChange(m.id, { oppseraTaxGroupId: val || undefined, isConfirmed: true })
                  }
                  placeholder="Select tax group..."
                />
              </td>
              <td className="px-3 py-2">
                <MappingDropdown
                  value={m.taxMode}
                  options={TAX_MODE_OPTIONS}
                  onChange={(val) => onChange(m.id, { taxMode: val, isConfirmed: true })}
                />
              </td>
              <td className="px-3 py-2">
                <ConfidenceBadge confidence={m.confidence} />
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onChange(m.id, { isConfirmed: !m.isConfirmed })}
                  className={`rounded p-1 ${
                    m.isConfirmed
                      ? 'text-green-500 hover:bg-green-500/10'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {m.isConfirmed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mappings.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No tax columns detected. You can skip this step.
        </p>
      )}
    </div>
  );
}
