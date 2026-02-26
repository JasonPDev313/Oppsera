'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { POSSlidePanel } from '@/components/pos/shared/POSSlidePanel';
import { TipSettingsSection } from './TipSettingsSection';
import { LayoutSettingsSection } from './LayoutSettingsSection';
import type { POSConfig, POSLayoutConfig, POSTipSettings } from '@/types/pos';

interface POSSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  config: POSConfig;
  onConfigChange: (updates: Partial<POSConfig>) => void;
  onOpenQuickMenuEditor: () => void;
}

/** Flash a "Saved" indicator for 1.5s after each save. */
function useSaveFlash() {
  const [showSaved, setShowSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setShowSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSaved(false), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { showSaved, flash };
}

export const POSSettingsPanel = memo(function POSSettingsPanel({
  open,
  config,
  onClose,
  onConfigChange,
  onOpenQuickMenuEditor,
}: POSSettingsPanelProps) {
  const { showSaved, flash } = useSaveFlash();

  const handleChange = useCallback(
    (updates: Partial<POSConfig>) => {
      onConfigChange(updates);
      flash();
    },
    [onConfigChange, flash],
  );

  const handleTipUpdate = useCallback(
    (updates: { tipEnabled?: boolean; tipSettings?: POSTipSettings }) => {
      handleChange(updates);
    },
    [handleChange],
  );

  const handleLayoutUpdate = useCallback(
    (layout: POSLayoutConfig) => {
      handleChange({ layout });
    },
    [handleChange],
  );

  const handleReceiptModeChange = useCallback(
    (mode: POSConfig['receiptMode']) => {
      handleChange({ receiptMode: mode });
    },
    [handleChange],
  );

  return (
    <POSSlidePanel open={open} onClose={onClose} title="POS Settings" width={420}>
      <div className="relative space-y-1 divide-y divide-border">
        {/* Save indicator */}
        {showSaved && (
          <div className="fixed right-6 top-20 z-10 flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-medium text-green-500 shadow-sm animate-[cart-slide-in_0.2s_ease-out]">
            <Check className="h-3.5 w-3.5" />
            Saved
          </div>
        )}

        {/* ── Tips ───────────────────────────────────────────── */}
        <TipSettingsSection
          tipEnabled={config.tipEnabled}
          tipSettings={config.tipSettings}
          onUpdate={handleTipUpdate}
        />

        {/* ── Layout ─────────────────────────────────────────── */}
        <LayoutSettingsSection
          layout={config.layout}
          onUpdate={handleLayoutUpdate}
        />

        {/* ── Receipt ────────────────────────────────────────── */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-3 py-3 select-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Receipts</h4>
              <p className="text-xs text-muted-foreground">Choose how receipts are delivered after payment</p>
            </div>
          </summary>
          <div className="pb-4 pl-7">
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'print', label: 'Print', desc: 'Always print' },
                { value: 'email', label: 'Email', desc: 'Email to customer' },
                { value: 'both', label: 'Both', desc: 'Print + email' },
                { value: 'ask', label: 'Ask', desc: 'Ask each time' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleReceiptModeChange(opt.value)}
                  className={`flex flex-col items-start rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                    config.receiptMode === opt.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <span className={`text-sm font-medium ${
                    config.receiptMode === opt.value ? 'text-indigo-500' : 'text-foreground'
                  }`}>
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </details>

        {/* ── Quick Menu ─────────────────────────────────────── */}
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-3 py-3 select-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Quick Menu</h4>
              <p className="text-xs text-muted-foreground">Customize the Hot Sellers grid layout</p>
            </div>
          </summary>
          <div className="pb-4 pl-7">
            <p className="mb-3 text-xs text-muted-foreground">
              Create a custom grid of your most-used items, categories, and actions for the Hot Sellers view.
            </p>
            <button
              type="button"
              onClick={onOpenQuickMenuEditor}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Palette className="h-4 w-4" />
              Open Quick Menu Editor
            </button>
          </div>
        </details>
      </div>
    </POSSlidePanel>
  );
});
