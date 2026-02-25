'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────────

export type ImportStep = 'upload' | 'analyzing' | 'mapping' | 'validating' | 'preview' | 'importing' | 'complete';

export interface ColumnMapping {
  columnIndex: number;
  sourceHeader: string;
  targetField: string | null;
  confidence: number;
  explanation: string;
  alternatives: Array<{
    targetField: string;
    confidence: number;
    source: string;
    explanation: string;
  }>;
  sampleValues: string[];
}

export interface ValidationStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  newDepartments: string[];
  newSubDepartments: string[];
  newCategories: string[];
  duplicateSkus: string[];
  duplicateBarcodes: string[];
}

export interface ValidationMessage {
  row?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

interface PreviewItem {
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  defaultPrice: number;
  cost: number | null;
  department: string | null;
  subDepartment: string | null;
  category: string | null;
}

export interface ImportResult {
  importLogId: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  skippedRows: number;
  updatedRows: number;
  categoriesCreated: number;
  errors: Array<{ row?: number; message: string }>;
  createdItemIds?: string[];
}

interface AnalyzeResponse {
  data: {
    columns: ColumnMapping[];
    sampleData: string[][];
    totalRows: number;
    delimiter: string;
  };
}

interface ValidateResponse {
  data: {
    isValid: boolean;
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    preview: PreviewItem[];
    stats: ValidationStats;
  };
}

interface ExecuteResponse {
  data: ImportResult;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useInventoryImport() {
  const { toast } = useToast();

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [defaultItemType, setDefaultItemType] = useState<string>('retail');
  const [duplicateSkuMode, setDuplicateSkuMode] = useState<'skip' | 'update'>('skip');

  // Analyze result
  const [columns, setColumns] = useState<ColumnMapping[]>([]);
  const [sampleData, setSampleData] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // User-adjusted mappings: columnIndex → targetField | null
  const [mappings, setMappings] = useState<Record<string, string | null>>({});

  // Validation result
  const [isValid, setIsValid] = useState(false);
  const [errors, setErrors] = useState<ValidationMessage[]>([]);
  const [warnings, setWarnings] = useState<ValidationMessage[]>([]);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);

  // Import result
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── File Select ──
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    const text = await file.text();
    setCsvContent(text);

    // Auto-analyze
    setStep('analyzing');
    setIsLoading(true);

    try {
      const res = await apiFetch<AnalyzeResponse>('/api/v1/catalog/import/analyze', {
        method: 'POST',
        body: JSON.stringify({ csvContent: text, fileName: file.name }),
      });

      setColumns(res.data.columns);
      setSampleData(res.data.sampleData);
      setTotalRows(res.data.totalRows);

      // Initialize mappings from analyzer suggestions
      const initialMappings: Record<string, string | null> = {};
      for (const col of res.data.columns) {
        initialMappings[String(col.columnIndex)] = col.targetField;
      }
      setMappings(initialMappings);

      setStep('mapping');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      setStep('upload');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // ── Update Mapping ──
  const updateMapping = useCallback((columnIndex: number, targetField: string | null) => {
    setMappings((prev) => ({ ...prev, [String(columnIndex)]: targetField }));
  }, []);

  // ── Confirm Mappings → Validate ──
  const confirmMappings = useCallback(async () => {
    setStep('validating');
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<ValidateResponse>('/api/v1/catalog/import/validate', {
        method: 'POST',
        body: JSON.stringify({
          csvContent,
          mappings,
          duplicateSkuMode,
          defaultItemType,
        }),
      });

      setIsValid(res.data.isValid);
      setErrors(res.data.errors);
      setWarnings(res.data.warnings);
      setPreview(res.data.preview);
      setStats(res.data.stats);

      setStep('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Validation failed';
      setError(msg);
      setStep('mapping');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [csvContent, mappings, duplicateSkuMode, defaultItemType, toast]);

  // ── Execute Import ──
  const handleImport = useCallback(async () => {
    setStep('importing');
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<ExecuteResponse>('/api/v1/catalog/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          csvContent,
          mappings,
          duplicateSkuMode,
          defaultItemType,
          fileName,
        }),
      });

      setImportResult(res.data);
      setStep('complete');
      toast.success(`${res.data.successRows} items imported successfully`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setError(msg);
      setStep('preview');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [csvContent, mappings, duplicateSkuMode, defaultItemType, fileName, toast]);

  // ── Go Back from Results (keep validation data) ──
  const goBackFromResults = useCallback(() => {
    setImportResult(null);
    setStep('preview');
  }, []);

  // ── Roll Back Import ──
  const rollbackImport = useCallback(async () => {
    if (!importResult?.importLogId) return;
    setIsRollingBack(true);
    try {
      await apiFetch('/api/v1/catalog/import/rollback', {
        method: 'POST',
        body: JSON.stringify({
          importLogId: importResult.importLogId,
          createdItemIds: importResult.createdItemIds ?? [],
        }),
      });
      toast.success('Import rolled back successfully');
      setImportResult(null);
      setStep('preview');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rollback failed';
      toast.error(msg);
    } finally {
      setIsRollingBack(false);
    }
  }, [importResult, toast]);

  // ── Navigation ──
  const goBack = useCallback(() => {
    if (step === 'mapping') setStep('upload');
    else if (step === 'preview') setStep('mapping');
  }, [step]);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setCsvContent('');
    setColumns([]);
    setSampleData([]);
    setTotalRows(0);
    setMappings({});
    setIsValid(false);
    setErrors([]);
    setWarnings([]);
    setPreview([]);
    setStats(null);
    setImportResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    // State
    step,
    fileName,
    defaultItemType,
    duplicateSkuMode,
    columns,
    sampleData,
    totalRows,
    mappings,
    isValid,
    errors,
    warnings,
    preview,
    stats,
    importResult,
    isLoading,
    isRollingBack,
    error,
    // Actions
    handleFileSelect,
    updateMapping,
    confirmMappings,
    handleImport,
    goBack,
    goBackFromResults,
    rollbackImport,
    reset,
    setDefaultItemType,
    setDuplicateSkuMode,
  };
}
