'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  HandCoins,
  Info,
  Layers,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Loader2,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { AccountPicker, getSuggestedAccount } from '@/components/accounting/account-picker';
import { apiFetch } from '@/lib/api-client';
import { useGLAccounts } from '@/hooks/use-accounting';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import {
  useMappingCoverage,
  useSubDepartmentMappings,
  useSubDepartmentItems,
  useTaxGroupMappings,
  useMappingMutations,
  useTransactionTypeMappings,
  useUnmappedEvents,
  useUnmappedEventMutations,
  useFnbMappingCoverage,
  useSaveFnbMapping,
  useDiscountMappings,
  useDiscountMappingCoverage,
  useDiscountMappingMutations,
  useSmartResolutionSuggestions,
  useApplySmartResolutions,
} from '@/hooks/use-mappings';
import type { SmartSuggestion } from '@/hooks/use-mappings';
import { useAuthContext } from '@/components/auth-provider';
import { useToast } from '@/components/ui/toast';
import { useRemappableTenders } from '@/hooks/use-gl-remap';
import { RemapPreviewDialog } from '@/components/accounting/remap-preview-dialog';
import { CreateTenderTypeDialog } from '@/components/accounting/create-tender-type-dialog';
import { Select } from '@/components/ui/select';
import {
  FNB_CATEGORY_CONFIG,
  TRANSACTION_TYPE_CATEGORY_LABELS,
  TRANSACTION_TYPE_CATEGORY_ORDER,
  getSystemTransactionType,
  isAutoPostedType,
  DEBIT_KIND_ACCOUNT_FILTER,
  CREDIT_KIND_ACCOUNT_FILTER,
  getMappedStatusRule,
  DISCOUNT_CLASSIFICATIONS,
} from '@oppsera/shared';
import type {
  FnbBatchCategoryKey,
  TransactionTypeCategory,
  DebitKind,
  CreditKind,
} from '@oppsera/shared';
import type { SubDepartmentMapping, AccountType, TransactionTypeMapping, FnbMappingCoverageResult } from '@/types/accounting';

type TabKey = 'departments' | 'payments' | 'taxes' | 'discounts' | 'fnb' | 'unmapped';

// ── Global Map All Types ──────────────────────────────────────

interface PhaseResult {
  name: string;
  mapped: number;
  failed: number;
}

interface GlobalMapProgress {
  phase: string;
  current: number;
  total: number;
  mapped: number;
  failed: number;
  phases: PhaseResult[];
}

export default function MappingsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('departments');
  const { data: coverage } = useMappingCoverage();
  const { data: unmappedEvents } = useUnmappedEvents({ status: 'unresolved' });

  // ── Global Map All state ────────────────────────────────────
  const [isGlobalMapping, setIsGlobalMapping] = useState(false);
  const [globalProgress, setGlobalProgress] = useState<GlobalMapProgress | null>(null);

  // ── Hoisted data hooks (React Query deduplicates — zero extra cost) ──
  const { data: subDeptMappings } = useSubDepartmentMappings();
  const { data: allTransactionTypes } = useTransactionTypeMappings();
  const { data: taxGroupMappings } = useTaxGroupMappings();
  const { data: glAccounts } = useGLAccounts({ isActive: true });
  const { data: discountMappings } = useDiscountMappings();
  const { data: smartResolutionData } = useSmartResolutionSuggestions();
  const { locations } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Hoisted mutation hooks ──────────────────────────────────
  const { saveSubDepartmentDefaults, saveTaxGroupDefaults, saveTransactionTypeMapping } = useMappingMutations();
  const { saveDiscountMappingsBatch } = useDiscountMappingMutations();
  const { saveFnbMapping } = useSaveFnbMapping();
  const applySmartResolutions = useApplySmartResolutions();

  // ── Global Map All orchestrator ──────────────────────────────
  const handleGlobalMapAll = useCallback(async () => {
    if (!glAccounts || glAccounts.length === 0) return;
    setIsGlobalMapping(true);
    const phases: PhaseResult[] = [];
    let totalMapped = 0;
    let totalFailed = 0;

    const updateProgress = (phase: string, current: number, total: number) => {
      setGlobalProgress({
        phase,
        current,
        total,
        mapped: totalMapped,
        failed: totalFailed,
        phases: [...phases],
      });
    };

    // ── Phase 1: Sub-Departments ──────────────────────────────
    try {
      updateProgress('Sub-Departments', 0, 1);
      let mapped = 0;
      let failed = 0;
      const revAccounts = glAccounts.filter((a) => a.accountType === 'revenue');
      const expAccounts = glAccounts.filter((a) => a.accountType === 'expense');
      const assetAccounts = glAccounts.filter((a) => a.accountType === 'asset');

      for (const m of subDeptMappings) {
        if (m.revenueAccountId) continue;
        const revSuggestion = getSuggestedAccount(revAccounts, m.subDepartmentName, 'revenue');
        if (!revSuggestion) continue;
        try {
          await saveSubDepartmentDefaults.mutateAsync({
            subDepartmentId: m.subDepartmentId,
            revenueAccountId: revSuggestion.id,
            cogsAccountId: getSuggestedAccount(expAccounts, m.subDepartmentName, 'cogs')?.id ?? m.cogsAccountId,
            inventoryAssetAccountId: getSuggestedAccount(assetAccounts, m.subDepartmentName, 'inventory')?.id ?? m.inventoryAssetAccountId,
            discountAccountId: m.discountAccountId,
            returnsAccountId: getSuggestedAccount(revAccounts, m.subDepartmentName, 'returns')?.id ?? m.returnsAccountId,
          });
          mapped++;
        } catch { failed++; }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'Sub-Departments', mapped, failed });
    } catch {
      phases.push({ name: 'Sub-Departments', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Phase 2: Transaction Types ────────────────────────────
    try {
      updateProgress('Transaction Types', 0, 1);
      let mapped = 0;
      let failed = 0;

      for (const t of allTransactionTypes) {
        if (t.isMapped || isAutoPostedType(t.code)) continue;
        const rule = getMappedStatusRule(t.category);
        let debitId: string | null = t.debitAccountId;
        let creditId: string | null = t.creditAccountId;

        if ((rule === 'debit' || rule === 'both') && !debitId && !isDebitDisabled(t.code)) {
          const debitTypes = getDebitAccountTypes(t.code) as string[];
          const candidates = glAccounts.filter((a) => debitTypes.includes(a.accountType));
          const suggestion = getSuggestedAccount(candidates, t.name, getDebitMappingRole(t.code) ?? 'cash');
          if (suggestion) debitId = suggestion.id;
        }
        if ((rule === 'credit' || rule === 'both') && !creditId && !isCreditDisabled(t.code)) {
          const creditTypes = getCreditAccountTypes(t.code) as string[];
          const candidates = glAccounts.filter((a) => creditTypes.includes(a.accountType));
          const suggestion = getSuggestedAccount(candidates, t.name, getCreditMappingRole(t.code) ?? 'revenue');
          if (suggestion) creditId = suggestion.id;
        }

        if (debitId === t.debitAccountId && creditId === t.creditAccountId) continue;
        try {
          await saveTransactionTypeMapping.mutateAsync({
            code: t.code,
            creditAccountId: creditId,
            debitAccountId: debitId,
          });
          mapped++;
        } catch { failed++; }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'Transaction Types', mapped, failed });
    } catch {
      phases.push({ name: 'Transaction Types', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Phase 3: Tax Groups ───────────────────────────────────
    try {
      updateProgress('Tax Groups', 0, 1);
      let mapped = 0;
      let failed = 0;
      const liabilityAccounts = glAccounts.filter((a) => a.accountType === 'liability');

      for (const m of taxGroupMappings) {
        if (m.taxPayableAccountId) continue;
        const suggestion = getSuggestedAccount(liabilityAccounts, m.taxGroupName, 'tax');
        if (!suggestion) continue;
        try {
          await saveTaxGroupDefaults.mutateAsync({
            taxGroupId: m.taxGroupId,
            taxPayableAccountId: suggestion.id,
          });
          mapped++;
        } catch { failed++; }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'Tax Groups', mapped, failed });
    } catch {
      phases.push({ name: 'Tax Groups', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Phase 4: Discounts ────────────────────────────────────
    try {
      updateProgress('Discounts', 0, 1);
      // Build sub-department list from sub-dept mappings
      const seen = new Set<string>();
      const subDepts: { id: string; name: string }[] = [];
      for (const m of subDeptMappings) {
        if (seen.has(m.subDepartmentId)) continue;
        seen.add(m.subDepartmentId);
        subDepts.push({ id: m.subDepartmentId, name: m.subDepartmentName });
      }

      // Build existing mapping lookup
      const mappingLookup = new Map<string, Map<string, string>>();
      for (const m of discountMappings) {
        let classMap = mappingLookup.get(m.subDepartmentId);
        if (!classMap) {
          classMap = new Map();
          mappingLookup.set(m.subDepartmentId, classMap);
        }
        classMap.set(m.discountClassification, m.glAccountId);
      }

      const batch: Array<{ subDepartmentId: string; classification: string; glAccountId: string }> = [];
      for (const sd of subDepts) {
        for (const def of DISCOUNT_CLASSIFICATIONS) {
          const existing = mappingLookup.get(sd.id)?.get(def.key);
          if (existing) continue;
          const match = glAccounts.find(a => a.accountNumber === def.defaultAccountCode);
          if (match) {
            batch.push({ subDepartmentId: sd.id, classification: def.key, glAccountId: match.id });
          }
        }
      }

      let mapped = 0;
      let failed = 0;
      if (batch.length > 0) {
        try {
          await saveDiscountMappingsBatch.mutateAsync(batch);
          mapped = batch.length;
        } catch { failed = batch.length; }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'Discounts', mapped, failed });
    } catch {
      phases.push({ name: 'Discounts', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Phase 5: F&B Categories (per location) ────────────────
    try {
      updateProgress('F&B Categories', 0, locations.length);
      let mapped = 0;
      let failed = 0;

      for (let i = 0; i < locations.length; i++) {
        const loc = locations[i]!;
        updateProgress('F&B Categories', i + 1, locations.length);

        try {
          const coverageRes = await apiFetch<{ data: FnbMappingCoverageResult }>(
            `/api/v1/accounting/mappings/fnb-categories?locationId=${loc.id}`,
          );
          const locCoverage = coverageRes.data;
          if (!locCoverage?.categories) continue;

          for (const cat of locCoverage.categories) {
            if (cat.key === 'sales_revenue' || cat.isMapped) continue;
            const config = FNB_CATEGORY_CONFIG[cat.key as FnbBatchCategoryKey];
            if (!config) continue;
            const suggestion = getFnbCategorySuggestion(glAccounts, cat.key as FnbBatchCategoryKey);
            if (!suggestion) continue;

            const mapping: Record<string, string | null> = {
              locationId: loc.id,
              entityType: config.entityType,
            };
            mapping[config.mappingColumn] = suggestion.id;

            try {
              await saveFnbMapping(mapping as any);
              mapped++;
            } catch { failed++; }
          }
        } catch {
          // Location-level failure — continue to next location
          failed++;
        }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'F&B Categories', mapped, failed });
    } catch {
      phases.push({ name: 'F&B Categories', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Phase 6: Unmapped Events (Smart Resolution) ───────────
    try {
      updateProgress('Unmapped Events', 0, 1);
      let mapped = 0;
      let failed = 0;

      if (smartResolutionData?.suggestions) {
        const actionable = smartResolutionData.suggestions.filter((s) => !s.alreadyMapped);
        if (actionable.length > 0) {
          try {
            const result = await applySmartResolutions.mutateAsync(
              actionable.map((s) => ({
                entityType: s.entityType,
                entityId: s.entityId,
                suggestedAccountId: s.suggestedAccountId,
              })),
            );
            mapped = result.mappingsCreated + result.eventsResolved;
            failed = result.failed;
          } catch { failed = actionable.length; }
        }
      }
      totalMapped += mapped;
      totalFailed += failed;
      phases.push({ name: 'Unmapped Events', mapped, failed });
    } catch {
      phases.push({ name: 'Unmapped Events', mapped: 0, failed: 1 });
      totalFailed++;
    }

    // ── Finalize ──────────────────────────────────────────────
    setGlobalProgress({
      phase: 'Complete',
      current: 6,
      total: 6,
      mapped: totalMapped,
      failed: totalFailed,
      phases,
    });

    // Invalidate all caches
    await queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    await queryClient.invalidateQueries({ queryKey: ['sub-department-mappings'] });
    await queryClient.invalidateQueries({ queryKey: ['transaction-type-mappings'] });
    await queryClient.invalidateQueries({ queryKey: ['tax-group-mappings'] });
    await queryClient.invalidateQueries({ queryKey: ['discount-gl-mappings'] });
    await queryClient.invalidateQueries({ queryKey: ['discount-mapping-coverage'] });
    await queryClient.invalidateQueries({ queryKey: ['smart-resolution-suggestions'] });
    await queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });

    if (totalMapped > 0 && totalFailed === 0) {
      toast.success(`Global mapping complete: ${totalMapped} item${totalMapped !== 1 ? 's' : ''} mapped across ${phases.filter(p => p.mapped > 0).length} categories`);
    } else if (totalMapped > 0) {
      toast.info(`Global mapping: ${totalMapped} mapped, ${totalFailed} failed across ${phases.length} categories`);
    } else {
      toast.info('No unmapped items found, or no matching GL accounts available');
    }

    setIsGlobalMapping(false);
    // Clear progress after 5 seconds
    setTimeout(() => setGlobalProgress(null), 5000);
  }, [
    glAccounts, subDeptMappings, allTransactionTypes, taxGroupMappings,
    discountMappings, locations, smartResolutionData,
    saveSubDepartmentDefaults, saveTransactionTypeMapping, saveTaxGroupDefaults,
    saveDiscountMappingsBatch, saveFnbMapping, applySmartResolutions,
    queryClient, toast,
  ]);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'departments', label: 'Sub-Departments' },
    { key: 'payments', label: 'Transaction Types' },
    { key: 'taxes', label: 'Tax Groups' },
    { key: 'discounts', label: 'Discounts' },
    { key: 'fnb', label: 'F&B Operations' },
    { key: 'unmapped', label: 'Unmapped Events', count: unmappedEvents.length },
  ];

  return (
    <AccountingPageShell
      title="GL Account Mappings"
      breadcrumbs={[{ label: 'Mappings' }]}
    >
      <GLReadinessBanner />

      {/* Coverage Summary */}
      {coverage && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">Mapping Coverage</h2>
              <span className="text-lg font-bold text-foreground">{coverage.overallPercentage}%</span>
            </div>
            {coverage.overallPercentage < 100 && (
              <button
                type="button"
                onClick={handleGlobalMapAll}
                disabled={isGlobalMapping || !glAccounts?.length}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGlobalMapping ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                )}
                {isGlobalMapping ? 'Mapping...' : 'Map All Unmapped'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Sub-Departments', ...coverage.departments },
              { label: 'Transaction Types', ...coverage.paymentTypes },
              { label: 'Tax Groups', ...coverage.taxGroups },
            ].map(({ label, mapped, total }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{mapped}/{total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      total === 0 ? 'bg-muted-foreground/30' :
                      mapped === total ? 'bg-green-500' :
                      mapped > 0 ? 'bg-amber-500' : 'bg-red-400'
                    }`}
                    style={{ width: total > 0 ? `${(mapped / total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
          {coverage.overallPercentage < 100 && !isGlobalMapping && !globalProgress && (
            <div className="flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/40 p-2 text-sm text-amber-500">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              Items without GL mappings will not post to the General Ledger.
            </div>
          )}
        </div>
      )}

      {/* Global Map All Progress */}
      {globalProgress && (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {globalProgress.phase === 'Complete' ? 'Mapping Complete' : `Mapping: ${globalProgress.phase}`}
            </h3>
            {globalProgress.phase !== 'Complete' && (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-indigo-500" />
            )}
          </div>
          <div className="space-y-1.5">
            {['Sub-Departments', 'Transaction Types', 'Tax Groups', 'Discounts', 'F&B Categories', 'Unmapped Events'].map((phaseName) => {
              const completed = globalProgress.phases.find(p => p.name === phaseName);
              const isCurrent = globalProgress.phase === phaseName;
              return (
                <div key={phaseName} className="flex items-center gap-2 text-sm">
                  {completed ? (
                    <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-green-500" />
                  ) : isCurrent ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded-full border border-border" />
                  )}
                  <span className={completed ? 'text-foreground' : isCurrent ? 'text-indigo-500 font-medium' : 'text-muted-foreground'}>
                    {phaseName}
                  </span>
                  {completed && (
                    <span className="text-muted-foreground">
                      — {completed.mapped} mapped{completed.failed > 0 ? `, ${completed.failed} failed` : ''}
                    </span>
                  )}
                  {isCurrent && globalProgress.total > 1 && (
                    <span className="text-muted-foreground">
                      ({globalProgress.current}/{globalProgress.total})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {globalProgress.phase === 'Complete' && (
            <div className="flex items-center gap-2 rounded bg-green-500/10 border border-green-500/30 p-2 text-sm text-green-500">
              <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
              {globalProgress.mapped} item{globalProgress.mapped !== 1 ? 's' : ''} mapped
              {globalProgress.failed > 0 ? `, ${globalProgress.failed} failed` : ''}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs font-medium text-red-500">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'departments' && <DepartmentMappingsTab />}
      {activeTab === 'payments' && <PaymentTypeMappingsTab />}
      {activeTab === 'taxes' && <TaxGroupMappingsTab />}
      {activeTab === 'discounts' && <DiscountMappingsTab />}
      {activeTab === 'fnb' && <FnbCategoryMappingsTab onNavigateToSubDepartments={() => setActiveTab('departments')} />}
      {activeTab === 'unmapped' && <UnmappedEventsTab />}
    </AccountingPageShell>
  );
}

// ── Department Mappings (Grouped by Department) ─────────────

interface DepartmentGroup {
  departmentId: string;
  departmentName: string;
  subDepartments: SubDepartmentMapping[];
  mappedCount: number;
  totalCount: number;
}

function DepartmentMappingsTab() {
  const { data: mappings, isLoading, mutate } = useSubDepartmentMappings();
  const { saveSubDepartmentDefaults } = useMappingMutations();
  const { toast } = useToast();
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<string | null>(null);
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  // Load all accounts for auto-map suggestions
  const { data: revenueAccounts } = useGLAccounts({ isActive: true });
  const allAccounts = revenueAccounts;

  const grouped = useMemo<DepartmentGroup[]>(() => {
    const map = new Map<string, DepartmentGroup>();
    for (const m of mappings) {
      let group = map.get(m.departmentId);
      if (!group) {
        group = {
          departmentId: m.departmentId,
          departmentName: m.departmentName,
          subDepartments: [],
          mappedCount: 0,
          totalCount: 0,
        };
        map.set(m.departmentId, group);
      }
      group.subDepartments.push(m);
      group.totalCount++;
      if (m.revenueAccountId) group.mappedCount++;
    }
    return Array.from(map.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  }, [mappings]);

  const toggleDept = (deptId: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  // Compute how many unmapped rows have available suggestions
  // NOTE: all hooks must be above early returns to satisfy Rules of Hooks
  const suggestionsAvailable = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return 0;
    let count = 0;
    const revAccounts = allAccounts.filter((a) => a.accountType === 'revenue');
    for (const m of mappings) {
      if (m.revenueAccountId) continue; // already mapped
      const suggestion = getSuggestedAccount(revAccounts, m.subDepartmentName, 'revenue');
      if (suggestion) count++;
    }
    return count;
  }, [mappings, allAccounts]);

  const handleSave = async (mapping: SubDepartmentMapping) => {
    try {
      const res = await saveSubDepartmentDefaults.mutateAsync({
        subDepartmentId: mapping.subDepartmentId,
        revenueAccountId: mapping.revenueAccountId,
        cogsAccountId: mapping.cogsAccountId,
        inventoryAssetAccountId: mapping.inventoryAssetAccountId,
        discountAccountId: mapping.discountAccountId,
        returnsAccountId: mapping.returnsAccountId,
      });
      const d = (res as any)?.data;
      if (d?.autoRemapCount > 0 && d?.autoRemapFailed > 0) {
        toast.info(`Mapping saved. ${d.autoRemapCount} remapped, ${d.autoRemapFailed} failed — check Unmapped Events.`);
      } else if (d?.autoRemapCount > 0) {
        toast.success(`Mapping saved. ${d.autoRemapCount} transaction(s) automatically remapped.`);
      } else if (d?.autoRemapFailed > 0) {
        toast.error(`Mapping saved, but ${d.autoRemapFailed} auto-remap(s) failed — check Unmapped Events.`);
      } else {
        toast.success('Mapping saved');
      }
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleAutoMapAll = async () => {
    if (!allAccounts || allAccounts.length === 0) return;
    setIsAutoMapping(true);
    let mapped = 0;
    let failed = 0;

    const revAccounts = allAccounts.filter((a) => a.accountType === 'revenue');
    const expAccounts = allAccounts.filter((a) => a.accountType === 'expense');
    const assetAccounts = allAccounts.filter((a) => a.accountType === 'asset');

    for (const m of mappings) {
      if (m.revenueAccountId) continue; // skip already mapped

      const revSuggestion = getSuggestedAccount(revAccounts, m.subDepartmentName, 'revenue');
      const cogsSuggestion = getSuggestedAccount(expAccounts, m.subDepartmentName, 'cogs');
      const invSuggestion = getSuggestedAccount(assetAccounts, m.subDepartmentName, 'inventory');
      const retSuggestion = getSuggestedAccount(revAccounts, m.subDepartmentName, 'returns');

      // Only save if at least a revenue suggestion exists
      if (revSuggestion) {
        try {
          await saveSubDepartmentDefaults.mutateAsync({
            subDepartmentId: m.subDepartmentId,
            revenueAccountId: revSuggestion.id,
            cogsAccountId: cogsSuggestion?.id ?? m.cogsAccountId,
            inventoryAssetAccountId: invSuggestion?.id ?? m.inventoryAssetAccountId,
            discountAccountId: m.discountAccountId,
            returnsAccountId: retSuggestion?.id ?? m.returnsAccountId,
          });
          mapped++;
        } catch {
          failed++;
        }
      }
    }

    setIsAutoMapping(false);
    mutate();

    if (mapped > 0 && failed === 0) {
      toast.success(`Auto-mapped ${mapped} sub-department${mapped !== 1 ? 's' : ''}`);
    } else if (mapped > 0 && failed > 0) {
      toast.info(`Auto-mapped ${mapped}, ${failed} failed`);
    } else if (failed > 0) {
      toast.error(`Auto-mapping failed for ${failed} sub-department${failed !== 1 ? 's' : ''}`);
    }
  };

  // ── Early returns (after all hooks) ──────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <AccountingEmptyState
        title="No sub-departments found"
        description="Configure departments and sub-departments in the Catalog module first. Sub-departments are used to group items for GL posting."
      />
    );
  }

  const infoBanner = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-500 mb-4">
      <div className="flex items-center gap-2">
        <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-500" />
        Sub-department revenue mappings are used by both Retail POS and F&amp;B POS.
      </div>
      {suggestionsAvailable > 0 && (
        <button
          type="button"
          onClick={handleAutoMapAll}
          disabled={isAutoMapping}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          {isAutoMapping
            ? 'Mapping...'
            : `Auto-Map ${suggestionsAvailable} Suggested`}
        </button>
      )}
    </div>
  );

  // Detect if this is a flat (2-level) hierarchy: all groups are self-grouped
  const isFlat = grouped.every(
    (d) => d.totalCount === 1 && d.subDepartments[0]?.subDepartmentId === d.departmentId,
  );

  // Flat mode: render a single table without collapsible groups
  if (isFlat) {
    return (
      <>
      {infoBanner}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Department
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Revenue Account
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                COGS Account
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Inventory Asset
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Returns Account
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((dept) => {
              const m = dept.subDepartments[0]!;
              const isMapped = !!m.revenueAccountId;
              return (
                <SubDepartmentRow
                  key={m.subDepartmentId}
                  mapping={m}
                  isMapped={isMapped}
                  isItemsExpanded={expandedItems === m.subDepartmentId}
                  onToggleItems={() =>
                    setExpandedItems(
                      expandedItems === m.subDepartmentId ? null : m.subDepartmentId,
                    )
                  }
                  onSave={handleSave}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      </>
    );
  }

  // Grouped mode: collapsible department sections with sub-department rows
  return (
    <div className="space-y-4">
      {infoBanner}
      {grouped.map((dept) => {
        const isExpanded = expandedDepts.has(dept.departmentId);
        const allMapped = dept.mappedCount === dept.totalCount;

        return (
          <div
            key={dept.departmentId}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            {/* Department Header */}
            <button
              type="button"
              onClick={() => toggleDept(dept.departmentId)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-foreground">
                  {dept.departmentName}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({dept.totalCount} sub-dept{dept.totalCount !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    allMapped
                      ? 'bg-green-500/20 text-green-500'
                      : dept.mappedCount > 0
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-red-500/20 text-red-500'
                  }`}
                >
                  {dept.mappedCount}/{dept.totalCount} mapped
                </span>
              </div>
            </button>

            {/* Sub-Department Rows */}
            {isExpanded && (
              <div className="border-t border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Sub-Department
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Revenue Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        COGS Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Inventory Asset
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Returns Account
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dept.subDepartments.map((m) => {
                      const isMapped = !!m.revenueAccountId;

                      return (
                        <SubDepartmentRow
                          key={m.subDepartmentId}
                          mapping={m}
                          isMapped={isMapped}
                          isItemsExpanded={expandedItems === m.subDepartmentId}
                          onToggleItems={() =>
                            setExpandedItems(
                              expandedItems === m.subDepartmentId ? null : m.subDepartmentId,
                            )
                          }
                          onSave={handleSave}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-Department Row with Drill-Down ──────────────────────

function SubDepartmentRow({
  mapping,
  isMapped,
  isItemsExpanded,
  onToggleItems,
  onSave,
}: {
  mapping: SubDepartmentMapping;
  isMapped: boolean;
  isItemsExpanded: boolean;
  onToggleItems: () => void;
  onSave: (m: SubDepartmentMapping) => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-border last:border-0 ${
          !isMapped ? 'bg-amber-500/5' : ''
        }`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-medium text-foreground">{mapping.subDepartmentName}</div>
              {mapping.itemCount > 0 ? (
                <button
                  type="button"
                  onClick={onToggleItems}
                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400"
                >
                  <Package aria-hidden="true" className="h-3 w-3" />
                  {mapping.itemCount} item{mapping.itemCount !== 1 ? 's' : ''}
                  {isItemsExpanded ? (
                    <ChevronDown aria-hidden="true" className="h-3 w-3" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">No items</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <AccountPicker
            value={mapping.revenueAccountId}
            onChange={(v) => onSave({ ...mapping, revenueAccountId: v })}
            accountTypes={['revenue']}
            suggestFor={mapping.subDepartmentName}
            mappingRole="revenue"
            className="w-48"
          />
        </td>
        <td className="px-4 py-3">
          <AccountPicker
            value={mapping.cogsAccountId}
            onChange={(v) => onSave({ ...mapping, cogsAccountId: v })}
            accountTypes={['expense']}
            suggestFor={mapping.subDepartmentName}
            mappingRole="cogs"
            className="w-48"
          />
        </td>
        <td className="px-4 py-3">
          <AccountPicker
            value={mapping.inventoryAssetAccountId}
            onChange={(v) => onSave({ ...mapping, inventoryAssetAccountId: v })}
            accountTypes={['asset']}
            suggestFor={mapping.subDepartmentName}
            mappingRole="inventory"
            className="w-48"
          />
        </td>
        <td className="px-4 py-3">
          <AccountPicker
            value={mapping.returnsAccountId}
            onChange={(v) => onSave({ ...mapping, returnsAccountId: v })}
            accountTypes={['revenue']}
            suggestFor={mapping.subDepartmentName}
            mappingRole="returns"
            className="w-48"
          />
        </td>
        <td className="px-4 py-3 text-center">
          {isMapped ? (
            <CheckCircle aria-hidden="true" className="inline h-5 w-5 text-green-500" />
          ) : (
            <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-500">
              Not Mapped
            </span>
          )}
        </td>
      </tr>
      {isItemsExpanded && (
        <tr>
          <td colSpan={6} className="px-0 py-0">
            <ItemsDrillDown subDepartmentId={mapping.subDepartmentId} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Items Drill-Down ────────────────────────────────────────

function ItemsDrillDown({ subDepartmentId }: { subDepartmentId: string }) {
  const { items, isLoading } = useSubDepartmentItems(subDepartmentId);

  if (isLoading) {
    return (
      <div className="px-8 py-3">
        <div className="h-8 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-8 py-3 text-xs text-muted-foreground">
        No active items in this sub-department.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-8 py-1.5 text-left text-xs font-medium text-muted-foreground">
              Item
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
              SKU
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
              Category
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">
              Type
            </th>
            <th className="px-4 py-1.5 text-right text-xs font-medium text-muted-foreground">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0">
              <td className="px-8 py-1.5 text-xs text-foreground">{item.name}</td>
              <td className="px-4 py-1.5 text-xs font-mono text-muted-foreground">
                {item.sku ?? '—'}
              </td>
              <td className="px-4 py-1.5 text-xs text-muted-foreground">{item.categoryName}</td>
              <td className="px-4 py-1.5 text-xs text-muted-foreground capitalize">
                {item.itemType.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-1.5 text-right text-xs tabular-nums text-foreground">
                ${Number(item.defaultPrice).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payment Type Mappings (Enhanced with Transaction Type Registry) ──

interface CategoryGroup {
  category: TransactionTypeCategory;
  label: string;
  types: TransactionTypeMapping[];
  mappedCount: number;
  totalCount: number;
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  backfilled: { label: 'Backfilled', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  auto: { label: 'Auto', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
};

/** Resolve the AccountPicker filter types for a given DebitKind or CreditKind */
function getDebitAccountTypes(code: string): readonly string[] {
  const sysType = getSystemTransactionType(code);
  if (!sysType) return ['asset'];
  return DEBIT_KIND_ACCOUNT_FILTER[sysType.defaultDebitKind as DebitKind] ?? ['asset'];
}

function getCreditAccountTypes(code: string): readonly string[] {
  const sysType = getSystemTransactionType(code);
  if (!sysType) return ['revenue'];
  return CREDIT_KIND_ACCOUNT_FILTER[sysType.defaultCreditKind as CreditKind] ?? ['revenue'];
}

function isDebitDisabled(code: string): boolean {
  const sysType = getSystemTransactionType(code);
  return sysType?.defaultDebitKind === 'none';
}

function isCreditDisabled(code: string): boolean {
  const sysType = getSystemTransactionType(code);
  return sysType?.defaultCreditKind === 'none';
}

/** Tooltip text for disabled pickers */
function getDebitDisabledTooltip(category: string): string {
  switch (category) {
    case 'revenue': return 'Revenue type \u2014 debit side determined by payment method';
    case 'tax': return 'Tax type \u2014 debit side determined by payment method';
    case 'tip': return 'Tip type \u2014 debit side determined by payment method';
    default: return 'Debit account not applicable for this type';
  }
}

function getCreditDisabledTooltip(category: string): string {
  switch (category) {
    case 'tender': return 'Tender type \u2014 credit postings come from Sub-Department / Tax Group mappings';
    default: return 'Credit account not applicable for this type';
  }
}

/** Map mapping role for AccountPicker suggestions */
function getDebitMappingRole(code: string): 'cash' | 'clearing' | 'expense' | undefined {
  const sysType = getSystemTransactionType(code);
  if (!sysType) return 'cash';
  switch (sysType.defaultDebitKind) {
    case 'cash_bank': return 'cash';
    case 'clearing': return 'clearing';
    case 'expense': case 'contra_revenue': return 'expense';
    default: return undefined;
  }
}

function getCreditMappingRole(code: string): 'revenue' | 'tax' | undefined {
  const sysType = getSystemTransactionType(code);
  if (!sysType) return 'revenue';
  switch (sysType.defaultCreditKind) {
    case 'revenue': return 'revenue';
    case 'tax_payable': case 'tips_payable': case 'deposit_liability': return 'tax';
    default: return undefined;
  }
}

function PaymentTypeMappingsTab() {
  const { data: allTypes, isLoading, error, mutate } = useTransactionTypeMappings();
  const { saveTransactionTypeMapping, deleteTransactionTypeMapping } = useMappingMutations();
  const { toast } = useToast();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['tender']));
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Load all accounts for auto-map suggestions
  const { data: allAccounts } = useGLAccounts({ isActive: true });

  const grouped = useMemo<CategoryGroup[]>(() => {
    const map = new Map<TransactionTypeCategory, CategoryGroup>();
    for (const t of allTypes) {
      let group = map.get(t.category);
      if (!group) {
        group = {
          category: t.category,
          label: TRANSACTION_TYPE_CATEGORY_LABELS[t.category] ?? t.category,
          types: [],
          mappedCount: 0,
          totalCount: 0,
        };
        map.set(t.category, group);
      }
      group.types.push(t);
      group.totalCount++;
      if (t.isMapped || isAutoPostedType(t.code)) group.mappedCount++;
    }
    return TRANSACTION_TYPE_CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => map.get(cat)!);
  }, [allTypes]);

  // Count suggestions available for auto-map
  const suggestionsAvailable = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return 0;
    let count = 0;
    for (const t of allTypes) {
      if (t.isMapped || isAutoPostedType(t.code)) continue;
      const rule = getMappedStatusRule(t.category);
      // For debit-driven types, look for asset accounts
      if (rule === 'debit' || rule === 'both') {
        const debitTypes = getDebitAccountTypes(t.code) as string[];
        const candidates = allAccounts.filter((a) => debitTypes.includes(a.accountType));
        const suggestion = getSuggestedAccount(candidates, t.name, getDebitMappingRole(t.code) ?? 'cash');
        if (suggestion) { count++; continue; }
      }
      // For credit-driven types, look for revenue/liability accounts
      if (rule === 'credit' || rule === 'both') {
        const creditTypes = getCreditAccountTypes(t.code) as string[];
        const candidates = allAccounts.filter((a) => creditTypes.includes(a.accountType));
        const suggestion = getSuggestedAccount(candidates, t.name, getCreditMappingRole(t.code) ?? 'revenue');
        if (suggestion) { count++; continue; }
      }
    }
    return count;
  }, [allTypes, allAccounts]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleSaveMapping = async (
    t: TransactionTypeMapping,
    patch: { creditAccountId?: string | null; debitAccountId?: string | null },
  ) => {
    try {
      await saveTransactionTypeMapping.mutateAsync({
        code: t.code,
        creditAccountId: patch.creditAccountId !== undefined ? patch.creditAccountId : t.creditAccountId,
        debitAccountId: patch.debitAccountId !== undefined ? patch.debitAccountId : t.debitAccountId,
      });
      toast.success('Mapping saved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDeleteMapping = async (t: TransactionTypeMapping) => {
    try {
      await deleteTransactionTypeMapping.mutateAsync({ code: t.code });
      toast.success('Mapping cleared');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear mapping');
    }
  };

  const handleAutoMapAll = async () => {
    if (!allAccounts || allAccounts.length === 0) return;
    setIsAutoMapping(true);
    let mapped = 0;
    let failed = 0;

    for (const t of allTypes) {
      if (t.isMapped || isAutoPostedType(t.code)) continue;
      const rule = getMappedStatusRule(t.category);
      let debitId: string | null = t.debitAccountId;
      let creditId: string | null = t.creditAccountId;

      if ((rule === 'debit' || rule === 'both') && !debitId && !isDebitDisabled(t.code)) {
        const debitTypes = getDebitAccountTypes(t.code) as string[];
        const candidates = allAccounts.filter((a) => debitTypes.includes(a.accountType));
        const suggestion = getSuggestedAccount(candidates, t.name, getDebitMappingRole(t.code) ?? 'cash');
        if (suggestion) debitId = suggestion.id;
      }
      if ((rule === 'credit' || rule === 'both') && !creditId && !isCreditDisabled(t.code)) {
        const creditTypes = getCreditAccountTypes(t.code) as string[];
        const candidates = allAccounts.filter((a) => creditTypes.includes(a.accountType));
        const suggestion = getSuggestedAccount(candidates, t.name, getCreditMappingRole(t.code) ?? 'revenue');
        if (suggestion) creditId = suggestion.id;
      }

      // Only save if we found at least one new account
      if (debitId === t.debitAccountId && creditId === t.creditAccountId) continue;

      try {
        await saveTransactionTypeMapping.mutateAsync({
          code: t.code,
          creditAccountId: creditId,
          debitAccountId: debitId,
        });
        mapped++;
      } catch {
        failed++;
      }
    }

    setIsAutoMapping(false);
    mutate();

    if (mapped > 0 && failed === 0) {
      toast.success(`Auto-mapped ${mapped} type${mapped !== 1 ? 's' : ''}`);
    } else if (mapped > 0) {
      toast.info(`Auto-mapped ${mapped}, ${failed} failed`);
    } else if (failed > 0) {
      toast.error(`Auto-mapping failed for ${failed} type${failed !== 1 ? 's' : ''}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <AccountingEmptyState
          title="Failed to load transaction types"
          description={error instanceof Error ? error.message : 'Unknown error loading transaction types. Check browser console.'}
        />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (allTypes.length === 0) {
    return (
      <AccountingEmptyState
        title="No transaction types found"
        description="Run the database migration to seed the transaction type registry."
      />
    );
  }

  const totalMapped = grouped.reduce((s, g) => s + g.mappedCount, 0);
  const totalTypes = grouped.reduce((s, g) => s + g.totalCount, 0);

  return (
    <div className="space-y-4">
      {/* Info banner + actions */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-500">
        <div className="flex items-center gap-2">
          <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-500" />
          <span>
            {totalMapped}/{totalTypes} transaction types mapped to GL accounts.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {suggestionsAvailable > 0 && (
            <button
              type="button"
              onClick={handleAutoMapAll}
              disabled={isAutoMapping}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              {isAutoMapping ? 'Mapping...' : `Auto-Map ${suggestionsAvailable} Suggested`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/40 px-3 py-1.5 text-sm font-medium text-indigo-500 transition-colors hover:bg-indigo-500/10"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Add Custom Type
          </button>
        </div>
      </div>

      {/* Category groups */}
      {grouped.map((group) => {
        const isExpanded = expandedCategories.has(group.category);
        const allMapped = group.mappedCount === group.totalCount;

        return (
          <div
            key={group.category}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(group.category)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-foreground">
                  {group.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({group.totalCount} type{group.totalCount !== 1 ? 's' : ''})
                </span>
              </div>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  allMapped
                    ? 'bg-green-500/20 text-green-500'
                    : group.mappedCount > 0
                      ? 'bg-amber-500/20 text-amber-500'
                      : 'bg-red-500/20 text-red-500'
                }`}
              >
                {group.mappedCount}/{group.totalCount} mapped
              </span>
            </button>

            {/* Type Rows */}
            {isExpanded && (
              <div className="border-t border-border">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted">
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Transaction Type
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Credit Account
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Debit Account
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">
                          Status
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-12">
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.types.map((t) => (
                        <TransactionTypeRow
                          key={t.id}
                          type={t}
                          onSave={handleSaveMapping}
                          onDelete={handleDeleteMapping}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <CreateTenderTypeDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </div>
  );
}

// ── Transaction Type Row ──────────────────────────────────────

function TransactionTypeRow({
  type: t,
  onSave,
  onDelete,
}: {
  type: TransactionTypeMapping;
  onSave: (t: TransactionTypeMapping, patch: { creditAccountId?: string | null; debitAccountId?: string | null }) => void;
  onDelete: (t: TransactionTypeMapping) => void;
}) {
  const debitDisabled = isDebitDisabled(t.code);
  const creditDisabled = isCreditDisabled(t.code);
  const autoPosted = isAutoPostedType(t.code);
  const hasMappingRow = t.creditAccountId != null || t.debitAccountId != null;
  const sourceBadge = t.mappingSource ? SOURCE_BADGE[t.mappingSource] : null;

  const isPartial = !t.isMapped && !autoPosted && (t.creditAccountId != null || t.debitAccountId != null);

  return (
    <tr
      className={`border-b border-border last:border-0 ${
        !t.isMapped && !autoPosted ? 'bg-amber-500/5' : ''
      }`}
    >
      {/* Type info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">{t.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-mono text-muted-foreground">{t.code}</span>
              {!t.isSystem && (
                <span className="inline-flex rounded-full bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0 text-[10px] font-medium text-indigo-500">
                  Custom
                </span>
              )}
              {sourceBadge && (
                <span className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${sourceBadge.color}`}>
                  {sourceBadge.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Credit Account */}
      <td className="px-4 py-3">
        {creditDisabled ? (
          <div className="group relative flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <span>N/A</span>
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden w-56 rounded-lg border border-border bg-surface p-2 text-xs text-muted-foreground shadow-lg group-hover:block z-10">
              {getCreditDisabledTooltip(t.category)}
            </div>
          </div>
        ) : (
          <AccountPicker
            value={t.creditAccountId}
            onChange={(v) => onSave(t, { creditAccountId: v })}
            accountTypes={getCreditAccountTypes(t.code) as AccountType[]}
            suggestFor={t.name}
            mappingRole={getCreditMappingRole(t.code)}
            className="w-52"
          />
        )}
      </td>

      {/* Debit Account */}
      <td className="px-4 py-3">
        {debitDisabled ? (
          <div className="group relative flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <span>N/A</span>
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden w-56 rounded-lg border border-border bg-surface p-2 text-xs text-muted-foreground shadow-lg group-hover:block z-10">
              {getDebitDisabledTooltip(t.category)}
            </div>
          </div>
        ) : (
          <AccountPicker
            value={t.debitAccountId}
            onChange={(v) => onSave(t, { debitAccountId: v })}
            accountTypes={getDebitAccountTypes(t.code) as AccountType[]}
            suggestFor={t.name}
            mappingRole={getDebitMappingRole(t.code)}
            className="w-52"
          />
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3 text-center">
        {t.isMapped ? (
          <CheckCircle aria-hidden="true" className="inline h-5 w-5 text-green-500" />
        ) : autoPosted ? (
          <span className="inline-flex rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-xs font-medium text-blue-500">
            Auto
          </span>
        ) : isPartial ? (
          <span className="inline-flex rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-500">
            Partial
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-xs font-medium text-red-500">
            Not Mapped
          </span>
        )}
      </td>

      {/* Reset */}
      <td className="px-4 py-3 text-center">
        {hasMappingRow && (
          <button
            type="button"
            onClick={() => onDelete(t)}
            className="inline-flex items-center rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
            title="Clear mapping"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Tax Group Mappings ───────────────────────────────────────

function TaxGroupMappingsTab() {
  const { data: mappings, isLoading, mutate } = useTaxGroupMappings();
  const { saveTaxGroupDefaults } = useMappingMutations();
  const { data: allAccounts } = useGLAccounts({ isActive: true });
  const { toast } = useToast();
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  const totalMapped = mappings.filter((m) => !!m.taxPayableAccountId).length;

  const suggestionsAvailable = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return 0;
    let count = 0;
    const liabilityAccounts = allAccounts.filter((a) => a.accountType === 'liability');
    for (const m of mappings) {
      if (m.taxPayableAccountId) continue;
      const suggestion = getSuggestedAccount(liabilityAccounts, m.taxGroupName, 'tax');
      if (suggestion) count++;
    }
    return count;
  }, [mappings, allAccounts]);

  const handleAutoMapAll = async () => {
    if (!allAccounts || allAccounts.length === 0) return;
    setIsAutoMapping(true);
    let mapped = 0;
    let failed = 0;

    const liabilityAccounts = allAccounts.filter((a) => a.accountType === 'liability');

    for (const m of mappings) {
      if (m.taxPayableAccountId) continue;
      const suggestion = getSuggestedAccount(liabilityAccounts, m.taxGroupName, 'tax');
      if (suggestion) {
        try {
          await saveTaxGroupDefaults.mutateAsync({
            taxGroupId: m.taxGroupId,
            taxPayableAccountId: suggestion.id,
          });
          mapped++;
        } catch {
          failed++;
        }
      }
    }

    setIsAutoMapping(false);
    mutate();

    if (mapped > 0 && failed === 0) {
      toast.success(`Auto-mapped ${mapped} tax group${mapped !== 1 ? 's' : ''}`);
    } else if (mapped > 0 && failed > 0) {
      toast.info(`Auto-mapped ${mapped}, ${failed} failed`);
    } else if (failed > 0) {
      toast.error(`Auto-mapping failed for ${failed} tax group${failed !== 1 ? 's' : ''}`);
    }
  };

  const handleSave = async (mapping: typeof mappings[number]) => {
    try {
      const res = await saveTaxGroupDefaults.mutateAsync({
        taxGroupId: mapping.taxGroupId,
        taxPayableAccountId: mapping.taxPayableAccountId,
      });
      const d = (res as any)?.data;
      if (d?.autoRemapCount > 0 && d?.autoRemapFailed > 0) {
        toast.info(`Mapping saved. ${d.autoRemapCount} remapped, ${d.autoRemapFailed} failed — check Unmapped Events.`);
      } else if (d?.autoRemapCount > 0) {
        toast.success(`Mapping saved. ${d.autoRemapCount} transaction(s) automatically remapped.`);
      } else if (d?.autoRemapFailed > 0) {
        toast.error(`Mapping saved, but ${d.autoRemapFailed} auto-remap(s) failed — check Unmapped Events.`);
      } else {
        toast.success('Mapping saved');
      }
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  if (mappings.length === 0) {
    return <AccountingEmptyState title="No tax groups configured" description="Tax groups are defined in the Catalog module's tax settings." />;
  }

  return (
    <div className="space-y-4">
      {/* Info banner with coverage + auto-map */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-500">
        <div className="flex items-center gap-2">
          <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-500" />
          <span>
            {totalMapped}/{mappings.length} tax group{mappings.length !== 1 ? 's' : ''} mapped to GL accounts.
          </span>
        </div>
        {suggestionsAvailable > 0 && (
          <button
            type="button"
            onClick={handleAutoMapAll}
            disabled={isAutoMapping}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {isAutoMapping ? 'Mapping...' : `Auto-Map ${suggestionsAvailable} Suggested`}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax Group</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax Payable Account</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => {
                const isMapped = !!m.taxPayableAccountId;
                return (
                  <tr key={m.taxGroupId} className={`border-b border-border last:border-0 ${!isMapped ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{m.taxGroupName}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{m.rate}%</td>
                    <td className="px-4 py-3">
                      <AccountPicker
                        value={m.taxPayableAccountId}
                        onChange={(v) => handleSave({ ...m, taxPayableAccountId: v })}
                        accountTypes={['liability']}
                        suggestFor={m.taxGroupName}
                        mappingRole="tax"
                        className="w-56"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isMapped ? (
                        <CheckCircle aria-hidden="true" className="inline h-5 w-5 text-green-500" />
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-500">
                          Not Mapped
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Discount GL Mappings ──────────────────────────────────────

function DiscountMappingsTab() {
  const { data: mappings, isLoading: mappingsLoading, mutate: refetchMappings } = useDiscountMappings();
  const { data: coverageList, isLoading: coverageLoading, mutate: refetchCoverage } = useDiscountMappingCoverage();
  const { saveDiscountMappingsBatch } = useDiscountMappingMutations();
  const { data: subDeptMappings, isLoading: subDeptsLoading } = useSubDepartmentMappings();
  const { data: allAccounts } = useGLAccounts({ isActive: true });
  const { toast } = useToast();
  const [expandedClassifications, setExpandedClassifications] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const isLoading = mappingsLoading || coverageLoading || subDeptsLoading;

  // Build a lookup: subDeptId → classification → glAccountId
  const mappingLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, string>>();
    for (const m of mappings) {
      let classMap = lookup.get(m.subDepartmentId);
      if (!classMap) {
        classMap = new Map();
        lookup.set(m.subDepartmentId, classMap);
      }
      classMap.set(m.discountClassification, m.glAccountId);
    }
    return lookup;
  }, [mappings]);

  // Deduplicate sub-departments (same logic as DepartmentMappingsTab)
  const subDepartments = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string; departmentName: string }[] = [];
    for (const m of subDeptMappings) {
      if (seen.has(m.subDepartmentId)) continue;
      seen.add(m.subDepartmentId);
      result.push({
        id: m.subDepartmentId,
        name: m.subDepartmentName,
        departmentName: m.departmentName,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [subDeptMappings]);

  // Split classifications by GL treatment
  const contraRevenueClassifications = DISCOUNT_CLASSIFICATIONS.filter(c => c.glTreatment === 'contra_revenue');
  const expenseClassifications = DISCOUNT_CLASSIFICATIONS.filter(c => c.glTreatment === 'expense');

  const toggleClassification = (key: string) => {
    setExpandedClassifications(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async (subDepartmentId: string, classification: string, glAccountId: string | null) => {
    if (!glAccountId) return;
    setIsSaving(true);
    try {
      await saveDiscountMappingsBatch.mutateAsync([
        { subDepartmentId, classification, glAccountId },
      ]);
      toast.success('Discount mapping saved');
      refetchMappings();
      refetchCoverage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Count how many sub-department × classification combos can be auto-mapped
  const discountSuggestionsAvailable = useMemo(() => {
    if (!allAccounts || subDepartments.length === 0) return 0;
    let count = 0;
    for (const sd of subDepartments) {
      for (const def of DISCOUNT_CLASSIFICATIONS) {
        const existing = mappingLookup.get(sd.id)?.get(def.key);
        if (existing) continue;
        const match = allAccounts.find(a => a.accountNumber === def.defaultAccountCode);
        if (match) count++;
      }
    }
    return count;
  }, [allAccounts, subDepartments, mappingLookup]);

  const handleAutoMapDefaults = async () => {
    if (!allAccounts || subDepartments.length === 0) return;
    setIsSaving(true);

    const batch: Array<{ subDepartmentId: string; classification: string; glAccountId: string }> = [];

    for (const sd of subDepartments) {
      for (const def of DISCOUNT_CLASSIFICATIONS) {
        // Skip if already mapped
        const existing = mappingLookup.get(sd.id)?.get(def.key);
        if (existing) continue;

        // Find a matching account by account number
        const match = allAccounts.find(a => a.accountNumber === def.defaultAccountCode);
        if (match) {
          batch.push({
            subDepartmentId: sd.id,
            classification: def.key,
            glAccountId: match.id,
          });
        }
      }
    }

    if (batch.length === 0) {
      toast.info('All sub-departments are already mapped, or no matching GL accounts found');
      setIsSaving(false);
      return;
    }

    try {
      await saveDiscountMappingsBatch.mutateAsync(batch);
      toast.success(`Auto-mapped ${batch.length} discount classification${batch.length !== 1 ? 's' : ''}`);
      refetchMappings();
      refetchCoverage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Auto-map failed');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (subDepartments.length === 0) {
    return (
      <AccountingEmptyState
        title="No sub-departments found"
        description="Configure departments and sub-departments in the Catalog module first. Discount GL mappings are per-sub-department."
      />
    );
  }

  // Compute overall coverage
  const totalMapped = coverageList.reduce((s, c) => s + c.mapped, 0);
  const totalPossible = coverageList.reduce((s, c) => s + c.total, 0);
  const overallPct = totalPossible > 0 ? Math.round((totalMapped / totalPossible) * 100) : 0;

  const renderClassificationGroup = (
    title: string,
    color: string,
    borderColor: string,
    classifications: typeof DISCOUNT_CLASSIFICATIONS,
  ) => (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className={`px-4 py-2 border-b ${borderColor}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {classifications.map(def => {
          const coverage = coverageList.find(c => c.classification === def.key);
          const isExpanded = expandedClassifications.has(def.key);
          const mapped = coverage?.mapped ?? 0;
          const total = coverage?.total ?? subDepartments.length;
          const allMapped = mapped === total && total > 0;

          return (
            <div key={def.key}>
              {/* Classification header row */}
              <button
                type="button"
                onClick={() => toggleClassification(def.key)}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="text-left">
                    <div className="text-sm font-medium text-foreground">{def.label}</div>
                    <div className="text-xs text-muted-foreground">{def.description}</div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {def.defaultAccountCode}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          allMapped ? 'bg-green-500' : mapped > 0 ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: total > 0 ? `${(mapped / total) * 100}%` : '0%' }}
                      />
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        allMapped
                          ? 'bg-green-500/20 text-green-500'
                          : mapped > 0
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-red-500/20 text-red-500'
                      }`}
                    >
                      {mapped}/{total}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded: sub-department mapping rows */}
              {isExpanded && (
                <div className="border-t border-border bg-muted">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Sub-Department
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          GL Account
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground w-16">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {subDepartments.map(sd => {
                        const accountId = mappingLookup.get(sd.id)?.get(def.key) ?? null;
                        const isMapped = !!accountId;
                        return (
                          <tr
                            key={sd.id}
                            className={`border-b border-border last:border-0 ${!isMapped ? 'bg-amber-500/5' : ''}`}
                          >
                            <td className="px-6 py-2.5">
                              <div className="text-sm text-foreground">{sd.name}</div>
                              <div className="text-xs text-muted-foreground">{sd.departmentName}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              <AccountPicker
                                value={accountId}
                                onChange={(v) => handleSave(sd.id, def.key, v)}
                                accountTypes={def.glTreatment === 'contra_revenue' ? ['revenue'] : ['expense']}
                                suggestFor={def.label}
                                mappingRole={def.glTreatment === 'contra_revenue' ? 'discount' : 'expense'}
                                className="w-52"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {isMapped ? (
                                <CheckCircle aria-hidden="true" className="inline h-4 w-4 text-green-500" />
                              ) : (
                                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Coverage + Auto-Map */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Discount Mapping Coverage</span>
            <span className="text-lg font-bold text-foreground">{overallPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                overallPct === 100 ? 'bg-green-500' : overallPct > 0 ? 'bg-amber-500' : 'bg-red-400'
              }`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {totalMapped} of {totalPossible} classification-level mappings configured across {subDepartments.length} sub-department{subDepartments.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAutoMapDefaults}
          disabled={isSaving || discountSuggestionsAvailable === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          {isSaving ? 'Mapping...' : discountSuggestionsAvailable > 0 ? `Auto-Map ${discountSuggestionsAvailable} Defaults` : 'All Mapped'}
        </button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-500">
        <Info aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          Each discount type posts to its own GL account per sub-department.
          <span className="text-indigo-500/70"> Contra-revenue </span>
          discounts (4100-range) reduce reported revenue.
          <span className="text-indigo-500/70"> Expense </span>
          comps (6150-range) are costs the business absorbs.
        </div>
      </div>

      {/* Contra-Revenue group */}
      {renderClassificationGroup(
        'Contra-Revenue Discounts (reduce reported revenue)',
        'text-blue-500',
        'border-blue-500/30 bg-blue-500/5',
        contraRevenueClassifications,
      )}

      {/* Expense group */}
      {renderClassificationGroup(
        'Expense Comps (costs absorbed by business)',
        'text-amber-500',
        'border-amber-500/30 bg-amber-500/5',
        expenseClassifications,
      )}
    </div>
  );
}

// ── F&B Category Suggestion Helper ──────────────────────────

/** Category-specific GL account suggestion for F&B operational categories. */
function getFnbCategorySuggestion(
  allAccounts: { id: string; name: string; accountNumber: string; controlAccountType?: string | null }[],
  categoryKey: FnbBatchCategoryKey,
): { id: string; name: string } | null {
  const n = (term: string) =>
    allAccounts.find((a) => a.name.toLowerCase().includes(term.toLowerCase())) ?? null;

  switch (categoryKey) {
    case 'tax_payable':
      return n('sales tax payable') ?? allAccounts.find((a) => a.controlAccountType === 'sales_tax') ?? null;
    case 'tips_payable_credit':
    case 'tips_payable_cash':
      return n('tips payable') ?? n('tips undistributed') ?? null;
    case 'auto_gratuity':
      return n('auto-gratuity') ?? n('gratuity') ?? n('tips payable') ?? null;
    case 'service_charge_revenue':
      return n('service charge revenue') ?? n('service charge') ?? null;
    case 'discount':
      return n('discount') ?? n('returns & allowances') ?? null;
    case 'comp_expense':
      return n('comp expense') ?? n('comp') ?? n('giveaway') ?? null;
    case 'cash_on_hand':
      return n('cash on hand') ?? n('operating check') ?? null;
    case 'undeposited_funds':
      return n('undeposited funds') ?? n('merchant clearing') ?? null;
    case 'cash_over_short':
      return n('cash over/short') ?? n('cash over') ?? n('over/short') ?? null;
    case 'processing_fee':
      return n('credit card processing') ?? n('processing fee') ?? n('merchant fee') ?? null;
    default:
      return null;
  }
}

// ── F&B Category Mappings ─────────────────────────────────────

function FnbCategoryMappingsTab({ onNavigateToSubDepartments }: { onNavigateToSubDepartments: () => void }) {
  const { locations } = useAuthContext();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const { data: coverage, isLoading, error, refetch } = useFnbMappingCoverage(locationId || undefined);
  const { saveFnbMapping } = useSaveFnbMapping();
  const { data: glAccounts } = useGLAccounts({ isActive: true });
  const { toast } = useToast();
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  const suggestionsAvailable = useMemo(() => {
    if (!coverage?.categories || !glAccounts?.length) return 0;
    let count = 0;
    for (const cat of coverage.categories) {
      if (cat.key === 'sales_revenue' || cat.isMapped) continue;
      const suggestion = getFnbCategorySuggestion(glAccounts, cat.key as FnbBatchCategoryKey);
      if (suggestion) count++;
    }
    return count;
  }, [coverage, glAccounts]);

  const handleAutoMapAll = async () => {
    if (!coverage?.categories || !glAccounts?.length || !locationId) return;
    setIsAutoMapping(true);
    let mapped = 0;
    try {
      for (const cat of coverage.categories) {
        if (cat.key === 'sales_revenue' || cat.isMapped) continue;
        const config = FNB_CATEGORY_CONFIG[cat.key as FnbBatchCategoryKey];
        if (!config) continue;
        const suggestion = getFnbCategorySuggestion(glAccounts, cat.key as FnbBatchCategoryKey);
        if (!suggestion) continue;

        const mapping: Record<string, string | null> = {
          locationId,
          entityType: config.entityType,
        };
        mapping[config.mappingColumn] = suggestion.id;

        try {
          await saveFnbMapping(mapping as any);
          mapped++;
        } catch {
          // skip individual failures
        }
      }
      if (mapped > 0) {
        toast.success(`Auto-mapped ${mapped} F&B categor${mapped === 1 ? 'y' : 'ies'}`);
        refetch();
      } else {
        toast.info('No matching accounts found for unmapped categories');
      }
    } finally {
      setIsAutoMapping(false);
    }
  };

  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.name })),
    [locations],
  );

  const handleSave = async (
    categoryKey: FnbBatchCategoryKey,
    accountId: string | null,
  ) => {
    if (!locationId) return;
    const config = FNB_CATEGORY_CONFIG[categoryKey];

    try {
      const mapping: Record<string, string | null> = {
        locationId,
        entityType: config.entityType,
      };

      // Set the right column based on the category config
      switch (config.mappingColumn) {
        case 'revenueAccountId':
          mapping.revenueAccountId = accountId;
          break;
        case 'expenseAccountId':
          mapping.expenseAccountId = accountId;
          break;
        case 'liabilityAccountId':
          mapping.liabilityAccountId = accountId;
          break;
        case 'assetAccountId':
          mapping.assetAccountId = accountId;
          break;
        case 'contraRevenueAccountId':
          mapping.contraRevenueAccountId = accountId;
          break;
      }

      await saveFnbMapping(mapping as any);
      toast.success('F&B mapping saved');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const mappingRoleForColumn = (col: string): 'revenue' | 'cogs' | 'tax' | 'cash' | 'discount' | undefined => {
    switch (col) {
      case 'revenueAccountId': return 'revenue';
      case 'expenseAccountId': return 'cogs';
      case 'liabilityAccountId': return 'tax';
      case 'assetAccountId': return 'cash';
      case 'contraRevenueAccountId': return 'discount';
      default: return undefined;
    }
  };

  const accountTypeFilter = (col: string): AccountType[] => {
    switch (col) {
      case 'revenueAccountId':
        return ['revenue'];
      case 'expenseAccountId':
        return ['expense'];
      case 'liabilityAccountId':
        return ['liability'];
      case 'assetAccountId':
        return ['asset'];
      case 'contraRevenueAccountId':
        return ['revenue'];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      {/* Location selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-foreground">Location</label>
        <Select
          options={locationOptions}
          value={locationId}
          onChange={(v) => setLocationId(v as string)}
          className="w-64"
        />
      </div>

      {!locationId && (
        <p className="text-sm text-muted-foreground">Select a location to configure F&B GL mappings.</p>
      )}

      {/* Auto-map banner */}
      {locationId && coverage && suggestionsAvailable > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
          <div className="flex items-start gap-2 text-sm text-indigo-500">
            <Info aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              F&B operational categories map tips, comps, cash variance, and processing fees to GL accounts.
              {' '}<strong>{suggestionsAvailable}</strong> unmapped categor{suggestionsAvailable === 1 ? 'y has' : 'ies have'} suggested matches.
            </span>
          </div>
          <button
            type="button"
            onClick={handleAutoMapAll}
            disabled={isAutoMapping}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {isAutoMapping ? 'Mapping...' : `Auto-Map ${suggestionsAvailable} Suggested`}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-500">Failed to load F&B mapping coverage</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'An unexpected error occurred. The fnb_gl_account_mappings table may not exist — ensure migration 0104 has been run.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 rounded-md bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/20 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {coverage && (
        <>
          {/* Coverage progress */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Overall Coverage</span>
                <span className="font-medium text-foreground">
                  {coverage.mappedCount}/{coverage.totalCount}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    coverage.mappedCount === coverage.totalCount
                      ? 'bg-green-500'
                      : coverage.mappedCount > 0
                        ? 'bg-amber-500'
                        : 'bg-red-400'
                  }`}
                  style={{
                    width: `${coverage.coveragePercent}%`,
                  }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{coverage.coveragePercent}%</div>
              <div className="text-xs text-muted-foreground">
                Critical: {coverage.criticalMappedCount}/{coverage.criticalTotalCount}
              </div>
            </div>
          </div>

          {/* Category table */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      GL Account
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.categories.map((cat) => {
                    const config = FNB_CATEGORY_CONFIG[cat.key as FnbBatchCategoryKey];
                    return (
                      <tr
                        key={cat.key}
                        className={`border-b border-border last:border-0 ${
                          cat.key === 'sales_revenue' ? '' :
                          !cat.isMapped && cat.critical ? 'bg-red-500/5' : !cat.isMapped ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{cat.label}</span>
                            {cat.critical && (
                              <span className="inline-flex rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          {cat.key === 'sales_revenue' ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-500 shrink-0" />
                              <span>Resolved via</span>
                              <button
                                type="button"
                                onClick={onNavigateToSubDepartments}
                                className="text-indigo-500 hover:text-indigo-400 font-medium"
                              >
                                Sub-Departments
                              </button>
                            </div>
                          ) : config ? (
                            <AccountPicker
                              value={cat.accountId}
                              onChange={(v) => handleSave(cat.key as FnbBatchCategoryKey, v)}
                              accountTypes={accountTypeFilter(config.mappingColumn)}
                              suggestFor={cat.label}
                              mappingRole={mappingRoleForColumn(config.mappingColumn)}
                              className="w-56"
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cat.key === 'sales_revenue' || cat.isMapped ? (
                            <CheckCircle aria-hidden="true" className="inline h-5 w-5 text-green-500" />
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                cat.critical
                                  ? 'bg-red-500/20 text-red-500'
                                  : 'bg-amber-500/20 text-amber-500'
                              }`}
                            >
                              {cat.critical ? 'Missing' : 'Not Mapped'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Unmapped Events (Smart Resolution) ──────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  sub_department: 'Revenue Accounts',
  payment_type: 'Payment Types',
  tax_group: 'Tax Groups',
  discount_account: 'Discount Accounts',
  tips_payable_account: 'Tips Payable',
  service_charge_account: 'Service Charge',
  posting_error: 'Posting Errors',
  no_line_detail: 'Missing Line Detail',
};

const ENTITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  sub_department: <Layers className="h-4 w-4 text-indigo-500" />,
  payment_type: <CreditCard className="h-4 w-4 text-blue-500" />,
  tax_group: <Receipt className="h-4 w-4 text-amber-500" />,
  discount_account: <Tag className="h-4 w-4 text-orange-500" />,
  tips_payable_account: <HandCoins className="h-4 w-4 text-green-500" />,
  service_charge_account: <DollarSign className="h-4 w-4 text-teal-500" />,
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  high: { bg: 'bg-green-500/10', text: 'text-green-500', border: '', label: 'Auto-resolve' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: '', label: 'Review suggested' },
  low: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border border-dashed border-red-500/30', label: 'Needs review' },
};

function UnmappedEventsTab() {
  const [view, setView] = useState<'smart' | 'events'>('smart');
  const [statusFilter, setStatusFilter] = useState<'unresolved' | 'resolved' | undefined>('unresolved');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const { data: events, isLoading: eventsLoading, isLoadingMore, hasMore, loadMore, mutate } = useUnmappedEvents({ status: statusFilter });
  const { resolveEvent } = useUnmappedEventMutations();
  const { data: smartData, isLoading: smartLoading, error: smartError, refetch: refetchSmart } = useSmartResolutionSuggestions();
  const applyMutation = useApplySmartResolutions();
  const { toast } = useToast();
  const { data: remappable, refetch: refetchRemappable } = useRemappableTenders();
  const queryClient = useQueryClient();
  const [remapDialogOpen, setRemapDialogOpen] = useState(false);

  const remappableCount = remappable.filter(t => t.canRemap).length;

  // Group suggestions by entity type
  const suggestionGroups = useMemo(() => {
    if (!smartData?.suggestions) return [];
    const map = new Map<string, SmartSuggestion[]>();
    for (const s of smartData.suggestions) {
      const list = map.get(s.entityType) ?? [];
      list.push(s);
      map.set(s.entityType, list);
    }
    return Array.from(map.entries()).map(([type, items]) => {
      const actionable = items.filter((s) => !s.alreadyMapped);
      const autoResolvable = actionable.filter((s) => s.confidence === 'high' || s.confidence === 'medium');
      return {
        type,
        label: ENTITY_TYPE_LABELS[type] ?? type.replace(/_/g, ' '),
        icon: ENTITY_TYPE_ICONS[type] ?? null,
        items,
        totalEvents: items.reduce((sum, s) => sum + s.eventCount, 0),
        actionableCount: actionable.length,
        autoResolvableCount: autoResolvable.length,
      };
    });
  }, [smartData]);

  // Count selected (non-deselected, actionable) suggestions
  const actionableSuggestions = useMemo(() => {
    if (!smartData?.suggestions) return [];
    return smartData.suggestions.filter(
      (s) => !s.alreadyMapped && !deselected.has(`${s.entityType}:${s.entityId}`),
    );
  }, [smartData, deselected]);

  const toggleSuggestion = (s: SmartSuggestion) => {
    const key = `${s.entityType}:${s.entityId}`;
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAutoResolveAll = async () => {
    if (actionableSuggestions.length === 0) return;
    try {
      const result = await applyMutation.mutateAsync(
        actionableSuggestions.map((s) => ({
          entityType: s.entityType,
          entityId: s.entityId,
          suggestedAccountId: s.suggestedAccountId,
        })),
      );
      const parts: string[] = [];
      if (result.mappingsCreated > 0) parts.push(`${result.mappingsCreated} mapping${result.mappingsCreated !== 1 ? 's' : ''} created`);
      if (result.eventsResolved > 0) parts.push(`${result.eventsResolved} event${result.eventsResolved !== 1 ? 's' : ''} resolved`);
      if (result.remapped > 0) parts.push(`${result.remapped} GL entr${result.remapped !== 1 ? 'ies' : 'y'} remapped`);
      if (result.failed > 0) parts.push(`${result.failed} remap${result.failed !== 1 ? 's' : ''} failed`);
      toast.success(parts.join(', ') || 'Smart resolution complete');
      setDeselected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Smart resolution failed');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveEvent.mutateAsync({ id, note: 'Manually resolved' });
      toast.success('Event marked as resolved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve');
    }
  };

  const handleRemapComplete = () => {
    mutate();
    refetchRemappable();
    refetchSmart();
    queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    toast.success('GL entries remapped successfully');
  };

  const isLoading = view === 'smart' ? smartLoading : eventsLoading;

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* View toggle + Remap banner */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView('smart')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              view === 'smart'
                ? 'bg-indigo-500/20 text-indigo-500'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Smart Resolve
          </button>
          <button
            type="button"
            onClick={() => setView('events')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              view === 'events'
                ? 'bg-indigo-500/20 text-indigo-500'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            All Events
          </button>
        </div>
        {remappableCount > 0 && (
          <button
            type="button"
            onClick={() => setRemapDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 px-3 py-1.5 text-sm font-medium text-indigo-500 hover:bg-indigo-500/10"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Remap {remappableCount} GL {remappableCount !== 1 ? 'entries' : 'entry'}
          </button>
        )}
      </div>

      {/* ── Smart Resolve view ── */}
      {view === 'smart' && (
        <>
          {/* Error state */}
          {smartError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Failed to load smart resolution suggestions</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{smartError instanceof Error ? smartError.message : 'An unexpected error occurred'}</p>
                </div>
                <button type="button" onClick={() => refetchSmart()} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent shrink-0">
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Summary banner */}
          {smartData && smartData.suggestions.length > 0 && (() => {
            const actionableEvents = smartData.totalEvents - smartData.skippedErrors;
            const allResolved = actionableSuggestions.length === 0 && smartData.alreadyMapped > 0;
            return (
              <div className={`rounded-lg border p-4 ${allResolved ? 'border-green-500/30 bg-green-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {allResolved
                      ? <CheckCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-green-500 shrink-0" />
                      : <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {allResolved
                          ? 'All mappings are configured'
                          : `${actionableEvents} unmapped event${actionableEvents !== 1 ? 's' : ''}, ${smartData.suggestions.length} suggested mapping${smartData.suggestions.length !== 1 ? 's' : ''}`
                        }
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {allResolved
                          ? `${smartData.alreadyMapped} event${smartData.alreadyMapped !== 1 ? 's' : ''} will auto-resolve on the next POS transaction.`
                          : smartData.autoResolvable > 0
                            ? `${smartData.autoResolvable} event${smartData.autoResolvable !== 1 ? 's' : ''} can be auto-resolved with high-confidence GL account matches.`
                            : 'Review the suggested mappings below and apply them to resolve these events.'
                        }
                        {!allResolved && smartData.alreadyMapped > 0 && ` ${smartData.alreadyMapped} already mapped.`}
                      </p>
                    </div>
                  </div>
                  {actionableSuggestions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoResolveAll}
                      disabled={applyMutation.isPending}
                      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 shrink-0"
                    >
                      {applyMutation.isPending ? (
                        <>
                          <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <CheckCircle aria-hidden="true" className="h-4 w-4" />
                          Auto Resolve All ({actionableSuggestions.length})
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* No events at all */}
          {smartData && smartData.totalEvents === 0 && (
            <AccountingEmptyState
              title="No unmapped events"
              description="All transactions are mapping to GL accounts correctly."
            />
          )}

          {/* Suggestion groups */}
          {suggestionGroups.map((group) => (
            <div key={group.type} className="rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <span className="shrink-0" aria-hidden="true">{group.icon}</span>
                <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                {group.autoResolvableCount > 0 && (
                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-500">
                    {group.autoResolvableCount} of {group.items.length} auto-resolvable
                  </span>
                )}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {group.totalEvents} event{group.totalEvents !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border">
                {group.items.map((suggestion) => {
                  const key = `${suggestion.entityType}:${suggestion.entityId}`;
                  const isSelected = !suggestion.alreadyMapped && !deselected.has(key);
                  const conf = CONFIDENCE_STYLES[suggestion.confidence] ?? CONFIDENCE_STYLES.low!;
                  const isLowConf = suggestion.confidence === 'low' && !suggestion.alreadyMapped;
                  return (
                    <div key={key} className={`flex items-center gap-3 px-4 py-3 ${suggestion.alreadyMapped ? 'opacity-50' : ''} ${isLowConf ? 'bg-red-500/5' : ''}`}>
                      {/* Checkbox */}
                      {!suggestion.alreadyMapped ? (
                        <button
                          type="button"
                          onClick={() => toggleSuggestion(suggestion)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-border bg-surface hover:border-muted-foreground'
                          }`}
                          aria-label={isSelected ? 'Deselect suggestion' : 'Select suggestion'}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <CheckCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-green-500" />
                      )}

                      {/* Entity info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {suggestion.entityName}
                          </span>
                          {!suggestion.alreadyMapped && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.bg} ${conf.text}`}>
                              {conf.label}
                            </span>
                          )}
                          {suggestion.alreadyMapped && (
                            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-500">
                              Mapped
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {suggestion.alreadyMapped
                            ? `Mapping exists \u2014 apply to resolve ${suggestion.eventCount} stale event${suggestion.eventCount !== 1 ? 's' : ''}`
                            : suggestion.reason}
                        </p>
                      </div>

                      {/* Mapping arrow */}
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />

                      {/* Suggested account */}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-mono font-medium text-foreground">
                          {suggestion.suggestedAccountNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {suggestion.suggestedAccountName}
                        </p>
                      </div>

                      {/* Event count */}
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {suggestion.eventCount} event{suggestion.eventCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Posting errors — retryable via remap */}
          {smartData && smartData.skippedErrors > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-3">
                <Info aria-hidden="true" className="h-5 w-5 text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {smartData.skippedErrors} posting error{smartData.skippedErrors !== 1 ? 's' : ''} can be retried
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    These are GL posting failures from previous attempts. Use the &quot;Preview &amp; Remap GL Entries&quot; button above to retry posting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('events')}
                  className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/10 shrink-0"
                >
                  View Details
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── All Events view ── */}
      {view === 'events' && (
        <>
          <div className="flex gap-2">
            {(['unresolved', 'resolved'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-500/20 text-indigo-500'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {events.length === 0 && (
            <AccountingEmptyState
              title={statusFilter === 'unresolved' ? 'No unmapped events' : 'No resolved events'}
              description={statusFilter === 'unresolved' ? 'All transactions are mapping to GL accounts correctly.' : 'No events have been resolved yet.'}
            />
          )}

          {events.length > 0 && (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {event.reason}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{event.eventType.replace(/_/g, ' ')}</span>
                      <span>·</span>
                      <span>{event.sourceModule}</span>
                      <span>·</span>
                      <span>{new Date(event.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {!event.resolvedAt ? (
                    <button
                      type="button"
                      onClick={() => handleResolve(event.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent shrink-0"
                    >
                      Resolve
                    </button>
                  ) : (
                    <span className="text-xs text-green-500">Resolved</span>
                  )}
                </div>
              ))}

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <RemapPreviewDialog
        open={remapDialogOpen}
        onClose={() => setRemapDialogOpen(false)}
        tenders={remappable}
        onComplete={handleRemapComplete}
      />
    </div>
  );
}
