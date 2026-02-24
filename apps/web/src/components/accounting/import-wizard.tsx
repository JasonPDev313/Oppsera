'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, X, AlertTriangle, CheckCircle, FileText, Loader2,
  ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff,
  Zap, Shield, Info, BarChart3, GitBranch, Settings2,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

// ── Types (aligned with backend AnalysisResult) ─────────────────────

interface ColumnMapping {
  sourceColumn: string;
  sourceIndex: number;
  targetField: string;
  confidence: number;
  reason: string;
  sampleValues: string[];
}

interface PreviewIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  resolutions?: Array<{ action: string; label: string; description: string }>;
  rowNumber?: number;
  accountNumber?: string;
}

interface ValidationSummary {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: PreviewIssue[];
  existingAccountNumbers: string[];
  typeDistribution: Record<string, number>;
}

interface AccountPreview {
  rowNumber: number;
  rawValues: Record<string, string>;
  accountNumber: string;
  name: string;
  accountType: string;
  typeConfidence: number;
  typeReason: string;
  normalBalance: string;
  parentAccountNumber: string | null;
  classificationName: string | null;
  description: string | null;
  isActive: boolean;
  isPosting: boolean;
  issues: PreviewIssue[];
}

interface HierarchyResult {
  strategy: string;
  confidence: number;
  reason: string;
  codeSeparator?: string;
  prefixLength?: number;
  parentMap: Record<string, string>;
}

interface AnalysisResult {
  fileInfo: { fileName: string; format: string; totalRows: number; headers: string[] };
  columnMappings: ColumnMapping[];
  hierarchy: HierarchyResult;
  accounts: AccountPreview[];
  validation: ValidationSummary;
  overallConfidence: number;
}

interface ImportResult {
  importLogId: string;
  totalRows: number;
  accountsCreated: number;
  accountsSkipped: number;
  headersCreated: number;
  errorsCount: number;
  errors: Array<{ row: number; accountNumber?: string; message: string }>;
  warnings: string[];
}

// ── Constants ────────────────────────────────────────────────────────

const TARGET_FIELD_LABELS: Record<string, string> = {
  accountNumber: 'Account Number',
  name: 'Account Name',
  accountType: 'Account Type',
  detailType: 'Detail Type',
  parentAccountNumber: 'Parent Account',
  classificationName: 'Classification',
  description: 'Description',
  isActive: 'Active Status',
  isSubAccount: 'Is Sub-Account',
  ignore: 'Ignore',
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  liability: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  revenue: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const WIZARD_STEPS = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'analysis', label: 'Analysis', icon: Zap },
  { key: 'mapping', label: 'Mapping', icon: Settings2 },
  { key: 'types', label: 'Types', icon: BarChart3 },
  { key: 'hierarchy', label: 'Hierarchy', icon: GitBranch },
  { key: 'validation', label: 'Validation', icon: Shield },
  { key: 'import', label: 'Import', icon: CheckCircle },
] as const;

type WizardStep = (typeof WIZARD_STEPS)[number]['key'];

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

// ── Props ────────────────────────────────────────────────────────────

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ────────────────────────────────────────────────────────

export function ImportWizard({ open, onClose, onSuccess }: ImportWizardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [isLoading, setIsLoading] = useState(false);

  // File state
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [stateName, setStateName] = useState('');

  // Analysis state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // User overrides
  const [customMappings, setCustomMappings] = useState<Record<number, string>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, Record<string, string>>>({});
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());

  // Import results
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── File handling ──────────────────────────────────────────────

  const handleFileRead = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Maximum file size is 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      setFileName(file.name);
    };
    reader.readAsText(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  // ── Analysis ───────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiFetch<{ data: AnalysisResult }>('/api/v1/accounting/coa-import/analyze', {
        method: 'POST',
        body: JSON.stringify({ content: fileContent, fileName, stateName: stateName || undefined }),
      });
      setAnalysis(result.data);
      setStep('analysis');
    } catch (err) {
      toast.error(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [fileContent, fileName, stateName, toast]);

  const runReanalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      // Build custom mapping object from user overrides
      const mappingOverrides: Record<string, string> = {};
      for (const [idx, field] of Object.entries(customMappings)) {
        const col = analysis?.columnMappings[Number(idx)];
        if (col) mappingOverrides[col.sourceColumn] = field;
      }

      const result = await apiFetch<{ data: AnalysisResult }>('/api/v1/accounting/coa-import/reanalyze', {
        method: 'POST',
        body: JSON.stringify({
          content: fileContent,
          fileName,
          stateName: stateName || undefined,
          customMappings: Object.keys(mappingOverrides).length > 0 ? mappingOverrides : undefined,
          rowOverrides: Object.keys(rowOverrides).length > 0 ? rowOverrides : undefined,
          skipRows: skipRows.size > 0 ? Array.from(skipRows) : undefined,
        }),
      });
      setAnalysis(result.data);
    } catch (err) {
      toast.error(`Re-analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [fileContent, fileName, stateName, customMappings, rowOverrides, skipRows, analysis, toast]);

  // ── Import ─────────────────────────────────────────────────────

  const runImport = useCallback(async () => {
    if (!analysis) return;
    setIsLoading(true);
    try {
      // Filter out skipped rows
      const existingSet = new Set(analysis.validation.existingAccountNumbers);
      const accounts = analysis.accounts.filter((a) => !skipRows.has(a.rowNumber) && !existingSet.has(a.accountNumber));

      const result = await apiFetch<{ data: ImportResult }>('/api/v1/accounting/coa-import/execute', {
        method: 'POST',
        body: JSON.stringify({
          accounts,
          options: { fileName, stateName: stateName || undefined, mergeMode: 'fresh' },
        }),
      });
      setImportResult(result.data);
      setStep('import');
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [analysis, skipRows, fileName, stateName, toast]);

  // ── Navigation ─────────────────────────────────────────────────

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);

  const canGoBack = stepIndex > 0 && step !== 'import';
  const canGoNext = (() => {
    if (step === 'upload') return !!fileContent;
    if (step === 'analysis') return !!analysis;
    if (step === 'mapping') return !!analysis;
    if (step === 'types') return !!analysis;
    if (step === 'hierarchy') return !!analysis;
    if (step === 'validation') return !!analysis && (analysis.validation.errorCount === 0 || skipRows.size > 0);
    return false;
  })();

  const goBack = useCallback(() => {
    const idx = WIZARD_STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(WIZARD_STEPS[idx - 1]!.key);
  }, [step]);

  const goNext = useCallback(async () => {
    if (step === 'upload') {
      await runAnalysis();
      return;
    }
    if (step === 'validation') {
      await runImport();
      return;
    }
    const idx = WIZARD_STEPS.findIndex((s) => s.key === step);
    if (idx < WIZARD_STEPS.length - 1) {
      // If going from mapping to types, re-analyze with overrides
      if (step === 'mapping' && Object.keys(customMappings).length > 0) {
        await runReanalysis();
      }
      setStep(WIZARD_STEPS[idx + 1]!.key);
    }
  }, [step, runAnalysis, runImport, runReanalysis, customMappings]);

  const handleClose = useCallback(() => {
    setStep('upload');
    setFileContent('');
    setFileName('');
    setStateName('');
    setAnalysis(null);
    setCustomMappings({});
    setRowOverrides({});
    setSkipRows(new Set());
    setImportResult(null);
    onClose();
  }, [onClose]);

  const handleComplete = useCallback(() => {
    onSuccess();
    handleClose();
  }, [onSuccess, handleClose]);

  // ── Computed ───────────────────────────────────────────────────

  const confidenceColor = useMemo(() => {
    if (!analysis) return 'text-gray-500';
    if (analysis.overallConfidence >= 90) return 'text-green-600 dark:text-green-400';
    if (analysis.overallConfidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }, [analysis]);

  const importableCount = useMemo(() => {
    if (!analysis) return 0;
    const existingSet = new Set(analysis.validation.existingAccountNumbers);
    return analysis.accounts.filter((a) => !skipRows.has(a.rowNumber) && !existingSet.has(a.accountNumber)).length;
  }, [analysis, skipRows]);

  // ── Render ─────────────────────────────────────────────────────

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-surface rounded-lg shadow-xl w-[95vw] max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Import Chart of Accounts
            </h2>
            {analysis && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {fileName} — {analysis.fileInfo.totalRows} accounts
                <span className={`ml-2 font-medium ${confidenceColor}`}>
                  {analysis.overallConfidence}% confidence
                </span>
              </p>
            )}
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-200/50 dark:hover:bg-gray-700/50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 border-b border-gray-200 dark:border-gray-700 gap-1 overflow-x-auto">
          {WIZARD_STEPS.map((s, i) => {
            const isActive = s.key === step;
            const isPast = i < stepIndex;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex items-center gap-1 shrink-0">
                {i > 0 && <div className={`w-6 h-px ${isPast ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />}
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : isPast
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {step === 'upload' && (
            <UploadStep
              fileContent={fileContent}
              fileName={fileName}
              stateName={stateName}
              onDrop={handleDrop}
              onFileInput={handleFileInput}
              onStateName={setStateName}
              fileInputRef={fileInputRef}
            />
          )}
          {step === 'analysis' && analysis && (
            <AnalysisStep analysis={analysis} />
          )}
          {step === 'mapping' && analysis && (
            <MappingStep
              analysis={analysis}
              customMappings={customMappings}
              onCustomMapping={(idx, field) => setCustomMappings((prev) => ({ ...prev, [idx]: field }))}
            />
          )}
          {step === 'types' && analysis && (
            <TypesStep
              analysis={analysis}
              rowOverrides={rowOverrides}
              onRowOverride={(row, field, value) =>
                setRowOverrides((prev) => ({
                  ...prev,
                  [row]: { ...prev[row], [field]: value },
                }))
              }
            />
          )}
          {step === 'hierarchy' && analysis && (
            <HierarchyStep analysis={analysis} />
          )}
          {step === 'validation' && analysis && (
            <ValidationStep
              analysis={analysis}
              skipRows={skipRows}
              onToggleSkip={(row) =>
                setSkipRows((prev) => {
                  const next = new Set(prev);
                  if (next.has(row)) next.delete(row);
                  else next.add(row);
                  return next;
                })
              }
            />
          )}
          {step === 'import' && (
            <ImportResultStep
              importResult={importResult}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {step === 'validation' && analysis && (
              <span>{importableCount} accounts ready to import</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {canGoBack && (
              <button
                onClick={goBack}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step === 'import' ? (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Done
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext || isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : step === 'validation' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Import {importableCount} Accounts
                  </>
                ) : step === 'upload' ? (
                  <>
                    <Zap className="w-4 h-4" />
                    Analyze
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Step: Upload ─────────────────────────────────────────────────────

function UploadStep({
  fileContent,
  fileName,
  stateName,
  onDrop,
  onFileInput,
  onStateName,
  fileInputRef,
}: {
  fileContent: string;
  fileName: string;
  stateName: string;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStateName: (s: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          fileContent
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
      >
        {fileContent ? (
          <>
            <FileText className="w-10 h-10 text-indigo-500 mb-3" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{fileName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {(fileContent.length / 1024).toFixed(1)} KB — Click or drop to replace
            </p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Drop your CSV or TSV file here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              or click to browse — max 10MB, 25,000 rows
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.tab,.txt"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      {/* State selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          State Name (optional)
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          If your COA uses state-specific account names (e.g., &quot;Michigan Sales Tax&quot;),
          select the state to auto-standardize them with [STATE_NAME] placeholders.
        </p>
        <select
          value={stateName}
          onChange={(e) => onStateName(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-surface text-gray-900 dark:text-gray-100"
        >
          <option value="">No state substitution</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Format info */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">Supported formats</p>
          <p className="text-xs">
            CSV, TSV. The system will auto-detect column mappings, account types, and hierarchy structure.
            Minimum: an account number and name column. Account types will be inferred if not provided.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step: Analysis Overview ──────────────────────────────────────────

function AnalysisStep({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Confidence overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Overall Confidence"
          value={`${analysis.overallConfidence}%`}
          color={analysis.overallConfidence >= 90 ? 'green' : analysis.overallConfidence >= 60 ? 'yellow' : 'red'}
        />
        <MetricCard
          label="Total Accounts"
          value={analysis.fileInfo.totalRows.toString()}
          color="blue"
        />
        <MetricCard
          label="Columns Mapped"
          value={`${analysis.columnMappings.filter((m) => m.targetField !== 'ignore').length}/${analysis.columnMappings.length}`}
          color="indigo"
        />
        <MetricCard
          label="Hierarchy"
          value={analysis.hierarchy.strategy === 'none' ? 'Flat' : analysis.hierarchy.strategy}
          color="purple"
        />
      </div>

      {/* Column detection summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Detected Column Mappings
        </h3>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">File Column</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Mapped To</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Confidence</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {analysis.columnMappings.map((m, i) => (
                <tr key={i} className={m.targetField === 'ignore' ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-mono text-xs">{m.sourceColumn}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      m.targetField === 'ignore'
                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    }`}>
                      {TARGET_FIELD_LABELS[m.targetField] ?? m.targetField}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBar value={m.confidence} />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                    {m.sampleValues.slice(0, 3).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account type distribution */}
      {analysis.validation.typeDistribution && Object.keys(analysis.validation.typeDistribution).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Account Type Distribution
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analysis.validation.typeDistribution).map(([type, count]) => (
              <span
                key={type}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  ACCOUNT_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {type}
                <span className="text-xs opacity-70">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Validation preview */}
      {(analysis.validation.errorCount > 0 || analysis.validation.warningCount > 0) && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/40">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              {analysis.validation.errorCount} error{analysis.validation.errorCount !== 1 ? 's' : ''},{' '}
              {analysis.validation.warningCount} warning{analysis.validation.warningCount !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Review the Validation step to resolve issues before importing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step: Mapping Review ─────────────────────────────────────────────

function MappingStep({
  analysis,
  customMappings,
  onCustomMapping,
}: {
  analysis: AnalysisResult;
  customMappings: Record<number, string>;
  onCustomMapping: (idx: number, field: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Review and adjust column mappings. The system detected these mappings automatically — override any that are incorrect.
      </p>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-1/4">File Column</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-1/4">Maps To</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-1/6">Confidence</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {analysis.columnMappings.map((m, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{m.sourceColumn}</span>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {m.sampleValues.slice(0, 2).join(', ')}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={customMappings[i] ?? m.targetField}
                    onChange={(e) => onCustomMapping(i, e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-surface text-gray-900 dark:text-gray-100"
                  >
                    {Object.entries(TARGET_FIELD_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <ConfidenceBar value={m.confidence} />
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {m.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step: Type Inference Preview ─────────────────────────────────────

function TypesStep({
  analysis,
  rowOverrides,
  onRowOverride,
}: {
  analysis: AnalysisResult;
  rowOverrides: Record<number, Record<string, string>>;
  onRowOverride: (row: number, field: string, value: string) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filteredAccounts = useMemo(() => {
    if (filter === 'all') return analysis.accounts;
    if (filter === 'low') return analysis.accounts.filter((a) => a.typeConfidence < 60);
    return analysis.accounts.filter((a) => a.accountType === filter);
  }, [analysis.accounts, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Review inferred account types. Override any that seem incorrect.
        </p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-surface text-gray-900 dark:text-gray-100"
        >
          <option value="all">All accounts</option>
          <option value="low">Low confidence only</option>
          <option value="asset">Assets</option>
          <option value="liability">Liabilities</option>
          <option value="equity">Equity</option>
          <option value="revenue">Revenue</option>
          <option value="expense">Expenses</option>
        </select>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-28">Account #</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Name</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-32">Type</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 w-24">Conf.</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredAccounts.slice(0, 200).map((a) => (
              <TypeRow
                key={a.rowNumber}
                account={a}
                override={rowOverrides[a.rowNumber]}
                expanded={expandedRow === a.rowNumber}
                onToggle={() => setExpandedRow(expandedRow === a.rowNumber ? null : a.rowNumber)}
                onOverride={(field, value) => onRowOverride(a.rowNumber, field, value)}
              />
            ))}
          </tbody>
        </table>
        {filteredAccounts.length > 200 && (
          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center border-t border-gray-200 dark:border-gray-700">
            Showing 200 of {filteredAccounts.length} accounts
          </div>
        )}
      </div>
    </div>
  );
}

function TypeRow({
  account,
  override,
  expanded,
  onToggle,
  onOverride,
}: {
  account: AccountPreview;
  override?: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
  onOverride: (field: string, value: string) => void;
}) {
  const effectiveType = override?.accountType ?? account.accountType;
  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
          account.typeConfidence < 60 ? 'bg-yellow-50/50 dark:bg-yellow-900/5' : ''
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-mono text-xs">{account.accountNumber}</td>
        <td className="px-3 py-2 text-xs">{account.name}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            ACCOUNT_TYPE_COLORS[effectiveType] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {effectiveType}
          </span>
          {account.issues.some((i) => i.code === 'EXISTING_ACCOUNT') && (
            <span className="ml-1 text-xs text-gray-400">(existing)</span>
          )}
        </td>
        <td className="px-3 py-2">
          <ConfidenceBar value={account.typeConfidence} small />
        </td>
        <td className="px-3 py-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-3 py-3 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="space-y-3">
              {/* Type override */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 w-24">Override type:</label>
                <select
                  value={override?.accountType ?? ''}
                  onChange={(e) => onOverride('accountType', e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-surface text-gray-900 dark:text-gray-100"
                >
                  <option value="">Use inferred ({account.accountType})</option>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              {/* Inference reason */}
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Inference reason:</p>
                <div className="flex flex-wrap gap-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {account.typeReason}
                  </span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Step: Hierarchy ──────────────────────────────────────────────────

function HierarchyStep({ analysis }: { analysis: AnalysisResult }) {
  const parentMapEntries = Object.entries(analysis.hierarchy.parentMap ?? {});
  const hasParents = parentMapEntries.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Strategy"
          value={analysis.hierarchy.strategy === 'none' ? 'Flat (no hierarchy)' : analysis.hierarchy.strategy.replace('_', ' ')}
          color="purple"
        />
        <MetricCard
          label="Confidence"
          value={`${analysis.hierarchy.confidence}%`}
          color={analysis.hierarchy.confidence >= 80 ? 'green' : analysis.hierarchy.confidence >= 50 ? 'yellow' : 'red'}
        />
        <MetricCard
          label="Relationships"
          value={parentMapEntries.length.toString()}
          color="blue"
        />
      </div>

      {analysis.hierarchy.strategy !== 'none' && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div className="text-sm text-green-700 dark:text-green-300">
            <p className="font-medium">Hierarchy detected: {analysis.hierarchy.strategy.replace('_', ' ')}</p>
            <p className="text-xs mt-1">
              {analysis.hierarchy.strategy === 'parent_column'
                ? 'Using explicit parent account numbers from the file.'
                : analysis.hierarchy.strategy === 'code_prefix'
                ? 'Parent-child relationships inferred from account number prefixes.'
                : 'Parent-child relationships inferred from indentation patterns.'}
            </p>
          </div>
        </div>
      )}

      {hasParents && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Parent-Child Relationships ({parentMapEntries.length})
          </h3>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Child Account</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Parent Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {parentMapEntries.slice(0, 100).map(([child, parent]) => (
                  <tr key={child}>
                    <td className="px-3 py-1.5 font-mono text-xs">{child}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{parent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parentMapEntries.length > 100 && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center border-t border-gray-200 dark:border-gray-700">
                Showing 100 of {parentMapEntries.length} relationships
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step: Validation ─────────────────────────────────────────────────

function ValidationStep({
  analysis,
  skipRows,
  onToggleSkip,
}: {
  analysis: AnalysisResult;
  skipRows: Set<number>;
  onToggleSkip: (row: number) => void;
}) {
  const errors = analysis.validation.issues.filter((i) => i.severity === 'error');
  const warnings = analysis.validation.issues.filter((i) => i.severity === 'warning');
  const infos = analysis.validation.issues.filter((i) => i.severity === 'info');

  const [showWarnings, setShowWarnings] = useState(errors.length === 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Errors"
          value={errors.length.toString()}
          color={errors.length > 0 ? 'red' : 'green'}
        />
        <MetricCard
          label="Warnings"
          value={warnings.length.toString()}
          color={warnings.length > 0 ? 'yellow' : 'green'}
        />
        <MetricCard
          label="Duplicates"
          value={(analysis.validation.existingAccountNumbers?.length ?? 0).toString()}
          color="blue"
        />
        <MetricCard
          label="Issues"
          value={analysis.validation.issues.filter((i) => i.code === 'PARENT_NOT_FOUND').length.toString()}
          color="purple"
        />
      </div>

      {errors.length === 0 && warnings.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div className="text-sm text-green-700 dark:text-green-300">
            <p className="font-medium">All accounts validated successfully</p>
            <p className="text-xs mt-1">No issues found. Ready to import.</p>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <IssueList
          title="Errors"
          issues={errors}
          skipRows={skipRows}
          onToggleSkip={onToggleSkip}
          color="red"
        />
      )}

      {/* Warnings (collapsible) */}
      {warnings.length > 0 && (
        <div>
          <button
            onClick={() => setShowWarnings(!showWarnings)}
            className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2"
          >
            {showWarnings ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <AlertTriangle className="w-4 h-4" />
            {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
          </button>
          {showWarnings && (
            <IssueList
              title=""
              issues={warnings}
              skipRows={skipRows}
              onToggleSkip={onToggleSkip}
              color="yellow"
            />
          )}
        </div>
      )}

      {/* Info items */}
      {infos.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {infos.length} informational note{infos.length !== 1 ? 's' : ''} (not shown)
        </div>
      )}
    </div>
  );
}

function IssueList({
  title,
  issues,
  skipRows,
  onToggleSkip,
  color,
}: {
  title: string;
  issues: PreviewIssue[];
  skipRows: Set<number>;
  onToggleSkip: (row: number) => void;
  color: 'red' | 'yellow';
}) {
  const borderColor = color === 'red' ? 'border-red-200 dark:border-red-800/40' : 'border-yellow-200 dark:border-yellow-800/40';

  return (
    <div className={`border ${borderColor} rounded-lg overflow-hidden`}>
      {title && (
        <div className={`px-3 py-2 text-xs font-semibold ${
          color === 'red'
            ? 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-300'
            : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/10 dark:text-yellow-300'
        }`}>
          {title}
        </div>
      )}
      <div className="max-h-[30vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
        {issues.map((issue, i) => {
          const hasRow = issue.rowNumber != null;
          const isSkipped = hasRow && skipRows.has(issue.rowNumber!);
          return (
            <div
              key={i}
              className={`flex items-start gap-3 px-3 py-2 text-xs ${isSkipped ? 'opacity-40 line-through' : ''}`}
            >
              <span className="font-mono text-gray-400 shrink-0 w-10">
                {hasRow ? `Row ${issue.rowNumber}` : '—'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 dark:text-gray-300">{issue.message}</p>
                {(issue.resolutions?.length ?? 0) > 0 && !isSkipped && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {issue.resolutions!.map((r, j) => (
                      <span key={j} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {r.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {hasRow && (
                <button
                  onClick={() => onToggleSkip(issue.rowNumber!)}
                  className="shrink-0 p-1 rounded hover:bg-gray-200/50 dark:hover:bg-gray-700/50"
                  title={isSkipped ? 'Include this row' : 'Skip this row'}
                >
                  {isSkipped ? <Eye className="w-3.5 h-3.5 text-gray-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step: Import Results ─────────────────────────────────────────────

function ImportResultStep({
  importResult,
  isLoading,
}: {
  importResult: ImportResult | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Importing accounts...</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This may take a moment for large files.</p>
      </div>
    );
  }

  if (!importResult) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 p-6 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40">
        <CheckCircle className="w-8 h-8 text-green-500 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
            Import Complete
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            Successfully imported your Chart of Accounts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Created" value={importResult.accountsCreated.toString()} color="green" />
        <MetricCard label="Skipped" value={importResult.accountsSkipped.toString()} color="blue" />
        <MetricCard label="Headers" value={importResult.headersCreated.toString()} color="indigo" />
        <MetricCard label="Errors" value={importResult.errorsCount.toString()} color={importResult.errorsCount > 0 ? 'red' : 'green'} />
      </div>

      {importResult.errors.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Import Errors</h4>
          <div className="border border-red-200 dark:border-red-800/40 rounded-lg max-h-[30vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {importResult.errors.map((err, i) => (
              <div key={i} className="px-3 py-2 text-xs flex gap-3">
                <span className="font-mono text-gray-400 shrink-0">{err.accountNumber}</span>
                <span className="text-red-600 dark:text-red-400">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI Components ─────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'red' | 'yellow' | 'blue' | 'indigo' | 'purple';
}) {
  const colorMap = {
    green: 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800/40',
    red: 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800/40',
    yellow: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800/40',
    blue: 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800/40',
    indigo: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/10 dark:border-indigo-800/40',
    purple: 'bg-purple-50 border-purple-200 dark:bg-purple-900/10 dark:border-purple-800/40',
  };

  const valueColorMap = {
    green: 'text-green-700 dark:text-green-300',
    red: 'text-red-700 dark:text-red-300',
    yellow: 'text-yellow-700 dark:text-yellow-300',
    blue: 'text-blue-700 dark:text-blue-300',
    indigo: 'text-indigo-700 dark:text-indigo-300',
    purple: 'text-purple-700 dark:text-purple-300',
  };

  return (
    <div className={`px-4 py-3 rounded-lg border ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${valueColorMap[color]}`}>{value}</p>
    </div>
  );
}

function ConfidenceBar({ value, small }: { value: number; small?: boolean }) {
  const color =
    value >= 90 ? 'bg-green-500' :
    value >= 60 ? 'bg-yellow-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full bg-gray-200 dark:bg-gray-700 ${small ? 'h-1' : 'h-1.5'}`}>
        <div
          className={`${color} rounded-full ${small ? 'h-1' : 'h-1.5'}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={`text-gray-500 dark:text-gray-400 font-mono ${small ? 'text-[10px]' : 'text-xs'}`}>
        {value}%
      </span>
    </div>
  );
}
