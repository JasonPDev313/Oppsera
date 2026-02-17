'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/toast';
import { useCatalogItem, useDepartments, useSubDepartments, useCategories, useModifierGroups } from '@/hooks/use-catalog';
import { apiFetch } from '@/lib/api-client';
import { getItemTypeGroup, ITEM_TYPE_BADGES } from '@/types/catalog';
import type { FnbMetadata, RetailMetadata, ServiceMetadata } from '@/types/catalog';

interface OptionSet {
  name: string;
  options: string[];
  required: boolean;
}

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;
  const { toast } = useToast();
  const { data: item, isLoading: itemLoading } = useCatalogItem(itemId);
  const { data: modifierGroups } = useModifierGroups();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [deptId, setDeptId] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [defaultPrice, setDefaultPrice] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // F&B
  const [allowSpecialInstructions, setAllowSpecialInstructions] = useState(false);
  const [allowedFractions, setAllowedFractions] = useState<number[]>([1.0, 0.5, 0.25]);
  const [defaultModifierGroupIds, setDefaultModifierGroupIds] = useState<string[]>([]);
  const [optionalModifierGroupIds, setOptionalModifierGroupIds] = useState<string[]>([]);

  // Retail
  const [isTrackable, setIsTrackable] = useState(false);
  const [optionSets, setOptionSets] = useState<OptionSet[]>([]);

  // Service
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>();
  const [requiresBooking, setRequiresBooking] = useState(false);

  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptId || undefined);
  const { data: categories } = useCategories(subDeptId || undefined);

  // Load item data into form
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setSku(item.sku || '');
    setDescription(item.description || '');
    setCategoryId(item.categoryId || '');
    setDefaultPrice(Number(item.defaultPrice));
    setCost(item.cost ? Number(item.cost) : null);
    setIsTrackable(item.isTrackable);

    const meta = (item.metadata || {}) as Record<string, unknown>;
    const typeGroup = getItemTypeGroup(item.itemType, meta);

    if (typeGroup === 'fnb') {
      const fnb = meta as FnbMetadata;
      setAllowSpecialInstructions(fnb.allowSpecialInstructions ?? false);
      setAllowedFractions(fnb.allowedFractions ?? [1.0, 0.5, 0.25]);
      setDefaultModifierGroupIds(fnb.defaultModifierGroupIds ?? []);
      setOptionalModifierGroupIds(fnb.optionalModifierGroupIds ?? []);
    } else if (typeGroup === 'retail') {
      const retail = meta as RetailMetadata;
      setOptionSets(retail.optionSets ?? []);
    } else if (typeGroup === 'service') {
      const svc = meta as ServiceMetadata;
      setDurationMinutes(svc.durationMinutes);
      setRequiresBooking(svc.requiresBooking ?? false);
    }
  }, [item]);

  // Resolve hierarchy from categoryId
  useEffect(() => {
    if (!item?.categoryId || departments.length === 0) return;
    // TODO: Resolve full hierarchy path from flat category list
    // For now, set categoryId directly
  }, [item, departments]);

  const typeGroup = item ? getItemTypeGroup(item.itemType, item.metadata as Record<string, unknown>) : null;
  const typeBadge = typeGroup ? ITEM_TYPE_BADGES[typeGroup] : null;

  const modGroupOptions = (modifierGroups || []).map((g) => ({
    value: g.id,
    label: g.name,
  }));

  const handleSubmit = useCallback(async () => {
    if (!item) return;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (defaultPrice == null || defaultPrice < 0) errs.defaultPrice = 'Price is required';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const metadata: Record<string, unknown> = { ...(item.metadata || {}) };

      if (typeGroup === 'fnb') {
        metadata.allowSpecialInstructions = allowSpecialInstructions;
        metadata.allowedFractions = allowedFractions;
        metadata.defaultModifierGroupIds = defaultModifierGroupIds;
        metadata.optionalModifierGroupIds = optionalModifierGroupIds;
      } else if (typeGroup === 'retail') {
        metadata.optionSets = optionSets;
      } else if (typeGroup === 'service') {
        metadata.durationMinutes = durationMinutes;
        metadata.requiresBooking = requiresBooking;
      }

      const body: Record<string, unknown> = {};
      if (name !== item.name) body.name = name.trim();
      if (sku !== (item.sku || '')) body.sku = sku.toUpperCase() || null;
      if (description !== (item.description || '')) body.description = description || null;
      if (categoryId !== (item.categoryId || '')) body.categoryId = categoryId || null;
      if (defaultPrice !== Number(item.defaultPrice)) body.defaultPrice = defaultPrice;
      if (cost !== (item.cost ? Number(item.cost) : null)) body.cost = cost;
      if (isTrackable !== item.isTrackable) body.isTrackable = isTrackable;
      body.metadata = metadata;

      await apiFetch(`/api/v1/catalog/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success('Item updated');
      router.push(`/catalog/items/${itemId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [item, name, sku, description, categoryId, defaultPrice, cost, isTrackable, typeGroup, allowSpecialInstructions, allowedFractions, defaultModifierGroupIds, optionalModifierGroupIds, optionSets, durationMinutes, requiresBooking, itemId, router, toast]);

  if (itemLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner label="Loading item..." />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">Item not found</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/catalog/items/${itemId}`} className="rounded-lg p-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Edit {item.name}</h1>
        {typeBadge && <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <FormField label="Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="SKU">
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onBlur={() => setSku(sku.toUpperCase())}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField label="Department">
              <Select
                options={[{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                value={deptId}
                onChange={(v) => { setDeptId(v as string); setSubDeptId(''); setCategoryId(''); }}
              />
            </FormField>
            <FormField label="Sub-Department">
              <Select
                options={[{ value: '', label: 'None' }, ...subDepartments.map((s) => ({ value: s.id, label: s.name }))]}
                value={subDeptId}
                onChange={(v) => { setSubDeptId(v as string); setCategoryId(''); }}
              />
            </FormField>
            <FormField label="Category">
              <Select
                options={[{ value: '', label: 'None' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                value={categoryId}
                onChange={(v) => setCategoryId(v as string)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Default Price" required error={errors.defaultPrice}>
              <CurrencyInput value={defaultPrice} onChange={setDefaultPrice} />
            </FormField>
            <FormField label="Cost">
              <CurrencyInput value={cost} onChange={setCost} />
            </FormField>
          </div>
        </div>
      </div>

      {/* Type-specific fields */}
      {typeGroup === 'fnb' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">F&B Options</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowSpecialInstructions}
                onChange={(e) => setAllowSpecialInstructions(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Allow Special Instructions
            </label>
            <FormField label="Allowed Fractions" helpText="Which portion sizes can be sold">
              <div className="flex gap-4">
                {[1.0, 0.5, 0.25].map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedFractions.includes(f)}
                      onChange={(e) => {
                        setAllowedFractions(
                          e.target.checked
                            ? [...allowedFractions, f]
                            : allowedFractions.filter((v) => v !== f),
                        );
                      }}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {f}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Default Modifier Groups" helpText="Pre-selected when item is added to order">
              <Select
                options={modGroupOptions}
                value={defaultModifierGroupIds}
                onChange={(v) => setDefaultModifierGroupIds(v as string[])}
                multiple
                placeholder="Select modifier groups..."
              />
            </FormField>
            <FormField label="Optional Modifier Groups" helpText="Customer can choose to add these">
              <Select
                options={modGroupOptions}
                value={optionalModifierGroupIds}
                onChange={(v) => setOptionalModifierGroupIds(v as string[])}
                multiple
                placeholder="Select modifier groups..."
              />
            </FormField>
          </div>
        </div>
      )}

      {typeGroup === 'retail' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">Retail Options</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isTrackable}
                onChange={(e) => setIsTrackable(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Track Inventory
            </label>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Option Sets</p>
              {/* TODO: Backend retail_option_groups table not yet available — storing in metadata.optionSets */}
              {optionSets.map((os, idx) => (
                <div key={idx} className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{os.name}</span>
                    {os.required && <span className="ml-2 text-xs text-gray-500">(required)</span>}
                    <p className="text-xs text-gray-500">{os.options.join(' · ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOptionSets(optionSets.filter((_, i) => i !== idx))}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Retail items are sold as 1 unit per line item</p>
          </div>
        </div>
      )}

      {typeGroup === 'service' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">Service Details</h3>
          <div className="space-y-4">
            <FormField label="Duration (minutes)" helpText="Length of the service">
              <input
                type="number"
                value={durationMinutes ?? ''}
                onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : undefined)}
                min={0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresBooking}
                onChange={(e) => setRequiresBooking(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Requires Booking
            </label>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href={`/catalog/items/${itemId}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
