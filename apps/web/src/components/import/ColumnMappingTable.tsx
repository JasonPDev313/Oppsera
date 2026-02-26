'use client';

import { Check, X } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MappingDropdown } from './MappingDropdown';
import type { ColumnMapping } from '@/hooks/use-import-jobs';

const TARGET_ENTITY_OPTIONS = [
  { value: 'order', label: 'Order Header', group: 'Entity' },
  { value: 'line', label: 'Line Item', group: 'Entity' },
  { value: 'tender', label: 'Tender/Payment', group: 'Entity' },
  { value: 'tax', label: 'Tax', group: 'Entity' },
  { value: 'ignore', label: 'Ignore', group: 'Other' },
];

const ORDER_FIELD_OPTIONS = [
  { value: 'groupingKey', label: 'Transaction ID / Grouping Key' },
  { value: 'businessDate', label: 'Business Date' },
  { value: 'total', label: 'Order Total' },
  { value: 'subtotal', label: 'Subtotal' },
  { value: 'discountTotal', label: 'Discount Amount' },
  { value: 'locationName', label: 'Location Name' },
  { value: 'employeeName', label: 'Employee/Server' },
  { value: 'terminalName', label: 'Terminal/Register' },
  { value: 'customerName', label: 'Customer Name' },
  { value: 'tableNumber', label: 'Table Number' },
];

const LINE_FIELD_OPTIONS = [
  { value: 'catalogItemName', label: 'Item Name' },
  { value: 'catalogItemSku', label: 'Item SKU/Code' },
  { value: 'qty', label: 'Quantity' },
  { value: 'unitPrice', label: 'Unit Price' },
  { value: 'lineTotal', label: 'Line Total' },
];

const TENDER_FIELD_OPTIONS = [
  { value: 'tenderType', label: 'Payment Type' },
  { value: 'amount', label: 'Payment Amount' },
  { value: 'tipAmount', label: 'Tip Amount' },
  { value: 'changeGiven', label: 'Change Given' },
];

const TAX_FIELD_OPTIONS = [
  { value: 'taxAmount', label: 'Tax Amount' },
  { value: 'taxRate', label: 'Tax Rate' },
];

function getFieldOptions(entity: string) {
  switch (entity) {
    case 'order': return ORDER_FIELD_OPTIONS;
    case 'line': return LINE_FIELD_OPTIONS;
    case 'tender': return TENDER_FIELD_OPTIONS;
    case 'tax': return TAX_FIELD_OPTIONS;
    default: return [];
  }
}

interface MappingEdit {
  targetEntity: string;
  targetField: string;
  isConfirmed: boolean;
}

interface ColumnMappingTableProps {
  mappings: ColumnMapping[];
  onChange: (mappingId: string, changes: MappingEdit) => void;
  groupingKey: string | null;
  onGroupingKeyChange: (key: string) => void;
}

export function ColumnMappingTable({
  mappings,
  onChange,
  groupingKey,
  onGroupingKeyChange,
}: ColumnMappingTableProps) {
  // Allow any column as grouping key
  const allColumns = mappings.map((m) => ({
    value: m.sourceColumn,
    label: m.sourceColumn,
  }));

  return (
    <div className="space-y-4">
      {/* Grouping Key Selector */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="text-sm font-medium whitespace-nowrap">Grouping Key:</label>
        <MappingDropdown
          value={groupingKey ?? ''}
          options={allColumns}
          onChange={onGroupingKeyChange}
          placeholder="Select column that groups rows into orders..."
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground">
          Rows sharing the same value in this column become one order
        </span>
      </div>

      {/* Mapping Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 font-medium">Source Column</th>
              <th className="px-3 py-2 font-medium">Target Entity</th>
              <th className="px-3 py-2 font-medium">Target Field</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Data Type</th>
              <th className="px-3 py-2 font-medium">Sample Values</th>
              <th className="w-16 px-3 py-2 font-medium">OK</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border ${
                  !m.isConfirmed && m.confidence < 0.5
                    ? 'bg-red-500/10'
                    : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs">{m.sourceColumn}</td>
                <td className="px-3 py-2">
                  <MappingDropdown
                    value={m.targetEntity}
                    options={TARGET_ENTITY_OPTIONS}
                    onChange={(val) =>
                      onChange(m.id, {
                        targetEntity: val,
                        targetField: val === 'ignore' ? 'ignored' : '',
                        isConfirmed: true,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  {m.targetEntity !== 'ignore' && (
                    <MappingDropdown
                      value={m.targetField}
                      options={getFieldOptions(m.targetEntity)}
                      onChange={(val) =>
                        onChange(m.id, {
                          targetEntity: m.targetEntity,
                          targetField: val,
                          isConfirmed: true,
                        })
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <ConfidenceBadge confidence={m.confidence} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{m.dataType ?? '-'}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                  {(m.sampleValues ?? []).slice(0, 3).join(', ') || '-'}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChange(m.id, {
                        targetEntity: m.targetEntity,
                        targetField: m.targetField,
                        isConfirmed: !m.isConfirmed,
                      })
                    }
                    className={`rounded p-1 ${
                      m.isConfirmed
                        ? 'text-green-600 hover:bg-green-500/20'
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
    </div>
  );
}
