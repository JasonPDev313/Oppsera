'use client';

import { useCallback, useState, useEffect } from 'react';
import { ChevronLeft, Users, ShoppingCart, QrCode, Copy, XCircle, Sparkles, Hand, UtensilsCrossed, LayoutGrid, Repeat } from 'lucide-react';

// ── Handheld detection hook ─────────────────────────────────────

function useIsHandheld(): boolean {
  const [isHandheld, setIsHandheld] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    setIsHandheld(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsHandheld(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isHandheld;
}

type HandheldPanel = 'menu' | 'cart';

// ── Handheld Bottom Tab Bar ────────────────────────────────────

function HandheldTabBar({
  activePanel,
  onSelectPanel,
  cartCount,
  onBack,
}: {
  activePanel: HandheldPanel;
  onSelectPanel: (panel: HandheldPanel) => void;
  cartCount: number;
  onBack: () => void;
}) {
  const tabs: Array<{ key: HandheldPanel | 'floor'; label: string; icon: typeof LayoutGrid }> = [
    { key: 'floor', label: 'Floor', icon: LayoutGrid },
    { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
    { key: 'cart', label: 'Cart', icon: ShoppingCart },
  ];

  return (
    <div
      className="shrink-0 flex items-center justify-around"
      style={{
        height: 'var(--fnb-touch-primary)',
        backgroundColor: 'var(--fnb-bg-surface)',
        borderTop: 'var(--fnb-border-subtle)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activePanel;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => tab.key === 'floor' ? onBack() : onSelectPanel(tab.key)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
            style={{
              color: isActive ? 'var(--fnb-info)' : 'var(--fnb-text-muted)',
            }}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {tab.key === 'cart' && cartCount > 0 && (
                <span
                  className="absolute -top-1 -right-2 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ width: 16, height: 16, backgroundColor: 'var(--fnb-action-void)' }}
                >
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { useFnbMenu } from '@/hooks/use-fnb-menu';
import { useFnbGuestPay } from '@/hooks/use-fnb-guest-pay';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { apiFetch } from '@/lib/api-client';
import { TabHeader } from './TabHeader';
import { TableContextCard } from './TableContextCard';
import { SeatRail } from './SeatRail';
import { CourseSelector } from './CourseSelector';
import { OrderTicket } from './OrderTicket';
import { ExemptionToggles } from './ExemptionToggles';
import { TabActionBar } from './TabActionBar';
import { FnbMenuNav, FnbMenuContent, FnbMenuError, recordRecentItem } from '@/components/fnb/menu/FnbMenuPanel';
import { FnbModifierDrawer } from '@/components/fnb/menu/FnbModifierDrawer';
import { useAuthContext } from '@/components/auth-provider';
import { ManageTabsButton } from '../manage-tabs/ManageTabsButton';

interface FnbTabViewProps {
  userId: string;
  isActive?: boolean;
  /** When false, hides Send/Fire buttons (KDS routing mode excludes F&B) */
  kdsSendEnabled?: boolean;
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
        <div className="flex flex-col min-w-0" style={{ gridColumn: '2', borderRight: 'var(--fnb-border-subtle)' }}>
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
        <div className="flex flex-col" style={{ gridColumn: '3' }}>
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

// ── AI Upsell Suggestion Banner ──────────────────────────────────
// Shows contextual upsell based on items in the current order.
// V1: simple rule-based suggestions. V2: wire to semantic layer.

function UpsellBanner({ items, onTap: _onTap }: {
  items: Array<{ id: string; name: string; priceCents: number; itemType: string }>;
  onTap: (id: string) => void;
}) {
  // Simple logic: if order has food but no beverage, suggest a drink
  // If order has drinks only, suggest an appetizer
  const hasFood = items.some((i) => i.itemType === 'food');
  const hasBeverage = items.some((i) => i.itemType === 'beverage');

  let suggestion: string | null = null;
  if (hasFood && !hasBeverage) suggestion = 'Add a drink?';
  else if (hasBeverage && !hasFood) suggestion = 'Add an appetizer?';
  else if (items.length === 0) return null;
  else return null; // Already has both — no upsell

  return (
    <div
      className="shrink-0 flex items-center gap-2 px-3 py-1.5"
      style={{ backgroundColor: 'rgba(139, 92, 246, 0.08)', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fnb-info)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
        {suggestion}
      </span>
    </div>
  );
}

export function FnbTabView({ userId: _userId, isActive: _isActive = true, kdsSendEnabled = true }: FnbTabViewProps) {
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const activeSeat = store.activeSeatNumber;
  const activeCourse = store.activeCourseNumber;
  const courseNames = store.courseNames;
  const isTabScreen = store.currentScreen === 'tab';
  const menuMode = store.menuMode;
  const leftHandMode = store.leftHandMode;
  const isHandheld = useIsHandheld();
  const [handheldPanel, setHandheldPanel] = useState<HandheldPanel>('menu');

  const {
    tab,
    isLoading,
    error,
    notFound,
    refresh: refreshTab,
    fireCourse,
    sendCourse,
    addItems,
    updatePartySize,
    isActing,
  } = useFnbTab({ tabId, pollEnabled: isTabScreen });

  // Auto-navigate back to floor when tab was closed/voided elsewhere
  useEffect(() => {
    if (notFound) {
      store.setActiveTab(null);
      store.navigateTo('floor');
    }
  }, [notFound, store]);

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

  // ── Modifier drawer state ──────────────────────────────────────
  const [modifierDrawerOpen, setModifierDrawerOpen] = useState(false);
  const [modifierDrawerItem, setModifierDrawerItem] = useState<{
    id: string;
    name: string;
    priceCents: number;
    itemType: string;
    groups: Array<{
      id: string;
      name: string;
      isRequired: boolean;
      minSelections: number;
      maxSelections: number;
      instructionMode?: string;
      defaultBehavior?: string;
      options: Array<{
        id: string;
        name: string;
        priceCents: number;
        isDefault: boolean;
        extraPriceDeltaCents?: number | null;
        kitchenLabel?: string | null;
        allowNone?: boolean;
        allowExtra?: boolean;
        allowOnSide?: boolean;
        isDefaultOption?: boolean;
      }>;
    }>;
  } | null>(null);

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

  const handlePay = async () => {
    if (!tabId) return;
    // Persist any unsent draft lines before navigating to payment,
    // otherwise the payment screen won't find items on the tab.
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
      // Refresh tab so payment screen sees persisted items
      await refreshTab();
    }
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

  // Item tap handler — checks for modifier groups before adding to cart
  const handleItemTap = useCallback((itemId: string, itemName: string, priceCents: number, itemType: string) => {
    if (!tabId) return;
    // Record to recents for Favorites tab
    recordRecentItem({ id: itemId, name: itemName, priceCents, itemType });

    // Check if item has modifier groups
    const groups = menu.getModifierGroupsForItem(itemId);
    if (groups.length > 0) {
      // Open modifier drawer (slides up from bottom)
      setModifierDrawerItem({ id: itemId, name: itemName, priceCents, itemType, groups });
      setModifierDrawerOpen(true);
      return;
    }

    // No modifiers — add directly to cart
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
  }, [tabId, store, activeSeat, activeCourse, menu]);

  // Modifier drawer confirm handler — adds item with selected modifiers to cart
  const handleModifierConfirm = useCallback((
    selectedModifiers: { groupId: string; optionId: string; name: string; priceCents: number; instruction?: 'none' | 'extra' | 'on_side' | null; kitchenLabel?: string | null }[],
    qty: number,
    notes: string,
  ) => {
    if (!tabId || !modifierDrawerItem) return;
    store.addDraftLine(tabId, {
      localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      catalogItemId: modifierDrawerItem.id,
      catalogItemName: modifierDrawerItem.name,
      unitPriceCents: modifierDrawerItem.priceCents,
      qty,
      itemType: modifierDrawerItem.itemType,
      seatNumber: activeSeat || 1,
      modifiers: selectedModifiers.map((m) => ({
        modifierId: m.optionId,
        modifierGroupId: m.groupId,
        name: m.name,
        priceAdjustment: m.priceCents,
        instruction: m.instruction ?? null,
      })),
      specialInstructions: notes || null,
      courseNumber: activeCourse,
      addedAt: Date.now(),
    });
    setModifierDrawerItem(null);
  }, [tabId, modifierDrawerItem, store, activeSeat, activeCourse]);

  // Repeat last item handler
  const handleRepeatLast = useCallback(() => {
    if (!tabId) return;
    store.repeatLastItem(tabId);
  }, [tabId, store]);

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

  // ── Handheld layout (<640px) ───────────────────────────────────
  // Shows one panel at a time with a bottom tab bar.
  if (isHandheld) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <TabHeader tab={tab} onBack={handleBack} />
        <TableContextCard tab={tab} />

        {/* Active panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {handheldPanel === 'menu' ? (
            <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
              <FnbMenuNav menu={menu} menuMode={menuMode} onSelectMode={handleSelectMenuMode} />
              <FnbMenuContent menu={menu} menuMode={menuMode} onItemTap={handleItemTap} />
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
              {/* Seat selector (horizontal on mobile) */}
              <div
                className="shrink-0 flex items-center gap-1 overflow-x-auto px-3 py-2"
                style={{ scrollbarWidth: 'none', borderBottom: 'var(--fnb-border-subtle)' }}
              >
                {Array.from({ length: tab.partySize ?? 1 }, (_, i) => i + 1).map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    onClick={() => handleSelectSeat(seat)}
                    className="shrink-0 rounded-full font-bold text-xs transition-opacity hover:opacity-80"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: activeSeat === seat ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
                      color: activeSeat === seat ? '#fff' : 'var(--fnb-text-secondary)',
                    }}
                  >
                    {seat}
                  </button>
                ))}
              </div>

              <CourseSelector activeCourse={activeCourse} onSelectCourse={handleSelectCourse} courseNames={courseNames} />

              <OrderTicket
                tab={tab}
                activeSeat={activeSeat}
                activeCourse={activeCourse}
                courseNames={courseNames}
                draftLines={draftLines}
                onSendCourse={sendCourse}
                onFireCourse={fireCourse}
                kdsSendEnabled={kdsSendEnabled}
              />

              {/* Totals */}
              <div
                className="shrink-0 px-3 py-2"
                style={{ borderTop: 'var(--fnb-border-subtle)', backgroundColor: 'var(--fnb-bg-elevated)' }}
              >
                <div
                  className="flex justify-between text-sm font-bold"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  <span>Total</span>
                  <span>{formatMoney(totalCents)}</span>
                </div>
              </div>

              {tab.primaryOrderId && (
                <ExemptionToggles
                  orderId={tab.primaryOrderId}
                  isTaxExempt={tab.isTaxExempt ?? false}
                  isServiceChargeExempt={tab.isServiceChargeExempt ?? false}
                  onUpdate={refreshTab}
                />
              )}

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
                kdsSendEnabled={kdsSendEnabled}
              />
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <HandheldTabBar
          activePanel={handheldPanel}
          onSelectPanel={setHandheldPanel}
          cartCount={totalItemCount}
          onBack={handleBack}
        />

        {/* Modifier drawer (portal-based) */}
        {modifierDrawerItem && (
          <FnbModifierDrawer
            open={modifierDrawerOpen}
            onClose={() => { setModifierDrawerOpen(false); setModifierDrawerItem(null); }}
            itemName={modifierDrawerItem.name}
            itemPriceCents={modifierDrawerItem.priceCents}
            modifierGroups={modifierDrawerItem.groups}
            onConfirm={handleModifierConfirm}
          />
        )}
      </div>
    );
  }

  // ── Main layout (tablet/desktop) ──────────────────────────────
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
      <div className="flex items-center">
        <div className="flex-1"><TabHeader tab={tab} onBack={handleBack} /></div>
        <div className="pr-3"><ManageTabsButton locationId={locationId ?? ''} /></div>
      </div>
      <TableContextCard tab={tab} />

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

      {/* ── Body: 3-column CSS Grid (flips for left-hand mode) ──── */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: leftHandMode ? '400px 1fr 80px' : '80px 1fr 400px',
        }}
      >

        {/* ── Seat rail (80px, full height) ──────────────── */}
        <div style={{ gridColumn: leftHandMode ? '3' : '1', gridRow: '1' }}>
          <SeatRail
            seatCount={tab.partySize ?? 1}
            activeSeat={activeSeat}
            onSelectSeat={handleSelectSeat}
            onAddSeat={handleAddSeat}
            unsentBySeat={unsentBySeat}
          />
        </div>

        {/* ── Menu browsing (1fr, full height) ─────────── */}
        <div
          className="flex flex-col min-w-0"
          style={{
            gridColumn: '2',
            gridRow: '1',
            backgroundColor: 'var(--fnb-bg-surface)',
            borderLeft: leftHandMode ? 'var(--fnb-border-subtle)' : undefined,
            borderRight: leftHandMode ? undefined : 'var(--fnb-border-subtle)',
          }}
        >
          {/* Navigation: search bar + mode tabs + department tabs + sub-department tabs */}
          <FnbMenuNav menu={menu} menuMode={menuMode} onSelectMode={handleSelectMenuMode} />

          {/* Content: category sidebar + item grid */}
          <FnbMenuContent menu={menu} menuMode={menuMode} onItemTap={handleItemTap} />
        </div>

        {/* ── Cart / Ticket (400px, full height) ─────────── */}
        <div
          className="flex flex-col min-w-0"
          style={{
            gridColumn: leftHandMode ? '1' : '3',
            gridRow: '1',
            backgroundColor: 'var(--fnb-bg-surface)',
          }}
        >
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
              {/* Repeat last item */}
              {draftLines.length > 0 && (
                <button
                  type="button"
                  onClick={handleRepeatLast}
                  className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
                  title="Repeat last item"
                  style={{ color: 'var(--fnb-text-muted)' }}
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Left-hand mode toggle */}
              <button
                type="button"
                onClick={() => store.toggleLeftHandMode()}
                className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
                title={leftHandMode ? 'Switch to right-hand mode' : 'Switch to left-hand mode'}
                style={{ color: leftHandMode ? 'var(--fnb-info)' : 'var(--fnb-text-muted)' }}
              >
                <Hand className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1" style={{ color: 'var(--fnb-text-muted)' }}>
                <Users className="h-3 w-3" />
                <span className="text-[10px] font-semibold">{tab.partySize ?? 1}</span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>
                {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>

          {/* AI Upsell suggestion */}
          <UpsellBanner
            items={(tab.lines ?? []).map((l) => ({
              id: l.catalogItemId ?? '',
              name: l.catalogItemName ?? '',
              priceCents: l.unitPriceCents ?? 0,
              itemType: 'food',
            }))}
            onTap={() => {}}
          />

          {/* Course selector */}
          <CourseSelector
            activeCourse={activeCourse}
            onSelectCourse={handleSelectCourse}
            courseNames={courseNames}
          />

          {/* Order ticket (scrollable cart body) */}
          <OrderTicket
            tab={tab}
            activeSeat={activeSeat}
            activeCourse={activeCourse}
            courseNames={courseNames}
            draftLines={draftLines}
            onSendCourse={sendCourse}
            onFireCourse={fireCourse}
            kdsSendEnabled={kdsSendEnabled}
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

          {/* Exemption toggles */}
          {tab.primaryOrderId && (
            <ExemptionToggles
              orderId={tab.primaryOrderId}
              isTaxExempt={tab.isTaxExempt ?? false}
              isServiceChargeExempt={tab.isServiceChargeExempt ?? false}
              onUpdate={refreshTab}
            />
          )}

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
            kdsSendEnabled={kdsSendEnabled}
          />
        </div>
      </div>

      {/* Modifier drawer — portal-based, opens when item with modifier groups is tapped */}
      {modifierDrawerItem && (
        <FnbModifierDrawer
          open={modifierDrawerOpen}
          onClose={() => { setModifierDrawerOpen(false); setModifierDrawerItem(null); }}
          itemName={modifierDrawerItem.name}
          itemPriceCents={modifierDrawerItem.priceCents}
          modifierGroups={modifierDrawerItem.groups}
          onConfirm={handleModifierConfirm}
        />
      )}
    </div>
  );
}
