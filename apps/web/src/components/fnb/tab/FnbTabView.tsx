'use client';

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
}

export function FnbTabView({ userId }: FnbTabViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const activeSeat = store.activeSeatNumber;
  const activeCourse = store.activeCourseNumber;

  const {
    tab,
    isLoading,
    error,
    fireCourse,
    sendCourse,
    isActing,
  } = useFnbTab({ tabId });

  const handleBack = () => {
    store.goBack();
  };

  const handleSendAll = async () => {
    if (!tab) return;
    // Send all unsent courses
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

  if (isLoading && !tab) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <div className="text-center">
          <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading tab...</p>
        </div>
      </div>
    );
  }

  if (error && !tab) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
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
    );
  }

  if (!tab) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
      >
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No tab selected</p>
      </div>
    );
  }

  // Compute unsent items per seat for badges
  const unsentBySeat: Record<number, number> = {};
  for (const line of tab.lines ?? []) {
    if (line.status === 'draft' || line.status === 'unsent') {
      const seat = line.seatNumber ?? 1;
      unsentBySeat[seat] = (unsentBySeat[seat] ?? 0) + 1;
    }
  }
  const hasUnsentItems = Object.keys(unsentBySeat).length > 0;

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
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

      {/* Right pane: Menu panel */}
      <div className="border-l shrink-0" style={{ width: '340px', borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <FnbMenuPanel
          onItemTap={(itemId, itemName, priceCents, itemType) => {
            if (!tabId) return;
            // Add draft line to store
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
          }}
        />
      </div>
    </div>
  );
}
