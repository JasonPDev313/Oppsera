'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, GripVertical } from 'lucide-react';
import { useGLClassifications } from '@/hooks/use-accounting';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { AccountType, GLClassification } from '@/types/accounting';

interface ClassificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

const ACCOUNT_TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

export function ClassificationsPanel({ open, onClose }: ClassificationsPanelProps) {
  const { data: classifications, mutate } = useGLClassifications();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addingType, setAddingType] = useState<AccountType | null>(null);
  const [newName, setNewName] = useState('');

  const grouped: Record<AccountType, GLClassification[]> = {
    asset: [], liability: [], equity: [], revenue: [], expense: [],
  };
  for (const c of classifications) {
    grouped[c.accountType as AccountType]?.push(c);
  }
  for (const type of ACCOUNT_TYPE_ORDER) {
    grouped[type]!.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const handleSaveEdit = useCallback(async (id: string) => {
    if (!editName.trim()) return;
    try {
      await apiFetch(`/api/v1/accounting/classifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      toast.success('Classification updated');
      mutate();
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }, [editName, mutate, toast]);

  const handleCreate = useCallback(async (accountType: AccountType) => {
    if (!newName.trim()) return;
    const existing = grouped[accountType] ?? [];
    try {
      await apiFetch('/api/v1/accounting/classifications', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          accountType,
          sortOrder: existing.length + 1,
        }),
      });
      toast.success('Classification created');
      mutate();
      setAddingType(null);
      setNewName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    }
  }, [newName, grouped, mutate, toast]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-y-auto bg-surface shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Classifications</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {ACCOUNT_TYPE_ORDER.map((type) => {
            const items = grouped[type]!;
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {ACCOUNT_TYPE_LABELS[type]}
                  </h3>
                  <button
                    type="button"
                    onClick={() => { setAddingType(type); setNewName(''); }}
                    className="text-xs font-medium text-indigo-500 hover:text-indigo-500"
                  >
                    <Plus className="inline h-3.5 w-3.5" /> Add
                  </button>
                </div>

                <div className="space-y-1">
                  {items.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {editingId === c.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => handleSaveEdit(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(c.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 rounded border border-indigo-500/30 px-2 py-1 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="flex-1 cursor-pointer text-sm text-foreground hover:text-foreground"
                          onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                        >
                          {c.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">#{c.sortOrder}</span>
                    </div>
                  ))}

                  {addingType === type && (
                    <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreate(type);
                          if (e.key === 'Escape') setAddingType(null);
                        }}
                        placeholder="Classification name..."
                        className="flex-1 rounded border border-input px-2 py-1 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleCreate(type)}
                        className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {items.length === 0 && addingType !== type && (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      No classifications
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
