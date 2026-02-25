'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  ImportJobDetail,
} from './use-import-jobs';

// ── Wizard Step Enum ───────────────────────────────────────────────

export type WizardStep =
  | 'upload'
  | 'columns'
  | 'tenders'
  | 'taxes'
  | 'items'
  | 'validation'
  | 'reconciliation'
  | 'importing'
  | 'results';

const STEP_ORDER: WizardStep[] = [
  'upload',
  'columns',
  'tenders',
  'taxes',
  'items',
  'validation',
  'reconciliation',
  'importing',
  'results',
];

// ── Hook ───────────────────────────────────────────────────────────

export function useImportWizard() {
  const [step, setStep] = useState<WizardStep>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);
  const canGoBack = stepIndex > 0 && step !== 'importing' && step !== 'results';
  const canGoForward = stepIndex < STEP_ORDER.length - 1 && step !== 'importing';

  const goBack = useCallback(() => {
    if (canGoBack) setStep(STEP_ORDER[stepIndex - 1]!);
  }, [canGoBack, stepIndex]);

  const goForward = useCallback(() => {
    if (canGoForward) setStep(STEP_ORDER[stepIndex + 1]!);
  }, [canGoForward, stepIndex]);

  const goToStep = useCallback((target: WizardStep) => {
    setStep(target);
  }, []);

  // ── Upload & Create ────────────────────────────────────────────

  const createJob = useCallback(
    async (input: {
      name: string;
      csvContent: string;
      fileName: string;
      locationId?: string;
      mode?: string;
      sourceSystem?: string;
    }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await apiFetch<{ data: ImportJobDetail }>('/api/v1/import/jobs', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        setJobId(res.data.id);
        setStep('columns');
        return res.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create import job';
        setError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // ── Save Column Mappings ───────────────────────────────────────

  const saveColumnMappings = useCallback(
    async (
      mappings: Array<{
        columnMappingId: string;
        targetEntity: string;
        targetField: string;
        isConfirmed: boolean;
        transformRule?: string;
      }>,
      groupingKey?: string,
    ) => {
      if (!jobId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/v1/import/jobs/${jobId}/mappings`, {
          method: 'PATCH',
          body: JSON.stringify({ mappings, groupingKey }),
        });
        setStep('tenders');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save column mappings');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId],
  );

  // ── Save Tender Mappings ───────────────────────────────────────

  const saveTenderMappings = useCallback(
    async (
      mappings: Array<{
        tenderMappingId: string;
        oppseraTenderType: string;
        isConfirmed: boolean;
      }>,
    ) => {
      if (!jobId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/v1/import/jobs/${jobId}/tender-mappings`, {
          method: 'PATCH',
          body: JSON.stringify({ mappings }),
        });
        setStep('taxes');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save tender mappings');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId],
  );

  // ── Save Tax Mappings ──────────────────────────────────────────

  const saveTaxMappings = useCallback(
    async (
      mappings: Array<{
        taxMappingId: string;
        oppseraTaxGroupId?: string;
        taxMode?: string;
        isConfirmed: boolean;
      }>,
    ) => {
      if (!jobId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/v1/import/jobs/${jobId}/tax-mappings`, {
          method: 'PATCH',
          body: JSON.stringify({ mappings }),
        });
        setStep('items');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save tax mappings');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId],
  );

  // ── Save Item Mappings ─────────────────────────────────────────

  const saveItemMappings = useCallback(
    async (
      mappings: Array<{
        itemMappingId: string;
        oppseraCatalogItemId?: string;
        strategy?: string;
        isConfirmed: boolean;
      }>,
    ) => {
      if (!jobId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/v1/import/jobs/${jobId}/item-mappings`, {
          method: 'PATCH',
          body: JSON.stringify({ mappings }),
        });
        setStep('validation');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save item mappings');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId],
  );

  // ── Validate ───────────────────────────────────────────────────

  const runValidation = useCallback(
    async (csvContent: string) => {
      if (!jobId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        await apiFetch(`/api/v1/import/jobs/${jobId}/validate`, {
          method: 'POST',
          body: JSON.stringify({ csvContent }),
        });
        setStep('reconciliation');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Validation failed');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId],
  );

  // ── Execute Import ─────────────────────────────────────────────

  const executeImport = useCallback(async () => {
    if (!jobId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      setStep('importing');
      await apiFetch(`/api/v1/import/jobs/${jobId}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import execution failed');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [jobId]);

  // ── Go Back from Results (keep mappings) ──────────────────────
  const goBackFromResults = useCallback(() => {
    setStep('reconciliation');
  }, []);

  // ── Roll Back Import ─────────────────────────────────────────
  const rollbackImport = useCallback(async () => {
    if (!jobId) return;
    setIsRollingBack(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/import/jobs/${jobId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStep('reconciliation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setIsRollingBack(false);
    }
  }, [jobId]);

  // ── Cancel Import ──────────────────────────────────────────────

  const cancelImport = useCallback(async () => {
    if (!jobId) return;
    try {
      await apiFetch(`/api/v1/import/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // Best-effort cancel
    }
  }, [jobId]);

  return {
    step,
    stepIndex,
    jobId,
    isSubmitting,
    isRollingBack,
    error,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToStep,
    setError,
    createJob,
    saveColumnMappings,
    saveTenderMappings,
    saveTaxMappings,
    saveItemMappings,
    runValidation,
    executeImport,
    goBackFromResults,
    rollbackImport,
    cancelImport,
  };
}
