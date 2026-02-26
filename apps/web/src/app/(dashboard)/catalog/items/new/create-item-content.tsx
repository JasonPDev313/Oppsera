'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  UtensilsCrossed,
  ShoppingBag,
  Clock,
  Package,
  ArrowLeft,
  Plus,
  X,
  Info,
} from 'lucide-react';
import { z } from 'zod';

import { FormField } from '@/components/ui/form-field';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select } from '@/components/ui/select';
import type { SelectOption } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import {
  useDepartments,
  useSubDepartments,
  useCategories,
  useModifierGroups,
  useCatalogItems,
} from '@/hooks/use-catalog';
import { useMutation } from '@/hooks/use-mutation';
import { apiFetch } from '@/lib/api-client';
import type {
  ItemTypeGroup,
  CatalogItemRow,
  FnbMetadata,
  RetailMetadata,
  ServiceMetadata,
  PackageMetadata,
} from '@/types/catalog';
import { ITEM_TYPE_BADGES, getItemTypeGroup } from '@/types/catalog';

// ── Type selection cards config ─────────────────────────────────

interface TypeCard {
  key: ItemTypeGroup;
  title: string;
  description: string;
  icon: React.ElementType;
}

const TYPE_CARDS: TypeCard[] = [
  {
    key: 'fnb',
    title: 'F&B',
    description: 'Food and beverage items with modifiers, fractions, and special instructions.',
    icon: UtensilsCrossed,
  },
  {
    key: 'retail',
    title: 'Retail',
    description: 'Physical goods with optional variants like size, color, or style.',
    icon: ShoppingBag,
  },
  {
    key: 'service',
    title: 'Service',
    description: 'Time-based or appointment services with optional booking and duration.',
    icon: Clock,
  },
  {
    key: 'package',
    title: 'Package',
    description: 'Bundles that combine multiple catalog items into a single offering.',
    icon: Package,
  },
];

// ── Local validation schemas ────────────────────────────────────

const baseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(50).optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  departmentId: z.string().optional().or(z.literal('')),
  subDepartmentId: z.string().optional().or(z.literal('')),
  categoryId: z.string().optional().or(z.literal('')),
  defaultPrice: z.number({ required_error: 'Default price is required' }).positive('Price must be greater than 0'),
  cost: z.number().nonnegative().nullable().optional(),
});

const fnbSchema = z.object({
  subType: z.enum(['food', 'beverage']),
  allowSpecialInstructions: z.boolean(),
  allowedFractions: z.array(z.number()).min(1, 'Select at least one fraction'),
  defaultModifierGroupIds: z.array(z.string()),
  optionalModifierGroupIds: z.array(z.string()),
});

const retailSchema = z.object({
  trackInventory: z.boolean(),
  optionSets: z.array(
    z.object({
      name: z.string().min(1),
      options: z.array(z.string()).min(1),
      required: z.boolean(),
    }),
  ),
});

const serviceSchema = z.object({
  durationMinutes: z.number().int().positive().nullable().optional(),
  requiresBooking: z.boolean(),
});

const packageSchema = z.object({
  packageComponents: z
    .array(
      z.object({
        catalogItemId: z.string().min(1),
        itemName: z.string(),
        itemType: z.string(),
        qty: z.number().positive('Quantity must be greater than 0'),
      }),
    )
    .min(1, 'Add at least one component'),
  fixedPrice: z.number({ required_error: 'Fixed price is required' }).positive('Price must be greater than 0'),
});

// ── Option Set Builder types ────────────────────────────────────

interface OptionSet {
  name: string;
  options: string[];
  required: boolean;
}

// ── Package Component type ──────────────────────────────────────

interface PackageComponent {
  catalogItemId: string;
  itemName: string;
  itemType: string;
  qty: number;
  /** Override unit price in dollars. null = use live catalog price at order time. */
  componentUnitPrice: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────

type FieldErrors = Record<string, string>;

function flattenZodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none';
const inputErrorClassName =
  'w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:outline-none';
const checkboxClassName =
  'rounded border-gray-300 text-indigo-600 focus:ring-indigo-500';

// ── Main Page ───────────────────────────────────────────────────

export default function CreateItemContent() {
  const router = useRouter();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ItemTypeGroup | null>(null);

  // Common fields
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [subDepartmentId, setSubDepartmentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [defaultPrice, setDefaultPrice] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  // F&B fields
  const [fnbSubType, setFnbSubType] = useState<'food' | 'beverage'>('food');
  const [allowSpecialInstructions, setAllowSpecialInstructions] = useState(false);
  const [allowedFractions, setAllowedFractions] = useState<number[]>([1.0, 0.5, 0.25]);
  const [defaultModifierGroupIds, setDefaultModifierGroupIds] = useState<string[]>([]);
  const [optionalModifierGroupIds, setOptionalModifierGroupIds] = useState<string[]>([]);

  // Retail fields
  const [trackInventory, setTrackInventory] = useState(true);
  const [optionSets, setOptionSets] = useState<OptionSet[]>([]);
  const [showOptionSetForm, setShowOptionSetForm] = useState(false);
  const [newOptionSetName, setNewOptionSetName] = useState('');
  const [newOptionSetOptions, setNewOptionSetOptions] = useState<string[]>([]);
  const [newOptionSetRequired, setNewOptionSetRequired] = useState(false);
  const [newOptionInput, setNewOptionInput] = useState('');

  // Service fields
  const [durationMinutes, setDurationMinutes] = useState<string>('');
  const [requiresBooking, setRequiresBooking] = useState(false);

  // Package fields
  const [packageComponents, setPackageComponents] = useState<PackageComponent[]>([]);
  const [showComponentSearch, setShowComponentSearch] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [fixedPrice, setFixedPrice] = useState<number | null>(null);
  const [pricingMode, setPricingMode] = useState<'fixed' | 'sum_of_components'>('fixed');

  // Computed subtotal for sum_of_components mode (dollars)
  const componentsSubtotal = useMemo(
    () =>
      packageComponents.reduce(
        (sum, c) => sum + (c.componentUnitPrice ?? 0) * c.qty,
        0,
      ),
    [packageComponents],
  );

  // Errors
  const [errors, setErrors] = useState<FieldErrors>({});

  // ── Data hooks ────────────────────────────────────────────────

  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(departmentId || undefined);
  const { data: categories } = useCategories(subDepartmentId || undefined);
  const { data: modifierGroups } = useModifierGroups();

  // For package component search
  const { data: searchItems } = useCatalogItems({
    search: componentSearch || undefined,
  });

  // Filter out packages from search results
  const filteredSearchItems = useMemo(
    () =>
      (searchItems || []).filter((item) => {
        const group = getItemTypeGroup(item.itemType, item.metadata);
        return group !== 'package';
      }),
    [searchItems],
  );

  // ── Select options ────────────────────────────────────────────

  const deptOptions = useMemo<SelectOption[]>(
    () =>
      departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const subDeptOptions = useMemo<SelectOption[]>(
    () =>
      subDepartments.map((s) => ({ value: s.id, label: s.name })),
    [subDepartments],
  );

  const catOptions = useMemo<SelectOption[]>(
    () =>
      categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const modifierGroupOptions = useMemo<SelectOption[]>(
    () =>
      (modifierGroups || []).map((mg) => ({ value: mg.id, label: mg.name })),
    [modifierGroups],
  );

  // ── Mutation ──────────────────────────────────────────────────

  const { mutate: createItem, isLoading: isSubmitting } = useMutation(
    useCallback(
      async (payload: Record<string, unknown>) => {
        return apiFetch<{ data: CatalogItemRow }>('/api/v1/catalog/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      },
      [],
    ),
  );

  // ── Handlers ──────────────────────────────────────────────────

  function handleSelectType(type: ItemTypeGroup) {
    setSelectedType(type);
    setStep(2);
    setErrors({});
  }

  function handleBackToTypeSelection() {
    setStep(1);
    setSelectedType(null);
    setErrors({});
  }

  function handleAddOptionTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = newOptionInput.trim();
      if (val && !newOptionSetOptions.includes(val)) {
        setNewOptionSetOptions((prev) => [...prev, val]);
      }
      setNewOptionInput('');
    }
  }

  function handleRemoveOptionTag(tag: string) {
    setNewOptionSetOptions((prev) => prev.filter((t) => t !== tag));
  }

  function handleSaveOptionSet() {
    if (!newOptionSetName.trim() || newOptionSetOptions.length === 0) return;
    setOptionSets((prev) => [
      ...prev,
      {
        name: newOptionSetName.trim(),
        options: newOptionSetOptions,
        required: newOptionSetRequired,
      },
    ]);
    setNewOptionSetName('');
    setNewOptionSetOptions([]);
    setNewOptionSetRequired(false);
    setNewOptionInput('');
    setShowOptionSetForm(false);
  }

  function handleRemoveOptionSet(index: number) {
    setOptionSets((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddComponent(item: CatalogItemRow) {
    if (packageComponents.some((c) => c.catalogItemId === item.id)) return;
    setPackageComponents((prev) => [
      ...prev,
      {
        catalogItemId: item.id,
        itemName: item.name,
        itemType: item.itemType,
        qty: 1,
        componentUnitPrice: null,
      },
    ]);
    setShowComponentSearch(false);
    setComponentSearch('');
  }

  function handleRemoveComponent(catalogItemId: string) {
    setPackageComponents((prev) => prev.filter((c) => c.catalogItemId !== catalogItemId));
  }

  function handleComponentQtyChange(catalogItemId: string, qty: number) {
    setPackageComponents((prev) =>
      prev.map((c) => (c.catalogItemId === catalogItemId ? { ...c, qty } : c)),
    );
  }

  function handleComponentUnitPriceChange(catalogItemId: string, price: number | null) {
    setPackageComponents((prev) =>
      prev.map((c) => (c.catalogItemId === catalogItemId ? { ...c, componentUnitPrice: price } : c)),
    );
  }

  function toggleFraction(fraction: number) {
    setAllowedFractions((prev) =>
      prev.includes(fraction) ? prev.filter((f) => f !== fraction) : [...prev, fraction],
    );
  }

  // ── Submit ────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // For packages the effective price comes from fixedPrice / computed sum, not defaultPrice state
    const effectiveDefaultPrice =
      selectedType === 'package'
        ? pricingMode === 'sum_of_components'
          ? componentsSubtotal
          : fixedPrice
        : defaultPrice;

    // Validate base
    const baseResult = baseSchema.safeParse({
      name,
      sku: sku || undefined,
      description: description || undefined,
      departmentId: departmentId || undefined,
      subDepartmentId: subDepartmentId || undefined,
      categoryId: categoryId || undefined,
      defaultPrice: effectiveDefaultPrice,
      cost,
    });

    let fieldErrors: FieldErrors = {};

    if (!baseResult.success) {
      fieldErrors = { ...fieldErrors, ...flattenZodErrors(baseResult.error) };
    }

    // Validate type-specific fields
    let itemType: string;
    let metadata: Record<string, unknown> = {};
    let modifierGroupIds: string[] = [];

    switch (selectedType) {
      case 'fnb': {
        const fnbResult = fnbSchema.safeParse({
          subType: fnbSubType,
          allowSpecialInstructions,
          allowedFractions,
          defaultModifierGroupIds,
          optionalModifierGroupIds,
        });
        if (!fnbResult.success) {
          fieldErrors = { ...fieldErrors, ...flattenZodErrors(fnbResult.error) };
        }
        itemType = fnbSubType; // 'food' or 'beverage'
        // Combine default + optional modifier group IDs for the backend junction table
        modifierGroupIds = [...defaultModifierGroupIds, ...optionalModifierGroupIds];
        // TODO: Backend does not yet have metadata column — storing F&B-specific config will need a schema migration
        metadata = {
          allowSpecialInstructions,
          allowedFractions,
          defaultModifierGroupIds,
          optionalModifierGroupIds,
        } satisfies FnbMetadata;
        break;
      }
      case 'retail': {
        const retailResult = retailSchema.safeParse({
          trackInventory,
          optionSets,
        });
        if (!retailResult.success) {
          fieldErrors = { ...fieldErrors, ...flattenZodErrors(retailResult.error) };
        }
        itemType = 'retail';
        // TODO: Backend retail_option_groups table not yet available — storing in metadata.optionSets
        metadata = {
          optionSets,
        } satisfies RetailMetadata;
        break;
      }
      case 'service': {
        const parsed = durationMinutes ? parseInt(durationMinutes, 10) : null;
        const serviceResult = serviceSchema.safeParse({
          durationMinutes: parsed,
          requiresBooking,
        });
        if (!serviceResult.success) {
          fieldErrors = { ...fieldErrors, ...flattenZodErrors(serviceResult.error) };
        }
        itemType = 'service';
        // TODO: Backend does not yet have metadata column — storing service-specific config will need a schema migration
        metadata = {
          durationMinutes: parsed ?? undefined,
          requiresBooking,
        } satisfies ServiceMetadata;
        break;
      }
      case 'package': {
        const effectiveFixedPrice =
          pricingMode === 'sum_of_components' ? componentsSubtotal : fixedPrice;
        const pkgResult = packageSchema.safeParse({
          packageComponents,
          fixedPrice: effectiveFixedPrice,
        });
        if (!pkgResult.success) {
          fieldErrors = { ...fieldErrors, ...flattenZodErrors(pkgResult.error) };
        }
        // For sum_of_components, require all component prices to be set
        if (pricingMode === 'sum_of_components') {
          packageComponents.forEach((c, i) => {
            if (!c.componentUnitPrice || c.componentUnitPrice <= 0) {
              fieldErrors[`packageComponents.${i}.componentUnitPrice`] =
                'Price required for each component';
            }
          });
        }
        itemType = 'other';
        metadata = {
          isPackage: true,
          packageComponents: packageComponents.map((c) => ({
            catalogItemId: c.catalogItemId,
            itemName: c.itemName,
            itemType: c.itemType,
            qty: c.qty,
            ...(c.componentUnitPrice != null && { componentUnitPrice: c.componentUnitPrice }),
          })),
          pricingMode,
        } satisfies PackageMetadata;
        break;
      }
      default:
        return;
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    // Build payload
    // TODO: Backend createItemSchema does not accept metadata yet — needs schema migration to add jsonb metadata column
    const payload: Record<string, unknown> = {
      name,
      itemType,
      defaultPrice: effectiveDefaultPrice,
      ...(sku && { sku }),
      ...(description && { description }),
      ...(categoryId && { categoryId }),
      ...(cost != null && { cost }),
      isTrackable: selectedType === 'retail' ? trackInventory : false,
      ...(modifierGroupIds.length > 0 && { modifierGroupIds }),
      metadata,
    };

    const result = await createItem(payload);
    if (result) {
      toast.success('Item created successfully');
      router.push('/catalog');
    }
  }

  // ── Step 1: Type Selection ────────────────────────────────────

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => router.push('/catalog')}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Items
          </button>

          <h1 className="mb-2 text-xl font-semibold text-gray-900">Create New Item</h1>
          <p className="mb-8 text-sm text-gray-500">
            Choose the type of item you want to create.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TYPE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => handleSelectType(card.key)}
                  className="group rounded-xl border border-gray-200 bg-surface p-6 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Type-specific form ────────────────────────────────

  const typeBadge = selectedType ? ITEM_TYPE_BADGES[selectedType] : null;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push('/catalog')}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to Items
        </button>

        <h1 className="mb-6 text-xl font-semibold text-gray-900">Create New Item</h1>

        <form onSubmit={handleSubmit}>
          <div className="rounded-xl border border-gray-200 bg-surface p-6 shadow-sm">
            <div className="space-y-4">
              {/* Type badge + change link */}
              <div className="flex items-center gap-3">
                {typeBadge && (
                  <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
                )}
                <button
                  type="button"
                  onClick={handleBackToTypeSelection}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Change
                </button>
              </div>

              {/* ── Common fields ─────────────────────────────── */}

              <FormField label="Name" required error={errors.name}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Item name"
                  className={errors.name ? inputErrorClassName : inputClassName}
                />
              </FormField>

              <FormField label="SKU" helpText="Optional. Auto-uppercased." error={errors.sku}>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  onBlur={() => setSku((prev) => prev.toUpperCase())}
                  placeholder="e.g. BEV-001"
                  className={errors.sku ? inputErrorClassName : inputClassName}
                />
              </FormField>

              <FormField label="Description" error={errors.description}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className={errors.description ? inputErrorClassName : inputClassName}
                />
              </FormField>

              {/* Department / Sub-Department / Category cascade */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="Department">
                  <Select
                    options={deptOptions}
                    value={departmentId}
                    onChange={(v) => {
                      setDepartmentId(v as string);
                      setSubDepartmentId('');
                      setCategoryId('');
                    }}
                    placeholder="Select..."
                  />
                </FormField>

                <FormField label="Sub-Department">
                  <Select
                    options={subDeptOptions}
                    value={subDepartmentId}
                    onChange={(v) => {
                      setSubDepartmentId(v as string);
                      setCategoryId('');
                    }}
                    placeholder="Select..."
                  />
                </FormField>

                <FormField label="Category">
                  <Select
                    options={catOptions}
                    value={categoryId}
                    onChange={(v) => setCategoryId(v as string)}
                    placeholder="Select..."
                  />
                </FormField>
              </div>

              {/* Price fields — hidden for Package type since it has its own fixed price */}
              {selectedType !== 'package' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Default Price" required error={errors.defaultPrice}>
                    <CurrencyInput
                      value={defaultPrice}
                      onChange={setDefaultPrice}
                      error={errors.defaultPrice}
                    />
                  </FormField>

                  <FormField label="Cost" helpText="Optional. Used for margin reporting.">
                    <CurrencyInput value={cost} onChange={setCost} />
                  </FormField>
                </div>
              )}

              {/* Tax info note */}
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700">
                  Tax groups are assigned per-location on the item detail page after creation.
                </p>
              </div>

              {/* ── Type-specific sections ────────────────────── */}

              {selectedType === 'fnb' && (
                <FnbFields
                  subType={fnbSubType}
                  onSubTypeChange={setFnbSubType}
                  allowSpecialInstructions={allowSpecialInstructions}
                  onAllowSpecialInstructionsChange={setAllowSpecialInstructions}
                  allowedFractions={allowedFractions}
                  onToggleFraction={toggleFraction}
                  defaultModifierGroupIds={defaultModifierGroupIds}
                  onDefaultModifierGroupIdsChange={(v) => setDefaultModifierGroupIds(v as string[])}
                  optionalModifierGroupIds={optionalModifierGroupIds}
                  onOptionalModifierGroupIdsChange={(v) => setOptionalModifierGroupIds(v as string[])}
                  modifierGroupOptions={modifierGroupOptions}
                  errors={errors}
                />
              )}

              {selectedType === 'retail' && (
                <RetailFields
                  trackInventory={trackInventory}
                  onTrackInventoryChange={setTrackInventory}
                  optionSets={optionSets}
                  showOptionSetForm={showOptionSetForm}
                  onShowOptionSetForm={setShowOptionSetForm}
                  newOptionSetName={newOptionSetName}
                  onNewOptionSetNameChange={setNewOptionSetName}
                  newOptionSetOptions={newOptionSetOptions}
                  newOptionSetRequired={newOptionSetRequired}
                  onNewOptionSetRequiredChange={setNewOptionSetRequired}
                  newOptionInput={newOptionInput}
                  onNewOptionInputChange={setNewOptionInput}
                  onAddOptionTag={handleAddOptionTag}
                  onRemoveOptionTag={handleRemoveOptionTag}
                  onSaveOptionSet={handleSaveOptionSet}
                  onRemoveOptionSet={handleRemoveOptionSet}
                  errors={errors}
                />
              )}

              {selectedType === 'service' && (
                <ServiceFields
                  durationMinutes={durationMinutes}
                  onDurationChange={setDurationMinutes}
                  requiresBooking={requiresBooking}
                  onRequiresBookingChange={setRequiresBooking}
                  errors={errors}
                />
              )}

              {selectedType === 'package' && (
                <PackageFields
                  components={packageComponents}
                  showSearch={showComponentSearch}
                  onShowSearch={setShowComponentSearch}
                  searchQuery={componentSearch}
                  onSearchChange={setComponentSearch}
                  searchResults={filteredSearchItems}
                  onAddComponent={handleAddComponent}
                  onRemoveComponent={handleRemoveComponent}
                  onQtyChange={handleComponentQtyChange}
                  onComponentUnitPriceChange={handleComponentUnitPriceChange}
                  pricingMode={pricingMode}
                  onPricingModeChange={setPricingMode}
                  componentsSubtotal={componentsSubtotal}
                  fixedPrice={fixedPrice}
                  onFixedPriceChange={setFixedPrice}
                  cost={cost}
                  onCostChange={setCost}
                  errors={errors}
                />
              )}
            </div>

            {/* Submit */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-6">
              <button
                type="button"
                onClick={() => router.push('/catalog')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── F&B Fields ──────────────────────────────────────────────────

interface FnbFieldsProps {
  subType: 'food' | 'beverage';
  onSubTypeChange: (v: 'food' | 'beverage') => void;
  allowSpecialInstructions: boolean;
  onAllowSpecialInstructionsChange: (v: boolean) => void;
  allowedFractions: number[];
  onToggleFraction: (fraction: number) => void;
  defaultModifierGroupIds: string[];
  onDefaultModifierGroupIdsChange: (v: string | string[]) => void;
  optionalModifierGroupIds: string[];
  onOptionalModifierGroupIdsChange: (v: string | string[]) => void;
  modifierGroupOptions: SelectOption[];
  errors: FieldErrors;
}

function FnbFields({
  subType,
  onSubTypeChange,
  allowSpecialInstructions,
  onAllowSpecialInstructionsChange,
  allowedFractions,
  onToggleFraction,
  defaultModifierGroupIds,
  onDefaultModifierGroupIdsChange,
  optionalModifierGroupIds,
  onOptionalModifierGroupIdsChange,
  modifierGroupOptions,
  errors,
}: FnbFieldsProps) {
  const fractionOptions = [1.0, 0.5, 0.25];

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">F&B Options</h3>

      {/* Sub-type */}
      <FormField label="Sub-type" required>
        <div className="flex gap-4">
          {(['food', 'beverage'] as const).map((val) => (
            <label key={val} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="fnbSubType"
                value={val}
                checked={subType === val}
                onChange={() => onSubTypeChange(val)}
                className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {val === 'food' ? 'Food' : 'Beverage'}
            </label>
          ))}
        </div>
      </FormField>

      {/* Allow Special Instructions */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={allowSpecialInstructions}
          onChange={(e) => onAllowSpecialInstructionsChange(e.target.checked)}
          className={checkboxClassName}
        />
        Allow Special Instructions
      </label>

      {/* Allowed Fractions */}
      <FormField
        label="Allowed Fractions"
        error={errors.allowedFractions}
        helpText="Which portion sizes can be ordered"
      >
        <div className="flex gap-4">
          {fractionOptions.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={allowedFractions.includes(f)}
                onChange={() => onToggleFraction(f)}
                className={checkboxClassName}
              />
              {f}
            </label>
          ))}
        </div>
      </FormField>

      {/* Default Modifier Groups */}
      <FormField label="Default Modifier Groups" helpText="Always shown when this item is ordered">
        <Select
          options={modifierGroupOptions}
          value={defaultModifierGroupIds}
          onChange={onDefaultModifierGroupIdsChange}
          multiple
          placeholder="Select modifier groups..."
        />
      </FormField>

      {/* Optional Modifier Groups */}
      <FormField label="Optional Modifier Groups" helpText="Available but not shown by default">
        <Select
          options={modifierGroupOptions}
          value={optionalModifierGroupIds}
          onChange={onOptionalModifierGroupIdsChange}
          multiple
          placeholder="Select modifier groups..."
        />
      </FormField>
    </div>
  );
}

// ── Retail Fields ───────────────────────────────────────────────

interface RetailFieldsProps {
  trackInventory: boolean;
  onTrackInventoryChange: (v: boolean) => void;
  optionSets: OptionSet[];
  showOptionSetForm: boolean;
  onShowOptionSetForm: (v: boolean) => void;
  newOptionSetName: string;
  onNewOptionSetNameChange: (v: string) => void;
  newOptionSetOptions: string[];
  newOptionSetRequired: boolean;
  onNewOptionSetRequiredChange: (v: boolean) => void;
  newOptionInput: string;
  onNewOptionInputChange: (v: string) => void;
  onAddOptionTag: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRemoveOptionTag: (tag: string) => void;
  onSaveOptionSet: () => void;
  onRemoveOptionSet: (index: number) => void;
  errors: FieldErrors;
}

function RetailFields({
  trackInventory,
  onTrackInventoryChange,
  optionSets,
  showOptionSetForm,
  onShowOptionSetForm,
  newOptionSetName,
  onNewOptionSetNameChange,
  newOptionSetOptions,
  newOptionSetRequired,
  onNewOptionSetRequiredChange,
  newOptionInput,
  onNewOptionInputChange,
  onAddOptionTag,
  onRemoveOptionTag,
  onSaveOptionSet,
  onRemoveOptionSet,
  errors: _errors,
}: RetailFieldsProps) {
  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Retail Options</h3>

      {/* Track Inventory */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={trackInventory}
          onChange={(e) => onTrackInventoryChange(e.target.checked)}
          className={checkboxClassName}
        />
        Track Inventory
      </label>

      {/* Option Set Builder */}
      {/* TODO: Backend retail_option_groups table not yet available — storing in metadata.optionSets */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Option Sets</label>
          <button
            type="button"
            onClick={() => onShowOptionSetForm(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Add Option Set
          </button>
        </div>

        {/* Existing option sets */}
        {optionSets.length > 0 && (
          <div className="space-y-2">
            {optionSets.map((os, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{os.name}</span>
                  {os.required && (
                    <span className="ml-2 text-xs text-red-500">Required</span>
                  )}
                  <p className="text-xs text-gray-500">{os.options.join(' \u00B7 ')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveOptionSet(idx)}
                  className="rounded p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inline option set form */}
        {showOptionSetForm && (
          <div className="mt-2 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
            <FormField label="Option Set Name" required>
              <input
                type="text"
                value={newOptionSetName}
                onChange={(e) => onNewOptionSetNameChange(e.target.value)}
                placeholder="e.g. Size, Color"
                className={inputClassName}
              />
            </FormField>

            <FormField label="Options" helpText="Type an option and press Enter">
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-2">
                {newOptionSetOptions.map((opt) => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {opt}
                    <button
                      type="button"
                      onClick={() => onRemoveOptionTag(opt)}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={newOptionInput}
                  onChange={(e) => onNewOptionInputChange(e.target.value)}
                  onKeyDown={onAddOptionTag}
                  placeholder={newOptionSetOptions.length === 0 ? 'Type and press Enter...' : ''}
                  className="min-w-[100px] flex-1 border-none bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 focus:outline-none"
                />
              </div>
            </FormField>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newOptionSetRequired}
                onChange={(e) => onNewOptionSetRequiredChange(e.target.checked)}
                className={checkboxClassName}
              />
              Required
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSaveOptionSet}
                disabled={!newOptionSetName.trim() || newOptionSetOptions.length === 0}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Option Set
              </button>
              <button
                type="button"
                onClick={() => onShowOptionSetForm(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          Retail items are sold as 1 unit per line item.
        </p>
      </div>
    </div>
  );
}

// ── Service Fields ──────────────────────────────────────────────

interface ServiceFieldsProps {
  durationMinutes: string;
  onDurationChange: (v: string) => void;
  requiresBooking: boolean;
  onRequiresBookingChange: (v: boolean) => void;
  errors: FieldErrors;
}

function ServiceFields({
  durationMinutes,
  onDurationChange,
  requiresBooking,
  onRequiresBookingChange,
  errors,
}: ServiceFieldsProps) {
  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Service Options</h3>

      <FormField
        label="Duration (minutes)"
        helpText="Optional. Typical length of the service."
        error={errors.durationMinutes}
      >
        <input
          type="number"
          value={durationMinutes}
          onChange={(e) => onDurationChange(e.target.value)}
          placeholder="e.g. 60"
          min={1}
          step={1}
          className={errors.durationMinutes ? inputErrorClassName : inputClassName}
        />
      </FormField>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={requiresBooking}
          onChange={(e) => onRequiresBookingChange(e.target.checked)}
          className={checkboxClassName}
        />
        Requires Booking
      </label>

      {/* Info note */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          Services are sold as 1 unit per line item.
        </p>
      </div>
    </div>
  );
}

// ── Package Fields ──────────────────────────────────────────────

interface PackageFieldsProps {
  components: PackageComponent[];
  showSearch: boolean;
  onShowSearch: (v: boolean) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  searchResults: CatalogItemRow[];
  onAddComponent: (item: CatalogItemRow) => void;
  onRemoveComponent: (catalogItemId: string) => void;
  onQtyChange: (catalogItemId: string, qty: number) => void;
  onComponentUnitPriceChange: (catalogItemId: string, price: number | null) => void;
  pricingMode: 'fixed' | 'sum_of_components';
  onPricingModeChange: (v: 'fixed' | 'sum_of_components') => void;
  componentsSubtotal: number;
  fixedPrice: number | null;
  onFixedPriceChange: (v: number | null) => void;
  cost: number | null;
  onCostChange: (v: number | null) => void;
  errors: FieldErrors;
}

function PackageFields({
  components,
  showSearch,
  onShowSearch,
  searchQuery,
  onSearchChange,
  searchResults,
  onAddComponent,
  onRemoveComponent,
  onQtyChange,
  onComponentUnitPriceChange,
  pricingMode,
  onPricingModeChange,
  componentsSubtotal,
  fixedPrice,
  onFixedPriceChange,
  cost,
  onCostChange,
  errors,
}: PackageFieldsProps) {
  // Determine if an item type allows fractions
  function getQtyOptions(itemType: string): SelectOption[] | null {
    const group = getItemTypeGroup(itemType);
    if (group === 'fnb') {
      return [
        { value: '0.25', label: '0.25' },
        { value: '0.5', label: '0.5' },
        { value: '1', label: '1' },
      ];
    }
    return null; // integer input for retail/service
  }

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Package Components</h3>

      {/* TODO: Backend does not have package_components table — storing in metadata.packageComponents */}

      {/* Add Component button */}
      <button
        type="button"
        onClick={() => onShowSearch(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-indigo-300 hover:text-indigo-600"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add Component
      </button>

      {/* Search dialog */}
      {showSearch && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
          <SearchInput
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search items..."
          />
          {searchQuery && (
            <ul className="mt-2 max-h-48 divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-200 bg-surface">
              {searchResults.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">No items found</li>
              )}
              {searchResults.map((item) => {
                const group = getItemTypeGroup(item.itemType, item.metadata);
                const badge = ITEM_TYPE_BADGES[group];
                const alreadyAdded = components.some((c) => c.catalogItemId === item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onAddComponent(item)}
                      disabled={alreadyAdded}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-gray-900">{item.name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              onShowSearch(false);
              onSearchChange('');
            }}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>
      )}

      {/* Pricing mode toggle */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={pricingMode === 'sum_of_components'}
          onChange={(e) =>
            onPricingModeChange(e.target.checked ? 'sum_of_components' : 'fixed')
          }
          className={checkboxClassName}
        />
        Price as sum of components
      </label>

      {/* Component list */}
      {errors.packageComponents && (
        <p className="text-xs text-red-600">{errors.packageComponents}</p>
      )}

      {components.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                {pricingMode === 'sum_of_components' && (
                  <>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Unit Price</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Extended</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Alloc %</th>
                  </>
                )}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-surface">
              {components.map((comp, idx) => {
                const group = getItemTypeGroup(comp.itemType);
                const badge = ITEM_TYPE_BADGES[group];
                const qtyOpts = getQtyOptions(comp.itemType);
                const extended = (comp.componentUnitPrice ?? 0) * comp.qty;
                const allocPct =
                  pricingMode === 'sum_of_components' && componentsSubtotal > 0
                    ? ((extended / componentsSubtotal) * 100).toFixed(1)
                    : null;
                const priceError =
                  errors[`packageComponents.${idx}.componentUnitPrice`];

                return (
                  <tr key={comp.catalogItemId}>
                    <td className="px-4 py-2 text-sm text-gray-900">{comp.itemName}</td>
                    <td className="px-4 py-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {qtyOpts ? (
                        <select
                          value={String(comp.qty)}
                          onChange={(e) =>
                            onQtyChange(comp.catalogItemId, parseFloat(e.target.value))
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        >
                          {qtyOpts.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={comp.qty}
                          onChange={(e) =>
                            onQtyChange(
                              comp.catalogItemId,
                              Math.max(1, parseInt(e.target.value, 10) || 1),
                            )
                          }
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      )}
                    </td>
                    {pricingMode === 'sum_of_components' && (
                      <>
                        <td className="px-4 py-2 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={comp.componentUnitPrice ?? ''}
                              onChange={(e) =>
                                onComponentUnitPriceChange(
                                  comp.catalogItemId,
                                  e.target.value === '' ? null : parseFloat(e.target.value),
                                )
                              }
                              placeholder="0.00"
                              className={`w-24 rounded border px-2 py-1 text-right text-sm focus:ring-1 focus:outline-none ${priceError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`}
                            />
                            {priceError && (
                              <span className="text-xs text-red-600">Required</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-gray-700">
                          ${extended.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-gray-500">
                          {allocPct != null ? `${allocPct}%` : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveComponent(comp.catalogItemId)}
                        className="rounded p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {pricingMode === 'sum_of_components' && components.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-sm font-medium text-gray-700">
                    Components Total
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                    —
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-indigo-600">
                    ${componentsSubtotal.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">100%</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Price / Cost */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pricingMode === 'fixed' ? (
          <FormField label="Fixed Price" required error={errors.fixedPrice}>
            <CurrencyInput
              value={fixedPrice}
              onChange={onFixedPriceChange}
              error={errors.fixedPrice}
            />
          </FormField>
        ) : (
          <FormField
            label="Package Price"
            helpText="Automatically derived from component sum"
          >
            <div className="flex h-9.5 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">
              ${componentsSubtotal.toFixed(2)}
            </div>
          </FormField>
        )}

        <FormField label="Cost" helpText="Optional. Used for margin reporting.">
          <CurrencyInput value={cost} onChange={onCostChange} />
        </FormField>
      </div>
    </div>
  );
}
