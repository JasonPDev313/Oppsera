'use client';

import { memo, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { FnbFloorView } from '@/components/fnb/floor/FnbFloorView';
import { FnbTabView } from '@/components/fnb/tab/FnbTabView';
import { FnbSplitView } from '@/components/fnb/FnbSplitView';
import { FnbPaymentView } from '@/components/fnb/FnbPaymentView';

// ── Offline Banner ─────────────────────────────────────────────

function OfflineBanner({ queueCount }: { queueCount: number }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center gap-2 px-4 py-1.5"
      style={{
        backgroundColor: 'var(--fnb-action-void)',
        color: '#ffffff',
      }}
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span className="text-xs font-bold">
        OFFLINE MODE
        {queueCount > 0 && ` — ${queueCount} action${queueCount > 1 ? 's' : ''} queued`}
      </span>
    </div>
  );
}

// ── F&B POS Content (Floor-Centric) ─────────────────────────────

interface FnbPOSContentProps {
  isActive?: boolean;
}

function FnbPOSPage({ isActive = true }: FnbPOSContentProps) {
  const { user, locations } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const currentScreen = useFnbPosStore((s) => s.currentScreen);
  const isOnline = useFnbPosStore((s) => s.isOnline);
  const setOnline = useFnbPosStore((s) => s.setOnline);
  const setCourseNames = useFnbPosStore((s) => s.setCourseNames);

  // Fetch fnb_ordering settings (course names, etc.) and push into store
  const locationId = locations[0]?.id;
  const { settings: orderingSettings } = useFnbSettings({
    moduleKey: 'fnb_ordering',
    locationId,
  });

  useEffect(() => {
    const courses = orderingSettings.default_courses;
    if (Array.isArray(courses) && courses.length > 0) {
      setCourseNames(courses as string[]);
    }
  }, [orderingSettings, setCourseNames]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

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
    <div className="h-full bg-surface flex flex-col">
      {/* Offline indicator */}
      {!isOnline && <OfflineBanner queueCount={0} />}

      <div className="flex-1 min-h-0">
        <div className={currentScreen === 'floor' ? 'h-full' : 'hidden'}>
          <FnbFloorView userId={userId} isActive={isActive && currentScreen === 'floor'} />
        </div>
        <div className={currentScreen === 'tab' ? 'h-full' : 'hidden'}>
          <FnbTabView userId={userId} isActive={isActive && currentScreen === 'tab'} />
        </div>
        {currentScreen === 'payment' && <FnbPaymentView userId={userId} />}
        {currentScreen === 'split' && <FnbSplitView userId={userId} />}
      </div>
    </div>
  );
}

export default memo(FnbPOSPage);
