'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { ImportWizardShell } from '@/components/import/ImportWizardShell';
import { ImportProgressStep } from '@/components/import/ImportProgressStep';
import { ImportResultsCard } from '@/components/import/ImportResultsCard';
import { ReassuranceBanner } from '@/components/import/ReassuranceBanner';

interface CsvImportFlowProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];

interface ValidationPreview {
  accountNumber: string;
  name: string;
  accountType: string;
  parentAccountNumber: string | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{ row?: number; field?: string; message: string; severity: string }>;
  warnings: Array<{ row?: number; field?: string; message: string; severity: string }>;
  accountCount: number;
  stateDetections: Array<{ originalName: string; stateDetected: string }>;
  preview: ValidationPreview[];
}

interface ImportResult {
  importLogId: string;
  totalRows: number;
  successRows: number;
  skipCount: number;
  errorCount: number;
  warnings: string[];
  stateDetections: Array<{ originalName: string; stateDetected: string }>;
  errors: Array<{ row: number; message: string }>;
}

type Step = 'upload' | 'validating' | 'preview' | 'importing' | 'complete';

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Preview' },
  { key: 'complete', label: 'Done' },
];

function resolveStepKey(step: Step): string {
  if (step === 'validating') return 'upload';
  if (step === 'importing') return 'preview';
  return step;
}

export function CsvImportFlow({ open, onClose, onSuccess }: CsvImportFlowProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [stateName, setStateName] = useState<string>('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setCsvContent('');
    setFileName('');
    setStateName('');
    setValidation(null);
    setImportResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File exceeds 5MB limit');
      return;
    }

    const text = await file.text();
    setCsvContent(text);
    setFileName(file.name);

    setStep('validating');
    try {
      const res = await apiFetch<{ data: ValidationResult }>('/api/v1/accounting/import/validate', {
        method: 'POST',
        body: JSON.stringify({ csvContent: text, stateName: stateName || undefined }),
      });
      setValidation(res.data);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation failed');
      setStep('upload');
    }
  }, [stateName, toast]);

  const handleRevalidate = useCallback(async () => {
    if (!csvContent) return;
    setStep('validating');
    try {
      const res = await apiFetch<{ data: ValidationResult }>('/api/v1/accounting/import/validate', {
        method: 'POST',
        body: JSON.stringify({ csvContent, stateName: stateName || undefined }),
      });
      setValidation(res.data);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation failed');
      setStep('upload');
    }
  }, [csvContent, stateName, toast]);

  const handleImport = useCallback(async () => {
    if (!csvContent) return;
    setStep('importing');
    try {
      const res = await apiFetch<{ data: ImportResult }>('/api/v1/accounting/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          csvContent,
          stateName: stateName || undefined,
          fileName: fileName || undefined,
        }),
      });
      setImportResult(res.data);
      setStep('complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  }, [csvContent, stateName, fileName, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFileSelect(file);
    } else {
      toast.error('Please upload a .csv file');
    }
  }, [handleFileSelect, toast]);

  // ── Footer ──

  const footer = (() => {
    if (step === 'validating' || step === 'importing') return undefined;

    return (
      <>
        <button
          type="button"
          onClick={step === 'complete' ? () => { handleClose(); onSuccess(); } : handleClose}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {step === 'complete' ? 'Done' : 'Cancel'}
        </button>
        <div className="flex gap-2">
          {step === 'preview' && !validation?.isValid && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Upload Different File
            </button>
          )}
          {step === 'preview' && validation?.isValid && (
            <button
              type="button"
              onClick={handleImport}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Import {validation.accountCount} Accounts
            </button>
          )}
          {step === 'complete' && (
            <button
              type="button"
              onClick={() => { handleClose(); onSuccess(); }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              View Accounts
            </button>
          )}
        </div>
      </>
    );
  })();

  return (
    <ImportWizardShell
      open={open}
      onClose={handleClose}
      title="Import Chart of Accounts"
      subtitle="Upload a CSV with your chart of accounts"
      steps={STEPS}
      currentStep={resolveStepKey(step)}
      footer={footer}
      preventClose={step === 'importing'}
      onReset={reset}
      maxWidth="max-w-2xl"
    >
      {/* Upload Step */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with your chart of accounts. Required columns:
            <strong> Account Number</strong> and <strong>Name</strong>.
            Optional: Account Type, Parent Account, Classification, Description.
          </p>

          {/* State Selector */}
          <div>
            <label className="block text-sm font-medium text-foreground">State (optional)</label>
            <select
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm bg-surface focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">None — leave state placeholders as-is</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              If your CSV contains state-specific accounts (e.g., &quot;Sales Tax Payable - Michigan&quot;),
              selecting a state will auto-detect and standardize them.
            </p>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-input px-6 py-10 transition-colors hover:border-indigo-400"
          >
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop your CSV here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-indigo-500 hover:text-indigo-500"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">CSV files only, max 5MB, up to 2000 accounts</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>

          <ReassuranceBanner variant="subtle" />
        </div>
      )}

      {/* Validating Step */}
      {step === 'validating' && (
        <ImportProgressStep
          label="Validating CSV..."
          sublabel="Checking account numbers, types, and hierarchy"
        />
      )}

      {/* Preview Step */}
      {step === 'preview' && validation && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{fileName}</span>
            </div>
            <span className="text-sm text-muted-foreground">{validation.accountCount} accounts</span>
          </div>

          {/* Error/Warning Counts */}
          <div className="flex gap-3">
            {validation.errors.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-sm font-medium text-red-500">
                <AlertTriangle className="h-4 w-4" />
                {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
              </div>
            )}
            {validation.isValid && validation.errors.length === 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-500">
                <CheckCircle className="h-4 w-4" />
                Valid — ready to import
              </div>
            )}
          </div>

          {/* State Detection */}
          {validation.stateDetections.length > 0 && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-sm font-medium text-blue-500">State names detected:</p>
              <ul className="mt-1 space-y-0.5">
                {validation.stateDetections.slice(0, 5).map((d, i) => (
                  <li key={i} className="text-xs text-blue-500">
                    &quot;{d.originalName}&quot; → detected {d.stateDetected}
                  </li>
                ))}
                {validation.stateDetections.length > 5 && (
                  <li className="text-xs text-blue-500">
                    ...and {validation.stateDetections.length - 5} more
                  </li>
                )}
              </ul>
              {!stateName && (
                <div className="mt-2">
                  <select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="rounded border border-blue-500/30 bg-surface px-2 py-1 text-xs"
                  >
                    <option value="">Apply state...</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleRevalidate}
                    className="ml-2 text-xs text-blue-500 underline"
                  >
                    Re-validate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Errors */}
          {validation.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="mb-1 text-sm font-medium text-red-500">Errors (must fix before import):</p>
              {validation.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-500">
                  {e.row ? `Row ${e.row}: ` : ''}{e.message}
                </p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <details className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <summary className="cursor-pointer text-sm font-medium text-amber-500">
                Warnings ({validation.warnings.length})
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto">
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-500">
                    {w.row ? `Row ${w.row}: ` : ''}{w.message}
                  </p>
                ))}
              </div>
            </details>
          )}

          {/* Preview Table */}
          {validation.preview.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Number</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Parent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validation.preview.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-xs text-foreground">{row.accountNumber}</td>
                      <td className="px-3 py-1.5 text-xs text-foreground">{row.name}</td>
                      <td className="px-3 py-1.5 text-xs capitalize text-muted-foreground">{row.accountType}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{row.parentAccountNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validation.accountCount > 50 && (
                <p className="border-t border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Showing first 50 of {validation.accountCount} accounts
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <ImportProgressStep
          label="Importing accounts..."
          sublabel="Creating chart of accounts entries"
        />
      )}

      {/* Complete Step */}
      {step === 'complete' && importResult && (
        <ImportResultsCard
          status={importResult.errorCount > 0 ? 'partial' : 'completed'}
          totalRows={importResult.totalRows}
          successRows={importResult.successRows}
          errorRows={importResult.errorCount}
          skippedRows={importResult.skipCount}
          entityLabel="accounts"
          errors={importResult.errors}
        />
      )}
    </ImportWizardShell>
  );
}
