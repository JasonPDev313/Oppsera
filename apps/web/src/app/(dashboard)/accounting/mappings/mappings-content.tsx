'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
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
import { FNB_CATEGORY_CONFIG, TRANSACTION_TYPE_CATEGORY_LABELS, TRANSACTION_TYPE_CATEGORY_ORDER } from '@oppsera/shared';
import type { FnbBatchCategoryKey } from '@oppsera/shared';
import type { TransactionTypeCategory } from '@oppsera/shared';
import type { SubDepartmentMapping, AccountType, TransactionTypeMapping } from '@/types/accounting';

type TabKey = 'departments' | 'payments' | 'taxes' | 'fnb' | 'unmapped';

export default function MappingsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('departments');
  const { data: coverage } = useMappingCoverage();
  const { data: unmappedEvents } = useUnmappedEvents({ status: 'unresolved' });

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'departments', label: 'Sub-Departments' },
    { key: 'payments', label: 'Payment Types' },
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
        <div className="rounded-lg border border-gray-200 bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Mapping Coverage</h2>
            <span className="text-lg font-bold text-gray-900">{coverage.overallPercentage}%</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Sub-Departments', ...coverage.departments },
              { label: 'Payment Types', ...coverage.paymentTypes },
              { label: 'Tax Groups', ...coverage.taxGroups },
            ].map(({ label, mapped, total }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium text-gray-900">{mapped}/{total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      total === 0 ? 'bg-gray-300' :
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
            <div className="flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/40 p-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Items without GL mappings will not post to the General Ledger.
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
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
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-800 mb-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 shrink-0 text-indigo-500" />
        Sub-department revenue mappings are used by both Retail POS and F&amp;B POS.
      </div>
      {suggestionsAvailable > 0 && (
        <button
          type="button"
          onClick={handleAutoMapAll}
          disabled={isAutoMapping}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
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
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Department
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Revenue Account
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                COGS Account
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Inventory Asset
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Returns Account
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 w-20">
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
            className="overflow-hidden rounded-lg border border-gray-200 bg-surface"
          >
            {/* Department Header */}
            <button
              type="button"
              onClick={() => toggleDept(dept.departmentId)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-200/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {dept.departmentName}
                </span>
                <span className="text-xs text-gray-500">
                  ({dept.totalCount} sub-dept{dept.totalCount !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    allMapped
                      ? 'bg-green-100 text-green-700'
                      : dept.mappedCount > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {dept.mappedCount}/{dept.totalCount} mapped
                </span>
              </div>
            </button>

            {/* Sub-Department Rows */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Sub-Department
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Revenue Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        COGS Account
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Inventory Asset
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Returns Account
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 w-20">
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
        className={`border-b border-gray-100 last:border-0 ${
          !isMapped ? 'bg-amber-500/5' : ''
        }`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-medium text-gray-900">{mapping.subDepartmentName}</div>
              {mapping.itemCount > 0 ? (
                <button
                  type="button"
                  onClick={onToggleItems}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  <Package className="h-3 w-3" />
                  {mapping.itemCount} item{mapping.itemCount !== 1 ? 's' : ''}
                  {isItemsExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="text-xs text-gray-400">No items</span>
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
            <CheckCircle className="inline h-5 w-5 text-green-500" />
          ) : (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
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
        <div className="h-8 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-8 py-3 text-xs text-gray-500">
        No active items in this sub-department.
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-8 py-1.5 text-left text-xs font-medium text-gray-400">
              Item
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-400">
              SKU
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-400">
              Category
            </th>
            <th className="px-4 py-1.5 text-left text-xs font-medium text-gray-400">
              Type
            </th>
            <th className="px-4 py-1.5 text-right text-xs font-medium text-gray-400">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <td className="px-8 py-1.5 text-xs text-gray-700">{item.name}</td>
              <td className="px-4 py-1.5 text-xs font-mono text-gray-500">
                {item.sku ?? '—'}
              </td>
              <td className="px-4 py-1.5 text-xs text-gray-500">{item.categoryName}</td>
              <td className="px-4 py-1.5 text-xs text-gray-500 capitalize">
                {item.itemType.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-1.5 text-right text-xs tabular-nums text-gray-700">
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

const POSTING_MODE_LABELS: Record<string, { label: string; color: string }> = {
  clearing: { label: 'Clearing', color: 'bg-blue-100 text-blue-700' },
  direct_bank: { label: 'Direct', color: 'bg-green-100 text-green-700' },
  non_cash: { label: 'Non-Cash', color: 'bg-purple-100 text-purple-700' },
};

function PaymentTypeMappingsTab() {
  const { data: allTypes, isLoading, mutate } = useTransactionTypeMappings();
  const { savePaymentTypeDefaults } = useMappingMutations();
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
    // Sort by the canonical category order
    return TRANSACTION_TYPE_CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => map.get(cat)!);
  }, [allTypes]);

  // Count suggestions available for auto-map
  const suggestionsAvailable = useMemo(() => {
    if (!allAccounts || allAccounts.length === 0) return 0;
    let count = 0;
    const assetAccounts = allAccounts.filter((a) => a.accountType === 'asset');
    for (const t of allTypes) {
      if (t.isMapped) continue;
      const suggestion = getSuggestedAccount(assetAccounts, t.name, 'cash');
      if (suggestion) count++;
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

  const handleSave = async (t: TransactionTypeMapping, patch: Partial<{ cashAccountId: string | null; clearingAccountId: string | null; feeExpenseAccountId: string | null; expenseAccountId: string | null; postingMode: string }>) => {
    try {
      const res = await savePaymentTypeDefaults.mutateAsync({
        paymentType: t.code,
        cashAccountId: patch.cashAccountId !== undefined ? patch.cashAccountId : t.cashAccountId,
        clearingAccountId: patch.clearingAccountId !== undefined ? patch.clearingAccountId : t.clearingAccountId,
        feeExpenseAccountId: patch.feeExpenseAccountId !== undefined ? patch.feeExpenseAccountId : t.feeExpenseAccountId,
        expenseAccountId: patch.expenseAccountId !== undefined ? patch.expenseAccountId : t.expenseAccountId,
        postingMode: patch.postingMode ?? t.postingMode ?? 'clearing',
      });
      const d = (res as any)?.data;
      if (d?.autoRemapCount > 0) {
        toast.success(`Mapping saved. ${d.autoRemapCount} transaction(s) automatically remapped.`);
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

    const assetAccounts = allAccounts.filter((a) => a.accountType === 'asset');
    const liabilityAccounts = allAccounts.filter((a) => a.accountType === 'liability');
    const expenseAccounts = allAccounts.filter((a) => a.accountType === 'expense');

    for (const t of allTypes) {
      if (t.isMapped) continue;
      const cashSuggestion = getSuggestedAccount(assetAccounts, t.name, 'cash');
      if (!cashSuggestion) continue;

      const clearingSuggestion = getSuggestedAccount([...assetAccounts, ...liabilityAccounts], t.name, 'clearing');
      const feeSuggestion = getSuggestedAccount(expenseAccounts, t.name, 'fee');

      try {
        await savePaymentTypeDefaults.mutateAsync({
          paymentType: t.code,
          cashAccountId: cashSuggestion.id,
          clearingAccountId: clearingSuggestion?.id ?? t.clearingAccountId,
          feeExpenseAccountId: feeSuggestion?.id ?? t.feeExpenseAccountId,
          postingMode: t.postingMode ?? 'clearing',
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
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
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
      <div className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-indigo-800">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-indigo-500" />
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
              <Sparkles className="h-3.5 w-3.5" />
              {isAutoMapping ? 'Mapping...' : `Auto-Map ${suggestionsAvailable} Suggested`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/40 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
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
            className="overflow-hidden rounded-lg border border-gray-200 bg-surface"
          >
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(group.category)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-200/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {group.label}
                </span>
                <span className="text-xs text-gray-500">
                  ({group.totalCount} type{group.totalCount !== 1 ? 's' : ''})
                </span>
              </div>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  allMapped
                    ? 'bg-green-100 text-green-700'
                    : group.mappedCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {group.mappedCount}/{group.totalCount} mapped
              </span>
            </button>

            {/* Type Rows */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          Cash/Bank Account
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          Clearing Account
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                          Fee Expense
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 w-20">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.types.map((t) => (
                        <TransactionTypeRow
                          key={t.id}
                          type={t}
                          onSave={handleSave}
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
}: {
  type: TransactionTypeMapping;
  onSave: (t: TransactionTypeMapping, patch: Partial<{ cashAccountId: string | null; clearingAccountId: string | null; feeExpenseAccountId: string | null; expenseAccountId: string | null; postingMode: string }>) => void;
}) {
  const mode = t.postingMode ?? 'clearing';
  const modeInfo = POSTING_MODE_LABELS[mode] ?? { label: 'Clearing', color: 'bg-blue-100 text-blue-700' };

  return (
    <tr
      className={`border-b border-gray-100 last:border-0 ${
        !t.isMapped ? 'bg-amber-500/5' : ''
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="text-sm font-medium text-gray-900">{t.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-mono text-gray-400">{t.code}</span>
              {!t.isSystem && (
                <span className="inline-flex rounded-full bg-indigo-100 px-1.5 py-0 text-[10px] font-medium text-indigo-700">
                  Custom
                </span>
              )}
              <span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium ${modeInfo.color}`}>
                {modeInfo.label}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <AccountPicker
          value={t.cashAccountId}
          onChange={(v) => onSave(t, { cashAccountId: v })}
          accountTypes={['asset']}
          suggestFor={t.name}
          mappingRole="cash"
          className="w-48"
        />
      </td>
      <td className="px-4 py-3">
        <AccountPicker
          value={t.clearingAccountId}
          onChange={(v) => onSave(t, { clearingAccountId: v })}
          accountTypes={['asset', 'liability']}
          suggestFor={t.name}
          mappingRole="clearing"
          className="w-48"
        />
      </td>
      <td className="px-4 py-3">
        {mode === 'non_cash' ? (
          <AccountPicker
            value={t.expenseAccountId}
            onChange={(v) => onSave(t, { expenseAccountId: v })}
            accountTypes={['expense']}
            suggestFor={t.name}
            mappingRole="expense"
            className="w-48"
          />
        ) : (
          <AccountPicker
            value={t.feeExpenseAccountId}
            onChange={(v) => onSave(t, { feeExpenseAccountId: v })}
            accountTypes={['expense']}
            suggestFor={t.name}
            mappingRole="fee"
            className="w-48"
          />
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {t.isMapped ? (
          <CheckCircle className="inline h-5 w-5 text-green-500" />
        ) : (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Not Mapped
          </span>
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
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  if (mappings.length === 0) {
    return <AccountingEmptyState title="No tax groups configured" description="Tax groups are defined in the Catalog module's tax settings." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tax Group</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tax Payable Account</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => {
              const isMapped = !!m.taxPayableAccountId;
              return (
                <tr key={m.taxGroupId} className={`border-b border-gray-100 last:border-0 ${!isMapped ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.taxGroupName}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{m.rate}%</td>
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
                      <CheckCircle className="inline h-5 w-5 text-green-500" />
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
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
        <label className="text-sm font-medium text-gray-700">Location</label>
        <Select
          options={locationOptions}
          value={locationId}
          onChange={(v) => setLocationId(v as string)}
          className="w-64"
        />
      </div>

      {!locationId && (
        <p className="text-sm text-gray-500">Select a location to configure F&B GL mappings.</p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {coverage && (
        <>
          {/* Coverage progress */}
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-surface p-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">Overall Coverage</span>
                <span className="font-medium text-gray-900">
                  {coverage.mappedCount}/{coverage.totalCount}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
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
              <div className="text-2xl font-bold text-gray-900">{coverage.coveragePercent}%</div>
              <div className="text-xs text-gray-500">
                Critical: {coverage.criticalMappedCount}/{coverage.criticalTotalCount}
              </div>
            </div>
          </div>

          {/* Category table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      GL Account
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
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
                        className={`border-b border-gray-100 last:border-0 ${
                          cat.key === 'sales_revenue' ? '' :
                          !cat.isMapped && cat.critical ? 'bg-red-500/5' : !cat.isMapped ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                            {cat.critical && (
                              <span className="inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          {cat.key === 'sales_revenue' ? (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                              <span>Resolved via</span>
                              <button
                                type="button"
                                onClick={onNavigateToSubDepartments}
                                className="text-indigo-600 hover:text-indigo-800 font-medium"
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
                            <CheckCircle className="inline h-5 w-5 text-green-500" />
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                cat.critical
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
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
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Remap banner */}
      {remappable.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-indigo-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {remappableCount > 0
                  ? `${remappableCount} transaction${remappableCount !== 1 ? 's' : ''} can be retroactively corrected`
                  : `${remappable.length} transaction${remappable.length !== 1 ? 's' : ''} with unmapped GL entries`}
              </p>
              <p className="text-xs text-indigo-700">
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
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <div key={event.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {event.reason}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
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
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Fix Mapping
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleResolve(event.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Resolve
                  </button>
                </div>
              ) : (
                <span className="text-xs text-green-600">Resolved</span>
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
