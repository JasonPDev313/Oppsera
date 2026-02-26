'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FieldCatalogEntry } from '@/types/custom-reports';
import {
  DATASET_LABELS,
  STANDALONE_DATASETS,
  isValidDatasetCombination,
  extractDatasetsFromColumns,
} from '@/types/custom-reports';

interface MultiDatasetFieldPickerProps {
  byDataset: Record<string, FieldCatalogEntry[]>;
  selectedColumns: string[];
  onToggleColumn: (compositeKey: string) => void;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  number: 'Number',
  string: 'Text',
  date: 'Date',
  boolean: 'Boolean',
};

const DATASET_ORDER = ['daily_sales', 'item_sales', 'inventory', 'customers'];

export function MultiDatasetFieldPicker({
  byDataset,
  selectedColumns,
  onToggleColumn,
}: MultiDatasetFieldPickerProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeDatasets = useMemo(
    () => extractDatasetsFromColumns(selectedColumns),
    [selectedColumns],
  );

  const toggleCollapsed = (dataset: string) => {
    setCollapsed((prev) => ({ ...prev, [dataset]: !prev[dataset] }));
  };

  // Check if adding a dataset would create an invalid combination
  const wouldBeInvalid = (dataset: string): string | null => {
    if (activeDatasets.length === 0) return null;
    if (activeDatasets.includes(dataset)) return null;
    const proposed = [...activeDatasets, dataset];
    if (!isValidDatasetCombination(proposed)) {
      const labels = proposed.map((d) => DATASET_LABELS[d] || d);
      return `${labels.join(' and ')} cannot be combined`;
    }
    return null;
  };

  const selectedCount = selectedColumns.length;
  const datasetCount = activeDatasets.length;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fields across all datasets..."
          className="w-full rounded-lg border border-input py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {/* Dataset sections */}
      <div className="space-y-2">
        {DATASET_ORDER.map((dataset) => {
          const fields = byDataset[dataset];
          if (!fields || fields.length === 0) return null;

          const isStandalone = STANDALONE_DATASETS.has(dataset);
          const incompatWarning = wouldBeInvalid(dataset);
          const isDisabled = incompatWarning !== null;
          const isOpen = !collapsed[dataset];
          const label = DATASET_LABELS[dataset] || dataset;
          const selectedInDataset = selectedColumns.filter(
            (col) => col.startsWith(`${dataset}:`),
          ).length;

          // Filter fields by search
          const lowerSearch = search.toLowerCase();
          const filteredFields = search
            ? fields.filter((f) => f.label.toLowerCase().includes(lowerSearch))
            : fields;

          if (search && filteredFields.length === 0) return null;

          const dimensions = filteredFields.filter((f) => !f.isMetric);
          const metrics = filteredFields.filter((f) => f.isMetric);

          return (
            <div
              key={dataset}
              className={`rounded-lg border transition-colors ${
                selectedInDataset > 0
                  ? 'border-indigo-500/30 bg-indigo-500/5'
                  : 'border-border'
              } ${isDisabled ? 'opacity-50' : ''}`}
            >
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleCollapsed(dataset)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 text-sm font-semibold text-foreground">
                  {label}
                </span>
                {selectedInDataset > 0 && (
                  <Badge variant="info">{selectedInDataset}</Badge>
                )}
                {isStandalone && (
                  <span className="text-xs text-muted-foreground">Standalone only</span>
                )}
              </button>

              {/* Incompatibility warning */}
              {isOpen && isDisabled && incompatWarning && (
                <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {incompatWarning}
                </div>
              )}

              {/* Fields */}
              {isOpen && !isDisabled && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Dimensions */}
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Dimensions
                      </h4>
                      {dimensions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">None</p>
                      ) : (
                        <div className="space-y-0.5">
                          {dimensions.map((field) => {
                            const compositeKey = `${dataset}:${field.fieldKey}`;
                            return (
                              <FieldRow
                                key={compositeKey}
                                field={field}
                                isSelected={selectedColumns.includes(compositeKey)}
                                onToggle={() => onToggleColumn(compositeKey)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Measures */}
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Measures
                      </h4>
                      {metrics.length === 0 ? (
                        <p className="text-xs text-muted-foreground">None</p>
                      ) : (
                        <div className="space-y-0.5">
                          {metrics.map((field) => {
                            const compositeKey = `${dataset}:${field.fieldKey}`;
                            return (
                              <FieldRow
                                key={compositeKey}
                                field={field}
                                isSelected={selectedColumns.includes(compositeKey)}
                                onToggle={() => onToggleColumn(compositeKey)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground">
        {selectedCount} field{selectedCount !== 1 ? 's' : ''} selected
        {datasetCount > 1 && ` from ${datasetCount} datasets`}
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
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-input text-indigo-600 focus:ring-indigo-500"
      />
      <span className="flex-1 text-sm text-foreground">{field.label}</span>
      <Badge variant="neutral">
        {DATA_TYPE_LABELS[field.dataType] ?? field.dataType}
      </Badge>
    </label>
  );
}
