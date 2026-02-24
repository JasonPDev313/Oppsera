'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useAuthContext } from '@/components/auth-provider';
import { useAccountingSetupStatus } from '@/hooks/use-accounting-nav';
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

// ── Quick existence check ────────────────────────────────

/** Check if an API endpoint returns any records, with a 5s timeout */
async function hasRecords(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await apiFetch<{ data: unknown[] | { items?: unknown[] } }>(url, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (Array.isArray(res.data)) return res.data.length > 0;
    if (res.data && typeof res.data === 'object' && 'items' in res.data) {
      return (res.data.items as unknown[]).length > 0;
    }
    return !!res.data;
  } catch {
    return false;
  }
}

// ── Build static defaults (no API needed) ────────────────

function buildStaticDefaults(): StepCompletion {
  return {
    organization: { locations: false, profit_centers: false, terminals: false, terminal_settings: false },
    users: { invite_users: false, import_staff: false, custom_roles: false, location_assignments: false },
    catalog: { hierarchy: false, tax_config: false, items: false, import_items: false, modifiers: false, packages: false },
    inventory: { vendors: false, uom: false, costing: false, reorder_levels: false, opening_balances: false },
    customers: { customer_records: false, membership_plans: false, billing_accounts: false },
    data_import: { import_overview: false, first_import_complete: false },
    accounting: { bootstrap: false, import_coa: false, control_accounts: false, mappings: false, bank_accounts: false, pos_posting: false },
    pos_config: { pos_terminal_prefs: false, quick_menu: false, drawer_defaults: false, tip_config: false },
    fnb: { floor_plans: false, sync_tables: false, kds_stations: false, menu_periods: false, allergens: false, tip_pools: false },
    reporting: { dashboard_widgets: false, custom_reports: false, ai_lenses: false },
    go_live: { all_phases_complete: false, test_order: false, verify_gl: false, final_review: false },
  };
}

// ── Hook ─────────────────────────────────────────────────

export function useOnboardingStatus(): OnboardingStatus {
  const { isModuleEnabled } = useEntitlementsContext();
  const { locations } = useAuthContext();
  const accountingStatus = useAccountingSetupStatus();

  // Stabilize accounting steps into a string key so it doesn't re-trigger the effect
  // on every render (steps is a new array ref each time)
  const acctStepsKey = accountingStatus.steps
    .map((s) => `${s.key}:${s.isComplete ? '1' : '0'}`)
    .join(',');

  // Initialize from cache or static defaults — never null, so UI renders immediately
  const [completion, setCompletion] = useState<StepCompletion>(() => {
    return loadCachedCompletion() ?? buildStaticDefaults();
  });
  const [skippedPhases, setSkippedPhases] = useState<Set<string>>(loadSkippedPhases);
  const [manualDone, setManualDone] = useState<StepCompletion>(loadManualDone);
  const [isLoading, setIsLoading] = useState(() => loadCachedCompletion() === null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(loadCompletedAt);

  // Refs for values needed inside the effect without triggering re-runs
  const isModuleEnabledRef = useRef(isModuleEnabled);
  isModuleEnabledRef.current = isModuleEnabled;
  const skippedPhasesRef = useRef(skippedPhases);
  skippedPhasesRef.current = skippedPhases;

  // ── Fetch completion data (only for enabled modules) ──
  useEffect(() => {
    let cancelled = false;
    const checkModule = isModuleEnabledRef.current;

    async function check() {
      // Build conditional checks — only call APIs for enabled modules
      const checks: Promise<[string, string, boolean]>[] = [];

      // ── Phase 1: Organization ──
      checks.push(
        hasRecords('/api/v1/profit-centers').then((v) => ['organization', 'profit_centers', v]),
      );
      if (locations && locations.length > 0) {
        checks.push(
          hasRecords(`/api/v1/terminals/by-location?locationId=${locations[0]!.id}`).then((v) => ['organization', 'terminals', v]),
        );
      }

      // ── Phase 2: Users ──
      checks.push(
        hasRecords('/api/v1/users').then((v) => ['users', 'invite_users', v]),
        hasRecords('/api/v1/roles').then((v) => ['users', 'custom_roles', v]),
      );

      // ── Phase 3: Catalog ──
      if (checkModule('catalog')) {
        checks.push(
          hasRecords('/api/v1/catalog/categories?limit=1').then((v) => ['catalog', 'hierarchy', v]),
          hasRecords('/api/v1/catalog/tax-rates').then((v) => ['catalog', 'tax_config', v]),
          hasRecords('/api/v1/catalog/items?limit=1').then((v) => ['catalog', 'items', v]),
          hasRecords('/api/v1/catalog/import/history?limit=1').then((v) => ['catalog', 'import_items', v]),
          hasRecords('/api/v1/catalog/modifier-groups').then((v) => ['catalog', 'modifiers', v]),
          hasRecords('/api/v1/catalog/items?itemType=package&limit=1').then((v) => ['catalog', 'packages', v]),
        );
      }

      // ── Phase 4: Inventory ──
      if (checkModule('inventory')) {
        checks.push(
          hasRecords('/api/v1/inventory/vendors?limit=1').then((v) => ['inventory', 'vendors', v]),
          hasRecords('/api/v1/inventory/receiving?limit=1').then((v) => ['inventory', 'opening_balances', v]),
        );
      }

      // ── Phase 5: Customers ──
      if (checkModule('customers')) {
        checks.push(
          hasRecords('/api/v1/customers?limit=1').then((v) => ['customers', 'customer_records', v]),
          hasRecords('/api/v1/memberships/plans?limit=1').then((v) => ['customers', 'membership_plans', v]),
          hasRecords('/api/v1/billing/accounts?limit=1').then((v) => ['customers', 'billing_accounts', v]),
        );
      }

      // ── Phase 6: Data Import ──
      // import_overview is always true (navigation step)
      checks.push(Promise.resolve<[string, string, boolean]>(['data_import', 'import_overview', true]));
      // first_import_complete: true if ANY module has at least one completed import
      checks.push(
        hasRecords('/api/v1/import/all-history?limit=1').then((v) => ['data_import', 'first_import_complete', v] as [string, string, boolean]),
      );

      // ── Phase 7: Accounting (COA import auto-detection) ──
      if (checkModule('accounting')) {
        checks.push(
          hasRecords('/api/v1/accounting/import/history?limit=1').then((v) => ['accounting', 'import_coa', v]),
        );
      }

      // ── Phase 8: F&B ──
      if (checkModule('pos_fnb')) {
        checks.push(
          hasRecords('/api/v1/room-layouts?limit=1').then((v) => ['fnb', 'floor_plans', v]),
          hasRecords('/api/v1/fnb/tables?limit=1').then((v) => ['fnb', 'sync_tables', v]),
          hasRecords('/api/v1/fnb/stations').then((v) => ['fnb', 'kds_stations', v]),
        );
      }

      // ── Phase 9: Reporting ──
      if (checkModule('reporting')) {
        checks.push(
          hasRecords('/api/v1/reports/custom?limit=1').then((v) => ['reporting', 'custom_reports', v]),
        );
      }
      if (checkModule('semantic')) {
        checks.push(
          hasRecords('/api/v1/semantic/lenses').then((v) => ['reporting', 'ai_lenses', v]),
        );
      }

      // ── Phase 10: Go Live — test order ──
      checks.push(
        hasRecords('/api/v1/orders?limit=1').then((v) => ['go_live', 'test_order', v]),
      );

      const results = await Promise.all(checks);
      if (cancelled) return;

      // Parse accounting steps from the stabilized key
      const acctMap: Record<string, boolean> = {};
      for (const pair of acctStepsKey.split(',')) {
        if (!pair) continue;
        const idx = pair.indexOf(':');
        if (idx > 0) acctMap[pair.slice(0, idx)] = pair.slice(idx + 1) === '1';
      }

      // Merge results into completion map
      const updated = buildStaticDefaults();

      // Apply locations from auth context (synchronous, no API call)
      updated.organization!.locations = (locations?.length ?? 0) > 0;

      // Apply API results
      for (const [phase, step, value] of results) {
        if (updated[phase]) updated[phase]![step] = value;
      }

      // import_items shares detection with items (if items exist, import is satisfied)
      if (updated.catalog) updated.catalog.import_items = updated.catalog.items ?? false;

      // Apply accounting from existing hook (merge, don't replace — import_coa comes from API check)
      updated.accounting = { ...updated.accounting, ...acctMap };

      setCompletion(updated);
      saveCachedCompletion(updated);
      setIsLoading(false);
    }

    check();
    return () => { cancelled = true; };
  }, [locations?.length, acctStepsKey, refreshCounter]);

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
