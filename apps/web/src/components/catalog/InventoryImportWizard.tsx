'use client';

import { useCallback, useRef } from 'react';
import {
  Upload,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';
import { useInventoryImport } from '@/hooks/use-inventory-import';
import { InventoryImportMappingRow } from './inventory-import-mapping-row';
import { ImportWizardShell } from '@/components/import/ImportWizardShell';
import { ImportProgressStep } from '@/components/import/ImportProgressStep';
import { ImportResultsCard } from '@/components/import/ImportResultsCard';
import { PreviewBanner } from '@/components/import/PreviewBanner';

// ── Props ────────────────────────────────────────────────────────────

interface InventoryImportWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Step config ─────────────────────────────────────────────────────

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'mapping', label: 'Map Columns' },
  { key: 'preview', label: 'Preview' },
  { key: 'complete', label: 'Done' },
];

/** Map transient states to the visible step key for the indicator */
function resolveStepKey(step: string): string {
  if (step === 'analyzing') return 'upload';
  if (step === 'validating') return 'mapping';
  if (step === 'importing') return 'preview';
  return step;
}

// ── Main Component ──────────────────────────────────────────────────

export function InventoryImportWizard({ open, onClose, onSuccess }: InventoryImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    step,
    fileName,
    defaultItemType,
    duplicateSkuMode,
    columns,
    totalRows,
    mappings,
    isValid,
    errors,
    warnings,
    preview,
    stats,
    importResult,
    isLoading,
    error,
    handleFileSelect,
    updateMapping,
    confirmMappings,
    handleImport,
    goBack,
    reset,
    setDefaultItemType,
    setDuplicateSkuMode,
  } = useInventoryImport();

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt'))) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  // Compute used targets for disabling duplicate assignments
  const usedTargets = new Set<string>();
  for (const [, targetField] of Object.entries(mappings)) {
    if (targetField) usedTargets.add(targetField);
  }

  const hasName = usedTargets.has('name');
  const hasPrice = usedTargets.has('defaultPrice');
  const isTransient = step === 'analyzing' || step === 'validating' || step === 'importing';

  // ── Footer ──

  const footer = (!isTransient && step !== 'complete') ? (
    <>
      <div>
        {(step === 'mapping' || step === 'preview') && (
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {step === 'mapping' && (
          <button
            onClick={confirmMappings}
            disabled={!hasName || !hasPrice || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Validate & Preview
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {step === 'preview' && (
          <button
            onClick={handleImport}
            disabled={!isValid || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import {stats?.validRows ?? 0} Items
          </button>
        )}
      </div>
    </>
  ) : undefined;

  return (
    <ImportWizardShell
      open={open}
      onClose={handleClose}
      title="Import Inventory"
      subtitle="Upload a CSV and we'll auto-match your columns"
      steps={STEPS}
      currentStep={resolveStepKey(step)}
      footer={footer}
      preventClose={step === 'importing'}
      onReset={reset}
      maxWidth="max-w-4xl"
    >
      {/* Upload Step */}
      {(step === 'upload' || step === 'analyzing') && (
        <div className="space-y-6">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            {step === 'analyzing' ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-sm font-medium">Analyzing {fileName}...</p>
                <p className="text-xs text-muted-foreground">Detecting column types and mappings</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a CSV file here, or click to browse</p>
                <p className="text-xs text-muted-foreground">Supports CSV, TSV — up to 10,000 rows</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={onFileChange}
              className="hidden"
            />
          </div>

          {/* Default item type selector */}
          <div>
            <label className="block text-sm font-medium mb-1">Default Item Type</label>
            <select
              value={defaultItemType}
              onChange={(e) => setDefaultItemType(e.target.value)}
              className="w-full max-w-xs text-sm rounded-md border border-input bg-surface px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="retail">Retail</option>
              <option value="food">Food</option>
              <option value="beverage">Beverage</option>
              <option value="service">Service</option>
              <option value="green_fee">Green Fee</option>
              <option value="rental">Rental</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Used when the file doesn&apos;t include an item type column
            </p>
          </div>

          <p className="text-xs text-muted-foreground italic">
            You don&apos;t need to clean your file perfectly. We&apos;ll help you match fields automatically.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/40 text-red-500 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Mapping Step */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Column Mapping</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                We&apos;ve auto-matched your columns. {totalRows.toLocaleString()} rows detected — review and adjust any mappings below.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-500/20 text-green-600">High</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600">Medium</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/20 text-red-600">Low</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/80 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Source Column</th>
                  <th className="px-3 py-2 font-medium">Sample Values</th>
                  <th className="px-3 py-2 font-medium text-center">Confidence</th>
                  <th className="px-3 py-2 font-medium">Map To</th>
                  <th className="px-3 py-2 font-medium">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <InventoryImportMappingRow
                    key={col.columnIndex}
                    column={{ ...col, targetField: mappings[String(col.columnIndex)] ?? null }}
                    usedTargets={usedTargets}
                    onUpdateMapping={updateMapping}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {!hasName && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/40 text-red-500 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Item Name must be mapped to continue
            </div>
          )}
          {!hasPrice && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/40 text-red-500 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Price must be mapped to continue
            </div>
          )}
        </div>
      )}

      {/* Validating Step */}
      {step === 'validating' && (
        <ImportProgressStep
          label="Validating data..."
          sublabel="Checking references and uniqueness constraints"
        />
      )}

      {/* Preview Step */}
      {step === 'preview' && stats && (
        <div className="space-y-4">
          <PreviewBanner
            readyCount={stats.validRows}
            attentionCount={errors.length}
            entityLabel="items"
          />

          {/* Extra stats pills */}
          <div className="flex flex-wrap gap-2">
            {(stats.newDepartments.length > 0 || stats.newSubDepartments.length > 0 || stats.newCategories.length > 0) && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-sm">
                {stats.newDepartments.length + stats.newSubDepartments.length + stats.newCategories.length} categories to auto-create
              </div>
            )}
            {stats.duplicateSkus.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-sm">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.duplicateSkus.length} duplicate SKUs
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-sm">
                {warnings.length} warnings
              </div>
            )}
          </div>

          {/* Duplicate SKU mode */}
          {stats.duplicateSkus.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/40">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-yellow-500">
                  {stats.duplicateSkus.length} item(s) have SKUs that already exist
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="dupMode"
                      checked={duplicateSkuMode === 'skip'}
                      onChange={() => setDuplicateSkuMode('skip')}
                      className="accent-indigo-600"
                    />
                    Skip duplicates
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="dupMode"
                      checked={duplicateSkuMode === 'update'}
                      onChange={() => setDuplicateSkuMode('update')}
                      className="accent-indigo-600"
                    />
                    Update existing items
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Error list */}
          {errors.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {errors.slice(0, 20).map((e, i) => (
                <div key={i} className="text-xs text-red-500 flex gap-1">
                  {e.row && <span className="font-medium">Row {e.row}:</span>}
                  <span>{e.message}</span>
                </div>
              ))}
              {errors.length > 20 && (
                <div className="text-xs text-muted-foreground">...and {errors.length - 20} more errors</div>
              )}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted/80 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((item, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-1.5 truncate max-w-[200px]">{item.name}</td>
                      <td className="px-3 py-1.5 text-xs font-mono">{item.sku ?? '—'}</td>
                      <td className="px-3 py-1.5 text-xs">{item.itemType}</td>
                      <td className="px-3 py-1.5 text-right">${item.defaultPrice.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {item.cost != null ? `$${item.cost.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-xs truncate max-w-[150px]">
                        {[item.department, item.subDepartment, item.category].filter(Boolean).join(' › ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.validRows > preview.length && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50">
                  Showing {preview.length} of {stats.validRows} items
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <ImportProgressStep
          label="Importing items..."
          sublabel="Creating categories and catalog items"
        />
      )}

      {/* Complete Step */}
      {step === 'complete' && importResult && (
        <ImportResultsCard
          status={importResult.errorRows > 0 ? 'partial' : 'completed'}
          totalRows={importResult.totalRows}
          successRows={importResult.successRows}
          errorRows={importResult.errorRows}
          updatedRows={importResult.updatedRows}
          skippedRows={importResult.skippedRows}
          entityLabel="items"
          extraStats={
            importResult.categoriesCreated > 0
              ? [{ label: 'Categories', value: importResult.categoriesCreated }]
              : undefined
          }
          errors={importResult.errors}
          actions={
            <button
              onClick={() => {
                handleClose();
                onSuccess();
              }}
              className="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              View Items
            </button>
          }
        />
      )}
    </ImportWizardShell>
  );
}
