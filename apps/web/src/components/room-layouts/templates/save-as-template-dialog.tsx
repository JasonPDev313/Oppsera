'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { saveAsTemplateApi } from '@/hooks/use-room-layouts';
import { useEditorStore } from '@/stores/room-layout-editor';
import { useToast } from '@/components/ui/toast';

interface SaveAsTemplateDialogProps {
  onClose: () => void;
}

const CATEGORIES = [
  { value: 'dining', label: 'Dining' },
  { value: 'banquet', label: 'Banquet' },
  { value: 'bar', label: 'Bar' },
  { value: 'patio', label: 'Patio' },
  { value: 'custom', label: 'Custom' },
];

export function SaveAsTemplateDialog({ onClose }: SaveAsTemplateDialogProps) {
  const { toast } = useToast();
  const roomName = useEditorStore((s) => s.roomName);
  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);
  const getSnapshot = useEditorStore((s) => s.getSnapshot);

  const [name, setName] = useState(roomName);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('dining');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const snapshot = getSnapshot();
      await saveAsTemplateApi({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        snapshotJson: snapshot as unknown as Record<string, unknown>,
        widthFt,
        heightFt,
      });
      toast.success('Template saved');
      onClose();
    } catch {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Save as Template</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">
              Cancel
            </button>
            <button type="submit" disabled={isSaving || !name.trim()} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
