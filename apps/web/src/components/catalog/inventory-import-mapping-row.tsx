'use client';

import type { ColumnMapping } from '@/hooks/use-inventory-import';

// ── Target Field Options ────────────────────────────────────────────

const TARGET_FIELD_GROUPS: Record<string, Array<{ value: string; label: string }>> = {
  Required: [
    { value: 'name', label: 'Item Name' },
    { value: 'defaultPrice', label: 'Price' },
  ],
  'Item Details': [
    { value: 'sku', label: 'SKU' },
    { value: 'barcode', label: 'Barcode / UPC' },
    { value: 'description', label: 'Description' },
    { value: 'itemType', label: 'Item Type' },
  ],
  Pricing: [
    { value: 'cost', label: 'Cost' },
    { value: 'priceIncludesTax', label: 'Price Includes Tax' },
  ],
  'Category Hierarchy': [
    { value: 'department', label: 'Department' },
    { value: 'subDepartment', label: 'Sub-Department' },
    { value: 'category', label: 'Category' },
  ],
  Tax: [{ value: 'taxCategoryName', label: 'Tax Category' }],
  Inventory: [
    { value: 'isTrackable', label: 'Track Inventory' },
    { value: 'reorderPoint', label: 'Reorder Point' },
    { value: 'parLevel', label: 'Par Level' },
  ],
  Vendor: [
    { value: 'vendor', label: 'Vendor' },
    { value: 'vendorSku', label: 'Vendor SKU' },
  ],
};

// ── Props ────────────────────────────────────────────────────────────

interface MappingRowProps {
  column: ColumnMapping;
  usedTargets: Set<string>;
  onUpdateMapping: (columnIndex: number, targetField: string | null) => void;
}

// ── Component ────────────────────────────────────────────────────────

export function InventoryImportMappingRow({ column, usedTargets, onUpdateMapping }: MappingRowProps) {
  const confidenceColor =
    column.confidence >= 80
      ? 'bg-green-500/20 text-green-600'
      : column.confidence >= 50
        ? 'bg-yellow-500/20 text-yellow-600'
        : column.confidence > 0
          ? 'bg-red-500/20 text-red-600'
          : 'bg-muted text-muted-foreground';

  const isRequired = column.targetField === 'name' || column.targetField === 'defaultPrice';

  return (
    <tr className="border-b border-border/50">
      {/* Source header */}
      <td className="px-3 py-2.5 font-medium text-sm">
        {column.sourceHeader}
      </td>

      {/* Sample values */}
      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
        {column.sampleValues.length > 0 ? (
          <div className="space-y-0.5">
            {column.sampleValues.map((v, i) => (
              <div key={i} className="truncate">{v || <span className="italic text-muted-foreground">(empty)</span>}</div>
            ))}
          </div>
        ) : (
          <span className="italic text-muted-foreground">(empty column)</span>
        )}
      </td>

      {/* Confidence badge */}
      <td className="px-3 py-2.5 text-center">
        {column.confidence > 0 ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${confidenceColor}`}>
            {column.confidence}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Target field select */}
      <td className="px-3 py-2.5">
        <select
          value={column.targetField ?? ''}
          onChange={(e) => onUpdateMapping(column.columnIndex, e.target.value || null)}
          className="w-full text-sm rounded-md border border-input bg-surface px-2 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">— Skip this column —</option>
          {Object.entries(TARGET_FIELD_GROUPS).map(([group, fields]) => (
            <optgroup key={group} label={group}>
              {fields.map((f) => (
                <option
                  key={f.value}
                  value={f.value}
                  disabled={usedTargets.has(f.value) && column.targetField !== f.value}
                >
                  {f.label}{usedTargets.has(f.value) && column.targetField !== f.value ? ' (assigned)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {isRequired && (
          <span className="text-[10px] text-red-500 ml-1">required</span>
        )}
      </td>

      {/* Explanation */}
      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
        <span className="truncate block">{column.explanation}</span>
      </td>
    </tr>
  );
}
