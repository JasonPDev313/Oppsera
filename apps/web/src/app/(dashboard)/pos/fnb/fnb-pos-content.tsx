'use client';

import { useEffect, memo } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { FnbFloorView } from '@/components/fnb/floor/FnbFloorView';
import { FnbTabView } from '@/components/fnb/tab/FnbTabView';
import { FnbSplitView } from '@/components/fnb/FnbSplitView';
import { FnbPaymentView } from '@/components/fnb/FnbPaymentView';


// ── F&B POS Content (Floor-Centric) ─────────────────────────────

interface FnbPOSContentProps {
  isActive?: boolean;
}

function FnbPOSPage({ isActive = true }: FnbPOSContentProps) {
  const { user } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const currentScreen = useFnbPosStore((s) => s.currentScreen);

  // Close portal dialogs when POS mode becomes inactive
  useEffect(() => {
    if (!isActive) {
      // Future: close any open portal dialogs here
    }
  }, [isActive]);

  // Entitlement check
  if (!isModuleEnabled('pos_fnb')) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          F&B POS module is not enabled for this location.
        </p>
      </div>
    );
  }

  const userId = user?.id ?? 'unknown';

  // ── Internal Screen Router (Zustand-driven) ──────────────────
  // No URL routes — instant switch via React state for dual-mount compat.

  return (
    <div className="h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {currentScreen === 'floor' && <FnbFloorView userId={userId} />}
      {currentScreen === 'tab' && <FnbTabView userId={userId} />}
      {currentScreen === 'payment' && <FnbPaymentView userId={userId} />}
      {currentScreen === 'split' && <FnbSplitView userId={userId} />}
    </div>
  );
}

export default memo(FnbPOSPage);
