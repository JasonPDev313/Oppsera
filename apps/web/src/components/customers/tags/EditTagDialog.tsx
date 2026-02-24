'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { useTagMutations } from '@/hooks/use-tags';
import type { TagListItem } from '@/hooks/use-tags';

const COLOR_PRESETS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
];

const CATEGORIES = [
  { value: 'behavior', label: 'Behavior' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'demographic', label: 'Demographic' },
  { value: 'operational', label: 'Operational' },
];

interface EditTagDialogProps {
  open: boolean;
  onClose: () => void;
  tag: TagListItem | null;
  onUpdated: () => void;
}

export function EditTagDialog({ open, onClose, tag, onUpdated }: EditTagDialogProps) {
  const { toast } = useToast();
  const { updateTag, isSubmitting } = useTagMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [customColor, setCustomColor] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form state from tag prop
  useEffect(() => {
    if (!tag) return;
    setName(tag.name);
    setDescription(tag.description ?? '');
    setIcon(tag.icon ?? '');
    setCategory(tag.category ?? '');
    setErrors({});

    // Set color: if it matches a preset, select it; otherwise put it in custom
    if (COLOR_PRESETS.includes(tag.color)) {
      setColor(tag.color);
      setCustomColor('');
    } else {
      setColor('');
      setCustomColor(tag.color);
    }
  }, [tag]);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setColor(COLOR_PRESETS[0]);
    setCustomColor('');
    setIcon('');
    setCategory('');
    setErrors({});
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }
    const resolvedColor = customColor || color;
    if (resolvedColor && !/^#[0-9A-Fa-f]{6}$/.test(resolvedColor)) {
      newErrors.color = 'Invalid hex color (e.g. #3B82F6)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!tag || !validate()) return;
    try {
      const resolvedColor = customColor || color;
      await updateTag(tag.id, {
        name: name.trim(),
        description: description.trim() || null,
        color: resolvedColor || undefined,
        icon: icon.trim() || null,
        category: category || null,
      });
      toast.success('Tag updated successfully');
      handleClose();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update tag');
    }
  };

  if (!open || !tag || typeof document === 'undefined') return null;

  // System tags cannot be edited
  if (tag.isSystem) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
        <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Edit Tag</h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3">
            <p className="text-sm text-yellow-800">
              System tags cannot be edited. This tag is managed by the platform and its configuration is read-only.
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Edit Tag</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <FormField label="Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIP, High Spender, At Risk"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Type">
            <div className="flex items-center gap-2">
              {tag.tagType === 'smart' ? (
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                  Smart
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  Manual
                </span>
              )}
              <span className="text-xs text-gray-500">Tag type cannot be changed</span>
            </div>
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this tag"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
            />
          </FormField>

          <FormField label="Color" error={errors.color}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setColor(preset); setCustomColor(''); }}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      color === preset && !customColor
                        ? 'border-gray-900 scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset }}
                    aria-label={`Color ${preset}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  placeholder="Custom hex (e.g. #FF5733)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                {(customColor || color) && (
                  <span
                    className="inline-block h-8 w-8 shrink-0 rounded-full border border-gray-200"
                    style={{ backgroundColor: customColor || color }}
                  />
                )}
              </div>
            </div>
          </FormField>

          <FormField label="Icon" helpText="Lucide icon name (e.g. star, heart, tag)">
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Optional icon name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
