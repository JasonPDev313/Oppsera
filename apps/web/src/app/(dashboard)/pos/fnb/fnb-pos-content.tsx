'use client';

import { memo } from 'react';
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

  // Entitlement check
  if (!isModuleEnabled('pos_fnb')) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <p className="text-sm text-gray-400">
          F&B POS module is not enabled for this location.
        </p>
      </div>
    );
  }

  const userId = user?.id ?? 'unknown';

  // ── Internal Screen Router (Zustand-driven) ──────────────────
  // Floor + Tab stay mounted and toggle via CSS for instant switching.
  // Payment + Split are mounted on-demand (less frequent transitions).

  return (
    <div className="h-full bg-surface">
      <div className={currentScreen === 'floor' ? 'h-full' : 'hidden'}>
        <FnbFloorView userId={userId} isActive={isActive && currentScreen === 'floor'} />
      </div>
      <div className={currentScreen === 'tab' ? 'h-full' : 'hidden'}>
        <FnbTabView userId={userId} isActive={isActive && currentScreen === 'tab'} />
      </div>
      {currentScreen === 'payment' && <FnbPaymentView userId={userId} />}
      {currentScreen === 'split' && <FnbSplitView userId={userId} />}
    </div>
  );
}

export default memo(FnbPOSPage);
