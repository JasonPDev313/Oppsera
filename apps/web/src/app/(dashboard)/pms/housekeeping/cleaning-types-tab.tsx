'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Plus, X, Loader2, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { DataTable } from '@/components/ui/data-table';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface CleaningType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  estimatedMinutes: number | null;
  sortOrder: number;
  isActive: boolean;
}

type CleaningTypeRow = CleaningType & Record<string, unknown>;

// ── Component ───────────────────────────────────────────────────

interface CleaningTypesTabProps {
  propertyId: string;
}

export default function CleaningTypesTab({ propertyId }: CleaningTypesTabProps) {
  const { toast } = useToast();

  // ── State ────────────────────────────────────────────────────
  const [cleaningTypes, setCleaningTypes] = useState<CleaningType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingType, setEditingType] = useState<CleaningType | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Data loading ─────────────────────────────────────────────
  const fetchCleaningTypes = useCallback(async () => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        propertyId,
        includeInactive: showInactive || undefined,
      });
      const res = await apiFetch<{ data: CleaningType[] }>(
        `/api/v1/pms/housekeeping/cleaning-types${qs}`,
      );
      setCleaningTypes(res.data ?? []);
    } catch {
      // silently handle
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, showInactive]);

  useEffect(() => {
    fetchCleaningTypes();
  }, [fetchCleaningTypes]);

  // ── Dialog handlers ──────────────────────────────────────────
  const openCreate = useCallback(() => {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormEstimatedMinutes('');
    setFormSortOrder('0');
    setFormError(null);
    setEditingType(null);
    setDialogMode('create');
  }, []);

  const openEdit = useCallback((ct: CleaningType) => {
    setFormCode(ct.code);
    setFormName(ct.name);
    setFormDescription(ct.description ?? '');
    setFormEstimatedMinutes(ct.estimatedMinutes != null ? String(ct.estimatedMinutes) : '');
    setFormSortOrder(String(ct.sortOrder));
    setFormError(null);
    setEditingType(ct);
    setDialogMode('edit');
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingType(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (dialogMode === 'create' && !formCode.trim()) {
      setFormError('Code is required');
      return;
    }
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    const mins = formEstimatedMinutes.trim() ? parseInt(formEstimatedMinutes, 10) : null;
    if (mins !== null && (isNaN(mins) || mins < 1)) {
      setFormError('Estimated minutes must be at least 1');
      return;
    }
    const sortOrd = parseInt(formSortOrder, 10);
    if (isNaN(sortOrd) || sortOrd < 0) {
      setFormError('Sort order must be 0 or greater');
      return;
    }

    setIsSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await apiFetch('/api/v1/pms/housekeeping/cleaning-types', {
          method: 'POST',
          body: JSON.stringify({
            propertyId,
            code: formCode.trim(),
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            estimatedMinutes: mins ?? undefined,
            sortOrder: sortOrd,
          }),
        });
        toast.success('Cleaning type created');
      } else if (editingType) {
        await apiFetch(`/api/v1/pms/housekeeping/cleaning-types/${editingType.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            estimatedMinutes: mins ?? undefined,
            sortOrder: sortOrd,
          }),
        });
        toast.success('Cleaning type updated');
      }
      closeDialog();
      await fetchCleaningTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save cleaning type';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [dialogMode, formCode, formName, formDescription, formEstimatedMinutes, formSortOrder, propertyId, editingType, closeDialog, fetchCleaningTypes, toast]);

  const handleToggleActive = useCallback(async (ct: CleaningType) => {
    try {
      await apiFetch(`/api/v1/pms/housekeeping/cleaning-types/${ct.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !ct.isActive }),
      });
      toast.success(ct.isActive ? 'Cleaning type deactivated' : 'Cleaning type activated');
      await fetchCleaningTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update cleaning type';
      toast.error(msg);
    }
  }, [fetchCleaningTypes, toast]);

  // ── Table columns ────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        width: '120px',
        render: (row: CleaningTypeRow) => (
          <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-mono text-sm font-medium text-indigo-400">
            {(row as CleaningType).code}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: CleaningTypeRow) => {
          const ct = row as CleaningType;
          return (
            <div>
              <span className="text-sm font-medium text-foreground">{ct.name}</span>
              {ct.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {ct.description}
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: 'estimatedMinutes',
        header: 'Est. Duration',
        width: '130px',
        render: (row: CleaningTypeRow) => {
          const mins = (row as CleaningType).estimatedMinutes;
          return (
            <span className="text-sm text-foreground">
              {mins != null ? `${mins} min` : '\u2014'}
            </span>
          );
        },
      },
      {
        key: 'sortOrder',
        header: 'Order',
        width: '80px',
        render: (row: CleaningTypeRow) => (
          <span className="text-sm text-foreground">{(row as CleaningType).sortOrder}</span>
        ),
      },
      {
        key: 'isActive',
        header: 'Status',
        width: '100px',
        render: (row: CleaningTypeRow) => {
          const active = (row as CleaningType).isActive;
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                active
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {active ? 'Active' : 'Inactive'}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        render: (row: CleaningTypeRow) => {
          const ct = row as CleaningType;
          const items: ActionMenuItem[] = [
            { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => openEdit(ct) },
            {
              key: 'toggle',
              label: ct.isActive ? 'Deactivate' : 'Activate',
              icon: ct.isActive ? ToggleLeft : ToggleRight,
              destructive: ct.isActive,
              dividerBefore: true,
              onClick: () => handleToggleActive(ct),
            },
          ];
          return <ActionMenu items={items} />;
        },
      },
    ],
    [openEdit, handleToggleActive],
  );

  // ── Guard ────────────────────────────────────────────────────
  if (!propertyId) return null;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Sub-header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cleaning Types</h2>
          <p className="text-sm text-muted-foreground">
            Define cleaning services like Full Clean, Towel Refresh, Stayover, etc.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border"
            />
            Show inactive
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Add Type
          </button>
        </div>
      </div>

      {/* Table or empty state */}
      {!isLoading && cleaningTypes.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No cleaning types yet"
          description="Create cleaning types to define services like Full Clean, Towel Refresh, Stayover, etc."
          action={{ label: 'Add Type', onClick: openCreate }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={cleaningTypes as CleaningTypeRow[]}
          isLoading={isLoading}
          emptyMessage="No cleaning types found"
        />
      )}

      {/* Create / Edit Dialog */}
      {dialogMode !== null &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="absolute inset-0 bg-black/40" onClick={closeDialog} />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {dialogMode === 'create' ? 'New Cleaning Type' : 'Edit Cleaning Type'}
                </h2>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                {/* Code */}
                <div>
                  <label htmlFor="cleaning-type-code" className="mb-1 block text-sm font-medium text-foreground">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cleaning-type-code"
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. FULL, TOWEL, STAY"
                    maxLength={20}
                    disabled={dialogMode === 'edit'}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={dialogMode === 'create'}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Short unique code{dialogMode === 'edit' ? ' (cannot be changed)' : ''}
                  </p>
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="cleaning-type-name" className="mb-1 block text-sm font-medium text-foreground">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cleaning-type-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Full Clean, Towel Refresh"
                    maxLength={100}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={dialogMode === 'edit'}
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="cleaning-type-description" className="mb-1 block text-sm font-medium text-foreground">
                    Description
                  </label>
                  <textarea
                    id="cleaning-type-description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional description of what this cleaning type includes"
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Estimated Minutes + Sort Order */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cleaning-type-est-minutes" className="mb-1 block text-sm font-medium text-foreground">
                      Est. Minutes
                    </label>
                    <input
                      id="cleaning-type-est-minutes"
                      type="number"
                      min={1}
                      value={formEstimatedMinutes}
                      onChange={(e) => setFormEstimatedMinutes(e.target.value)}
                      placeholder="e.g. 45"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Expected duration</p>
                  </div>
                  <div>
                    <label htmlFor="cleaning-type-sort-order" className="mb-1 block text-sm font-medium text-foreground">
                      Sort Order
                    </label>
                    <input
                      id="cleaning-type-sort-order"
                      type="number"
                      min={0}
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Lower = listed first</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {dialogMode === 'create'
                    ? isSubmitting ? 'Creating...' : 'Create Type'
                    : isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
