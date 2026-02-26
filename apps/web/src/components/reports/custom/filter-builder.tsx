'use client';

import { useCallback, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import type { FieldCatalogEntry, ReportFilter } from '@/types/custom-reports';
import { FILTER_OPERATORS, OPERATORS_BY_TYPE, DATASET_LABELS } from '@/types/custom-reports';

interface FilterBuilderProps {
  fields: FieldCatalogEntry[];
  filters: ReportFilter[];
  onFiltersChange: (filters: ReportFilter[]) => void;
  useCompositeKeys?: boolean;
}

export function FilterBuilder({
  fields,
  filters,
  onFiltersChange,
  useCompositeKeys = false,
}: FilterBuilderProps) {
  const filterableFields = useMemo(
    () => fields.filter((f) => f.isFilterable),
    [fields],
  );

  const fieldOptions = useMemo(
    () =>
      filterableFields.map((f) => ({
        value: useCompositeKeys ? `${f.dataset}:${f.fieldKey}` : f.fieldKey,
        label: useCompositeKeys
          ? `${DATASET_LABELS[f.dataset] ?? f.dataset} > ${f.label}`
          : f.label,
      })),
    [filterableFields, useCompositeKeys],
  );

  const addFilter = useCallback(() => {
    const first = filterableFields[0];
    if (!first) return;
    const ops = OPERATORS_BY_TYPE[first.dataType] ?? ['eq'];
    const fieldKey = useCompositeKeys ? `${first.dataset}:${first.fieldKey}` : first.fieldKey;
    onFiltersChange([
      ...filters,
      { fieldKey, op: ops[0]!, value: '' },
    ]);
  }, [filterableFields, filters, onFiltersChange, useCompositeKeys]);

  const updateFilter = useCallback(
    (index: number, patch: Partial<ReportFilter>) => {
      const updated = filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
      onFiltersChange(updated);
    },
    [filters, onFiltersChange],
  );

  const removeFilter = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange],
  );

  const getFieldByKey = useCallback(
    (key: string) => {
      if (useCompositeKeys) {
        const colonIdx = key.indexOf(':');
        if (colonIdx !== -1) {
          const ds = key.slice(0, colonIdx);
          const fk = key.slice(colonIdx + 1);
          return fields.find((f) => f.dataset === ds && f.fieldKey === fk);
        }
      }
      return fields.find((f) => f.fieldKey === key);
    },
    [fields, useCompositeKeys],
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={addFilter}
        disabled={filterableFields.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Filter
      </button>

      {filters.length === 0 && (
        <p className="text-sm text-muted-foreground">No filters applied</p>
      )}

      <div className="space-y-2">
        {filters.map((filter, index) => {
          const field = getFieldByKey(filter.fieldKey);
          const dataType = field?.dataType ?? 'string';
          const operators = OPERATORS_BY_TYPE[dataType] ?? ['eq'];
          const operatorOptions = operators.map((op) => ({
            value: op,
            label: FILTER_OPERATORS[op],
          }));

          return (
            <div
              key={index}
              className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-surface p-3"
            >
              {/* Field selector */}
              <div className="w-full sm:w-auto sm:min-w-[180px]">
                <Select
                  options={fieldOptions}
                  value={filter.fieldKey}
                  onChange={(val) => {
                    const newKey = val as string;
                    const newField = getFieldByKey(newKey);
                    const newType = newField?.dataType ?? 'string';
                    const newOps = OPERATORS_BY_TYPE[newType] ?? ['eq'];
                    updateFilter(index, {
                      fieldKey: newKey,
                      op: newOps[0]!,
                      value: '',
                    });
                  }}
                  placeholder="Field..."
                />
              </div>

              {/* Operator selector */}
              <div className="w-full sm:w-auto sm:min-w-[140px]">
                <Select
                  options={operatorOptions}
                  value={filter.op}
                  onChange={(val) =>
                    updateFilter(index, { op: val as ReportFilter['op'] })
                  }
                  placeholder="Operator..."
                />
              </div>

              {/* Value input */}
              <div className="min-w-0 flex-1">
                <FilterValueInput
                  dataType={dataType}
                  op={filter.op}
                  value={filter.value}
                  onChange={(value) => updateFilter(index, { value })}
                />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeFilter(index)}
                className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Remove filter"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterValueInput({
  dataType,
  op,
  value,
  onChange,
}: {
  dataType: string;
  op: ReportFilter['op'];
  value: ReportFilter['value'];
  onChange: (value: ReportFilter['value']) => void;
}) {
  const baseClasses =
    'w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none';

  // Boolean toggle
  if (dataType === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => onChange(value === true ? false : true)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          value === true
            ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-500'
            : 'border-border text-foreground hover:bg-accent'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            value === true ? 'bg-indigo-600' : 'bg-muted'
          }`}
        />
        {value === true ? 'True' : 'False'}
      </button>
    );
  }

  // Date input
  if (dataType === 'date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={baseClasses}
      />
    );
  }

  // Number input
  if (dataType === 'number' && op !== 'in') {
    return (
      <input
        type="number"
        value={String(value ?? '')}
        onChange={(e) => {
          const num = e.target.value === '' ? '' : Number(e.target.value);
          onChange(num);
        }}
        placeholder="Value..."
        className={baseClasses}
      />
    );
  }

  // "in" operator — comma-separated values
  if (op === 'in') {
    const displayValue = Array.isArray(value)
      ? value.join(', ')
      : String(value ?? '');
    return (
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          const parts = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(parts);
        }}
        placeholder="Comma separated values..."
        className={baseClasses}
      />
    );
  }

  // Default: text input
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value..."
      className={baseClasses}
    />
  );
}
