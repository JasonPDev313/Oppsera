'use client';

import type { ModulePricingItem } from '@/types/pricing';

interface ModulePricingTableProps {
  modules: ModulePricingItem[];
  onUpdate: (moduleId: string, input: Partial<ModulePricingItem>) => Promise<unknown>;
}

export function ModulePricingTable({ modules, onUpdate }: ModulePricingTableProps) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900 text-slate-400">
            <th className="text-left px-4 py-3 font-medium">Module</th>
            <th className="text-left px-4 py-3 font-medium">Module Key</th>
            <th className="text-right px-4 py-3 font-medium">Per-Seat Add-on</th>
            <th className="text-right px-4 py-3 font-medium">Flat Fee</th>
            <th className="text-center px-4 py-3 font-medium">Is Add-on</th>
            <th className="text-left px-4 py-3 font-medium">Included In</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {modules.map((mod) => (
            <tr key={mod.id} className="hover:bg-slate-700/50 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{mod.displayName}</td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{mod.moduleKey}</td>
              <td className="px-4 py-3 text-right text-slate-300">
                {mod.pricePerSeatCents > 0
                  ? `$${(mod.pricePerSeatCents / 100).toFixed(2)}`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right text-slate-300">
                {mod.flatFeeCents > 0
                  ? `$${(mod.flatFeeCents / 100).toFixed(2)}`
                  : '—'}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => onUpdate(mod.id, { isAddon: !mod.isAddon })}
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    mod.isAddon
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-slate-600/30 text-slate-500'
                  }`}
                >
                  {mod.isAddon ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs">
                {mod.includedInTiers.length > 0
                  ? mod.includedInTiers.join(', ')
                  : 'All tiers'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
