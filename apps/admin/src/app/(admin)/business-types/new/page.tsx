'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';
import { useCategories } from '@/hooks/use-business-types';
import { useEffect } from 'react';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CreateBusinessTypePage() {
  const router = useRouter();
  const { categories, load: loadCategories } = useCategories();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [iconKey, setIconKey] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showAtSignup, setShowAtSignup] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugManual) {
        setSlug(toSlug(value));
      }
    },
    [slugManual],
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlugManual(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!slug.trim()) errs.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(slug)) errs.slug = 'Slug must be lowercase alphanumeric with hyphens';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setErrors({});

    try {
      const res = await adminFetch<{ data: { businessType: { id: string } } }>(
        '/api/v1/admin/business-types',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim(),
            categoryId: categoryId || undefined,
            description: description.trim() || undefined,
            iconKey: iconKey.trim() || undefined,
            isActive,
            showAtSignup,
            sortOrder,
          }),
        },
      );
      router.push(`/business-types/${res.data.businessType.id}`);
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'CONFLICT') {
        setErrors({ slug: 'A business type with this slug already exists' });
      } else {
        setErrors({ form: err instanceof Error ? err.message : 'Failed to create' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link
        href="/business-types"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to Business Types
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6">New Business Type</h1>

      {errors.form && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
          {errors.form}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="bt-name" className="block text-sm font-medium text-slate-300 mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="bt-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="e.g. Full-Service Restaurant"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="bt-slug" className="block text-sm font-medium text-slate-300 mb-1.5">
            Slug <span className="text-red-400">*</span>
          </label>
          <input
            id="bt-slug"
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            placeholder="full-service-restaurant"
          />
          <p className="text-xs text-amber-400 mt-1">Slug cannot be changed after creation</p>
          {errors.slug && <p className="text-xs text-red-400 mt-1">{errors.slug}</p>}
        </div>

        {/* Category */}
        <div>
          <label htmlFor="bt-category" className="block text-sm font-medium text-slate-300 mb-1.5">
            Category
          </label>
          <select
            id="bt-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Select category...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="bt-desc" className="block text-sm font-medium text-slate-300 mb-1.5">
            Description
          </label>
          <textarea
            id="bt-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Brief description of this business type..."
          />
        </div>

        {/* Icon Key */}
        <div>
          <label htmlFor="bt-icon" className="block text-sm font-medium text-slate-300 mb-1.5">
            Icon Key
          </label>
          <input
            id="bt-icon"
            type="text"
            value={iconKey}
            onChange={(e) => setIconKey(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            placeholder="e.g. utensils-crossed"
          />
          <p className="text-xs text-slate-500 mt-1">Lucide icon key (optional)</p>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-700 px-4 py-3">
            <span className="text-sm text-slate-300">Active</span>
            <Toggle checked={isActive} onChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-700 px-4 py-3">
            <span className="text-sm text-slate-300">Show at Signup</span>
            <Toggle
              checked={showAtSignup}
              onChange={setShowAtSignup}
              disabled={!isActive}
            />
          </div>
        </div>

        {/* Sort Order */}
        <div>
          <label htmlFor="bt-sort" className="block text-sm font-medium text-slate-300 mb-1.5">
            Sort Order
          </label>
          <input
            id="bt-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            min={0}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-6">
        <Link
          href="/business-types"
          className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {isSaving && <Loader2 size={16} className="animate-spin" />}
          Create Business Type
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-indigo-600' : 'bg-slate-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
