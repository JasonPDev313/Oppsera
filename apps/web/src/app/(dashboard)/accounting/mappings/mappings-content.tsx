'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker, getSuggestedAccount } from '@/components/accounting/account-picker';
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
} from '@/hooks/use-mappings';
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
  DEBIT_KIND_ACCOUNT_FILTER,
  CREDIT_KIND_ACCOUNT_FILTER,
  getMappedStatusRule,
} from '@oppsera/shared';
import type {
  FnbBatchCategoryKey,
  TransactionTypeCategory,
  DebitKind,
  CreditKind,
} from '@oppsera/shared';
import type { SubDepartmentMapping, AccountType, TransactionTypeMapping } from '@/types/accounting';

type TabKey = 'departments' | 'payments' | 'taxes' | 'fnb' | 'unmapped';

export default function MappingsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('departments');
  const { data: coverage } = useMappingCoverage();
  const { data: unmappedEvents } = useUnmappedEvents({ status: 'unresolved' });

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'departments', label: 'Sub-Departments' },
    { key: 'payments', label: 'Transaction Types' },
    { key: 'taxes', label: 'Tax Groups' },
    { key: 'fnb', label: 'F&B Categories' },
    { key: 'unmapped', label: 'Unmapped Events', count: unmappedEvents.length },
  ];

  return (
    <AccountingPageShell
      title="GL Account Mappings"
      breadcrumbs={[{ label: 'Mappings' }]}
    >
      {/* Coverage Summary */}
      {coverage && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Mapping Coverage</h2>
            <span className="text-lg font-bold text-foreground">{coverage.overallPercentage}%</span>
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
          {coverage.overallPercentage < 100 && (
            <div className="flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/40 p-2 text-sm text-amber-500">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              Items without GL mappings will not post to the General Ledger.
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
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
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
                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-500"
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
      if (t.isMapped) group.mappedCount++;
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
      if (t.isMapped) continue;
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
      if (t.isMapped) continue;
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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
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
  const hasMappingRow = t.creditAccountId != null || t.debitAccountId != null;
  const sourceBadge = t.mappingSource ? SOURCE_BADGE[t.mappingSource] : null;

  const isPartial = !t.isMapped && (t.creditAccountId != null || t.debitAccountId != null);

  return (
    <tr
      className={`border-b border-border last:border-0 ${
        !t.isMapped ? 'bg-amber-500/5' : ''
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
  const { toast } = useToast();

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
  );
}

// ── F&B Category Mappings ─────────────────────────────────────

function FnbCategoryMappingsTab({ onNavigateToSubDepartments }: { onNavigateToSubDepartments: () => void }) {
  const { locations } = useAuthContext();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const { data: coverage, isLoading, refetch } = useFnbMappingCoverage(locationId || undefined);
  const { saveFnbMapping } = useSaveFnbMapping();
  const { toast } = useToast();

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

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
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
                                className="text-indigo-500 hover:text-indigo-500 font-medium"
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

// ── Unmapped Events ──────────────────────────────────────────

function UnmappedEventsTab() {
  const [statusFilter, setStatusFilter] = useState<'unresolved' | 'resolved' | undefined>('unresolved');
  const { data: events, isLoading, mutate } = useUnmappedEvents({ status: statusFilter });
  const { resolveEvent } = useUnmappedEventMutations();
  const { toast } = useToast();
  const { data: remappable, refetch: refetchRemappable } = useRemappableTenders();
  const [remapDialogOpen, setRemapDialogOpen] = useState(false);

  const remappableCount = remappable.filter(t => t.canRemap).length;

  const handleResolve = async (id: string) => {
    try {
      await resolveEvent.mutateAsync({ id, note: 'Manually resolved' });
      toast.success('Event marked as resolved');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve');
    }
  };

  const handleRemapComplete = () => {
    mutate();
    refetchRemappable();
    toast.success('GL entries remapped successfully');
  };

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Remap banner */}
      {remappable.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
          <div className="flex items-center gap-3">
            <RefreshCw aria-hidden="true" className="h-5 w-5 text-indigo-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {remappableCount > 0
                  ? `${remappableCount} transaction${remappableCount !== 1 ? 's' : ''} can be retroactively corrected`
                  : `${remappable.length} transaction${remappable.length !== 1 ? 's' : ''} with unmapped GL entries`}
              </p>
              <p className="text-xs text-muted-foreground">
                {remappableCount > 0
                  ? 'GL account mappings now exist for these tenders. Preview and remap their GL entries.'
                  : 'Configure the missing mappings above, then return here to remap.'}
              </p>
            </div>
          </div>
          {remappableCount > 0 && (
            <button
              type="button"
              onClick={() => setRemapDialogOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shrink-0"
            >
              Preview & Remap
            </button>
          )}
        </div>
      )}

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
          description={statusFilter === 'unresolved' ? 'All POS transactions are mapping to GL accounts correctly.' : 'No events have been resolved yet.'}
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
                <div className="flex items-center gap-2">
                  <Link
                    href="/accounting/mappings"
                    className="text-sm text-indigo-500 hover:text-indigo-500"
                  >
                    Fix Mapping
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleResolve(event.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    Resolve
                  </button>
                </div>
              ) : (
                <span className="text-xs text-green-500">Resolved</span>
              )}
            </div>
          ))}
        </div>
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
