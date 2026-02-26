'use client';

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '@/lib/dialog-a11y';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isLoading = false,
  children,
}: ConfirmDialogProps) {
  const instanceId = useId();
  const titleId = `confirm-dialog-title-${instanceId}`;
  const descId = `confirm-dialog-desc-${instanceId}`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useDialogA11y(dialogRef, open, {
    labelledBy: titleId,
    describedBy: description ? descId : undefined,
    onClose,
    role: destructive ? 'alertdialog' : 'dialog',
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold text-foreground">{title}</h3>
        {description && <p id={descId} className="mt-2 text-sm text-gray-500">{description}</p>}
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isLoading}
            data-autofocus
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
