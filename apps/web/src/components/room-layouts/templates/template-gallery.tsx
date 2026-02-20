'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, LayoutTemplate } from 'lucide-react';
import { useRoomTemplates } from '@/hooks/use-room-layouts';
import type { TemplateRow } from '@/types/room-layouts';
import { TemplateThumbnail } from './template-thumbnail';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'dining', label: 'Dining' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'bar', label: 'Bar' },
  { value: 'patio', label: 'Patio' },
  { value: 'custom', label: 'Custom' },
];

interface TemplateGalleryProps {
  onSelect: (template: TemplateRow) => void;
  onClose: () => void;
}

export function TemplateGallery({ onSelect, onClose }: TemplateGalleryProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<TemplateRow | null>(null);

  const { data: templates, isLoading, mutate } = useRoomTemplates({
    category: category || undefined,
    search: debouncedSearch || undefined,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    mutate();
  }, [mutate, debouncedSearch, category]);

  const handleUse = useCallback(() => {
    if (selected) onSelect(selected);
  }, [selected, onSelect]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-3xl flex-col rounded-lg bg-surface shadow-xl" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Template Gallery</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-200/50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-10 pr-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && templates.length === 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <LayoutTemplate className="mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm">No templates found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`flex flex-col overflow-hidden rounded-lg border text-left transition-all ${
                    selected?.id === t.id
                      ? 'border-indigo-500 ring-2 ring-indigo-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center bg-gray-50">
                    <TemplateThumbnail
                      snapshot={(t as unknown as { snapshotJson?: Record<string, unknown> }).snapshotJson ?? {}}
                      width={220}
                      height={140}
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                      {t.isSystemTemplate && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">System</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      {t.category && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-600">
                          {t.category}
                        </span>
                      )}
                      <span>{Number(t.widthFt)}×{Number(t.heightFt)} ft</span>
                      <span>{t.objectCount} obj</span>
                      {t.totalCapacity > 0 && <span>{t.totalCapacity} seats</span>}
                    </div>
                    {t.description && (
                      <p className="mt-1 truncate text-xs text-gray-400">{t.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            onClick={handleUse}
            disabled={!selected}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use Template
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
