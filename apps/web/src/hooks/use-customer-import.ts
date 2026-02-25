'use client';

/**
 * State management hook for the customer import wizard.
 * Tracks all 7 steps and orchestrates API calls.
 */

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types (mirrored from backend for frontend use) ───────────────

export interface ColumnMapping {
  sourceHeader: string;
  sourceIndex: number;
  targetField: string | null;
  confidence: number;
  method: 'alias' | 'ai' | 'manual' | 'unmapped';
  reasoning?: string;
}

export interface DetectedTransform {
  sourceIndex: number;
  sourceHeader: string;
  type: 'split_name' | 'split_address' | 'none';
  description: string;
  outputFields: string[];
}

export interface DuplicateMatch {
  csvRowIndex: number;
  matchType: 'email' | 'phone' | 'member_number' | 'external_id';
  existingCustomerId: string;
  existingDisplayName: string;
  existingEmail: string | null;
  matchConfidence: number;
}

export type DuplicateResolution = 'skip' | 'update' | 'create_new';

export interface ValidationMessage {
  row?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface MappedCustomerRow {
  rowIndex: number;
  customer: Record<string, unknown>;
  address?: Record<string, unknown>;
  externalId?: string;
  billingBalance?: number;
  creditLimit?: number;
}

export interface ImportResult {
  importLogId: string;
  totalRows: number;
  successRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: Array<{ row: number; message: string }>;
  createdCustomerIds?: string[];
}

// ── Step enum ─────────────────────────────────────────────────────

export type ImportStep =
  | 'upload'
  | 'analyzing'
  | 'mapping'
  | 'validating'
  | 'validation_preview'
  | 'duplicates'
  | 'importing'
  | 'results';

// ── Hook ──────────────────────────────────────────────────────────

export function useCustomerImport() {
  const [step, setStep] = useState<ImportStep>('upload');
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  // Detection state
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [transforms, setTransforms] = useState<DetectedTransform[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<ValidationMessage[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationMessage[]>([]);
  const [validRowCount, setValidRowCount] = useState(0);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [preview, setPreview] = useState<MappedCustomerRow[]>([]);

  // Duplicate resolution state
  const [duplicateResolutions, setDuplicateResolutions] = useState<Record<number, DuplicateResolution>>({});

  // Result state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // ── Step 1: Handle file upload ──
  const handleFileSelected = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setFileSizeBytes(file.size);

    try {
      const content = await file.text();
      setCsvContent(content);
      setStep('analyzing');

      // Call detect-columns API
      const res = await apiFetch('/api/v1/customers/import/detect-columns', {
        method: 'POST',
        body: JSON.stringify({ csvContent: content }),
      }) as Response;

      if (!res.ok) {
        const errBody = await res.json() as { error?: { message?: string } };
        setError(errBody.error?.message ?? 'Failed to analyze file');
        setStep('upload');
        return;
      }

      const { data } = await res.json() as { data: { headers: string[]; sampleRows: string[][]; mappings: ColumnMapping[]; transforms: DetectedTransform[]; totalRows: number } };
      setHeaders(data.headers);
      setSampleRows(data.sampleRows);
      setMappings(data.mappings);
      setTransforms(data.transforms);
      setTotalRows(data.totalRows);
      setStep('mapping');
    } catch (err: any) {
      setError(err.message ?? 'Failed to read file');
      setStep('upload');
    }
  }, []);

  // ── Step 3: Update a mapping ──
  const updateMapping = useCallback((sourceIndex: number, targetField: string | null) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceIndex === sourceIndex
          ? { ...m, targetField, confidence: targetField ? 100 : 0, method: targetField ? 'manual' as const : 'unmapped' as const }
          : m,
      ),
    );
  }, []);

  // ── Step 4: Run validation ──
  const runValidation = useCallback(async () => {
    if (!csvContent) return;
    setStep('validating');
    setError(null);

    try {
      const res = await apiFetch('/api/v1/customers/import/validate', {
        method: 'POST',
        body: JSON.stringify({ csvContent, mappings, transforms }),
      }) as Response;

      if (!res.ok) {
        const errBody = await res.json() as { error?: { message?: string } };
        setError(errBody.error?.message ?? 'Validation failed');
        setStep('mapping');
        return;
      }

      const { data } = await res.json() as { data: { errors: ValidationMessage[]; warnings: ValidationMessage[]; validRows: number; duplicates: DuplicateMatch[]; preview: MappedCustomerRow[] } };
      setValidationErrors(data.errors);
      setValidationWarnings(data.warnings);
      setValidRowCount(data.validRows);
      setDuplicates(data.duplicates);
      setPreview(data.preview);

      // Initialize default resolutions (skip all)
      const defaultResolutions: Record<number, DuplicateResolution> = {};
      for (const dup of data.duplicates) {
        defaultResolutions[dup.csvRowIndex] = 'skip';
      }
      setDuplicateResolutions(defaultResolutions);

      if (data.duplicates.length > 0) {
        setStep('duplicates');
      } else {
        setStep('validation_preview');
      }
    } catch (err: any) {
      setError(err.message ?? 'Validation request failed');
      setStep('mapping');
    }
  }, [csvContent, mappings, transforms]);

  // ── Step 5: Set duplicate resolution ──
  const setDuplicateResolution = useCallback((csvRowIndex: number, resolution: DuplicateResolution) => {
    setDuplicateResolutions((prev) => ({ ...prev, [csvRowIndex]: resolution }));
  }, []);

  const setAllDuplicateResolutions = useCallback((resolution: DuplicateResolution) => {
    setDuplicateResolutions((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[Number(key)] = resolution;
      }
      return updated;
    });
  }, []);

  // ── Step 6: Execute import ──
  const executeImport = useCallback(async () => {
    if (!csvContent) return;
    setStep('importing');
    setError(null);

    try {
      const res = await apiFetch('/api/v1/customers/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          csvContent,
          mappings,
          transforms,
          duplicateResolutions,
          fileName,
          fileSizeBytes,
        }),
      }) as Response;

      if (!res.ok) {
        const errBody = await res.json() as { error?: { message?: string } };
        setError(errBody.error?.message ?? 'Import failed');
        setStep('validation_preview');
        return;
      }

      const { data } = await res.json() as { data: ImportResult };
      setImportResult(data);
      setStep('results');
    } catch (err: any) {
      setError(err.message ?? 'Import request failed');
      setStep('validation_preview');
    }
  }, [csvContent, mappings, transforms, duplicateResolutions, fileName, fileSizeBytes]);

  // ── Go Back from Results (keep validation data) ──
  const goBackFromResults = useCallback(() => {
    setImportResult(null);
    if (duplicates.length > 0) {
      setStep('duplicates');
    } else {
      setStep('validation_preview');
    }
  }, [duplicates]);

  // ── Roll Back Import ──
  const rollbackImport = useCallback(async () => {
    if (!importResult?.importLogId) return;
    setIsRollingBack(true);
    try {
      const res = await apiFetch('/api/v1/customers/import/rollback', {
        method: 'POST',
        body: JSON.stringify({
          importLogId: importResult.importLogId,
          createdCustomerIds: importResult.createdCustomerIds ?? [],
        }),
      }) as Response;

      if (!res.ok) {
        const errBody = await res.json() as { error?: { message?: string } };
        setError(errBody.error?.message ?? 'Rollback failed');
        return;
      }

      setImportResult(null);
      if (duplicates.length > 0) {
        setStep('duplicates');
      } else {
        setStep('validation_preview');
      }
    } catch (err: any) {
      setError(err.message ?? 'Rollback failed');
    } finally {
      setIsRollingBack(false);
    }
  }, [importResult, duplicates]);

  // ── Reset ──
  const reset = useCallback(() => {
    setStep('upload');
    setError(null);
    setCsvContent(null);
    setFileName('');
    setFileSizeBytes(0);
    setHeaders([]);
    setSampleRows([]);
    setMappings([]);
    setTransforms([]);
    setTotalRows(0);
    setValidationErrors([]);
    setValidationWarnings([]);
    setValidRowCount(0);
    setDuplicates([]);
    setPreview([]);
    setDuplicateResolutions({});
    setImportResult(null);
  }, []);

  return {
    // State
    step,
    error,
    fileName,
    headers,
    sampleRows,
    mappings,
    transforms,
    totalRows,
    validationErrors,
    validationWarnings,
    validRowCount,
    duplicates,
    preview,
    duplicateResolutions,
    importResult,
    isRollingBack,

    // Actions
    handleFileSelected,
    updateMapping,
    runValidation,
    setDuplicateResolution,
    setAllDuplicateResolutions,
    executeImport,
    goBackFromResults,
    rollbackImport,
    reset,
    setStep,

    // Navigation helpers
    goToMapping: () => setStep('mapping'),
    goToValidation: () => setStep('validation_preview'),
    goToDuplicates: () => setStep('duplicates'),
  };
}
