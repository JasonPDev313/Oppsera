import { describe, it, expect, beforeEach } from 'vitest';
import { useFnbPosStore } from '../stores/fnb-pos-store';
import type { FnbDraftLine } from '@/types/fnb';

// Reset store before each test
beforeEach(() => {
  useFnbPosStore.getState().reset();
});

// ── Helpers ─────────────────────────────────────────────────────

function makeDraftLine(overrides: Partial<FnbDraftLine> = {}): FnbDraftLine {
  return {
    localId: `local-${Math.random().toString(36).slice(2, 8)}`,
    catalogItemId: 'item-001',
    catalogItemName: 'Caesar Salad',
    itemType: 'fnb',
    qty: 1,
    unitPriceCents: 1495,
    modifiers: [],
    specialInstructions: null,
    seatNumber: 1,
    courseNumber: 1,
    addedAt: Date.now(),
    ...overrides,
  };
}

// ── Navigation ──────────────────────────────────────────────────

describe('FnbPosStore — Navigation', () => {
  it('starts on floor screen', () => {
    const { currentScreen, previousScreen } = useFnbPosStore.getState();
    expect(currentScreen).toBe('floor');
    expect(previousScreen).toBeNull();
  });

  it('navigateTo updates screen and tracks previous', () => {
    const store = useFnbPosStore.getState();
    store.navigateTo('tab');
    const s = useFnbPosStore.getState();
    expect(s.currentScreen).toBe('tab');
    expect(s.previousScreen).toBe('floor');
  });

  it('navigateTo with tabId param updates activeTabId', () => {
    useFnbPosStore.getState().navigateTo('tab', { tabId: 'tab-123' });
    expect(useFnbPosStore.getState().activeTabId).toBe('tab-123');
  });

  it('navigateTo with roomId param updates activeRoomId', () => {
    useFnbPosStore.getState().navigateTo('floor', { roomId: 'room-1' });
    expect(useFnbPosStore.getState().activeRoomId).toBe('room-1');
  });

  it('navigateTo tab resets seat/course when tabId changes', () => {
    const store = useFnbPosStore.getState();
    store.navigateTo('tab', { tabId: 'tab-1' });
    store.setSeat(3);
    store.setCourse(2);
    // Navigate to a different tab
    store.navigateTo('tab', { tabId: 'tab-2' });
    const s = useFnbPosStore.getState();
    expect(s.activeSeatNumber).toBe(1);
    expect(s.activeCourseNumber).toBe(1);
  });

  it('goBack returns to previous screen', () => {
    const store = useFnbPosStore.getState();
    store.navigateTo('tab');
    store.goBack();
    const s = useFnbPosStore.getState();
    expect(s.currentScreen).toBe('floor');
    expect(s.previousScreen).toBeNull();
  });

  it('goBack without previous screen defaults to floor', () => {
    useFnbPosStore.getState().goBack();
    const s = useFnbPosStore.getState();
    expect(s.currentScreen).toBe('floor');
    expect(s.activeTabId).toBeNull();
  });

  it('setActiveTab updates activeTabId', () => {
    useFnbPosStore.getState().setActiveTab('tab-x');
    expect(useFnbPosStore.getState().activeTabId).toBe('tab-x');
  });

  it('setActiveRoom updates activeRoomId', () => {
    useFnbPosStore.getState().setActiveRoom('room-2');
    expect(useFnbPosStore.getState().activeRoomId).toBe('room-2');
  });
});

// ── Draft Line Management ───────────────────────────────────────

describe('FnbPosStore — Draft Lines', () => {
  const tabId = 'tab-001';

  it('addDraftLine adds to tab', () => {
    const line = makeDraftLine();
    useFnbPosStore.getState().addDraftLine(tabId, line);
    const lines = useFnbPosStore.getState().getDraftLines(tabId);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.catalogItemName).toBe('Caesar Salad');
  });

  it('addDraftLine creates tab bucket if missing', () => {
    expect(useFnbPosStore.getState().getDraftLines(tabId)).toHaveLength(0);
    useFnbPosStore.getState().addDraftLine(tabId, makeDraftLine());
    expect(useFnbPosStore.getState().getDraftLines(tabId)).toHaveLength(1);
  });

  it('removeDraftLine removes by localId', () => {
    const line = makeDraftLine({ localId: 'remove-me' });
    const store = useFnbPosStore.getState();
    store.addDraftLine(tabId, line);
    store.addDraftLine(tabId, makeDraftLine({ localId: 'keep-me' }));
    store.removeDraftLine(tabId, 'remove-me');
    const lines = useFnbPosStore.getState().getDraftLines(tabId);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.localId).toBe('keep-me');
  });

  it('removeDraftLine on non-existent tab is no-op', () => {
    useFnbPosStore.getState().removeDraftLine('no-such-tab', 'x');
    // no error thrown
    expect(useFnbPosStore.getState().getDraftLines('no-such-tab')).toHaveLength(0);
  });

  it('updateDraftLineQty updates quantity', () => {
    const line = makeDraftLine({ localId: 'qty-test', qty: 1 });
    const store = useFnbPosStore.getState();
    store.addDraftLine(tabId, line);
    store.updateDraftLineQty(tabId, 'qty-test', 3);
    expect(useFnbPosStore.getState().getDraftLines(tabId)[0]!.qty).toBe(3);
  });

  it('updateDraftLineQty on non-existent line is no-op', () => {
    useFnbPosStore.getState().addDraftLine(tabId, makeDraftLine());
    useFnbPosStore.getState().updateDraftLineQty(tabId, 'nonexistent', 5);
    // no crash
    expect(useFnbPosStore.getState().getDraftLines(tabId)[0]!.qty).toBe(1);
  });

  it('clearDraft removes all lines for tab', () => {
    const store = useFnbPosStore.getState();
    store.addDraftLine(tabId, makeDraftLine());
    store.addDraftLine(tabId, makeDraftLine());
    store.clearDraft(tabId);
    expect(useFnbPosStore.getState().getDraftLines(tabId)).toHaveLength(0);
  });

  it('getDraftCount returns correct count', () => {
    const store = useFnbPosStore.getState();
    expect(store.getDraftCount(tabId)).toBe(0);
    store.addDraftLine(tabId, makeDraftLine());
    store.addDraftLine(tabId, makeDraftLine());
    expect(useFnbPosStore.getState().getDraftCount(tabId)).toBe(2);
  });

  it('draft lines are isolated per tab', () => {
    const store = useFnbPosStore.getState();
    store.addDraftLine('tab-A', makeDraftLine());
    store.addDraftLine('tab-A', makeDraftLine());
    store.addDraftLine('tab-B', makeDraftLine());
    expect(useFnbPosStore.getState().getDraftCount('tab-A')).toBe(2);
    expect(useFnbPosStore.getState().getDraftCount('tab-B')).toBe(1);
  });
});

// ── Seat + Course ───────────────────────────────────────────────

describe('FnbPosStore — Seat + Course', () => {
  it('defaults to seat 1 and course 1', () => {
    const s = useFnbPosStore.getState();
    expect(s.activeSeatNumber).toBe(1);
    expect(s.activeCourseNumber).toBe(1);
  });

  it('setSeat updates active seat', () => {
    useFnbPosStore.getState().setSeat(4);
    expect(useFnbPosStore.getState().activeSeatNumber).toBe(4);
  });

  it('setCourse updates active course', () => {
    useFnbPosStore.getState().setCourse(3);
    expect(useFnbPosStore.getState().activeCourseNumber).toBe(3);
  });

  it('nextSeat increments seat number', () => {
    useFnbPosStore.getState().nextSeat();
    expect(useFnbPosStore.getState().activeSeatNumber).toBe(2);
    useFnbPosStore.getState().nextSeat();
    expect(useFnbPosStore.getState().activeSeatNumber).toBe(3);
  });
});

// ── Split Check ─────────────────────────────────────────────────

describe('FnbPosStore — Split Check', () => {
  it('initSplit creates workspace and navigates to split screen', () => {
    useFnbPosStore.getState().initSplit('by_seat', 3);
    const s = useFnbPosStore.getState();
    expect(s.currentScreen).toBe('split');
    expect(s.previousScreen).toBe('tab'); // initSplit sets previousScreen to 'tab'
    expect(s.splitWorkspace).not.toBeNull();
    expect(s.splitWorkspace!.strategy).toBe('by_seat');
    expect(s.splitWorkspace!.numberOfChecks).toBe(3);
    expect(s.splitWorkspace!.checks).toHaveLength(3);
  });

  it('initSplit creates checks with correct labels', () => {
    useFnbPosStore.getState().initSplit('equal_split', 4);
    const checks = useFnbPosStore.getState().splitWorkspace!.checks;
    expect(checks[0]!.label).toBe('Check 1');
    expect(checks[1]!.label).toBe('Check 2');
    expect(checks[2]!.label).toBe('Check 3');
    expect(checks[3]!.label).toBe('Check 4');
  });

  it('initSplit checks start with empty lineIds and zeroed totals', () => {
    useFnbPosStore.getState().initSplit('by_item', 2);
    const check = useFnbPosStore.getState().splitWorkspace!.checks[0]!;
    expect(check.lineIds).toEqual([]);
    expect(check.subtotalCents).toBe(0);
    expect(check.taxCents).toBe(0);
    expect(check.totalCents).toBe(0);
    expect(check.isPaid).toBe(false);
  });

  it('updateSplitCheck applies partial updates', () => {
    useFnbPosStore.getState().initSplit('equal_split', 2);
    useFnbPosStore.getState().updateSplitCheck(0, { subtotalCents: 2500, isPaid: true });
    const check = useFnbPosStore.getState().splitWorkspace!.checks[0]!;
    expect(check.subtotalCents).toBe(2500);
    expect(check.isPaid).toBe(true);
    expect(check.label).toBe('Check 1'); // unchanged
  });

  it('updateSplitCheck on invalid index is no-op', () => {
    useFnbPosStore.getState().initSplit('equal_split', 2);
    useFnbPosStore.getState().updateSplitCheck(99, { subtotalCents: 999 });
    // no crash
    expect(useFnbPosStore.getState().splitWorkspace!.checks).toHaveLength(2);
  });

  it('moveLineToCheck moves line between checks', () => {
    useFnbPosStore.getState().initSplit('by_item', 2);
    // Manually add line to check 0
    useFnbPosStore.getState().updateSplitCheck(0, { lineIds: ['line-1', 'line-2'] });
    useFnbPosStore.getState().moveLineToCheck('line-1', 0, 1);
    const checks = useFnbPosStore.getState().splitWorkspace!.checks;
    expect(checks[0]!.lineIds).toEqual(['line-2']);
    expect(checks[1]!.lineIds).toEqual(['line-1']);
  });

  it('moveLineToCheck prevents duplicates in target', () => {
    useFnbPosStore.getState().initSplit('by_item', 2);
    useFnbPosStore.getState().updateSplitCheck(0, { lineIds: ['line-1'] });
    useFnbPosStore.getState().updateSplitCheck(1, { lineIds: ['line-1'] });
    useFnbPosStore.getState().moveLineToCheck('line-1', 0, 1);
    // Should not duplicate
    expect(useFnbPosStore.getState().splitWorkspace!.checks[1]!.lineIds).toEqual(['line-1']);
  });

  it('clearSplit resets workspace and goes to tab screen', () => {
    useFnbPosStore.getState().initSplit('equal_split', 2);
    useFnbPosStore.getState().clearSplit();
    const s = useFnbPosStore.getState();
    expect(s.splitWorkspace).toBeNull();
    expect(s.currentScreen).toBe('tab');
  });
});

// ── UI Preferences ──────────────────────────────────────────────

describe('FnbPosStore — UI Preferences', () => {
  it('defaults: sidebarMode=my-tables, sidebarOpen=true, menuColumns=3, mySectionOnly=false', () => {
    const s = useFnbPosStore.getState();
    expect(s.sidebarMode).toBe('my-tables');
    expect(s.sidebarOpen).toBe(true);
    expect(s.menuColumns).toBe(3);
    expect(s.mySectionOnly).toBe(false);
  });

  it('setSidebarMode changes mode', () => {
    useFnbPosStore.getState().setSidebarMode('stats');
    expect(useFnbPosStore.getState().sidebarMode).toBe('stats');
  });

  it('toggleSidebar toggles open state', () => {
    useFnbPosStore.getState().toggleSidebar();
    expect(useFnbPosStore.getState().sidebarOpen).toBe(false);
    useFnbPosStore.getState().toggleSidebar();
    expect(useFnbPosStore.getState().sidebarOpen).toBe(true);
  });

  it('setMenuColumns changes column count', () => {
    useFnbPosStore.getState().setMenuColumns(4);
    expect(useFnbPosStore.getState().menuColumns).toBe(4);
    useFnbPosStore.getState().setMenuColumns(2);
    expect(useFnbPosStore.getState().menuColumns).toBe(2);
  });

  it('toggleMySectionOnly toggles filter', () => {
    useFnbPosStore.getState().toggleMySectionOnly();
    expect(useFnbPosStore.getState().mySectionOnly).toBe(true);
    useFnbPosStore.getState().toggleMySectionOnly();
    expect(useFnbPosStore.getState().mySectionOnly).toBe(false);
  });
});

// ── Connection ──────────────────────────────────────────────────

describe('FnbPosStore — Connection', () => {
  it('defaults to online', () => {
    expect(useFnbPosStore.getState().isOnline).toBe(true);
  });

  it('setOnline toggles connection state', () => {
    useFnbPosStore.getState().setOnline(false);
    expect(useFnbPosStore.getState().isOnline).toBe(false);
    useFnbPosStore.getState().setOnline(true);
    expect(useFnbPosStore.getState().isOnline).toBe(true);
  });
});

// ── Reset ───────────────────────────────────────────────────────

describe('FnbPosStore — Reset', () => {
  it('reset restores all state to initial values', () => {
    const store = useFnbPosStore.getState();
    // Modify everything
    store.navigateTo('tab', { tabId: 'tab-x' });
    store.setActiveRoom('room-5');
    store.addDraftLine('tab-x', makeDraftLine());
    store.setSeat(5);
    store.setCourse(3);
    store.initSplit('by_seat', 2);
    store.setSidebarMode('waitlist');
    store.toggleSidebar();
    store.setMenuColumns(4);
    store.toggleMySectionOnly();
    store.setOnline(false);

    // Reset
    useFnbPosStore.getState().reset();
    const s = useFnbPosStore.getState();

    expect(s.currentScreen).toBe('floor');
    expect(s.previousScreen).toBeNull();
    expect(s.activeTabId).toBeNull();
    expect(s.activeRoomId).toBeNull();
    expect(s.draftLines).toEqual({});
    expect(s.activeSeatNumber).toBe(1);
    expect(s.activeCourseNumber).toBe(1);
    expect(s.splitWorkspace).toBeNull();
    expect(s.sidebarMode).toBe('my-tables');
    expect(s.sidebarOpen).toBe(true);
    expect(s.menuColumns).toBe(3);
    expect(s.mySectionOnly).toBe(false);
    expect(s.isOnline).toBe(true);
  });
});
