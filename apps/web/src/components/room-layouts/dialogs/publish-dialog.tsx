'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload } from 'lucide-react';
import { FormField } from '@/components/ui/form-field';

interface PublishDialogProps {
  onClose: () => void;
  onPublish: (note: string) => void;
  isPublishing: boolean;
}

export function PublishDialog({ onClose, onPublish, isPublishing }: PublishDialogProps) {
  const [note, setNote] = useState('');

  const handleSubmit = useCallback(() => {
    onPublish(note.trim());
  }, [note, onPublish]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10">
            <Upload className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Publish Version</h3>
            <p className="text-sm text-muted-foreground">This will make the current draft live.</p>
          </div>
        </div>

        <div className="mt-4">
          <FormField label="Publish Note" helpText="Optional note describing changes">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Rearranged patio seating for summer"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPublishing}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 ${
              isPublishing ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
