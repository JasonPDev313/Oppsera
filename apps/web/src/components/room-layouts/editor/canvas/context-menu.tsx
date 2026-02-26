'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '@/stores/room-layout-editor';
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Lock,
  Unlock,
  ArrowUpToLine,
  ArrowDownToLine,
  CopyPlus,
  BoxSelect,
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  hasClipboard: boolean;
}

export function ContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onPaste,
  onDuplicate,
  hasClipboard,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const objects = useEditorStore((s) => s.objects);
  const removeObjects = useEditorStore((s) => s.removeObjects);
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const selectAll = useEditorStore((s) => s.selectAll);

  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
  const hasSingle = selectedObjects.length === 1;
  const hasSelection = selectedObjects.length > 0;

  // Close on click outside or Escape
  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClose);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleDelete = () => {
    if (hasSelection) {
      removeObjects(selectedIds);
      commitToHistory();
    }
    onClose();
  };

  const handleToggleLock = () => {
    if (!hasSingle) return;
    const obj = selectedObjects[0]!;
    updateObject(obj.id, { locked: !obj.locked });
    commitToHistory();
    onClose();
  };

  const handleBringToFront = () => {
    if (!hasSingle) return;
    const maxZ = Math.max(0, ...objects.map((o) => o.zIndex));
    updateObject(selectedObjects[0]!.id, { zIndex: maxZ + 1 });
    commitToHistory();
    onClose();
  };

  const handleSendToBack = () => {
    if (!hasSingle) return;
    const minZ = Math.min(0, ...objects.map((o) => o.zIndex));
    updateObject(selectedObjects[0]!.id, { zIndex: minZ - 1 });
    commitToHistory();
    onClose();
  };

  const handleSelectAll = () => {
    selectAll();
    onClose();
  };

  const items: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    disabled?: boolean;
    separator?: boolean;
  }> = [];

  if (hasSelection) {
    items.push(
      { label: 'Copy', icon: Copy, onClick: () => { onCopy(); onClose(); } },
      { label: 'Duplicate', icon: CopyPlus, onClick: () => { onDuplicate(); onClose(); } },
    );
    if (hasSingle) {
      const isLocked = selectedObjects[0]!.locked;
      items.push(
        { label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? Unlock : Lock, onClick: handleToggleLock, separator: true },
        { label: 'Bring to Front', icon: ArrowUpToLine, onClick: handleBringToFront },
        { label: 'Send to Back', icon: ArrowDownToLine, onClick: handleSendToBack },
      );
    }
    items.push({ label: 'Delete', icon: Trash2, onClick: handleDelete, separator: true });
  } else {
    // Empty canvas context
    items.push(
      { label: 'Paste', icon: ClipboardPaste, onClick: () => { onPaste(); onClose(); }, disabled: !hasClipboard },
      { label: 'Select All', icon: BoxSelect, onClick: handleSelectAll },
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-45 rounded-md border border-border bg-surface py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.separator && i > 0 && (
            <div className="my-1 border-t border-border" />
          )}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={item.onClick}
            disabled={item.disabled}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
