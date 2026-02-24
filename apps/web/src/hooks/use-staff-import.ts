'use client';

/**
 * Hook for the staff import wizard.
 * Manages the multi-step flow: upload → analyze → map → resolve → validate → execute.
 */

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  StaffAnalysisResult,
  StaffColumnMapping,
  StaffValueMappings,
  StaffValidationResult,
  StaffImportMode,
  StaffImportResult,
  RoleValueMapping,
  LocationValueMapping,
} from '@oppsera/core/import/staff-import-types';

export type WizardStep =
  | 'upload'
  | 'mapping'
  | 'values'
  | 'preview'
  | 'executing'
  | 'results';

export interface StaffImportContext {
  roles: Array<{ id: string; name: string; description: string | null; is_system: boolean }>;
  locations: Array<{ id: string; name: string; location_type: string; parent_location_id: string | null }>;
}

export function useStaffImport() {
  const [step, setStep] = useState<WizardStep>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw file data
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  // Analysis
  const [analysis, setAnalysis] = useState<StaffAnalysisResult | null>(null);

  // Mappings (editable)
  const [columnMappings, setColumnMappings] = useState<StaffColumnMapping[]>([]);
  const [valueMappings, setValueMappings] = useState<StaffValueMappings>({ roles: [], locations: [] });

  // Settings
  const [importMode, setImportMode] = useState<StaffImportMode>('upsert');
  const [autoGenerateUsername, setAutoGenerateUsername] = useState(true);
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(null);
  const [defaultLocationIds, setDefaultLocationIds] = useState<string[]>([]);

  // Tenant context
  const [context, setContext] = useState<StaffImportContext | null>(null);

  // Validation
  const [validation, setValidation] = useState<StaffValidationResult | null>(null);

  // Results
  const [result, setResult] = useState<StaffImportResult | null>(null);

  // ── Step 1: Upload + Analyze ──
  const analyzeFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const text = await file.text();
      setCsvText(text);
      setFileName(file.name);

      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch<{ data: StaffAnalysisResult }>('/api/v1/import/staff/analyze', {
        method: 'POST',
        body: formData,
      });

      setAnalysis(res.data);
      setColumnMappings(res.data.columns);

      // Fetch tenant context (roles + locations)
      const ctxRes = await apiFetch<{ data: StaffImportContext }>('/api/v1/import/staff/context');
      setContext(ctxRes.data);

      // Build initial value mappings from analysis
      buildInitialValueMappings(res.data, ctxRes.data);

      setStep('mapping');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Build initial role/location value mappings with auto-matching
  const buildInitialValueMappings = (analysis: StaffAnalysisResult, ctx: StaffImportContext) => {
    const roleMappings: RoleValueMapping[] = analysis.distinctRoles.map((legacyVal) => {
      const normalized = legacyVal.toLowerCase().trim();
      const match = ctx.roles.find((r) => r.name.toLowerCase() === normalized);
      return {
        legacyValue: legacyVal,
        oppsEraRoleId: match?.id ?? null,
        occurrenceCount: 0,
        confidence: match ? 90 : 0,
      };
    });

    const locationMappings: LocationValueMapping[] = analysis.distinctLocations.map((legacyVal) => {
      const normalized = legacyVal.toLowerCase().trim();
      const match = ctx.locations.find((l) => l.name.toLowerCase() === normalized);
      return {
        legacyValue: legacyVal,
        oppsEraLocationIds: match ? [match.id] : [],
        occurrenceCount: 0,
        confidence: match ? 90 : 0,
      };
    });

    setValueMappings({ roles: roleMappings, locations: locationMappings });
  };

  // ── Step 2: Confirm mappings → go to values ──
  const confirmMappings = useCallback(() => {
    setStep('values');
  }, []);

  // ── Step 3: Confirm value mappings → validate ──
  const validateImport = useCallback(async () => {
    if (!csvText) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StaffValidationResult }>('/api/v1/import/staff/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText,
          columnMappings,
          valueMappings,
          importMode,
          autoGenerateUsername,
          defaultRoleId,
          defaultLocationIds,
        }),
      });

      setValidation(res.data);
      setStep('preview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsLoading(false);
    }
  }, [csvText, columnMappings, valueMappings, importMode, autoGenerateUsername, defaultRoleId, defaultLocationIds]);

  // ── Step 4: Execute import ──
  const executeImport = useCallback(async (dryRun = false) => {
    if (!validation) return;
    setIsLoading(true);
    setError(null);
    if (!dryRun) setStep('executing');
    try {
      const res = await apiFetch<{ data: StaffImportResult }>('/api/v1/import/staff/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: validation.rows,
          fileName,
          importMode,
          columnMappings,
          valueMappings,
          defaultRoleId,
          defaultLocationIds,
          dryRun,
        }),
      });

      if (!dryRun) {
        setResult(res.data);
        setStep('results');
      }
      return res.data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
      if (!dryRun) setStep('preview');
    } finally {
      setIsLoading(false);
    }
  }, [validation, fileName, importMode, columnMappings, valueMappings, defaultRoleId, defaultLocationIds]);

  // ── Navigation ──
  const goBack = useCallback(() => {
    const steps: WizardStep[] = ['upload', 'mapping', 'values', 'preview', 'executing', 'results'];
    const idx = steps.indexOf(step);
    if (idx > 0 && step !== 'executing' && step !== 'results') {
      setStep(steps[idx - 1]!);
    }
  }, [step]);

  const reset = useCallback(() => {
    setCsvText(null);
    setFileName('');
    setAnalysis(null);
    setColumnMappings([]);
    setValueMappings({ roles: [], locations: [] });
    setValidation(null);
    setResult(null);
    setError(null);
    setStep('upload');
  }, []);

  return {
    // State
    step,
    isLoading,
    error,
    fileName,
    analysis,
    columnMappings,
    valueMappings,
    importMode,
    autoGenerateUsername,
    defaultRoleId,
    defaultLocationIds,
    context,
    validation,
    result,

    // Setters
    setColumnMappings,
    setValueMappings,
    setImportMode,
    setAutoGenerateUsername,
    setDefaultRoleId,
    setDefaultLocationIds,

    // Actions
    analyzeFile,
    confirmMappings,
    validateImport,
    executeImport,
    goBack,
    reset,
  };
}
