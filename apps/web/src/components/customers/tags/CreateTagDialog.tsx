'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { useTagMutations } from '@/hooks/use-tags';

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

interface CreateTagDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTagDialog({ open, onClose, onCreated }: CreateTagDialogProps) {
  const { toast } = useToast();
  const { createTag, isSubmitting } = useTagMutations();

  const [name, setName] = useState('');
  const [tagType, setTagType] = useState<'manual' | 'smart' | ''>('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [customColor, setCustomColor] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setName('');
    setTagType('');
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
    if (!tagType) {
      newErrors.tagType = 'Type is required';
    }
    const resolvedColor = customColor || color;
    if (resolvedColor && !/^#[0-9A-Fa-f]{6}$/.test(resolvedColor)) {
      newErrors.color = 'Invalid hex color (e.g. #3B82F6)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      const resolvedColor = customColor || color;
      await createTag({
        name: name.trim(),
        tagType: tagType as 'manual' | 'smart',
        description: description.trim() || undefined,
        color: resolvedColor || undefined,
        icon: icon.trim() || undefined,
        category: category || undefined,
      });
      toast.success('Tag created successfully');
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tag');
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Create Tag</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Type" required error={errors.tagType}>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tagType"
                  value="manual"
                  checked={tagType === 'manual'}
                  onChange={() => setTagType('manual')}
                  className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-foreground">Manual</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tagType"
                  value="smart"
                  checked={tagType === 'smart'}
                  onChange={() => setTagType('smart')}
                  className="h-4 w-4 border-border text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-foreground">Smart</span>
              </label>
            </div>
          </FormField>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this tag"
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
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
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                {(customColor || color) && (
                  <span
                    className="inline-block h-8 w-8 shrink-0 rounded-full border border-border"
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
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          {tagType && (
            <FormField label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Creating...' : 'Create Tag'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
