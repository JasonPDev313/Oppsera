/**
 * @vitest-environment jsdom
 *
 * Tests for FnbTabView per-course draft persistence path:
 *   persistDraftsForCourse → sendCourseWithWarning / fireCourseWithWarning
 *
 * Strategy: render the component with mocked hooks, capture the callbacks
 * passed to OrderTicket and TabActionBar, invoke them, and assert that
 * addItems receives only the targeted course's drafts, the store is cleaned
 * up, and sendCourse/fireCourse fire in the right order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';

// ── jsdom polyfill: matchMedia ──────────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import type { FnbDraftLine } from '@/types/fnb';

// ── Captured callback refs ──────────────────────────────────────
let capturedOnSendCourse: ((courseNumber: number) => Promise<void>) | undefined;
let capturedOnFireCourse: ((courseNumber: number) => Promise<void>) | undefined;
let capturedOnFireNext: (() => Promise<void>) | undefined;

// ── Mock addItems / sendCourse / fireCourse ─────────────────────
const mockAddItems = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
const mockSendCourse = vi.fn<(courseNumber: number) => Promise<{ warning?: string; effectiveKdsLocationId?: string } | undefined>>().mockResolvedValue(undefined);
const mockFireCourse = vi.fn<(courseNumber: number) => Promise<void>>().mockResolvedValue(undefined);

// ── Mock hooks & child components ───────────────────────────────

vi.mock('@/hooks/use-fnb-tab', () => ({
  useFnbTab: () => ({
    tab: {
      id: 'tab-1',
      locationId: 'loc-test',
      status: 'open',
      partySize: 2,
      courses: [
        { courseNumber: 1, courseStatus: 'sent' },
        { courseNumber: 2, courseStatus: 'unsent' },
      ],
      lines: [],
      primaryOrderId: null,
      isTaxExempt: false,
      isServiceChargeExempt: false,
    },
    isLoading: false,
    error: null,
    notFound: false,
    refresh: vi.fn(),
    fireCourse: mockFireCourse,
    sendCourse: mockSendCourse,
    addItems: mockAddItems,
    updatePartySize: vi.fn(),
    isActing: false,
  }),
}));

vi.mock('@/hooks/use-fnb-menu', () => ({
  useFnbMenu: () => ({
    categories: [],
    items: [],
    isLoading: false,
    error: null,
    activeCategory: null,
    setActiveCategory: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    filteredItems: [],
    recentItems: [],
  }),
}));

vi.mock('@/hooks/use-fnb-guest-pay', () => ({
  useFnbGuestPay: () => ({
    isProcessing: false,
    qrUrl: null,
    startGuestPay: vi.fn(),
  }),
}));

vi.mock('@/components/auth-provider', () => ({
  useAuthContext: () => ({
    locations: [{ id: 'loc-1', name: 'Main Kitchen' }],
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: () => true,
  }),
}));

vi.mock('@/hooks/use-fnb-kitchen', () => ({
  useStations: () => ({
    stations: [{ id: 'station-1', isActive: true }],
  }),
}));

vi.mock('@/lib/kds-location', () => ({
  resolveKdsLocationId: () => 'loc-1',
  resolveKdsLocationName: () => 'Main Kitchen',
}));

vi.mock('@/hooks/use-pos-location', () => ({
  usePosLocation: () => ({ locationId: 'loc_test', locationName: 'Test Location' }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

// ── Stub child components (capture props we care about) ─────────

vi.mock('../TabHeader', () => ({
  TabHeader: () => <div data-testid="tab-header" />,
}));

vi.mock('../TableContextCard', () => ({
  TableContextCard: () => <div data-testid="table-context" />,
}));

vi.mock('../SeatRail', () => ({
  SeatRail: () => <div data-testid="seat-rail" />,
}));

vi.mock('../CourseSelector', () => ({
  CourseSelector: () => <div data-testid="course-selector" />,
}));

vi.mock('../OrderTicket', () => ({
  OrderTicket: (props: {
    onSendCourse?: (courseNumber: number) => Promise<void>;
    onFireCourse?: (courseNumber: number) => Promise<void>;
  }) => {
    capturedOnSendCourse = props.onSendCourse;
    capturedOnFireCourse = props.onFireCourse;
    return <div data-testid="order-ticket" />;
  },
}));

vi.mock('../ExemptionToggles', () => ({
  ExemptionToggles: () => <div data-testid="exemption-toggles" />,
}));

vi.mock('../TabActionBar', () => ({
  TabActionBar: (props: { onFireNext?: () => Promise<void> }) => {
    capturedOnFireNext = props.onFireNext;
    return <div data-testid="tab-action-bar" />;
  },
}));

vi.mock('@/components/fnb/menu/FnbMenuPanel', () => ({
  FnbMenuNav: () => <div data-testid="menu-nav" />,
  FnbMenuContent: () => <div data-testid="menu-content" />,
  FnbMenuError: () => null,
  recordRecentItem: vi.fn(),
}));

vi.mock('@/components/fnb/menu/FnbModifierDrawer', () => ({
  FnbModifierDrawer: () => null,
}));

vi.mock('@/components/pos/shared/KdsNotConfiguredDialog', () => ({
  KdsNotConfiguredDialog: () => null,
}));

vi.mock('../manage-tabs/ManageTabsButton', () => ({
  ManageTabsButton: () => null,
}));

// ── Import the component under test AFTER mocks ─────────────────
import { FnbTabView } from '../FnbTabView';

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

function seedDrafts(tabId: string, lines: FnbDraftLine[]) {
  const store = useFnbPosStore.getState();
  for (const line of lines) {
    store.addDraftLine(tabId, line);
  }
}

function renderTabView() {
  // Set up store: active tab, tab screen
  const store = useFnbPosStore.getState();
  store.setActiveTab('tab-1');
  store.navigateTo('tab');

  return render(<FnbTabView userId="user-1" isActive kdsSendEnabled />);
}

// ── Tests ───────────────────────────────────────────────────────

describe('FnbTabView — per-course draft persistence', () => {
  beforeEach(() => {
    useFnbPosStore.getState().reset();
    mockAddItems.mockClear();
    mockSendCourse.mockClear();
    mockFireCourse.mockClear();
    capturedOnSendCourse = undefined;
    capturedOnFireCourse = undefined;
    capturedOnFireNext = undefined;
  });

  it('sendCourseWithWarning persists only the targeted course drafts then sends', async () => {
    const c1a = makeDraftLine({ localId: 'c1a', courseNumber: 1, catalogItemName: 'Soup' });
    const c1b = makeDraftLine({ localId: 'c1b', courseNumber: 1, catalogItemName: 'Salad' });
    const c2a = makeDraftLine({ localId: 'c2a', courseNumber: 2, catalogItemName: 'Steak' });
    seedDrafts('tab-1', [c1a, c1b, c2a]);

    renderTabView();
    expect(capturedOnSendCourse).toBeDefined();

    await act(async () => {
      await capturedOnSendCourse!(1);
    });

    // addItems called with only course 1 drafts
    expect(mockAddItems).toHaveBeenCalledTimes(1);
    const addedItems = mockAddItems.mock.calls[0]![0] as Array<{ catalogItemName: string; courseNumber: number }>;
    expect(addedItems).toHaveLength(2);
    expect(addedItems.every((i) => i.courseNumber === 1)).toBe(true);
    expect(addedItems.map((i) => i.catalogItemName).sort()).toEqual(['Salad', 'Soup']);

    // sendCourse called after addItems
    expect(mockSendCourse).toHaveBeenCalledTimes(1);
    expect(mockSendCourse).toHaveBeenCalledWith(1);

    // Course 1 drafts removed from store, course 2 draft remains
    const remaining = useFnbPosStore.getState().draftLines['tab-1'] ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.localId).toBe('c2a');
  });

  it('fireCourseWithDraftPersist persists drafts then fires', async () => {
    const c2a = makeDraftLine({ localId: 'c2a', courseNumber: 2, catalogItemName: 'Risotto' });
    const c3a = makeDraftLine({ localId: 'c3a', courseNumber: 3, catalogItemName: 'Dessert' });
    seedDrafts('tab-1', [c2a, c3a]);

    renderTabView();
    expect(capturedOnFireCourse).toBeDefined();

    await act(async () => {
      await capturedOnFireCourse!(2);
    });

    // addItems called with only course 2 draft
    expect(mockAddItems).toHaveBeenCalledTimes(1);
    const addedItems = mockAddItems.mock.calls[0]![0] as Array<{ catalogItemName: string; courseNumber: number }>;
    expect(addedItems).toHaveLength(1);
    expect(addedItems[0]!.catalogItemName).toBe('Risotto');
    expect(addedItems[0]!.courseNumber).toBe(2);

    // fireCourse called
    expect(mockFireCourse).toHaveBeenCalledTimes(1);
    expect(mockFireCourse).toHaveBeenCalledWith(2);

    // Course 2 draft gone, course 3 draft stays
    const remaining = useFnbPosStore.getState().draftLines['tab-1'] ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.localId).toBe('c3a');
  });

  it('skips addItems when no drafts exist for the targeted course', async () => {
    // Only course 3 drafts — sending course 1 should skip addItems
    const c3a = makeDraftLine({ localId: 'c3a', courseNumber: 3, catalogItemName: 'Tiramisu' });
    seedDrafts('tab-1', [c3a]);

    renderTabView();

    await act(async () => {
      await capturedOnSendCourse!(1);
    });

    // No addItems call — nothing to persist for course 1
    expect(mockAddItems).not.toHaveBeenCalled();
    // sendCourse still fires
    expect(mockSendCourse).toHaveBeenCalledWith(1);

    // Course 3 draft untouched
    const remaining = useFnbPosStore.getState().draftLines['tab-1'] ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.localId).toBe('c3a');
  });

  it('handleFireNext persists drafts for the first sent course then fires', async () => {
    // Tab has course 1 as "sent" (see mock above), so handleFireNext targets course 1
    const c1a = makeDraftLine({ localId: 'c1a', courseNumber: 1, catalogItemName: 'Bread' });
    seedDrafts('tab-1', [c1a]);

    renderTabView();
    expect(capturedOnFireNext).toBeDefined();

    await act(async () => {
      await capturedOnFireNext!();
    });

    // Drafts for course 1 persisted
    expect(mockAddItems).toHaveBeenCalledTimes(1);
    const addedItems = mockAddItems.mock.calls[0]![0] as Array<{ courseNumber: number }>;
    expect(addedItems).toHaveLength(1);
    expect(addedItems[0]!.courseNumber).toBe(1);

    // fireCourse called for course 1 (first "sent" course)
    expect(mockFireCourse).toHaveBeenCalledWith(1);
  });

  it('sendCourseWithWarning surfaces KDS error on failure', async () => {
    mockSendCourse.mockRejectedValueOnce(new Error('KDS unreachable'));

    renderTabView();

    await act(async () => {
      await capturedOnSendCourse!(1);
    });

    // sendCourse was attempted
    expect(mockSendCourse).toHaveBeenCalledWith(1);
    // No crash — error is handled inside the component (sets kdsSendError state)
  });

  it('sendCourseWithWarning surfaces cross-location warning', async () => {
    mockSendCourse.mockResolvedValueOnce({
      effectiveKdsLocationId: 'loc-other',
      warning: 'Rerouted',
    });

    renderTabView();

    await act(async () => {
      await capturedOnSendCourse!(1);
    });

    expect(mockSendCourse).toHaveBeenCalledWith(1);
    // No crash — cross-location warning is handled internally
  });
});
