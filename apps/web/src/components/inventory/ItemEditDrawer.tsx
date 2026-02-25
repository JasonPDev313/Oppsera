'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2 } from 'lucide-react';
import { useItemEditDrawer } from './ItemEditDrawerContext';
import type { ItemPreSeed } from './ItemEditDrawerContext';
import { useCatalogItem } from '@/hooks/use-catalog';
import { useInventoryForCatalogItem } from '@/hooks/use-inventory-for-catalog-item';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { ITEM_TYPE_BADGES, getItemTypeGroup } from '@/types/catalog';
import { InventoryIndicator } from '@/components/pos/InventoryIndicator';
import { GeneralSection } from './sections/GeneralSection';
import { PricingSection } from './sections/PricingSection';
import { InventorySection } from './sections/InventorySection';
import { TaxSection } from './sections/TaxSection';
import { FnbSection } from './sections/FnbSection';
import { MenuDisplaySection } from './sections/MenuDisplaySection';
import { ActivitySection } from './sections/ActivitySection';

export interface ItemFormState {
  name: string;
  itemType: string;
  categoryId: string | null;
  defaultPrice: string;
  cost: string;
  sku: string;
  barcode: string;
  description: string;
  priceIncludesTax: boolean;
  isTrackable: boolean;
  metadata: Record<string, unknown>;
}

function buildInitialForm(item: {
  name: string;
  itemType: string;
  categoryId: string | null;
  defaultPrice: string;
  cost: string | null;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  priceIncludesTax?: boolean;
  isTrackable: boolean;
  metadata?: Record<string, unknown>;
}): ItemFormState {
  return {
    name: item.name,
    itemType: item.itemType,
    categoryId: item.categoryId ?? null,
    defaultPrice: item.defaultPrice,
    cost: item.cost ?? '',
    sku: item.sku ?? '',
    barcode: item.barcode ?? '',
    description: item.description ?? '',
    priceIncludesTax: item.priceIncludesTax ?? false,
    isTrackable: item.isTrackable,
    metadata: item.metadata ?? {},
  };
}

/** Build a form from POS pre-seed data (missing cost + description) */
function buildPreSeedForm(seed: ItemPreSeed): ItemFormState {
  return {
    name: seed.name,
    itemType: seed.itemType,
    categoryId: seed.categoryId,
    defaultPrice: (seed.priceCents / 100).toFixed(2),
    cost: '',
    sku: seed.sku ?? '',
    barcode: seed.barcode ?? '',
    description: '',
    priceIncludesTax: false,
    isTrackable: seed.isTrackable,
    metadata: seed.metadata,
  };
}

function computeDirtyFields(
  original: ItemFormState,
  current: ItemFormState,
): Partial<Record<string, unknown>> | null {
  const changes: Record<string, unknown> = {};

  if (current.name !== original.name) changes.name = current.name;
  if (current.itemType !== original.itemType) changes.itemType = current.itemType;
  if (current.categoryId !== original.categoryId) changes.categoryId = current.categoryId;
  if (current.defaultPrice !== original.defaultPrice) {
    changes.defaultPrice = parseFloat(current.defaultPrice) || 0;
  }
  if (current.cost !== original.cost) {
    changes.cost = current.cost ? parseFloat(current.cost) || 0 : null;
  }
  if (current.sku !== original.sku) changes.sku = current.sku || undefined;
  if (current.barcode !== original.barcode) changes.barcode = current.barcode || null;
  if (current.description !== original.description) {
    changes.description = current.description || null;
  }
  if (current.priceIncludesTax !== original.priceIncludesTax) changes.priceIncludesTax = current.priceIncludesTax;
  if (current.isTrackable !== original.isTrackable) changes.isTrackable = current.isTrackable;
  if (JSON.stringify(current.metadata) !== JSON.stringify(original.metadata)) {
    changes.metadata = current.metadata;
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function ItemEditDrawer() {
  const { state, close } = useItemEditDrawer();
  const { isOpen, itemId, onSaveSuccess, preSeed } = state;
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const { toast } = useToast();

  const { data: item, isLoading, error, mutate: refetchItem } = useCatalogItem(
    isOpen && itemId ? itemId : '',
  );
  const { data: inventoryData } = useInventoryForCatalogItem(
    isOpen && itemId ? itemId : null,
  );

  // Form state — both are useState so isDirty recomputes when either changes
  const [form, setForm] = useState<ItemFormState | null>(null);
  const [original, setOriginal] = useState<ItemFormState | null>(null);
  // Track whether we've received full API data (to allow overwrite of pre-seed)
  const hasFullDataRef = useRef(false);
  // Track whether user has made manual edits (prevent API data from overwriting in-progress changes)
  const userHasEditedRef = useRef(false);

  // Pre-seed: build form IMMEDIATELY from POS data when drawer opens
  useEffect(() => {
    if (isOpen && preSeed && !form) {
      const preForm = buildPreSeedForm(preSeed);
      setForm(preForm);
      // Set original from preSeed so isDirty works immediately.
      // When full API data arrives, original will be updated to server truth.
      setOriginal({ ...preForm, metadata: { ...preForm.metadata } });
    }
  }, [isOpen, preSeed, form]);

  // Update form when full API data arrives
  useEffect(() => {
    if (item && isOpen && !hasFullDataRef.current) {
      const initial = buildInitialForm(item);
      // Always set original from server truth (baseline for dirty tracking)
      setOriginal({ ...initial, metadata: { ...initial.metadata } });
      // Only overwrite form if user hasn't started editing the pre-seed
      if (!userHasEditedRef.current) {
        setForm(initial);
      }
      hasFullDataRef.current = true;
    }
  }, [item, isOpen]);

  // Clear form on close
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setForm(null);
        setOriginal(null);
        hasFullDataRef.current = false;
        userHasEditedRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const isDirty = useMemo(() => {
    if (!form || !original) return false;
    return computeDirtyFields(original, form) !== null;
  }, [form, original]);

  const updateForm = useCallback((updates: Partial<ItemFormState>) => {
    userHasEditedRef.current = true;
    setForm((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const updateMetadata = useCallback((key: string, value: unknown) => {
    userHasEditedRef.current = true;
    setForm((prev) =>
      prev ? { ...prev, metadata: { ...prev.metadata, [key]: value } } : null,
    );
  }, []);

  // Animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Attempt close (with dirty check)
  const attemptClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      close();
    }
  }, [isDirty, close]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        attemptClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, attemptClose]);

  // Save handler
  const handleSave = useCallback(
    async (closeAfter: boolean) => {
      if (!form || !original || !itemId) return;

      const changes = computeDirtyFields(original, form);
      if (!changes) {
        toast.info('No changes to save');
        return;
      }

      if (!form.name.trim()) {
        toast.error('Item name is required');
        return;
      }
      const price = parseFloat(form.defaultPrice);
      if (isNaN(price) || price < 0) {
        toast.error('Valid sale price is required');
        return;
      }

      setIsSaving(true);
      try {
        await apiFetch(`/api/v1/catalog/items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        });

        toast.success('Item updated successfully');
        refetchItem();
        onSaveSuccess?.();
        setActivityRefreshKey((k) => k + 1);
        // Update original to match current form — triggers isDirty recalculation via useState
        setOriginal({ ...form, metadata: { ...form.metadata } });

        if (closeAfter) close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save';
        toast.error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [form, original, itemId, toast, refetchItem, onSaveSuccess, close],
  );

  if (!isVisible || typeof document === 'undefined') return null;

  // Derive display info from full API data OR pre-seed
  const displayItemType = item?.itemType ?? form?.itemType ?? 'retail';
  const displayMetadata = item?.metadata ?? form?.metadata ?? {};
  const typeGroup = getItemTypeGroup(displayItemType, displayMetadata);
  const badgeConfig = ITEM_TYPE_BADGES[typeGroup];
  const isFnb = displayItemType === 'food' || displayItemType === 'beverage';
  const displayOnHand = inventoryData?.onHand ?? preSeed?.onHand ?? null;
  const displayIsTrackable = item?.isTrackable ?? preSeed?.isTrackable ?? false;

  // Show skeleton only when no form at all (no pre-seed, API still loading)
  const showSkeleton = !form && isLoading;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${
          isAnimating ? 'bg-black/30' : 'bg-black/0'
        }`}
        onClick={attemptClose}
      />

      {/* Drawer panel */}
      <div
        className={`relative flex h-full w-[33vw] min-w-105 flex-col bg-surface shadow-2xl transition-transform duration-300 ease-in-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {showSkeleton ? (
                <>
                  <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-24 animate-pulse rounded bg-gray-100" />
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold leading-tight text-gray-900">
                    {form?.name || preSeed?.name || item?.name || 'Loading...'}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
                    <InventoryIndicator
                      onHand={displayOnHand}
                      isTrackInventory={displayIsTrackable}
                      compact={false}
                    />
                    {isDirty && (
                      <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
                    )}
                    {!hasFullDataRef.current && isLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={attemptClose}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {showSkeleton ? (
            <div className="space-y-4 p-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-9 w-full animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : error && !form ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600">Failed to load item.</p>
              <button
                type="button"
                onClick={() => refetchItem()}
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Try again
              </button>
            </div>
          ) : form ? (
            <>
              <GeneralSection form={form} onUpdate={updateForm} />
              <TaxSection itemId={itemId!} />
              <PricingSection
                form={form}
                onUpdate={updateForm}
                onUpdateMetadata={updateMetadata}
                itemId={itemId!}
              />
              <InventorySection form={form} onUpdate={updateForm} inventoryData={inventoryData} inventoryItemId={inventoryData?.id ?? null} />
              {isFnb && (
                <FnbSection metadata={form.metadata} onUpdateMetadata={updateMetadata} />
              )}
              <MenuDisplaySection metadata={form.metadata} onUpdateMetadata={updateMetadata} />
              <ActivitySection itemId={itemId!} refreshKey={activityRefreshKey} />
            </>
          ) : null}
        </div>

        {/* Footer action bar */}
        {form && (
          <div className="shrink-0 border-t border-gray-200 px-5 py-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={attemptClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={isSaving || !isDirty}
                  className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save & Close
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={isSaving || !isDirty}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discard changes confirmation */}
      {showDiscardDialog &&
        createPortal(
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setShowDiscardDialog(false)}
            />
            <div className="relative w-full max-w-sm rounded-lg bg-surface p-6 shadow-xl">
              <h3 className="text-base font-semibold text-gray-900">Unsaved changes</h3>
              <p className="mt-2 text-sm text-gray-600">
                You have unsaved changes. Are you sure you want to close?
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardDialog(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardDialog(false);
                    close();
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>,
    document.body,
  );
}
