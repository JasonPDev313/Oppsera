'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { FormField } from '@/components/ui/form-field';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useTaxRates, useTaxGroups } from '@/hooks/use-catalog';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import type { TaxRateRow, TaxGroupRow } from '@/types/catalog';

type Tab = 'rates' | 'groups';

// ── Tax Rates Tab ──────────────────────────────────────────────

const AUTHORITY_TYPE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'state', label: 'State' },
  { value: 'county', label: 'County' },
  { value: 'city', label: 'City' },
  { value: 'district', label: 'District' },
];

const TAX_TYPE_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'excise', label: 'Excise' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'use', label: 'Use' },
];

const FILING_FREQUENCY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function TaxRatesTab() {
  const { toast } = useToast();
  const { data: rates, isLoading, mutate: refresh } = useTaxRates();

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRate, setAddRate] = useState('');
  const [addJurisdictionCode, setAddJurisdictionCode] = useState('');
  const [addAuthorityName, setAddAuthorityName] = useState('');
  const [addAuthorityType, setAddAuthorityType] = useState('');
  const [addTaxType, setAddTaxType] = useState('sales');
  const [addFilingFrequency, setAddFilingFrequency] = useState('');
  const [adding, setAdding] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  const [editingRate, setEditingRate] = useState<TaxRateRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editJurisdictionCode, setEditJurisdictionCode] = useState('');
  const [editAuthorityName, setEditAuthorityName] = useState('');
  const [editAuthorityType, setEditAuthorityType] = useState('');
  const [editTaxType, setEditTaxType] = useState('sales');
  const [editFilingFrequency, setEditFilingFrequency] = useState('');
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<TaxRateRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const handleAdd = async () => {
    const errs: Record<string, string> = {};
    if (!addName.trim()) errs.name = 'Name is required';
    const parsed = parseFloat(addRate);
    if (isNaN(parsed) || parsed <= 0 || parsed > 100) errs.rate = 'Enter a valid rate between 0 and 100';
    if (Object.keys(errs).length > 0) {
      setAddErrors(errs);
      return;
    }

    setAdding(true);
    try {
      await apiFetch('/api/v1/catalog/tax-rates', {
        method: 'POST',
        body: JSON.stringify({
          name: addName.trim(),
          rateDecimal: parsed / 100,
          ...(addJurisdictionCode && { jurisdictionCode: addJurisdictionCode.trim() }),
          ...(addAuthorityName && { authorityName: addAuthorityName.trim() }),
          ...(addAuthorityType && { authorityType: addAuthorityType }),
          ...(addTaxType !== 'sales' && { taxType: addTaxType }),
          ...(addFilingFrequency && { filingFrequency: addFilingFrequency }),
        }),
      });
      toast.success(`Tax rate "${addName.trim()}" created`);
      setShowAdd(false);
      setAddName('');
      setAddRate('');
      setAddJurisdictionCode('');
      setAddAuthorityName('');
      setAddAuthorityType('');
      setAddTaxType('sales');
      setAddFilingFrequency('');
      setAddErrors({});
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tax rate');
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = (rate: TaxRateRow) => {
    setEditingRate(rate);
    setEditName(rate.name);
    setEditRate((Number(rate.rateDecimal) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
    setEditJurisdictionCode(rate.jurisdictionCode ?? '');
    setEditAuthorityName(rate.authorityName ?? '');
    setEditAuthorityType(rate.authorityType ?? '');
    setEditTaxType(rate.taxType ?? 'sales');
    setEditFilingFrequency(rate.filingFrequency ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editingRate) return;
    const parsed = parseFloat(editRate);
    if (!editName.trim() || isNaN(parsed) || parsed <= 0 || parsed > 100) {
      toast.error('Invalid name or rate');
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/v1/catalog/tax-rates/${editingRate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          rateDecimal: parsed / 100,
          jurisdictionCode: editJurisdictionCode.trim() || null,
          authorityName: editAuthorityName.trim() || null,
          authorityType: editAuthorityType || null,
          taxType: editTaxType || 'sales',
          filingFrequency: editFilingFrequency || null,
        }),
      });
      toast.success('Tax rate updated');
      setEditingRate(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiFetch(`/api/v1/catalog/tax-rates/${deactivateTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      toast.success('Tax rate deactivated');
      setDeactivateTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Manage the individual tax rates that can be composed into tax groups.
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add Rate
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Name" required error={addErrors.name}>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. MI State Sales Tax"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
            <FormField label="Rate (%)" required error={addErrors.rate}>
              <input
                type="number"
                value={addRate}
                onChange={(e) => setAddRate(e.target.value)}
                placeholder="e.g. 6.0"
                min={0}
                max={100}
                step="0.001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
            <FormField label="Tax Type">
              <Select
                options={TAX_TYPE_OPTIONS}
                value={addTaxType}
                onChange={(v) => setAddTaxType(v as string)}
              />
            </FormField>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <FormField label="Jurisdiction Code" helpText="e.g. MI, COOK-CTY">
              <input
                type="text"
                value={addJurisdictionCode}
                onChange={(e) => setAddJurisdictionCode(e.target.value)}
                placeholder="e.g. MI"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
            <FormField label="Authority Name">
              <input
                type="text"
                value={addAuthorityName}
                onChange={(e) => setAddAuthorityName(e.target.value)}
                placeholder="e.g. State of Michigan"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
            <FormField label="Authority Type">
              <Select
                options={AUTHORITY_TYPE_OPTIONS}
                value={addAuthorityType}
                onChange={(v) => setAddAuthorityType(v as string)}
              />
            </FormField>
            <FormField label="Filing Frequency">
              <Select
                options={FILING_FREQUENCY_OPTIONS}
                value={addFilingFrequency}
                onChange={(v) => setAddFilingFrequency(v as string)}
              />
            </FormField>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setAddErrors({});
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editingRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditingRate(null)} />
          <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Edit Tax Rate</h3>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Name" required>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </FormField>
                <FormField label="Rate (%)" required>
                  <input
                    type="number"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    min={0}
                    max={100}
                    step="0.001"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </FormField>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-medium text-gray-500">Jurisdiction Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Jurisdiction Code">
                    <input
                      type="text"
                      value={editJurisdictionCode}
                      onChange={(e) => setEditJurisdictionCode(e.target.value)}
                      placeholder="e.g. MI"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </FormField>
                  <FormField label="Authority Name">
                    <input
                      type="text"
                      value={editAuthorityName}
                      onChange={(e) => setEditAuthorityName(e.target.value)}
                      placeholder="e.g. State of Michigan"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </FormField>
                  <FormField label="Authority Type">
                    <Select
                      options={AUTHORITY_TYPE_OPTIONS}
                      value={editAuthorityType}
                      onChange={(v) => setEditAuthorityType(v as string)}
                    />
                  </FormField>
                  <FormField label="Tax Type">
                    <Select
                      options={TAX_TYPE_OPTIONS}
                      value={editTaxType}
                      onChange={(v) => setEditTaxType(v as string)}
                    />
                  </FormField>
                  <FormField label="Filing Frequency">
                    <Select
                      options={FILING_FREQUENCY_OPTIONS}
                      value={editFilingFrequency}
                      onChange={(v) => setEditFilingFrequency(v as string)}
                    />
                  </FormField>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rates table */}
      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (row) => (
              <span className="font-medium text-gray-900">{row.name as string}</span>
            ),
          },
          {
            key: 'rateDecimal',
            header: 'Rate',
            render: (row) => `${(Number(row.rateDecimal) * 100).toFixed(2)}%`,
          },
          {
            key: 'jurisdictionCode',
            header: 'Jurisdiction',
            render: (row) => {
              const r = row as unknown as TaxRateRow;
              if (!r.jurisdictionCode && !r.authorityName) return <span className="text-gray-400">—</span>;
              return (
                <div className="text-xs">
                  {r.authorityName && <div className="text-gray-700">{r.authorityName}</div>}
                  {r.jurisdictionCode && <div className="text-gray-500">{r.jurisdictionCode}</div>}
                </div>
              );
            },
          },
          {
            key: 'isActive',
            header: 'Status',
            render: (row) => (
              <Badge variant={row.isActive ? 'success' : 'neutral'}>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            width: '120px',
            render: (row) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(row as unknown as TaxRateRow);
                  }}
                  className="rounded p-1 text-gray-400 hover:text-indigo-600"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {(row as unknown as TaxRateRow).isActive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeactivateTarget(row as unknown as TaxRateRow);
                    }}
                    className="rounded p-1 text-gray-400 hover:text-red-600"
                    title="Deactivate"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ),
          },
        ]}
        data={(rates ?? []) as unknown as (Record<string, unknown> & { id: string })[]}
        isLoading={isLoading}
        emptyMessage="No tax rates defined yet"
        emptyAction={{ label: 'Add Tax Rate', onClick: () => setShowAdd(true) }}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Tax Rate"
        description={`Deactivate "${deactivateTarget?.name}"? It will no longer be available for new tax groups.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivating}
      />
    </div>
  );
}

// ── Tax Groups Tab ─────────────────────────────────────────────

function TaxGroupsTab() {
  const { toast } = useToast();
  const { locations } = useAuthContext();
  const { data: allRates } = useTaxRates();

  const [locationId, setLocationId] = useState('');
  const { data: groups, isLoading, mutate: refresh } = useTaxGroups(locationId || undefined);

  // Set first location by default
  useEffect(() => {
    if (locations.length > 0 && !locationId) {
      setLocationId(locations[0]!.id);
    }
  }, [locations, locationId]);

  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.name })),
    [locations],
  );

  const activeRateOptions = useMemo(
    () =>
      (allRates ?? [])
        .filter((r) => r.isActive)
        .map((r) => ({
          value: r.id,
          label: `${r.name} (${(Number(r.rateDecimal) * 100).toFixed(2)}%)`,
        })),
    [allRates],
  );

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createRateIds, setCreateRateIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editGroup, setEditGroup] = useState<TaxGroupRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editRateIds, setEditRateIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Deactivate
  const [deactivateTarget, setDeactivateTarget] = useState<TaxGroupRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const handleCreate = async () => {
    if (!createName.trim() || !locationId) return;
    setCreating(true);
    try {
      await apiFetch('/api/v1/catalog/tax-groups', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          locationId,
          taxRateIds: createRateIds,
        }),
      });
      toast.success(`Tax group "${createName.trim()}" created`);
      setShowCreate(false);
      setCreateName('');
      setCreateRateIds([]);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tax group');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (group: TaxGroupRow) => {
    setEditGroup(group);
    setEditName(group.name);
    setEditRateIds(group.rates.map((r) => r.id));
  };

  const handleSaveEdit = async () => {
    if (!editGroup || !editName.trim()) return;
    setEditSaving(true);
    try {
      // Update name via PATCH
      await apiFetch(`/api/v1/catalog/tax-groups/${editGroup.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
        }),
      });

      // Sync rates: compare original vs edited, add/remove as needed
      const originalRateIds = editGroup.rates.map((r) => r.id);
      const toRemove = originalRateIds.filter((id) => !editRateIds.includes(id));
      const toAdd = editRateIds.filter((id) => !originalRateIds.includes(id));

      for (const rateId of toRemove) {
        await apiFetch(`/api/v1/catalog/tax-groups/${editGroup.id}/rates/${rateId}`, {
          method: 'DELETE',
        });
      }
      for (const rateId of toAdd) {
        await apiFetch(`/api/v1/catalog/tax-groups/${editGroup.id}/rates`, {
          method: 'POST',
          body: JSON.stringify({ taxRateId: rateId }),
        });
      }

      toast.success('Tax group updated');
      setEditGroup(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await apiFetch(`/api/v1/catalog/tax-groups/${deactivateTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      toast.success('Tax group deactivated');
      setDeactivateTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          Tax groups combine rates and are scoped to a specific location.
        </p>
        <Select
          options={locationOptions}
          value={locationId}
          onChange={(v) => setLocationId(v as string)}
          placeholder="Select location..."
          className="w-full sm:w-64"
        />
      </div>

      {locationId && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add Tax Group
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">New Tax Group</h4>
              <div className="space-y-4">
                <FormField label="Name" required>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Standard Food Tax"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </FormField>
                <FormField label="Tax Rates" helpText="Select the rates to include in this group">
                  <Select
                    options={activeRateOptions}
                    value={createRateIds}
                    onChange={(v) => setCreateRateIds(v as string[])}
                    multiple
                    placeholder="Select tax rates..."
                  />
                </FormField>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating || !createName.trim()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Group cards */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner label="Loading tax groups..." />
            </div>
          ) : (groups ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-12">
              <p className="text-sm text-gray-500">No tax groups at this location</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Add Tax Group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(groups ?? []).map((group) => (
                <div
                  key={group.id}
                  className="rounded-lg border border-gray-200 bg-surface p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{group.name}</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant={group.isActive ? 'success' : 'neutral'}>
                          {group.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(group)}
                        className="rounded p-1.5 text-gray-400 hover:text-indigo-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {group.isActive && (
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(group)}
                          className="rounded p-1.5 text-gray-400 hover:text-red-600"
                          title="Deactivate"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rate composition */}
                  <div className="space-y-1.5">
                    {group.rates.length > 0 ? (
                      group.rates.map((rate) => (
                        <div
                          key={rate.id}
                          className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm"
                        >
                          <span className="text-gray-700">{rate.name}</span>
                          <span className="font-medium text-gray-900">
                            {(rate.rateDecimal * 100).toFixed(2)}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">No rates assigned</p>
                    )}
                  </div>

                  {/* Total */}
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
                    <span className="text-xs font-medium text-gray-500">Total Rate</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {(group.totalRate * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!locationId && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-12">
          <p className="text-sm text-gray-500">Select a location to view its tax groups</p>
        </div>
      )}

      {/* Edit dialog */}
      {editGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditGroup(null)} />
          <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Edit Tax Group</h3>
            <div className="mt-4 space-y-4">
              <FormField label="Name" required>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </FormField>
              <FormField label="Tax Rates">
                <Select
                  options={activeRateOptions}
                  value={editRateIds}
                  onChange={(v) => setEditRateIds(v as string[])}
                  multiple
                  placeholder="Select tax rates..."
                />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditGroup(null)}
                disabled={editSaving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Tax Group"
        description={`Deactivate "${deactivateTarget?.name}"? Items using this group will need to be reassigned.`}
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivating}
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function TaxesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('rates');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Tax Management</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {([
            { key: 'rates' as Tab, label: 'Tax Rates' },
            { key: 'groups' as Tab, label: 'Tax Groups' },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'rates' ? <TaxRatesTab /> : <TaxGroupsTab />}
    </div>
  );
}
