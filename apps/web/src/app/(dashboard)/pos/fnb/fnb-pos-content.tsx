'use client';

import { memo, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { usePosLocation } from '@/hooks/use-pos-location';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { apiFetch } from '@/lib/api-client';
import { FnbFloorView } from '@/components/fnb/floor/FnbFloorView';
import { FnbTabView } from '@/components/fnb/tab/FnbTabView';
import { FnbSplitView } from '@/components/fnb/FnbSplitView';
import { FnbPaymentView } from '@/components/fnb/FnbPaymentView';
import { FnbBottomNav } from '@/components/fnb/FnbBottomNav';

import { OpenTicketsView } from '@/components/fnb/views/OpenTicketsView';
import { ClosedTicketsView } from '@/components/fnb/views/ClosedTicketsView';
import { SalesSummaryView } from '@/components/fnb/views/SalesSummaryView';

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
  const { user } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const { locationId: posLocationId } = usePosLocation();
  const currentScreen = useFnbPosStore((s) => s.currentScreen);
  const isOnline = useFnbPosStore((s) => s.isOnline);
  const setOnline = useFnbPosStore((s) => s.setOnline);
  const setCourseNames = useFnbPosStore((s) => s.setCourseNames);
  const setCourseRulesMap = useFnbPosStore((s) => s.setCourseRulesMap);

  // Use the active room's locationId from the store (set by FnbFloorView)
  // so settings are fetched for the correct venue. Falls back to terminal
  // session location on first render before the floor view has resolved.
  const activeLocationId = useFnbPosStore((s) => s.activeLocationId);
  const locationId = activeLocationId ?? posLocationId;
  const { settings: orderingSettings } = useFnbSettings({
    moduleKey: 'fnb_ordering',
    locationId,
  });

  // Fetch fnb_kitchen settings to determine KDS routing mode
  const { settings: kitchenSettings } = useFnbSettings({
    moduleKey: 'fnb_kitchen',
    locationId,
  });
  const kdsRoutingMode = typeof kitchenSettings.kds_routing_mode === 'string'
    ? kitchenSettings.kds_routing_mode
    : 'fb_and_retail';
  // F&B POS shows Send buttons unless mode is 'retail_only'
  const kdsSendEnabled = kdsRoutingMode !== 'retail_only';

  // Use the specific key to avoid re-running when other settings change
  const defaultCourses = orderingSettings.default_courses;
  useEffect(() => {
    if (Array.isArray(defaultCourses) && defaultCourses.length > 0) {
      setCourseNames(defaultCourses as string[]);
    }
  }, [defaultCourses, setCourseNames]);

  // Fetch course rules for POS auto-select
  const { data: courseRulesData } = useQuery({
    queryKey: ['fnb-course-rules-pos', locationId],
    queryFn: () => apiFetch<{ data: Record<string, unknown> }>('/api/v1/fnb/course-rules/pos'),
    enabled: !!locationId,
  });

  useEffect(() => {
    if (courseRulesData?.data) {
      setCourseRulesMap(courseRulesData.data as Record<string, { effectiveRule: { defaultCourseNumber: number | null; allowedCourseNumbers: number[] | null; lockCourse: boolean }; source: string; defaultSource: string }>);
    }
  }, [courseRulesData, setCourseRulesMap]);

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
        <p className="text-sm text-muted-foreground">
          F&B POS module is not enabled for this location.
        </p>
      </div>
    );
  }

  const userId = user?.id ?? '';

  // ── Internal Screen Router (Zustand-driven) ──────────────────
  // Floor + Tab stay mounted and toggle via CSS for instant switching.
  // Payment + Split are mounted on-demand (less frequent transitions).

  return (
    <div className="fnb-scaled h-full bg-surface flex flex-col">
      {/* Offline indicator */}
      {!isOnline && <OfflineBanner queueCount={0} />}

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Floor + Tab stay mounted and use visibility (not display:none) so
            the browser keeps their layout pre-computed — switching back is instant
            instead of triggering a full reflow of the 3-column grid. */}
        <div className="flex-1 min-h-0 relative">
          <div
            className="absolute inset-0"
            style={currentScreen === 'floor' ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
          >
            <FnbFloorView userId={userId} isActive={isActive && currentScreen === 'floor'} />
          </div>
          <div
            className="absolute inset-0"
            style={currentScreen === 'tab' ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
          >
            <FnbTabView userId={userId} isActive={isActive && currentScreen === 'tab'} kdsSendEnabled={kdsSendEnabled} />
          </div>
          {currentScreen === 'open_tickets' && <OpenTicketsView userId={userId} />}
          {currentScreen === 'closed_tickets' && <ClosedTicketsView userId={userId} />}
          {currentScreen === 'sales_summary' && <SalesSummaryView userId={userId} />}
          {currentScreen === 'payment' && <FnbPaymentView userId={userId} />}
          {currentScreen === 'split' && <FnbSplitView userId={userId} />}
        </div>
        <FnbBottomNav />
      </div>

    </div>
  );
}

export default memo(FnbPOSPage);
