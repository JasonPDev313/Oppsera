'use client';

import type { AccessMode } from '@/types/tenant';

interface ModuleModeSelectorProps {
  value: AccessMode;
  supportsViewMode: boolean;
  disabled?: boolean;
  onChange: (mode: AccessMode) => void;
}

const MODE_CONFIG = {
  off: { label: 'OFF', bg: 'bg-slate-700', activeBg: 'bg-red-600', text: 'text-slate-400', activeText: 'text-white' },
  view: { label: 'VIEW', bg: 'bg-slate-700', activeBg: 'bg-amber-600', text: 'text-slate-400', activeText: 'text-white' },
  full: { label: 'FULL', bg: 'bg-slate-700', activeBg: 'bg-emerald-600', text: 'text-slate-400', activeText: 'text-white' },
} as const;

export function ModuleModeSelector({ value, supportsViewMode, disabled, onChange }: ModuleModeSelectorProps) {
  const modes: AccessMode[] = supportsViewMode ? ['off', 'view', 'full'] : ['off', 'full'];

  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-600">
      {modes.map((mode) => {
        const config = MODE_CONFIG[mode];
        const isActive = value === mode;
        return (
          <button
            key={mode}
            onClick={() => !disabled && onChange(mode)}
            disabled={disabled}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              isActive ? `${config.activeBg} ${config.activeText}` : `${config.bg} ${config.text} hover:bg-slate-600`
            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
