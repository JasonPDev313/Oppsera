'use client';

import { useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { TabHeader } from './TabHeader';
import { SeatRail } from './SeatRail';
import { CourseSelector } from './CourseSelector';
import { OrderTicket } from './OrderTicket';
import { TabActionBar } from './TabActionBar';
import { FnbMenuPanel } from '@/components/fnb/menu/FnbMenuPanel';

interface FnbTabViewProps {
  userId: string;
  isActive?: boolean;
}

// ── Skeleton for left + center panes while tab data loads ──────

function TabSkeleton({ onBack }: { onBack: () => void }) {
  const shimmer = { backgroundColor: 'var(--fnb-bg-elevated)' };
  return (
    <>
      {/* Seat rail skeleton */}
      <div
        className="shrink-0 flex flex-col items-center gap-2 pt-3 border-r"
        style={{ width: 56, borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-10 rounded-full animate-pulse" style={shimmer} />
        ))}
      </div>

      {/* Center skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="h-5 w-32 rounded animate-pulse" style={shimmer} />
          <div className="ml-auto h-5 w-20 rounded animate-pulse" style={shimmer} />
        </div>

        {/* Course tabs */}
        <div
          className="flex gap-2 px-4 py-2 border-b"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-20 rounded-lg animate-pulse" style={shimmer} />
          ))}
        </div>

        {/* Ticket body */}
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 rounded animate-pulse" style={shimmer} />
              <div className="h-4 flex-1 rounded animate-pulse" style={shimmer} />
              <div className="h-4 w-16 rounded animate-pulse" style={shimmer} />
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div
          className="flex gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 flex-1 rounded-lg animate-pulse" style={shimmer} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main Tab View ──────────────────────────────────────────────

export function FnbTabView({ userId: _userId, isActive: _isActive = true }: FnbTabViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const activeSeat = store.activeSeatNumber;
  const activeCourse = store.activeCourseNumber;
  const isTabScreen = store.currentScreen === 'tab';

  const {
    tab,
    isLoading,
    error,
    fireCourse,
    sendCourse,
    addItems,
    isActing,
  } = useFnbTab({ tabId, pollEnabled: isTabScreen });

  const draftLines = tabId ? (store.draftLines[tabId] ?? []) : [];

  const handleBack = useCallback(() => {
    store.goBack();
  }, [store]);

  const handleSendAll = async () => {
    if (!tab || !tabId) return;

    // 1. Persist any draft lines first
    if (draftLines.length > 0) {
      await addItems(draftLines.map((d) => ({
        catalogItemId: d.catalogItemId,
        catalogItemName: d.catalogItemName,
        unitPriceCents: d.unitPriceCents,
        qty: d.qty,
        seatNumber: d.seatNumber,
        courseNumber: d.courseNumber,
        modifiers: d.modifiers,
        specialInstructions: d.specialInstructions,
      })));
      store.clearDraft(tabId);
    }

    // 2. Send all unsent courses
    const courses = tab.courses ?? [];
    for (const course of courses) {
      if (course.courseStatus === 'unsent') {
        await sendCourse(course.courseNumber);
      }
    }
  };

  const handleFireNext = async () => {
    if (!tab) return;
    // Fire the next sent course
    const courses = tab.courses ?? [];
    const nextSent = courses.find((c) => c.courseStatus === 'sent');
    if (nextSent) {
      await fireCourse(nextSent.courseNumber);
    }
  };

  const handlePay = () => {
    store.navigateTo('payment');
  };

  const handleSplit = () => {
    store.initSplit('by_seat', tab?.partySize ?? 2);
  };

  const handleVoid = () => {
    // Future: open void modal
  };

  const handleSelectSeat = (seatNumber: number) => {
    store.setSeat(seatNumber);
  };

  const handleAddSeat = () => {
    const currentCount = tab?.partySize ?? 1;
    store.setSeat(currentCount + 1);
  };

  const handleSelectCourse = (courseNumber: number) => {
    store.setCourse(courseNumber);
  };

  // Item tap handler — works even during loading (adds to Zustand draft lines)
  const handleItemTap = useCallback((itemId: string, itemName: string, priceCents: number, itemType: string) => {
    if (!tabId) return;
    store.addDraftLine(tabId, {
      localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      catalogItemId: itemId,
      catalogItemName: itemName,
      unitPriceCents: priceCents,
      qty: 1,
      itemType,
      seatNumber: activeSeat || 1,
      modifiers: [] as Array<{ modifierId: string; name: string; priceAdjustment: number }>,
      specialInstructions: null,
      courseNumber: activeCourse,
      addedAt: Date.now(),
    });
  }, [tabId, store, activeSeat, activeCourse]);

  // ── Determine left + center content ────────────────────────────

  const showSkeleton = (isLoading && !tab) || (!tab && !error && tabId);
  const showError = error && !tab;
  const showEmpty = !tab && !error && !tabId;

  // Compute unsent items per seat when tab is loaded
  const unsentBySeat: Record<number, number> = {};
  let hasUnsentItems = draftLines.length > 0;
  if (tab) {
    for (const line of tab.lines ?? []) {
      if (line.status === 'draft' || line.status === 'unsent') {
        const seat = line.seatNumber ?? 1;
        unsentBySeat[seat] = (unsentBySeat[seat] ?? 0) + 1;
      }
    }
    for (const draft of draftLines) {
      const seat = draft.seatNumber ?? 1;
      unsentBySeat[seat] = (unsentBySeat[seat] ?? 0) + 1;
    }
    hasUnsentItems = Object.keys(unsentBySeat).length > 0 || draftLines.length > 0;
  }

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Left + Center: Tab content, skeleton, error, or empty */}
      {showSkeleton ? (
        <TabSkeleton onBack={handleBack} />
      ) : showError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm mb-2" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--fnb-status-seated)' }}
            >
              Back to Floor
            </button>
          </div>
        </div>
      ) : showEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No tab selected</p>
        </div>
      ) : tab ? (
        <>
          {/* Left pane: Seat rail */}
          <SeatRail
            seatCount={tab.partySize ?? 1}
            activeSeat={activeSeat}
            onSelectSeat={handleSelectSeat}
            onAddSeat={handleAddSeat}
            unsentBySeat={unsentBySeat}
          />

          {/* Center pane: Order ticket */}
          <div className="flex-1 flex flex-col min-w-0">
            <TabHeader tab={tab} onBack={handleBack} />
            <CourseSelector
              activeCourse={activeCourse}
              onSelectCourse={handleSelectCourse}
            />
            <OrderTicket
              tab={tab}
              activeSeat={activeSeat}
              draftLines={draftLines}
              onSendCourse={sendCourse}
              onFireCourse={fireCourse}
            />
            <TabActionBar
              onSendAll={handleSendAll}
              onFireNext={handleFireNext}
              onPay={handlePay}
              onSplit={handleSplit}
              onVoid={handleVoid}
              hasUnsentItems={hasUnsentItems}
              disabled={isActing}
            />
          </div>
        </>
      ) : null}

      {/* Right pane: Menu panel (ALWAYS rendered — preloads and stays interactive during loading) */}
      <div className="border-l shrink-0" style={{ width: '340px', borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <FnbMenuPanel onItemTap={handleItemTap} />
      </div>
    </div>
  );
}
