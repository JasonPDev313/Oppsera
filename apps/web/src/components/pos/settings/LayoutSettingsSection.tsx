'use client';

import { memo, useCallback } from 'react';
import { ChevronDown, LayoutGrid, List } from 'lucide-react';
import type { POSLayoutConfig } from '@/types/pos';

interface LayoutSettingsSectionProps {
  layout: POSLayoutConfig | undefined;
  onUpdate: (layout: POSLayoutConfig) => void;
}

const TILE_SIZES: Array<{ value: 'small' | 'medium' | 'large'; label: string; px: string }> = [
  { value: 'small', label: 'S', px: '100px' },
  { value: 'medium', label: 'M', px: '130px' },
  { value: 'large', label: 'L', px: '160px' },
];

export const LayoutSettingsSection = memo(function LayoutSettingsSection({
  layout,
  onUpdate,
}: LayoutSettingsSectionProps) {
  const splitRatio = layout?.splitRatio ?? 60;
  const tileSize = layout?.itemTileSize ?? 'medium';
  const viewMode = layout?.defaultViewMode ?? 'grid';

  const update = useCallback(
    (patch: Partial<POSLayoutConfig>) => {
      onUpdate({ ...layout, ...patch });
    },
    [layout, onUpdate],
  );

  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center gap-3 py-3 select-none">
        <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        <div>
          <h4 className="text-sm font-semibold text-foreground">Layout</h4>
          <p className="text-xs text-gray-500">Adjust the POS screen layout and tile sizes</p>
        </div>
      </summary>

      <div className="space-y-5 pb-4 pl-7">
        {/* Split ratio slider */}
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">
            Catalog / Cart Width
          </label>
          <div className="space-y-2">
            {/* Mini preview */}
            <div className="flex h-8 gap-1 rounded-md overflow-hidden border border-border">
              <div
                className="bg-indigo-500/20 transition-all duration-200"
                style={{ width: `${splitRatio}%` }}
              />
              <div
                className="bg-emerald-500/20 transition-all duration-200"
                style={{ width: `${100 - splitRatio}%` }}
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50}
                max={80}
                step={5}
                value={splitRatio}
                onChange={(e) => update({ splitRatio: parseInt(e.target.value, 10) })}
                className="flex-1 accent-indigo-600"
              />
              <span className="w-14 text-right text-sm font-medium text-foreground">
                {splitRatio}/{100 - splitRatio}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Catalog</span>
              <span>Cart</span>
            </div>
          </div>
        </div>

        {/* Item tile size */}
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Item Tile Size</label>
          <div className="flex gap-2">
            {TILE_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => update({ itemTileSize: size.value })}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 px-4 py-2 transition-colors ${
                  tileSize === size.value
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                    : 'border-border text-muted-foreground hover:border-gray-300'
                }`}
              >
                <span className="text-sm font-semibold">{size.label}</span>
                <span className="text-[10px] text-gray-400">{size.px}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Default view mode */}
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Default View Mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update({ defaultViewMode: 'grid' })}
              className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-colors ${
                viewMode === 'grid'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-sm font-medium">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => update({ defaultViewMode: 'list' })}
              className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-colors ${
                viewMode === 'list'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <List className="h-4 w-4" />
              <span className="text-sm font-medium">List</span>
            </button>
          </div>
        </div>
      </div>
    </details>
  );
});
