'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Building,
  Plus,
  Search,
  Package,
  DollarSign,
  TrendingDown,
  Calendar,
  MoreVertical,
  Trash2,
  Edit,
  Calculator,
  AlertCircle,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useFixedAssets, useAssetSummary, useFixedAssetMutations } from '@/hooks/use-fixed-assets';
import type { FixedAssetListItem } from '@oppsera/module-accounting';
import { formatAccountingMoney } from '@/types/accounting';

// ── Constants ────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'building', label: 'Building' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'technology', label: 'Technology' },
  { value: 'leasehold_improvement', label: 'Leasehold Improvement' },
  { value: 'other', label: 'Other' },
] as const;

const ASSET_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'fully_depreciated', label: 'Fully Depreciated' },
  { value: 'disposed', label: 'Disposed' },
] as const;

const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'sum_of_years', label: 'Sum of Years Digits' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  building: 'Building',
  equipment: 'Equipment',
  vehicle: 'Vehicle',
  furniture: 'Furniture',
  technology: 'Technology',
  leasehold_improvement: 'Leasehold Improv.',
  other: 'Other',
};

const METHOD_LABELS: Record<string, string> = {
  straight_line: 'Straight Line',
  declining_balance: 'Declining Balance',
  sum_of_years: 'Sum of Years',
};

// ── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-500/10 text-green-500 border-green-500/30' },
    fully_depreciated: { label: 'Fully Depreciated', className: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    disposed: { label: 'Disposed', className: 'bg-red-500/10 text-red-500 border-red-500/30' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

// ── Category Badge ───────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Actions Dropdown ─────────────────────────────────────────

function ActionsDropdown({
  asset,
  onEdit,
  onDepreciate,
  onDispose,
}: {
  asset: FixedAssetListItem;
  onEdit: () => void;
  onDepreciate: () => void;
  onDispose: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-surface shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <Edit className="h-4 w-4 text-muted-foreground" />
              Edit
            </button>
            {asset.status === 'active' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDepreciate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <Calculator className="h-4 w-4 text-muted-foreground" />
                Depreciate
              </button>
            )}
            {asset.status !== 'disposed' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDispose();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Dispose
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Add Asset Dialog ─────────────────────────────────────────

interface AddAssetDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
}

function AddAssetDialog({ open, onClose, onSave, isSaving }: AddAssetDialogProps) {
  const [assetNumber, setAssetNumber] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('equipment');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [salvageValue, setSalvageValue] = useState('0');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('60');
  const [depreciationMethod, setDepreciationMethod] = useState('straight_line');
  const [locationId, setLocationId] = useState('');
  const [assetGlAccountId, setAssetGlAccountId] = useState('');
  const [depreciationExpenseGlAccountId, setDepreciationExpenseGlAccountId] = useState('');
  const [accumulatedDepreciationGlAccountId, setAccumulatedDepreciationGlAccountId] = useState('');
  const [disposalGlAccountId, setDisposalGlAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!assetNumber.trim()) { setError('Asset number is required'); return; }
    if (!name.trim()) { setError('Name is required'); return; }
    if (!acquisitionCost || Number(acquisitionCost) <= 0) { setError('Acquisition cost must be greater than zero'); return; }
    if (!usefulLifeMonths || Number(usefulLifeMonths) <= 0) { setError('Useful life must be greater than zero'); return; }

    try {
      await onSave({
        assetNumber: assetNumber.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        acquisitionDate,
        acquisitionCost,
        salvageValue: salvageValue || '0',
        usefulLifeMonths: Number(usefulLifeMonths),
        depreciationMethod,
        locationId: locationId.trim() || undefined,
        assetGlAccountId: assetGlAccountId.trim() || undefined,
        depreciationExpenseGlAccountId: depreciationExpenseGlAccountId.trim() || undefined,
        accumulatedDepreciationGlAccountId: accumulatedDepreciationGlAccountId.trim() || undefined,
        disposalGlAccountId: disposalGlAccountId.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-muted-foreground';
  const labelCls = 'block text-sm font-medium text-foreground mb-1';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="p-6 space-y-5">
          <h2 className="text-lg font-semibold text-foreground">Add Fixed Asset</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Row 1: Asset Number + Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Asset Number *</label>
              <input type="text" value={assetNumber} onChange={(e) => setAssetNumber(e.target.value)} className={inputCls} placeholder="FA-001" />
            </div>
            <div>
              <label className={labelCls}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Office Equipment" />
            </div>
          </div>

          {/* Row 2: Description */}
          <div>
            <label className={labelCls}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Optional description" />
          </div>

          {/* Row 3: Category + Acquisition Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Category *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {ASSET_CATEGORIES.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Acquisition Date *</label>
              <input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Row 4: Cost + Salvage Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Acquisition Cost *</label>
              <input type="number" step="0.01" min="0" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} className={inputCls} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Salvage Value</label>
              <input type="number" step="0.01" min="0" value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)} className={inputCls} placeholder="0.00" />
            </div>
          </div>

          {/* Row 5: Useful Life + Depreciation Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Useful Life (months) *</label>
              <input type="number" min="1" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} className={inputCls} placeholder="60" />
            </div>
            <div>
              <label className={labelCls}>Depreciation Method *</label>
              <select value={depreciationMethod} onChange={(e) => setDepreciationMethod(e.target.value)} className={inputCls}>
                {DEPRECIATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 6: Location */}
          <div>
            <label className={labelCls}>Location ID</label>
            <input type="text" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls} placeholder="Optional location ID" />
          </div>

          {/* GL Accounts Section */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">GL Account IDs (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Asset Account</label>
                <input type="text" value={assetGlAccountId} onChange={(e) => setAssetGlAccountId(e.target.value)} className={inputCls} placeholder="GL account ID" />
              </div>
              <div>
                <label className={labelCls}>Depreciation Expense</label>
                <input type="text" value={depreciationExpenseGlAccountId} onChange={(e) => setDepreciationExpenseGlAccountId(e.target.value)} className={inputCls} placeholder="GL account ID" />
              </div>
              <div>
                <label className={labelCls}>Accumulated Depreciation</label>
                <input type="text" value={accumulatedDepreciationGlAccountId} onChange={(e) => setAccumulatedDepreciationGlAccountId(e.target.value)} className={inputCls} placeholder="GL account ID" />
              </div>
              <div>
                <label className={labelCls}>Disposal Account</label>
                <input type="text" value={disposalGlAccountId} onChange={(e) => setDisposalGlAccountId(e.target.value)} className={inputCls} placeholder="GL account ID" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="Optional notes" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50">
              {isSaving ? 'Creating...' : 'Create Asset'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Depreciate Dialog ────────────────────────────────────────

interface DepreciateDialogProps {
  open: boolean;
  onClose: () => void;
  asset: FixedAssetListItem;
  onSubmit: (periodDate: string) => Promise<void>;
  isSubmitting: boolean;
}

function DepreciateDialog({ open, onClose, asset, onSubmit, isSubmitting }: DepreciateDialogProps) {
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!periodDate) { setError('Period date is required'); return; }
    try {
      await onSubmit(periodDate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record depreciation');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Record Depreciation</h3>
        <p className="text-sm text-muted-foreground">
          Record a depreciation entry for <strong className="text-foreground">{asset.name}</strong> ({asset.assetNumber}).
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Period Date</label>
          <input
            type="date"
            value={periodDate}
            onChange={(e) => setPeriodDate(e.target.value)}
            className="w-full px-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50">
            {isSubmitting ? 'Recording...' : 'Record Depreciation'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Dispose Dialog ───────────────────────────────────────────

interface DisposeDialogProps {
  open: boolean;
  onClose: () => void;
  asset: FixedAssetListItem;
  onSubmit: (data: { disposalDate: string; disposalProceeds: string; disposalGlAccountId?: string }) => Promise<void>;
  isSubmitting: boolean;
}

function DisposeDialog({ open, onClose, asset, onSubmit, isSubmitting }: DisposeDialogProps) {
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [disposalProceeds, setDisposalProceeds] = useState('0');
  const [disposalGlAccountId, setDisposalGlAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!disposalDate) { setError('Disposal date is required'); return; }
    try {
      await onSubmit({
        disposalDate,
        disposalProceeds: disposalProceeds || '0',
        disposalGlAccountId: disposalGlAccountId.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispose asset');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-muted-foreground';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Dispose Asset</h3>
        <p className="text-sm text-muted-foreground">
          Dispose <strong className="text-foreground">{asset.name}</strong> ({asset.assetNumber}).
          Net book value: <strong className="text-foreground">{formatAccountingMoney(asset.netBookValue)}</strong>.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Disposal Date *</label>
          <input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Disposal Proceeds</label>
          <input type="number" step="0.01" min="0" value={disposalProceeds} onChange={(e) => setDisposalProceeds(e.target.value)} className={inputCls} placeholder="0.00" />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Disposal GL Account ID</label>
          <input type="text" value={disposalGlAccountId} onChange={(e) => setDisposalGlAccountId(e.target.value)} className={inputCls} placeholder="Optional GL account ID" />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border rounded-md hover:bg-accent">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-500 disabled:opacity-50">
            {isSubmitting ? 'Disposing...' : 'Dispose Asset'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Content ─────────────────────────────────────────────

export default function FixedAssetsContent() {
  // ── State ────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [depreciateTarget, setDepreciateTarget] = useState<FixedAssetListItem | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<FixedAssetListItem | null>(null);

  // ── Data ─────────────────────────────────────────────────────
  const { data: assets, isLoading } = useFixedAssets({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
  });
  const { data: summary } = useAssetSummary();
  const mutations = useFixedAssetMutations();

  // ── Client-side search filter ────────────────────────────────
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const q = searchQuery.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.assetNumber.toLowerCase().includes(q),
    );
  }, [assets, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleCreateAsset = async (data: Record<string, unknown>) => {
    await mutations.createAsset.mutateAsync(data);
  };

  const handleDepreciate = async (periodDate: string) => {
    if (!depreciateTarget) return;
    await mutations.recordDepreciation.mutateAsync({ assetId: depreciateTarget.id, periodDate });
  };

  const handleDispose = async (data: { disposalDate: string; disposalProceeds: string; disposalGlAccountId?: string }) => {
    if (!disposeTarget) return;
    await mutations.disposeAsset.mutateAsync({ assetId: disposeTarget.id, ...data });
  };

  const handleEditAsset = (asset: FixedAssetListItem) => {
    // For now, edit opens the same create form pattern. A full edit flow
    // would use useFixedAsset(id) to load detail + updateAsset mutation.
    // Placeholder: log to console until the edit dialog is implemented.
    console.log('Edit asset:', asset.id);
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <AccountingPageShell
      title="Fixed Assets"
      subtitle={summary ? `${summary.totalAssets} asset${summary.totalAssets !== 1 ? 's' : ''} registered` : undefined}
      breadcrumbs={[{ label: 'Fixed Assets' }]}
      actions={
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Add Asset
        </button>
      }
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Package}
          label="Total Assets"
          value={summary ? String(summary.totalAssets) : '0'}
          accent="bg-indigo-500/10 text-indigo-500"
        />
        <KpiCard
          icon={DollarSign}
          label="Total Cost"
          value={formatAccountingMoney(summary?.totalCost ?? 0)}
          accent="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          icon={Building}
          label="Net Book Value"
          value={formatAccountingMoney(summary?.totalNetBookValue ?? 0)}
          accent="bg-green-500/10 text-green-500"
        />
        <KpiCard
          icon={TrendingDown}
          label="Monthly Depreciation"
          value={formatAccountingMoney(summary?.totalMonthlyDepreciation ?? 0)}
          accent="bg-amber-500/10 text-amber-500"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or asset number..."
            className="w-full pl-9 pr-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {ASSET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-input bg-surface text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Asset Table */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading assets...</div>
      ) : filteredAssets.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
          <Building className="h-8 w-8 text-muted-foreground" />
          <p>No fixed assets found</p>
          {(searchQuery || statusFilter || categoryFilter) && (
            <p className="text-xs">Try adjusting your filters</p>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Asset #</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acq. Date</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Accum. Depr.</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Net Book Value</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-accent">
                    <td className="px-4 py-3 font-mono text-foreground text-xs">{asset.assetNumber}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{asset.name}</td>
                    <td className="px-4 py-3"><CategoryBadge category={asset.category} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{asset.acquisitionDate}</td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatAccountingMoney(asset.acquisitionCost)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{formatAccountingMoney(asset.accumulatedDepreciation)}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium tabular-nums">{formatAccountingMoney(asset.netBookValue)}</td>
                    <td className="px-4 py-3"><StatusBadge status={asset.status} /></td>
                    <td className="px-4 py-3">
                      <ActionsDropdown
                        asset={asset}
                        onEdit={() => handleEditAsset(asset)}
                        onDepreciate={() => setDepreciateTarget(asset)}
                        onDispose={() => setDisposeTarget(asset)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div className="border-t-2 border-border bg-muted px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                Total Cost: <span className="font-medium text-foreground tabular-nums">{formatAccountingMoney(filteredAssets.reduce((sum, a) => sum + a.acquisitionCost, 0))}</span>
              </span>
              <span className="text-muted-foreground">
                Net Book Value: <span className="font-medium text-foreground tabular-nums">{formatAccountingMoney(filteredAssets.reduce((sum, a) => sum + a.netBookValue, 0))}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add Asset Dialog */}
      <AddAssetDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={handleCreateAsset}
        isSaving={mutations.createAsset.isPending}
      />

      {/* Depreciate Dialog */}
      {depreciateTarget && (
        <DepreciateDialog
          open={!!depreciateTarget}
          onClose={() => setDepreciateTarget(null)}
          asset={depreciateTarget}
          onSubmit={handleDepreciate}
          isSubmitting={mutations.recordDepreciation.isPending}
        />
      )}

      {/* Dispose Dialog */}
      {disposeTarget && (
        <DisposeDialog
          open={!!disposeTarget}
          onClose={() => setDisposeTarget(null)}
          asset={disposeTarget}
          onSubmit={handleDispose}
          isSubmitting={mutations.disposeAsset.isPending}
        />
      )}
    </AccountingPageShell>
  );
}
