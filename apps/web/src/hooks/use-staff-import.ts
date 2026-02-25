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

// ── Intelligent role matching ──

/** Keyword patterns mapped to system role names, ordered by specificity */
const ROLE_KEYWORD_MAP: Array<{ keywords: string[]; roleName: string; confidence: number }> = [
  // Owner-level (highest privilege)
  { keywords: ['super admin', 'super administrator', 'superadmin'], roleName: 'owner', confidence: 85 },
  { keywords: ['owner', 'principal', 'proprietor', 'gm', 'general manager'], roleName: 'owner', confidence: 85 },
  // Manager-level
  { keywords: ['manager', 'director', 'head pro', 'head professional', 'administrator', 'admin'], roleName: 'manager', confidence: 80 },
  { keywords: ['agm', 'assistant manager', 'asst manager', 'dept head', 'department head'], roleName: 'manager', confidence: 75 },
  // Supervisor-level
  { keywords: ['supervisor', 'lead', 'senior', 'shift lead', 'team lead', 'foreman', 'head'], roleName: 'supervisor', confidence: 80 },
  { keywords: ['captain', 'coordinator', 'chief'], roleName: 'supervisor', confidence: 70 },
  // Cashier-level
  { keywords: ['cashier', 'register', 'checkout', 'teller', 'pro shop'], roleName: 'cashier', confidence: 75 },
  // Server-level
  { keywords: ['server', 'waiter', 'waitress', 'bartender', 'barista', 'food runner'], roleName: 'server', confidence: 80 },
  { keywords: ['hostess', 'host', 'busser', 'busboy'], roleName: 'server', confidence: 70 },
  // Staff-level (lowest privilege, broadest catch)
  { keywords: ['staff', 'employee', 'associate', 'clerk', 'attendant', 'worker', 'crew'], roleName: 'staff', confidence: 75 },
  { keywords: ['ranger', 'marshal', 'starter', 'cart', 'cartie', 'maintenance', 'grounds', 'housekeeping', 'porter', 'valet', 'intern', 'trainee', 'volunteer', 'temp'], roleName: 'staff', confidence: 70 },
];

function matchLegacyRole(
  legacyValue: string,
  roles: Array<{ id: string; name: string }>,
): { roleId: string | null; confidence: number } {
  const normalized = legacyValue.toLowerCase().trim();

  // 1. Exact match on role name
  const exact = roles.find((r) => r.name.toLowerCase() === normalized);
  if (exact) return { roleId: exact.id, confidence: 95 };

  // 2. Keyword-based matching: check if the legacy value contains any keyword pattern
  for (const rule of ROLE_KEYWORD_MAP) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw) || kw.includes(normalized)) {
        const target = roles.find((r) => r.name.toLowerCase() === rule.roleName);
        if (target) return { roleId: target.id, confidence: rule.confidence };
      }
    }
  }

  // 3. Token overlap: split both strings into words and find the best overlap
  const legacyTokens = normalized.split(/[\s_\-/]+/).filter(Boolean);
  let bestMatch: { id: string; score: number } | null = null;
  for (const role of roles) {
    const roleTokens = role.name.toLowerCase().split(/[\s_\-/]+/);
    const overlap = legacyTokens.filter((t) => roleTokens.some((rt) => rt.includes(t) || t.includes(rt))).length;
    const score = overlap / Math.max(legacyTokens.length, roleTokens.length);
    if (score > 0.3 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: role.id, score };
    }
  }
  if (bestMatch) return { roleId: bestMatch.id, confidence: Math.round(bestMatch.score * 65) };

  return { roleId: null, confidence: 0 };
}

function matchLegacyLocation(
  legacyValue: string,
  locations: Array<{ id: string; name: string }>,
): { locationIds: string[]; confidence: number } {
  const normalized = legacyValue.toLowerCase().trim();

  // 1. Exact match
  const exact = locations.find((l) => l.name.toLowerCase() === normalized);
  if (exact) return { locationIds: [exact.id], confidence: 95 };

  // 2. Substring/contains match
  const contains = locations.find(
    (l) => normalized.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(normalized),
  );
  if (contains) return { locationIds: [contains.id], confidence: 80 };

  // 3. Token overlap
  const legacyTokens = normalized.split(/[\s_\-/,]+/).filter(Boolean);
  let bestMatch: { id: string; score: number } | null = null;
  for (const loc of locations) {
    const locTokens = loc.name.toLowerCase().split(/[\s_\-/,]+/);
    const overlap = legacyTokens.filter((t) => locTokens.some((lt) => lt.includes(t) || t.includes(lt))).length;
    const score = overlap / Math.max(legacyTokens.length, locTokens.length);
    if (score > 0.3 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: loc.id, score };
    }
  }
  if (bestMatch) return { locationIds: [bestMatch.id], confidence: Math.round(bestMatch.score * 70) };

  return { locationIds: [], confidence: 0 };
}

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

  // Build initial role/location value mappings with intelligent auto-matching
  const buildInitialValueMappings = (analysis: StaffAnalysisResult, ctx: StaffImportContext) => {
    const roleMappings: RoleValueMapping[] = analysis.distinctRoles.map((legacyVal) => {
      const { roleId, confidence } = matchLegacyRole(legacyVal, ctx.roles);
      return {
        legacyValue: legacyVal,
        oppsEraRoleId: roleId,
        occurrenceCount: 0,
        confidence,
      };
    });

    const locationMappings: LocationValueMapping[] = analysis.distinctLocations.map((legacyVal) => {
      const { locationIds, confidence } = matchLegacyLocation(legacyVal, ctx.locations);
      return {
        legacyValue: legacyVal,
        oppsEraLocationIds: locationIds,
        occurrenceCount: 0,
        confidence,
      };
    });

    setValueMappings({ roles: roleMappings, locations: locationMappings });

    // Auto-set default role to "Staff" (lowest privilege) if available
    if (!defaultRoleId) {
      const staffRole = ctx.roles.find((r) => r.name.toLowerCase() === 'staff');
      if (staffRole) setDefaultRoleId(staffRole.id);
    }
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

  // Go back from results to preview so user can fix errors and re-import
  const goBackFromResults = useCallback(() => {
    if (step !== 'results') return;
    // Keep validation data intact so the preview step works
    setResult(null);
    setError(null);
    setStep('preview');
  }, [step]);

  // Roll back a completed import — deletes users that were just created
  const rollbackImport = useCallback(async () => {
    if (!result) return;
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/import/staff/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: result.jobId,
          createdUserIds: result.createdUserIds ?? [],
        }),
      });
      // Reset to preview step so they can fix and retry
      setResult(null);
      setStep('preview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setIsLoading(false);
    }
  }, [result]);

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
    goBackFromResults,
    rollbackImport,
    reset,
  };
}
