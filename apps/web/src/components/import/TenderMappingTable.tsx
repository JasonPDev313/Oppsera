'use client';

import { Check, X } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MappingDropdown } from './MappingDropdown';
import type { TenderMapping } from '@/hooks/use-import-jobs';

const TENDER_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Credit/Debit Card' },
  { value: 'gift_card', label: 'Gift Card' },
  { value: 'house_account', label: 'House Account' },
  { value: 'check', label: 'Check' },
  { value: 'online', label: 'Online Payment' },
  { value: 'other', label: 'Other' },
];

interface TenderMappingTableProps {
  mappings: TenderMapping[];
  onChange: (mappingId: string, tenderType: string, isConfirmed: boolean) => void;
}

export function TenderMappingTable({ mappings, onChange }: TenderMappingTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 font-medium">Legacy Value</th>
            <th className="px-3 py-2 font-medium">Occurrences</th>
            <th className="px-3 py-2 font-medium">OppsEra Type</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="w-16 px-3 py-2 font-medium">OK</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => (
            <tr key={m.id} className="border-b border-border">
              <td className="px-3 py-2 font-mono text-xs">{m.legacyValue}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.occurrenceCount.toLocaleString()}</td>
              <td className="px-3 py-2">
                <MappingDropdown
                  value={m.oppseraTenderType}
                  options={TENDER_TYPE_OPTIONS}
                  onChange={(val) => onChange(m.id, val, true)}
                />
              </td>
              <td className="px-3 py-2">
                <ConfidenceBadge confidence={m.confidence} />
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onChange(m.id, m.oppseraTenderType, !m.isConfirmed)}
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
    </div>
  );
}
