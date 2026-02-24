'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react';
import { useImportWizard } from '@/hooks/use-import-wizard';
import type { WizardStep } from '@/hooks/use-import-wizard';
import { useImportJob, useImportErrors, useReconciliation } from '@/hooks/use-import-jobs';
import type { ColumnMapping, TenderMapping, TaxMapping, ItemMapping } from '@/hooks/use-import-jobs';
import { useImportProgress } from '@/hooks/use-import-progress';
import { FileUploadZone } from '@/components/import/FileUploadZone';
import { ColumnMappingTable } from '@/components/import/ColumnMappingTable';
import { TenderMappingTable } from '@/components/import/TenderMappingTable';
import { TaxMappingTable } from '@/components/import/TaxMappingTable';
import { ItemMappingTable } from '@/components/import/ItemMappingTable';
import { ValidationSummary } from '@/components/import/ValidationSummary';
import { ReconciliationComparison } from '@/components/import/ReconciliationComparison';
import { ImportProgressBar } from '@/components/import/ImportProgressBar';
import { ImportResultsSummary } from '@/components/import/ImportResultsSummary';

// ── Step Labels ────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload & Configure',
  columns: 'Column Mapping',
  tenders: 'Tender Mapping',
  taxes: 'Tax Mapping',
  items: 'Item Mapping',
  validation: 'Validation',
  reconciliation: 'Reconciliation',
  importing: 'Importing',
  results: 'Results',
};

// ── Main Component ─────────────────────────────────────────────────

export default function ImportWizardContent() {
  const router = useRouter();
  const params = useParams();
  const existingJobId = params?.id as string | undefined;

  const wizard = useImportWizard();
  const { job, fetchJob } = useImportJob(wizard.jobId ?? existingJobId ?? null);
  const { items: errors, fetchErrors } = useImportErrors(wizard.jobId ?? existingJobId ?? null);
  const { data: reconciliation, fetchReconciliation } = useReconciliation(
    wizard.jobId ?? existingJobId ?? null,
  );

  // Track CSV content for validation step
  const csvContentRef = useRef<string>('');

  // ── Load existing job on mount ──────────────────────────────────

  useEffect(() => {
    if (existingJobId && !wizard.jobId) {
      fetchJob();
    }
  }, [existingJobId, wizard.jobId, fetchJob]);

  // Resume wizard at correct step based on loaded job status
  useEffect(() => {
    if (job && existingJobId && !wizard.jobId) {
      const statusStepMap: Record<string, WizardStep> = {
        analyzing: 'columns',
        mapping: 'columns',
        validating: 'validation',
        ready: 'reconciliation',
        importing: 'importing',
        completed: 'results',
        failed: 'results',
        cancelled: 'results',
      };
      const resumeStep = statusStepMap[job.status] ?? 'columns';
      wizard.goToStep(resumeStep);
    }
  }, [job, existingJobId, wizard.jobId]);

  // ── Upload Step Handlers ────────────────────────────────────────

  const [uploadName, setUploadName] = useState('');
  const [uploadMode, setUploadMode] = useState('operational');
  const [uploadSourceSystem, setUploadSourceSystem] = useState('');

  const handleFileSelected = useCallback(
    (file: { name: string; content: string; sizeBytes: number }) => {
      csvContentRef.current = file.content;
      if (!uploadName) {
        setUploadName(file.name.replace(/\.(csv|tsv|txt)$/i, ''));
      }
    },
    [uploadName],
  );

  const handleUploadSubmit = useCallback(async () => {
    if (!csvContentRef.current || !uploadName) return;
    await wizard.createJob({
      name: uploadName,
      csvContent: csvContentRef.current,
      fileName: uploadName,
      mode: uploadMode,
      sourceSystem: uploadSourceSystem || undefined,
    });
  }, [uploadName, uploadMode, uploadSourceSystem, wizard]);

  // ── Column Mapping Handlers ─────────────────────────────────────

  const [localColumnMappings, setLocalColumnMappings] = useState<ColumnMapping[]>([]);
  const [localGroupingKey, setLocalGroupingKey] = useState<string | null>(null);

  useEffect(() => {
    if (job?.columnMappings) {
      setLocalColumnMappings(job.columnMappings);
      setLocalGroupingKey(job.groupingKey);
    }
  }, [job?.columnMappings, job?.groupingKey]);

  const handleColumnChange = useCallback(
    (mappingId: string, changes: { targetEntity: string; targetField: string; isConfirmed: boolean }) => {
      setLocalColumnMappings((prev) =>
        prev.map((m) => (m.id === mappingId ? { ...m, ...changes } : m)),
      );
    },
    [],
  );

  const handleSaveColumns = useCallback(async () => {
    await wizard.saveColumnMappings(
      localColumnMappings.map((m) => ({
        columnMappingId: m.id,
        targetEntity: m.targetEntity,
        targetField: m.targetField,
        isConfirmed: m.isConfirmed,
        transformRule: m.transformRule ?? undefined,
      })),
      localGroupingKey ?? undefined,
    );
  }, [wizard, localColumnMappings, localGroupingKey]);

  // ── Tender Mapping Handlers ─────────────────────────────────────

  const [localTenderMappings, setLocalTenderMappings] = useState<TenderMapping[]>([]);

  useEffect(() => {
    if (job?.tenderMappings) setLocalTenderMappings(job.tenderMappings);
  }, [job?.tenderMappings]);

  const handleTenderChange = useCallback(
    (mappingId: string, tenderType: string, isConfirmed: boolean) => {
      setLocalTenderMappings((prev) =>
        prev.map((m) =>
          m.id === mappingId ? { ...m, oppseraTenderType: tenderType, isConfirmed } : m,
        ),
      );
    },
    [],
  );

  const handleSaveTenders = useCallback(async () => {
    await wizard.saveTenderMappings(
      localTenderMappings.map((m) => ({
        tenderMappingId: m.id,
        oppseraTenderType: m.oppseraTenderType,
        isConfirmed: m.isConfirmed,
      })),
    );
  }, [wizard, localTenderMappings]);

  // ── Tax Mapping Handlers ────────────────────────────────────────

  const [localTaxMappings, setLocalTaxMappings] = useState<TaxMapping[]>([]);

  useEffect(() => {
    if (job?.taxMappings) setLocalTaxMappings(job.taxMappings);
  }, [job?.taxMappings]);

  const handleTaxChange = useCallback(
    (mappingId: string, updates: { oppseraTaxGroupId?: string; taxMode?: string; isConfirmed: boolean }) => {
      setLocalTaxMappings((prev) =>
        prev.map((m) => (m.id === mappingId ? { ...m, ...updates } : m)),
      );
    },
    [],
  );

  const handleSaveTaxes = useCallback(async () => {
    await wizard.saveTaxMappings(
      localTaxMappings.map((m) => ({
        taxMappingId: m.id,
        oppseraTaxGroupId: m.oppseraTaxGroupId ?? undefined,
        taxMode: m.taxMode,
        isConfirmed: m.isConfirmed,
      })),
    );
  }, [wizard, localTaxMappings]);

  // ── Item Mapping Handlers ───────────────────────────────────────

  const [localItemMappings, setLocalItemMappings] = useState<ItemMapping[]>([]);

  useEffect(() => {
    if (job?.itemMappings) setLocalItemMappings(job.itemMappings);
  }, [job?.itemMappings]);

  const handleItemChange = useCallback(
    (mappingId: string, updates: { strategy?: string; oppseraCatalogItemId?: string; isConfirmed: boolean }) => {
      setLocalItemMappings((prev) =>
        prev.map((m) => (m.id === mappingId ? { ...m, ...updates } : m)),
      );
    },
    [],
  );

  const handleSaveItems = useCallback(async () => {
    await wizard.saveItemMappings(
      localItemMappings.map((m) => ({
        itemMappingId: m.id,
        strategy: m.strategy,
        oppseraCatalogItemId: m.oppseraCatalogItemId ?? undefined,
        isConfirmed: m.isConfirmed,
      })),
    );
  }, [wizard, localItemMappings]);

  // ── Validation Step ─────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!csvContentRef.current) {
      wizard.setError('CSV content not available. Please re-upload the file.');
      return;
    }
    await wizard.runValidation(csvContentRef.current);
    await fetchErrors();
    await fetchReconciliation();
  }, [wizard, fetchErrors, fetchReconciliation]);

  // ── Reconciliation Step ─────────────────────────────────────────

  useEffect(() => {
    if (wizard.step === 'reconciliation') {
      fetchReconciliation();
      fetchErrors();
    }
  }, [wizard.step, fetchReconciliation, fetchErrors]);

  // ── Import Progress ─────────────────────────────────────────────

  const { progress } = useImportProgress(
    wizard.step === 'importing' ? (wizard.jobId ?? existingJobId ?? null) : null,
    {
      onComplete: () => {
        wizard.goToStep('results');
        fetchJob();
      },
    },
  );

  // ── Error counts ────────────────────────────────────────────────

  const errorCount = {
    error: errors.filter((e) => e.severity === 'error').length,
    warning: errors.filter((e) => e.severity === 'warning').length,
    info: errors.filter((e) => e.severity === 'info').length,
  };

  // ── Render ──────────────────────────────────────────────────────

  const activeJob = job ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/settings/import')}
          className="rounded p-1 hover:bg-gray-200/50"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">
            {activeJob ? activeJob.name : 'New Import'}
          </h1>
          <p className="text-sm text-gray-500">{STEP_LABELS[wizard.step]}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={wizard.step} />

      {/* Error Banner */}
      {wizard.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {wizard.error}
        </div>
      )}

      {/* Step Content */}
      <div className="rounded-lg border border-gray-200 bg-surface p-6 dark:border-gray-700">
        {wizard.step === 'upload' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Import Name</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g., Q4 2024 POS History"
                className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Import Mode</label>
                <select
                  value={uploadMode}
                  onChange={(e) => setUploadMode(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm dark:border-gray-600"
                >
                  <option value="operational">Operational Only (no GL)</option>
                  <option value="financial">Financial (with GL posting)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Source System</label>
                <input
                  type="text"
                  value={uploadSourceSystem}
                  onChange={(e) => setUploadSourceSystem(e.target.value)}
                  placeholder="e.g., Square, Toast, Lightspeed"
                  className="w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm dark:border-gray-600"
                />
              </div>
            </div>
            <FileUploadZone onFileSelected={handleFileSelected} />
          </div>
        )}

        {wizard.step === 'columns' && (
          <ColumnMappingTable
            mappings={localColumnMappings}
            onChange={handleColumnChange}
            groupingKey={localGroupingKey}
            onGroupingKeyChange={setLocalGroupingKey}
          />
        )}

        {wizard.step === 'tenders' && (
          <TenderMappingTable mappings={localTenderMappings} onChange={handleTenderChange} />
        )}

        {wizard.step === 'taxes' && (
          <TaxMappingTable mappings={localTaxMappings} taxGroups={[]} onChange={handleTaxChange} />
        )}

        {wizard.step === 'items' && (
          <ItemMappingTable mappings={localItemMappings} onChange={handleItemChange} />
        )}

        {wizard.step === 'validation' && activeJob && (
          <ValidationSummary job={activeJob} errors={errors} errorCount={errorCount} />
        )}

        {wizard.step === 'reconciliation' && reconciliation && (
          <ReconciliationComparison data={reconciliation} />
        )}

        {wizard.step === 'importing' && (
          <ImportProgressBar progress={progress} onCancel={wizard.cancelImport} />
        )}

        {wizard.step === 'results' && activeJob && (
          <ImportResultsSummary
            job={activeJob}
            onDownloadErrors={() => {
              window.open(
                `/api/v1/import/jobs/${activeJob.id}/errors/export`,
                '_blank',
              );
            }}
            onViewOrders={() => router.push('/orders')}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      {wizard.step !== 'importing' && wizard.step !== 'results' && (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={wizard.goBack}
            disabled={!wizard.canGoBack}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <StepActionButton
            step={wizard.step}
            isSubmitting={wizard.isSubmitting}
            hasUploadContent={!!csvContentRef.current && !!uploadName}
            hasErrors={errorCount.error > 0}
            isBalanced={reconciliation?.isBalanced ?? false}
            onUpload={handleUploadSubmit}
            onSaveColumns={handleSaveColumns}
            onSaveTenders={handleSaveTenders}
            onSaveTaxes={handleSaveTaxes}
            onSaveItems={handleSaveItems}
            onValidate={handleValidate}
            onExecute={wizard.executeImport}
          />
        </div>
      )}
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps: WizardStep[] = ['upload', 'columns', 'tenders', 'taxes', 'items', 'validation', 'reconciliation'];
  const currentIdx = steps.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {steps.map((step, idx) => {
        const isActive = step === currentStep;
        const isPast = idx < currentIdx;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                  : isPast
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : isPast
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700'
              }`}>
                {isPast ? '\u2713' : idx + 1}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`mx-1 h-px w-4 ${isPast ? 'bg-green-300' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step Action Button ─────────────────────────────────────────────

function StepActionButton({
  step,
  isSubmitting,
  hasUploadContent,
  hasErrors,
  isBalanced: _isBalanced,
  onUpload,
  onSaveColumns,
  onSaveTenders,
  onSaveTaxes,
  onSaveItems,
  onValidate,
  onExecute,
}: {
  step: WizardStep;
  isSubmitting: boolean;
  hasUploadContent: boolean;
  hasErrors: boolean;
  isBalanced: boolean;
  onUpload: () => void;
  onSaveColumns: () => void;
  onSaveTenders: () => void;
  onSaveTaxes: () => void;
  onSaveItems: () => void;
  onValidate: () => void;
  onExecute: () => void;
}) {
  const actionMap: Record<string, { label: string; onClick: () => void; disabled?: boolean }> = {
    upload: { label: 'Upload & Analyze', onClick: onUpload, disabled: !hasUploadContent },
    columns: { label: 'Save & Continue', onClick: onSaveColumns },
    tenders: { label: 'Save & Continue', onClick: onSaveTenders },
    taxes: { label: 'Save & Continue', onClick: onSaveTaxes },
    items: { label: 'Save & Continue', onClick: onSaveItems },
    validation: { label: 'Run Validation', onClick: onValidate },
    reconciliation: {
      label: hasErrors ? 'Import (with errors)' : 'Confirm & Import',
      onClick: onExecute,
      disabled: hasErrors,
    },
  };

  const action = actionMap[step];
  if (!action) return null;

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={isSubmitting || action.disabled}
      className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {isSubmitting ? 'Processing...' : action.label}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}
