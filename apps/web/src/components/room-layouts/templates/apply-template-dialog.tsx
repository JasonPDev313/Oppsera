'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { applyTemplateApi } from '@/hooks/use-room-layouts';
import { useToast } from '@/components/ui/toast';
import { TemplateGallery } from './template-gallery';
import type { TemplateRow } from '@/types/room-layouts';

interface ApplyTemplateDialogProps {
  roomId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function ApplyTemplateDialog({ roomId, onClose, onApplied }: ApplyTemplateDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleSelect = useCallback((template: TemplateRow) => {
    setSelected(template);
    setStep('confirm');
  }, []);

  const handleApply = useCallback(async () => {
    if (!selected) return;
    setIsApplying(true);
    try {
      await applyTemplateApi(roomId, selected.id);
      toast.success('Template applied');
      onApplied();
    } catch {
      toast.error('Failed to apply template');
    } finally {
      setIsApplying(false);
    }
  }, [roomId, selected, toast, onApplied]);

  if (typeof document === 'undefined') return null;

  if (step === 'select') {
    return <TemplateGallery onSelect={handleSelect} onClose={onClose} />;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Apply Template</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500" />
          <div>
            <p className="text-sm font-medium text-yellow-500">
              This will replace your current draft
            </p>
            <p className="mt-1 text-sm text-yellow-500">
          Applying &ldquo;{selected?.name}&rdquo; will replace all objects in your current draft with the template layout.
              This action can be undone with version history.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setStep('select')}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Back
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 ${
              isApplying ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isApplying ? 'Applying...' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
