'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Shield, Clock } from 'lucide-react';
import type { EntitlementItem, AccessMode } from '@/types/tenant';
import { ModuleModeSelector } from './ModuleModeSelector';

interface ModuleCardProps {
  module: EntitlementItem;
  onModeChange: (moduleKey: string, mode: AccessMode) => void;
}

const RISK_BADGE: Record<string, { color: string; label: string }> = {
  low: { color: 'text-slate-400', label: '' },
  medium: { color: 'text-amber-400', label: 'Medium Risk' },
  high: { color: 'text-orange-400', label: 'High Risk' },
  critical: { color: 'text-red-400', label: 'Critical' },
};

export function ModuleCard({ module, onModeChange }: ModuleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const riskInfo = RISK_BADGE[module.riskLevel] ?? RISK_BADGE.low!;
  const isPlatformCore = module.moduleKey === 'platform_core';

  return (
    <div
      className={`rounded-lg border transition-colors ${
        module.accessMode === 'full'
          ? 'bg-slate-800 border-slate-700'
          : module.accessMode === 'view'
            ? 'bg-slate-800 border-amber-500/30'
            : 'bg-slate-800/50 border-slate-700/50'
      }`}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-500 hover:text-white transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${module.accessMode !== 'off' ? 'text-white' : 'text-slate-500'}`}>
              {module.moduleName}
            </span>
            {riskInfo.label && (
              <span className={`text-[10px] font-semibold uppercase ${riskInfo.color}`}>
                {riskInfo.label}
              </span>
            )}
            {module.expiresAt && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                <Clock size={10} /> Trial
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">{module.moduleDescription}</p>
        </div>

        {/* Mode selector */}
        <ModuleModeSelector
          value={module.accessMode}
          supportsViewMode={module.supportsViewMode}
          disabled={isPlatformCore}
          onChange={(mode) => onModeChange(module.moduleKey, mode)}
        />

        {/* Module key */}
        <span className="text-[10px] font-mono text-slate-600 hidden xl:block w-24 text-right">
          {module.moduleKey}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-700/50 space-y-2">
          {/* Dependencies */}
          {module.dependencies.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Requires:</span>
              <div className="flex flex-wrap gap-1">
                {module.dependencies.map((dep) => (
                  <span key={dep} className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 text-[10px] font-mono">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dependents */}
          {module.dependents.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Used by:</span>
              <div className="flex flex-wrap gap-1">
                {module.dependents.map((dep) => (
                  <span key={dep} className="px-1.5 py-0.5 bg-indigo-500/20 rounded text-indigo-300 text-[10px] font-mono">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Last changed */}
          {module.changedBy && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Last changed by {module.changedBy}</span>
              {module.lastChangedAt && (
                <span>on {new Date(module.lastChangedAt).toLocaleDateString()}</span>
              )}
              {module.changeReason && (
                <span className="italic text-slate-400">&mdash; {module.changeReason}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
