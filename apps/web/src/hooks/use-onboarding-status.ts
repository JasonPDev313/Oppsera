'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { ONBOARDING_PHASES } from '@/components/onboarding/phase-definitions';

// ── Types ────────────────────────────────────────────────

interface StepCompletion {
  [phaseKey: string]: {
    [stepKey: string]: boolean;
  };
}

export interface OnboardingStatus {
  completion: StepCompletion;
  skippedPhases: Set<string>;
  overallPercentage: number;
  isComplete: boolean;
  /** True only on first load before any data (cache or API) is available */
  isLoading: boolean;
  /** Timestamp when user marked onboarding as complete, or null */
  completedAt: string | null;
  toggleSkip: (phaseKey: string) => void;
  /** Toggle a step as manually completed (for steps without automatic detection) */
  toggleStepDone: (phaseKey: string, stepKey: string) => void;
  refresh: () => void;
  markComplete: () => void;
}

// ── localStorage / sessionStorage helpers ────────────────

const SKIP_STORAGE_KEY = 'oppsera_onboarding_skipped';
const CACHE_STORAGE_KEY = 'oppsera_onboarding_cache';
const COMPLETED_STORAGE_KEY = 'oppsera_onboarding_completed_at';
const MANUAL_DONE_STORAGE_KEY = 'oppsera_onboarding_manual_done';

function loadSkippedPhases(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SKIP_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSkippedPhases(skipped: Set<string>) {
  try {
    localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify([...skipped]));
  } catch { /* ignore */ }
}

/** Load cached completion from sessionStorage (stale-while-revalidate) */
function loadCachedCompletion(): StepCompletion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StepCompletion) : null;
  } catch {
    return null;
  }
}

function saveCachedCompletion(completion: StepCompletion) {
  try {
    sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(completion));
  } catch { /* ignore */ }
}

function loadCompletedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(COMPLETED_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Load manually completed steps from localStorage: { "phase.step": true } */
function loadManualDone(): StepCompletion {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MANUAL_DONE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StepCompletion) : {};
  } catch {
    return {};
  }
}

function saveManualDone(manual: StepCompletion) {
  try {
    localStorage.setItem(MANUAL_DONE_STORAGE_KEY, JSON.stringify(manual));
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────

export function useOnboardingStatus(): OnboardingStatus {
  const { isModuleEnabled } = useEntitlementsContext();

  // Initialize from cache or empty — never null, so UI renders immediately
  const [completion, setCompletion] = useState<StepCompletion>(
    () => loadCachedCompletion() ?? {},
  );
  const [skippedPhases, setSkippedPhases] = useState<Set<string>>(loadSkippedPhases);
  const [manualDone, setManualDone] = useState<StepCompletion>(loadManualDone);
  const [isLoading, setIsLoading] = useState(() => loadCachedCompletion() === null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(loadCompletedAt);

  // ── Single consolidated API call ──
  useEffect(() => {
    const controller = new AbortController();

    async function fetchStatus() {
      try {
        const res = await apiFetch<{ data: StepCompletion }>(
          '/api/v1/onboarding/status',
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setCompletion(res.data);
        saveCachedCompletion(res.data);
      } catch {
        // On error, keep cached/default state — don't blank the UI
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    fetchStatus();
    return () => {
      controller.abort();
    };
  }, [refreshCounter]);

  // ── Merge API completion + manual completions + compute Go Live ──
  const mergedCompletion = useMemo(() => {
    const merged: StepCompletion = {};
    for (const phase of Object.keys(completion)) {
      merged[phase] = { ...completion[phase] };
    }
    for (const phase of Object.keys(manualDone)) {
      if (!merged[phase]) merged[phase] = {};
      for (const step of Object.keys(manualDone[phase]!)) {
        if (manualDone[phase]![step]) merged[phase]![step] = true;
      }
    }

    // Compute Go Live steps from merged data
    if (!merged.go_live) merged.go_live = {};

    // all_phases_complete: every non-skipped, non-go_live, visible phase has all steps done
    const allPhasesDone = ONBOARDING_PHASES
      .filter((p) => p.key !== 'go_live')
      .filter((p) => !p.moduleKey || isModuleEnabled(p.moduleKey))
      .filter((p) => !skippedPhases.has(p.key))
      .every((p) => {
        const pc = merged[p.key] ?? {};
        return p.steps.every((s) => pc[s.key]);
      });
    merged.go_live.all_phases_complete = allPhasesDone;

    // verify_gl: if accounting enabled, check accounting phase is fully complete; else auto-pass
    if (isModuleEnabled('accounting')) {
      const acct = merged.accounting ?? {};
      merged.go_live.verify_gl = Object.values(acct).every((v) => v);
    } else {
      merged.go_live.verify_gl = true;
    }

    // final_review: auto-complete when all other go_live steps pass
    merged.go_live.final_review =
      !!merged.go_live.all_phases_complete &&
      !!merged.go_live.test_order &&
      !!merged.go_live.verify_gl;

    return merged;
  }, [completion, manualDone, isModuleEnabled, skippedPhases]);

  // ── Compute visible phases + overall percentage ──
  const { overallPercentage, isComplete } = useMemo(() => {
    let totalSteps = 0;
    let completedSteps = 0;

    for (const phase of ONBOARDING_PHASES) {
      if (phase.moduleKey && !isModuleEnabled(phase.moduleKey)) continue;
      if (skippedPhases.has(phase.key)) continue;

      const phaseCompletion = mergedCompletion[phase.key] ?? {};
      for (const step of phase.steps) {
        totalSteps++;
        if (phaseCompletion[step.key]) completedSteps++;
      }
    }

    const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    return { overallPercentage: pct, isComplete: totalSteps > 0 && completedSteps === totalSteps };
  }, [mergedCompletion, skippedPhases, isModuleEnabled]);

  const toggleSkip = useCallback((phaseKey: string) => {
    setSkippedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) {
        next.delete(phaseKey);
      } else {
        next.add(phaseKey);
      }
      saveSkippedPhases(next);
      return next;
    });
  }, []);

  const toggleStepDone = useCallback((phaseKey: string, stepKey: string) => {
    setManualDone((prev) => {
      const next = { ...prev };
      if (!next[phaseKey]) next[phaseKey] = {};
      next[phaseKey]![stepKey] = !next[phaseKey]![stepKey];
      // Clean up false entries
      if (!next[phaseKey]![stepKey]) delete next[phaseKey]![stepKey];
      if (Object.keys(next[phaseKey]!).length === 0) delete next[phaseKey];
      saveManualDone(next);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  const markComplete = useCallback(() => {
    const ts = new Date().toISOString();
    try {
      localStorage.setItem(COMPLETED_STORAGE_KEY, ts);
    } catch { /* ignore */ }
    setCompletedAt(ts);
  }, []);

  return {
    completion: mergedCompletion,
    skippedPhases,
    overallPercentage,
    isComplete,
    isLoading,
    completedAt,
    toggleSkip,
    toggleStepDone,
    refresh,
    markComplete,
  };
}
