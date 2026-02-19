'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import {
  BarChart3,
  TrendingUp,
  Table2,
  Hash,
  ArrowLeft,
  Download,
  Save,
  Play,
} from 'lucide-react';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useFieldCatalog } from '@/hooks/use-field-catalog';
import { useSaveReport, usePreviewReport, downloadCustomReportExport } from '@/hooks/use-custom-reports';
import { MultiDatasetFieldPicker } from '@/components/reports/custom/multi-dataset-field-picker';
import { FilterBuilder } from '@/components/reports/custom/filter-builder';
import { ReportPreview } from '@/components/reports/custom/report-preview';
import { useReportFilters } from '@/hooks/use-report-filters';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { detectPreset } from '@/lib/date-presets';
import type {
  SavedReport,
  ReportFilter,
  ChartType,
  RunReportResult,
} from '@/types/custom-reports';
import {
  DATASET_LABELS,
  TIME_SERIES_DATASETS,
  validateReportDefinition,
  extractDatasetsFromColumns,
  isValidDatasetCombination,
  parseFieldKey,
} from '@/types/custom-reports';

interface ReportBuilderProps {
  reportId?: string;
  initialData?: SavedReport;
}

const CHART_TYPE_OPTIONS: { type: ChartType; label: string; Icon: typeof BarChart3 }[] = [
  { type: 'line', label: 'Line', Icon: TrendingUp },
  { type: 'bar', label: 'Bar', Icon: BarChart3 },
  { type: 'table', label: 'Table', Icon: Table2 },
  { type: 'metric', label: 'Metric', Icon: Hash },
];

export function ReportBuilder({ reportId, initialData }: ReportBuilderProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ── Form state ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<{ fieldKey: string; direction: 'asc' | 'desc' }[]>([]);
  const [limit, setLimit] = useState(1000);
  const [chartType, setChartType] = useState<ChartType>('table');

  // ── Date range (shared filter bar) ────────────────────────
  const reportFilters = useReportFilters();

  // ── Validation errors ───────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [nameError, setNameError] = useState('');

  // ── Preview state ───────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<RunReportResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Dirty state (track unsaved column reorder changes) ────
  const [isDirty, setIsDirty] = useState(false);
  const savedColumnsRef = useRef<string[] | null>(null);

  // ── Hooks ───────────────────────────────────────────────────
  const { fields, byDataset, isLoading: fieldsLoading, error: fieldsError } = useFieldCatalog();
  const saveReport = useSaveReport();
  const previewReport = usePreviewReport();
  const { setGuard, guardedNavigate } = useNavigationGuard();

  // ── Derive active datasets from selected columns ──────────
  const activeDatasets = useMemo(
    () => extractDatasetsFromColumns(selectedColumns),
    [selectedColumns],
  );

  // ── Get all fields for active datasets (flat list for filter/sort) ──
  const activeFields = useMemo(() => {
    const result: typeof fields = [];
    for (const ds of activeDatasets) {
      const dsFields = byDataset[ds];
      if (dsFields) result.push(...dsFields);
    }
    return result;
  }, [activeDatasets, byDataset]);

  // ── Does this report need a date range? ────────────────────
  const needsDateRange = useMemo(
    () => activeDatasets.some((d) => (TIME_SERIES_DATASETS as readonly string[]).includes(d)),
    [activeDatasets],
  );

  // ── Purge stale refs when datasets change ─────────────────
  // When the user deselects all fields from a dataset, remove any
  // groupBy / sortBy / filter entries that reference that dataset.
  useEffect(() => {
    const dsSet = new Set(activeDatasets);
    const belongsToActive = (key: string) => {
      const { dataset } = parseFieldKey(key);
      return !dataset || dsSet.has(dataset);
    };
    setGroupBy((prev) => {
      const next = prev.filter(belongsToActive);
      return next.length === prev.length ? prev : next;
    });
    setSortBy((prev) => {
      const next = prev.filter((s) => belongsToActive(s.fieldKey));
      return next.length === prev.length ? prev : next;
    });
    setFilters((prev) => {
      const next = prev.filter((f) => belongsToActive(f.fieldKey));
      return next.length === prev.length ? prev : next;
    });
  }, [activeDatasets]);

  // ── Populate from initialData ───────────────────────────────
  useEffect(() => {
    if (!initialData) return;
    setName(initialData.name);
    setDescription(initialData.description ?? '');

    // Handle legacy bare field keys: prefix with dataset if no colon present
    const legacyDataset = initialData.dataset;
    const columns = initialData.definition.datasets?.length
      ? initialData.definition.columns
      : initialData.definition.columns.map((col) =>
          col.includes(':') ? col : `${legacyDataset}:${col}`,
        );
    setSelectedColumns(columns);

    const rawFilters = initialData.definition.datasets?.length
      ? initialData.definition.filters
      : (initialData.definition.filters ?? []).map((f) => ({
          ...f,
          fieldKey: f.fieldKey.includes(':') ? f.fieldKey : `${legacyDataset}:${f.fieldKey}`,
        }));
    // Strip business_date filters — they're managed by the date range picker
    const nonDateFilters = rawFilters.filter((f) => {
      const { fieldKey } = parseFieldKey(f.fieldKey);
      return fieldKey !== 'business_date';
    });
    setFilters(nonDateFilters);

    const gby = initialData.definition.datasets?.length
      ? (initialData.definition.groupBy ?? [])
      : (initialData.definition.groupBy ?? []).map((g) =>
          g.includes(':') ? g : `${legacyDataset}:${g}`,
        );
    setGroupBy(gby);

    const sby = initialData.definition.datasets?.length
      ? (initialData.definition.sortBy ?? [])
      : (initialData.definition.sortBy ?? []).map((s) => ({
          ...s,
          fieldKey: s.fieldKey.includes(':') ? s.fieldKey : `${legacyDataset}:${s.fieldKey}`,
        }));
    setSortBy(sby);

    setLimit(initialData.definition.limit ?? 1000);

    // Restore date range from saved business_date filters
    let savedFrom = '';
    let savedTo = '';
    for (const f of initialData.definition.filters ?? []) {
      const { fieldKey } = parseFieldKey(f.fieldKey);
      if (fieldKey === 'business_date' && f.op === 'gte' && typeof f.value === 'string') {
        savedFrom = f.value;
      }
      if (fieldKey === 'business_date' && f.op === 'lte' && typeof f.value === 'string') {
        savedTo = f.value;
      }
    }
    if (savedFrom && savedTo) {
      reportFilters.setDateRange(savedFrom, savedTo, detectPreset(savedFrom, savedTo));
    }
  }, [initialData]);

  // ── Toggle column ───────────────────────────────────────────
  const handleToggleColumn = useCallback((compositeKey: string) => {
    setSelectedColumns((prev) => {
      // Deselect — always allowed
      if (prev.includes(compositeKey)) {
        return prev.filter((k) => k !== compositeKey);
      }
      // Select — block if it would create an invalid dataset combo
      const proposed = [...prev, compositeKey];
      const proposedDatasets = extractDatasetsFromColumns(proposed);
      if (!isValidDatasetCombination(proposedDatasets)) {
        return prev; // reject
      }
      return proposed;
    });
    setIsDirty(true);
  }, []);

  // ── Derived options for Group By / Sort ─────────────────────
  const groupByOptions = useMemo(
    () =>
      activeFields
        .filter((f) => !f.isMetric)
        .filter((f) => selectedColumns.includes(`${f.dataset}:${f.fieldKey}`))
        .map((f) => ({
          value: `${f.dataset}:${f.fieldKey}`,
          label: `${DATASET_LABELS[f.dataset] ?? f.dataset} > ${f.label}`,
        })),
    [activeFields, selectedColumns],
  );

  const sortFieldOptions = useMemo(
    () =>
      activeFields
        .filter((f) => selectedColumns.includes(`${f.dataset}:${f.fieldKey}`))
        .map((f) => ({
          value: `${f.dataset}:${f.fieldKey}`,
          label: `${DATASET_LABELS[f.dataset] ?? f.dataset} > ${f.label}`,
        })),
    [activeFields, selectedColumns],
  );

  const sortDirectionOptions = [
    { value: 'asc', label: 'Ascending' },
    { value: 'desc', label: 'Descending' },
  ];

  // ── Build definition ────────────────────────────────────────
  const buildDefinition = useCallback(() => {
    // Merge user filters with auto-injected date range filters
    let allFilters = [...filters];

    if (needsDateRange && reportFilters.dateFrom && reportFilters.dateTo) {
      // Find the first time-series dataset for the composite key
      const tsDataset = activeDatasets.find((d) =>
        (TIME_SERIES_DATASETS as readonly string[]).includes(d),
      ) ?? activeDatasets[0] ?? '';

      // Remove any existing business_date filters (avoid duplicates)
      allFilters = allFilters.filter((f) => {
        const { fieldKey } = parseFieldKey(f.fieldKey);
        return fieldKey !== 'business_date';
      });

      allFilters.push(
        { fieldKey: `${tsDataset}:business_date`, op: 'gte', value: reportFilters.dateFrom },
        { fieldKey: `${tsDataset}:business_date`, op: 'lte', value: reportFilters.dateTo },
      );
    }

    return {
      datasets: activeDatasets,
      columns: selectedColumns,
      filters: allFilters,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
      sortBy: sortBy.length > 0 ? sortBy : undefined,
      limit,
    };
  }, [activeDatasets, selectedColumns, filters, groupBy, sortBy, limit, needsDateRange, reportFilters.dateFrom, reportFilters.dateTo]);

  // ── Validate ────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const errors: string[] = [];
    let hasNameErr = false;

    if (!name.trim()) {
      hasNameErr = true;
      setNameError('Name is required');
    } else {
      setNameError('');
    }

    const defErrors = validateReportDefinition(buildDefinition(), activeDatasets);
    errors.push(...defErrors);

    setValidationErrors(errors);
    return !hasNameErr && errors.length === 0;
  }, [name, buildDefinition, activeDatasets]);

  // ── Save ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    const result = await saveReport.mutate({
      id: reportId,
      name: name.trim(),
      description: description.trim() || undefined,
      dataset: activeDatasets[0] ?? '',
      definition: buildDefinition(),
    });

    if (result) {
      toast.success(reportId ? 'Report updated' : 'Report created');
      setIsDirty(false);
      savedColumnsRef.current = selectedColumns;
      if (!reportId) {
        router.push(`/reports/custom/${result.id}`);
      }
    }
  }, [validate, saveReport, reportId, name, description, activeDatasets, buildDefinition, toast, router, selectedColumns]);

  // ── Preview (works without saving) ─────────────────────────
  const validatePreview = useCallback((): boolean => {
    const defErrors = validateReportDefinition(buildDefinition(), activeDatasets);
    setValidationErrors(defErrors);
    return defErrors.length === 0;
  }, [buildDefinition, activeDatasets]);

  const handlePreview = useCallback(async () => {
    if (!validatePreview()) return;

    setPreviewError(null);
    const definition = buildDefinition();
    const result = await previewReport.mutate({
      dataset: activeDatasets[0] ?? '',
      definition,
    });

    if (result) {
      setPreviewResult(result);
    } else {
      setPreviewError('Failed to run report preview');
    }
  }, [validatePreview, previewReport, buildDefinition, activeDatasets]);

  // ── Auto-preview on field/filter/date changes (debounced) ──
  const handlePreviewRef = useRef(handlePreview);
  handlePreviewRef.current = handlePreview;
  const initialLoadDone = useRef(false);

  useEffect(() => {
    // Skip auto-preview until initial data has loaded (or we're on "new" page)
    if (!initialLoadDone.current) {
      if (initialData || selectedColumns.length > 0) {
        initialLoadDone.current = true;
      }
      // On first load with initialData, don't auto-fire — user hasn't changed anything yet
      if (initialData) return;
    }

    if (selectedColumns.length === 0) return;

    const timer = setTimeout(() => {
      handlePreviewRef.current();
    }, 400);
    return () => clearTimeout(timer);
    // Re-run when definition inputs change
  }, [selectedColumns, filters, reportFilters.dateFrom, reportFilters.dateTo, groupBy, sortBy, limit, initialData]);

  // ── Export ──────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!reportId) return;
    try {
      await downloadCustomReportExport(reportId);
    } catch {
      toast.error('Export failed');
    }
  }, [reportId, toast]);

  // ── Column reorder handler ──────────────────────────────────
  const handleColumnsReorder = useCallback((newColumns: string[]) => {
    setSelectedColumns(newColumns);
    setIsDirty(true);
    // Update preview result columns to match the new order
    setPreviewResult((prev) => {
      if (!prev) return prev;
      return { ...prev, columns: newColumns };
    });
  }, []);

  // Track saved column order after initialData loads
  useEffect(() => {
    if (initialData) {
      const legacyDataset = initialData.dataset;
      const cols = initialData.definition.datasets?.length
        ? initialData.definition.columns
        : initialData.definition.columns.map((col) =>
            col.includes(':') ? col : `${legacyDataset}:${col}`,
          );
      savedColumnsRef.current = cols;
    }
  }, [initialData]);

  // ── Navigation guard (custom modal) + beforeunload ─────────
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    // Browser tab close / hard reload — native prompt (can't customize)
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);

    // SPA navigation — custom OppsEra modal
    const unregister = setGuard({
      isDirty: () => isDirtyRef.current,
      onSave: async () => {
        await handleSaveRef.current();
        // If save succeeds isDirty will be false
        return !isDirtyRef.current;
      },
    });

    return () => {
      window.removeEventListener('beforeunload', handler);
      unregister();
    };
  }, [setGuard]);

  const hasFields = selectedColumns.length > 0;

  return (
    <div className="space-y-6">
      {/* Validation errors banner */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Please fix the following errors:
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-red-600">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Date Range Filter Bar (always visible) */}
      <ReportFilterBar
        dateFrom={reportFilters.dateFrom}
        dateTo={reportFilters.dateTo}
        preset={reportFilters.preset}
        onDateChange={reportFilters.setDateRange}
        locationId={reportFilters.locationId}
        onLocationChange={reportFilters.setLocationId}
        locations={[]}
        hideLocation
      />

      {/* Main layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left panel — Form */}
        <div className="space-y-6">
          {/* Name */}
          <FormField label="Report Name" required error={nameError}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="e.g. Weekly Sales Summary"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none ${
                nameError
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
            />
          </FormField>

          {/* Description */}
          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          {/* Multi-Dataset Field Picker */}
          <div className="rounded-lg border border-gray-200 bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Select Fields
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              Select fields from one or more datasets. Compatible datasets will be automatically joined.
            </p>
            {fieldsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-gray-200" />
                ))}
              </div>
            ) : fieldsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Failed to load fields. Make sure migration 0050 has been applied
                ({fieldsError.message}).
              </div>
            ) : (
              <MultiDatasetFieldPicker
                byDataset={byDataset}
                selectedColumns={selectedColumns}
                onToggleColumn={handleToggleColumn}
              />
            )}
          </div>

          {/* Filter Builder (excludes date range filters managed by the filter bar) */}
          {hasFields && activeFields.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Filters
              </h3>
              <FilterBuilder
                fields={activeFields}
                filters={filters}
                onFiltersChange={setFilters}
                useCompositeKeys
              />
            </div>
          )}

          {/* Group By */}
          {hasFields && groupByOptions.length > 0 && (
            <FormField label="Group By" helpText="Select dimension fields to group by">
              <Select
                options={groupByOptions}
                value={groupBy}
                onChange={(val) => setGroupBy(val as string[])}
                placeholder="Select group by fields..."
                multiple
              />
            </FormField>
          )}

          {/* Sort */}
          {hasFields && sortFieldOptions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Sort Field">
                <Select
                  options={sortFieldOptions}
                  value={sortBy[0]?.fieldKey ?? ''}
                  onChange={(val) => {
                    const fieldKey = val as string;
                    if (!fieldKey) {
                      setSortBy([]);
                    } else {
                      setSortBy([
                        { fieldKey, direction: sortBy[0]?.direction ?? 'desc' },
                      ]);
                    }
                  }}
                  placeholder="Sort by..."
                />
              </FormField>
              <FormField label="Direction">
                <Select
                  options={sortDirectionOptions}
                  value={sortBy[0]?.direction ?? 'desc'}
                  onChange={(val) => {
                    if (sortBy.length === 0) return;
                    setSortBy([
                      { fieldKey: sortBy[0]!.fieldKey, direction: val as 'asc' | 'desc' },
                    ]);
                  }}
                  placeholder="Direction..."
                />
              </FormField>
            </div>
          )}

          {/* Limit */}
          {hasFields && (
            <FormField label="Row Limit" helpText="Maximum 10,000 rows">
              <input
                type="number"
                value={limit}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 10000) {
                    setLimit(val);
                  }
                }}
                min={1}
                max={10000}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
          )}
        </div>

        {/* Right panel — Chart type + Preview */}
        <div className="space-y-6">
          {/* Chart type selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Visualization
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CHART_TYPE_OPTIONS.map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setChartType(type);
                    if (hasFields) handlePreview();
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                    chartType === type
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview button */}
          <div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewReport.isLoading || !hasFields}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {previewReport.isLoading ? 'Running...' : 'Preview'}
            </button>
          </div>

          {/* Preview result */}
          <ReportPreview
            columns={previewResult?.columns ?? []}
            rows={previewResult?.rows ?? []}
            chartType={chartType}
            isLoading={previewReport.isLoading}
            error={previewError}
            fieldCatalog={fields}
            onColumnsReorder={handleColumnsReorder}
          />
        </div>
      </div>

      {/* Actions bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-surface pt-4 pb-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveReport.isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saveReport.isLoading ? 'Saving...' : 'Save Report'}
        </button>

        {reportId && (
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}

        <button
          type="button"
          onClick={() => guardedNavigate('/reports/custom')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}
