'use client';

import { DollarSign, Settings, Users } from 'lucide-react';

export interface QuickFilterPreset {
  label: string;
  icon: typeof DollarSign;
  filters: Record<string, string>;
}

const PRESETS: QuickFilterPreset[] = [
  {
    label: 'Financial',
    icon: DollarSign,
    filters: {
      action: 'order.void,order.refund,tender.reverse,gl.*,close_batch.*',
    },
  },
  {
    label: 'Config Changes',
    icon: Settings,
    filters: {
      action: '*.update,*.create,*.delete',
      entity_type: 'catalog_item,tax_rate,location,terminal,role',
    },
  },
  {
    label: 'User Mgmt',
    icon: Users,
    filters: {
      entity_type: 'user',
    },
  },
];

interface AuditQuickFiltersProps {
  activePreset: string | null;
  onSelect: (preset: QuickFilterPreset | null) => void;
}

export function AuditQuickFilters({ activePreset, onSelect }: AuditQuickFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Quick:</span>
      {PRESETS.map((p) => {
        const isActive = activePreset === p.label;
        return (
          <button
            key={p.label}
            onClick={() => onSelect(isActive ? null : p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-surface text-muted-foreground border-border hover:text-foreground hover:border-slate-500'
            }`}
          >
            <p.icon size={12} />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export { PRESETS as AUDIT_QUICK_FILTER_PRESETS };
