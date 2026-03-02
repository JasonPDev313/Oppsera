'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { ManageTabsPanel } from './ManageTabsPanel';

interface ManageTabsButtonProps {
  locationId: string;
}

export function ManageTabsButton({ locationId }: ManageTabsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        style={{
          background: 'var(--fnb-bg-elevated)',
          color: 'var(--fnb-text-secondary)',
          border: '1px solid var(--fnb-border-subtle)',
        }}
        title="Manage Tabs"
      >
        <Settings2 size={16} />
        <span className="hidden sm:inline">Manage Tabs</span>
      </button>
      {open && (
        <ManageTabsPanel
          locationId={locationId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
