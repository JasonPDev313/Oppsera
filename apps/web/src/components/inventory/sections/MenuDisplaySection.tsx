'use client';

import { CollapsibleSection } from '../shared/CollapsibleSection';
import { getContrastTextColor } from '@/lib/contrast';

const MENU_COLORS = [
  // Row 1 — Pastels (lightest)
  { value: '#EFF6FF', label: 'Blue Pastel' },
  { value: '#EEF2FF', label: 'Indigo Pastel' },
  { value: '#F5F3FF', label: 'Violet Pastel' },
  { value: '#FDF4FF', label: 'Fuchsia Pastel' },
  { value: '#FFF1F2', label: 'Rose Pastel' },
  { value: '#FEF2F2', label: 'Red Pastel' },
  { value: '#FFF7ED', label: 'Orange Pastel' },
  { value: '#FFFBEB', label: 'Amber Pastel' },
  // Row 2 — Pastels continued
  { value: '#FEFCE8', label: 'Yellow Pastel' },
  { value: '#F7FEE7', label: 'Lime Pastel' },
  { value: '#F0FDF4', label: 'Green Pastel' },
  { value: '#ECFDF5', label: 'Emerald Pastel' },
  { value: '#F0FDFA', label: 'Teal Pastel' },
  { value: '#ECFEFF', label: 'Cyan Pastel' },
  { value: '#F0F9FF', label: 'Sky Pastel' },
  { value: '#F8FAFC', label: 'Slate Pastel' },
  // Row 3 — Mids (slightly deeper)
  { value: '#DBEAFE', label: 'Blue Mid' },
  { value: '#E0E7FF', label: 'Indigo Mid' },
  { value: '#EDE9FE', label: 'Violet Mid' },
  { value: '#FAE8FF', label: 'Fuchsia Mid' },
  { value: '#FFE4E6', label: 'Rose Mid' },
  { value: '#FEE2E2', label: 'Red Mid' },
  { value: '#FFEDD5', label: 'Orange Mid' },
  { value: '#FEF3C7', label: 'Amber Mid' },
  // Row 4 — Mids continued
  { value: '#FEF9C3', label: 'Yellow Mid' },
  { value: '#ECFCCB', label: 'Lime Mid' },
  { value: '#DCFCE7', label: 'Green Mid' },
  { value: '#D1FAE5', label: 'Emerald Mid' },
  { value: '#CCFBF1', label: 'Teal Mid' },
  { value: '#CFFAFE', label: 'Cyan Mid' },
  { value: '#E0F2FE', label: 'Sky Mid' },
  { value: '#FFFFFF', label: 'Default (White)' },
] as const;

interface MenuDisplaySectionProps {
  metadata: Record<string, unknown>;
  onUpdateMetadata: (key: string, value: unknown) => void;
}

export function MenuDisplaySection({ metadata, onUpdateMetadata }: MenuDisplaySectionProps) {
  const currentColor = (metadata.menuColor as string) ?? '';

  return (
    <CollapsibleSection id="menu-display" title="Menu Display" defaultOpen={false}>
      <div className="space-y-3">
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">
            Button Color
          </label>
          <div className="grid grid-cols-8 gap-2">
            {MENU_COLORS.map((color) => {
              const isSelected = currentColor === color.value;
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => onUpdateMetadata('menuColor', color.value === '#FFFFFF' ? null : color.value)}
                  className={`h-8 w-full rounded-md border-2 transition-all ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                  aria-label={`${color.label}${isSelected ? ' (selected)' : ''}`}
                />
              );
            })}
          </div>
        </div>

        {/* Preview */}
        {currentColor && currentColor !== '#FFFFFF' && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Preview</p>
            {(() => {
              const textColor = getContrastTextColor(currentColor);
              return (
                <div
                  className="flex h-[80px] w-[120px] flex-col overflow-hidden rounded-lg border border-border shadow-sm"
                  style={{ backgroundColor: currentColor }}
                >
                  <div className="h-1 w-full bg-indigo-500" />
                  <div className="flex flex-1 flex-col justify-between p-2">
                    <span className="text-xs font-medium" style={{ color: textColor }}>Sample Item</span>
                    <span className="text-xs font-semibold" style={{ color: textColor, opacity: 0.85 }}>$9.99</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
