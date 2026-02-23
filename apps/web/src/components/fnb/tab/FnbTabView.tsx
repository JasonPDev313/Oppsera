'use client';

import { useCallback, useState } from 'react';
import { ChevronLeft, Users, ShoppingCart, QrCode, Copy, XCircle } from 'lucide-react';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { useFnbMenu } from '@/hooks/use-fnb-menu';
import { useFnbGuestPay } from '@/hooks/use-fnb-guest-pay';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { apiFetch } from '@/lib/api-client';
import { TabHeader } from './TabHeader';
import { SeatRail } from './SeatRail';
import { CourseSelector } from './CourseSelector';
import { OrderTicket } from './OrderTicket';
import { TabActionBar } from './TabActionBar';
import { FnbMenuNav, FnbMenuContent, FnbMenuError } from '@/components/fnb/menu/FnbMenuPanel';

interface FnbTabViewProps {
  userId: string;
  isActive?: boolean;
}

// ── Money formatter ────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Skeleton for loading state ──────────────────────────────────

function TabSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header skeleton */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: 'var(--fnb-border-subtle)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 rounded-lg transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="h-5 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
        <div className="ml-auto h-5 w-20 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
      </div>

      {/* Body skeleton: three columns using CSS Grid */}
      <div className="flex-1 overflow-hidden" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 400px' }}>
        {/* Left: seat rail skeleton */}
        <div
          className="flex flex-col items-center gap-2 py-2"
          style={{ backgroundColor: 'var(--fnb-seat-rail-bg)', borderRight: 'var(--fnb-border-subtle)' }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ width: 56, height: 56, backgroundColor: 'var(--fnb-bg-elevated)' }} />
          ))}
        </div>

        {/* Center: menu skeleton */}
        <div className="flex flex-col min-w-0" style={{ borderRight: 'var(--fnb-border-subtle)' }}>
          <div className="p-3 space-y-2">
            <div className="h-8 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-20 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
              ))}
            </div>
          </div>
          <div className="flex-1 p-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-lg animate-pulse" style={{ height: 100, backgroundColor: 'var(--fnb-bg-elevated)' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: cart skeleton */}
        <div className="flex flex-col">
          <div className="flex gap-2 px-3 py-2" style={{ borderBottom: 'var(--fnb-border-subtle)' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-20 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
            ))}
          </div>
          <div className="flex-1 p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 flex-1 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
                <div className="h-4 w-16 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-3 py-3" style={{ borderTop: 'var(--fnb-border-subtle)' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 flex-1 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab View ──────────────────────────────────────────────

export function FnbTabView({ userId: _userId, isActive: _isActive = true }: FnbTabViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const activeSeat = store.activeSeatNumber;
  const activeCourse = store.activeCourseNumber;
  const isTabScreen = store.currentScreen === 'tab';
  const menuMode = store.menuMode;

  const {
    tab,
    isLoading,
    error,
    fireCourse,
    sendCourse,
    addItems,
    updatePartySize,
    isActing,
  } = useFnbTab({ tabId, pollEnabled: isTabScreen });

  const menu = useFnbMenu();

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const guestPay = useFnbGuestPay({
    tabId,
    pollEnabled: isTabScreen,
    onPaymentConfirmed: (session) => {
      const tipLabel = session.tipCents ? ` (tip $${(session.tipCents / 100).toFixed(2)})` : '';
      setToastMsg({ type: 'success', text: `Guest paid $${(session.totalCents / 100).toFixed(2)}${tipLabel}` });
      setTimeout(() => setToastMsg(null), 5000);
    },
  });

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

  const handlePrintCheck = useCallback(async () => {
    if (!tabId || !tab) return;
    try {
      // 1. Create guest pay session (also presents check)
      const res = await apiFetch<{ data: { sessionId: string; token: string; expiresAt: string } }>('/api/v1/fnb/guest-pay/sessions', {
        method: 'POST',
        body: JSON.stringify({ tabId, orderId: tab.primaryOrderId ?? tabId }),
      });
      const session = res.data;
      // 2. Show success toast with copy link option
      const url = `${window.location.origin}/pay/${session.token}`;
      setToastMsg({ type: 'success', text: 'Check printed with QR code' });
      setTimeout(() => setToastMsg(null), 4000);
      // Copy link to clipboard
      navigator.clipboard.writeText(url).catch(() => {});
      // Refresh guest pay state
      guestPay.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to print check';
      setToastMsg({ type: 'error', text: message });
      setTimeout(() => setToastMsg(null), 4000);
    }
  }, [tabId, tab, guestPay]);

  const handleSelectSeat = (seatNumber: number) => {
    store.setSeat(seatNumber);
  };

  const handleAddSeat = async () => {
    const currentCount = tab?.partySize ?? 1;
    const newCount = currentCount + 1;
    await updatePartySize(newCount);
    store.setSeat(newCount);
  };

  const handleSelectCourse = (courseNumber: number) => {
    store.setCourse(courseNumber);
  };

  const handleSelectMenuMode = useCallback((mode: 'all_items' | 'hot_sellers' | 'tools') => {
    store.setMenuMode(mode);
  }, [store]);

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

  // ── Determine content state ────────────────────────────────────

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

  // Compute item counts for cart header
  const serverLineCount = (tab?.lines ?? []).length;
  const totalItemCount = serverLineCount + draftLines.length;

  // Compute totals
  const subtotalCents = tab?.runningTotalCents ?? 0;
  const taxCents = tab?.taxTotalCents ?? 0;
  const totalCents = subtotalCents + taxCents;

  // ── Loading / error / empty states ─────────────────────────────

  if (showSkeleton) {
    return <TabSkeleton onBack={handleBack} />;
  }

  if (showError) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--fnb-action-void)' }}>{error}</p>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-info)', color: '#fff' }}
          >
            Back to Floor
          </button>
        </div>
      </div>
    );
  }

  if (showEmpty || !tab) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No tab selected</p>
      </div>
    );
  }

  // ── Menu error state ──────────────────────────────────────────
  if (menu.error) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <TabHeader tab={tab} onBack={handleBack} />
        <FnbMenuError error={menu.error} onRetry={() => menu.refresh()} />
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────
  //
  //  ┌───────────────────────────────────────────────────────────────────────┐
  //  │  TabHeader (full width)                                               │
  //  ├──────┬──────────────────────────────────────┬────────────────────────┤
  //  │      │ Search bar                           │ Cart Header           │
  //  │      ├──────────────────────────────────────┤ Course selector       │
  //  │      │ Mode Tabs (All / Hot / Tools)        │                        │
  //  │ SEAT ├──────────────────────────────────────┤ Order ticket           │
  //  │ RAIL │ Department row (horizontal tabs)     │ (scrollable)           │
  //  │(80px)├──────────────────────────────────────┤                        │
  //  │      │ Sub-department row (conditional)     │                        │
  //  │      ├─────────┬────────────────────────────┤ Totals bar             │
  //  │      │ Category│ Item grid (auto-fill 150px)│                        │
  //  │      │ sidebar │                            │ Action bar (2-row)     │
  //  │      │ (230px) │                            │ Send/Fire/Split/Void/Pay│
  //  └──────┴─────────┴────────────────────────────┴────────────────────────┘

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* ── Full-width tab header ──────────────────────────────────── */}
      <TabHeader tab={tab} onBack={handleBack} />

      {/* Guest Pay banner */}
      {guestPay.hasActive && guestPay.session && (
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2"
          style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4" style={{ color: 'var(--fnb-guest-pay-active)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
              Guest is paying via phone
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => guestPay.copyLink(guestPay.session!.token)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
            >
              <Copy className="h-3 w-3" />
              Copy Link
            </button>
            <button
              type="button"
              onClick={() => guestPay.invalidate(guestPay.session!.id)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--fnb-action-void)' }}
            >
              <XCircle className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toast message */}
      {toastMsg && (
        <div
          className={`shrink-0 px-4 py-2 text-xs font-medium text-center ${
            toastMsg.type === 'success' ? 'text-green-200' : 'text-red-200'
          }`}
          style={{
            backgroundColor: toastMsg.type === 'success'
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(239, 68, 68, 0.15)',
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* ── Body: 3-column CSS Grid ──────────────────────────────── */}
      <div
        className="flex-1 overflow-hidden"
        style={{ display: 'grid', gridTemplateColumns: '80px 1fr 400px' }}
      >

        {/* ── COL 1: Seat rail (80px, full height) ──────────────── */}
        <SeatRail
          seatCount={tab.partySize ?? 1}
          activeSeat={activeSeat}
          onSelectSeat={handleSelectSeat}
          onAddSeat={handleAddSeat}
          unsentBySeat={unsentBySeat}
        />

        {/* ── COL 2: Product browsing (1fr, full height) ────────── */}
        <div
          className="flex flex-col min-w-0"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', borderRight: 'var(--fnb-border-subtle)' }}
        >
          {/* Navigation: search bar + mode tabs + department tabs + sub-department tabs */}
          <FnbMenuNav menu={menu} menuMode={menuMode} onSelectMode={handleSelectMenuMode} />

          {/* Content: category sidebar + item grid */}
          <FnbMenuContent menu={menu} menuMode={menuMode} onItemTap={handleItemTap} />
        </div>

        {/* ── COL 3: Cart / Ticket (400px, full height) ─────────── */}
        <div className="flex flex-col min-w-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          {/* Cart header */}
          <div
            className="shrink-0 flex items-center justify-between px-3 py-2"
            style={{ borderBottom: 'var(--fnb-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--fnb-text-primary)' }}>
                Current Order
              </span>
              {tab.tableNumber && (
                <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                  — Table {tab.tableNumber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1" style={{ color: 'var(--fnb-text-muted)' }}>
                <Users className="h-3 w-3" />
                <span className="text-[10px] font-semibold">{tab.partySize ?? 1}</span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>
                {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>

          {/* Course selector */}
          <CourseSelector
            activeCourse={activeCourse}
            onSelectCourse={handleSelectCourse}
          />

          {/* Order ticket (scrollable cart body) */}
          <OrderTicket
            tab={tab}
            activeSeat={activeSeat}
            draftLines={draftLines}
            onSendCourse={sendCourse}
            onFireCourse={fireCourse}
          />

          {/* Totals bar */}
          <div
            className="shrink-0 px-3 py-2"
            style={{ borderTop: 'var(--fnb-border-subtle)', backgroundColor: 'var(--fnb-bg-elevated)' }}
          >
            <div className="flex justify-between text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>
              <span>Subtotal</span>
              <span>{formatMoney(subtotalCents)}</span>
            </div>
            {taxCents > 0 && (
              <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
                <span>Tax</span>
                <span>{formatMoney(taxCents)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-sm font-bold mt-1 pt-1"
              style={{ color: 'var(--fnb-text-primary)', borderTop: 'var(--fnb-border-subtle)' }}
            >
              <span>Total</span>
              <span>{formatMoney(totalCents)}</span>
            </div>
          </div>

          {/* Action bar (Send / Fire / Split / Void / Pay) */}
          <TabActionBar
            onSendAll={handleSendAll}
            onFireNext={handleFireNext}
            onPay={handlePay}
            onSplit={handleSplit}
            onVoid={handleVoid}
            onPrintCheck={handlePrintCheck}
            hasUnsentItems={hasUnsentItems}
            guestPayEnabled
            disabled={isActing}
          />
        </div>
      </div>
    </div>
  );
}
