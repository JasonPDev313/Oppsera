'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FieldCatalogEntry } from '@/types/custom-reports';

interface FieldPickerProps {
  fields: FieldCatalogEntry[];
  selectedColumns: string[];
  onToggleColumn: (fieldKey: string) => void;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  number: 'Number',
  string: 'Text',
  date: 'Date',
  boolean: 'Boolean',
};

export function FieldPicker({
  fields,
  selectedColumns,
  onToggleColumn,
}: FieldPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return fields;
    const lower = search.toLowerCase();
    return fields.filter((f) => f.label.toLowerCase().includes(lower));
  }, [fields, search]);

  const dimensions = useMemo(
    () => filtered.filter((f) => !f.isMetric),
    [filtered],
  );

  const metrics = useMemo(
    () => filtered.filter((f) => f.isMetric),
    [filtered],
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fields..."
          className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* Two-column responsive layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Dimensions */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dimensions
          </h4>
          {dimensions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search ? 'No matching dimensions' : 'No dimensions available'}
            </p>
          ) : (
            <div className="space-y-1">
              {dimensions.map((field) => (
                <FieldRow
                  key={field.fieldKey}
                  field={field}
                  isSelected={selectedColumns.includes(field.fieldKey)}
                  onToggle={() => onToggleColumn(field.fieldKey)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Measures */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Measures
          </h4>
          {metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search ? 'No matching measures' : 'No measures available'}
            </p>
          ) : (
            <div className="space-y-1">
              {metrics.map((field) => (
                <FieldRow
                  key={field.fieldKey}
                  field={field}
                  isSelected={selectedColumns.includes(field.fieldKey)}
                  onToggle={() => onToggleColumn(field.fieldKey)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selection count */}
      <p className="text-xs text-muted-foreground">
        {selectedColumns.length} field{selectedColumns.length !== 1 ? 's' : ''}{' '}
        selected
      </p>
    </div>
  );
}

function FieldRow({
  field,
  isSelected,
  onToggle,
}: {
  field: FieldCatalogEntry;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
      />
      <span className="flex-1 text-sm text-foreground">{field.label}</span>
      <Badge variant="neutral">
        {DATA_TYPE_LABELS[field.dataType] ?? field.dataType}
      </Badge>
    </label>
  );
}
