'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  FnbScreen,
  FnbNavigateParams,
  FnbDraftLine,
  FnbSplitWorkspace,
  FnbSplitStrategy,
  FnbSplitCheck,
} from '@/types/fnb';

// ── State Interface ──────────────────────────────────────────────

export interface FnbPosState {
  // Screen navigation (internal to fnb-pos-content)
  currentScreen: FnbScreen;
  previousScreen: FnbScreen | null;
  activeTabId: string | null;
  activeRoomId: string | null;

  // Draft order (unsent items staging area per tab)
  draftLines: Record<string, FnbDraftLine[]>;

  // Seat + course selection
  activeSeatNumber: number;
  activeCourseNumber: number;

  // Split check workspace (active only during split flow)
  splitWorkspace: FnbSplitWorkspace | null;

  // UI preferences
  floorViewMode: 'layout' | 'grid';
  sidebarMode: 'my-tables' | 'stats' | 'waitlist';
  sidebarOpen: boolean;
  menuColumns: 2 | 3 | 4;
  mySectionOnly: boolean;

  // Connection
  isOnline: boolean;
}

// ── Actions Interface ────────────────────────────────────────────

export interface FnbPosActions {
  // Navigation
  navigateTo: (screen: FnbScreen, params?: FnbNavigateParams) => void;
  goBack: () => void;
  setActiveTab: (tabId: string | null) => void;
  setActiveRoom: (roomId: string) => void;

  // Draft line management
  addDraftLine: (tabId: string, line: FnbDraftLine) => void;
  removeDraftLine: (tabId: string, localId: string) => void;
  updateDraftLineQty: (tabId: string, localId: string, qty: number) => void;
  clearDraft: (tabId: string) => void;
  getDraftLines: (tabId: string) => FnbDraftLine[];
  getDraftCount: (tabId: string) => number;

  // Seat + course
  setSeat: (seatNumber: number) => void;
  setCourse: (courseNumber: number) => void;
  nextSeat: () => void;

  // Split check
  initSplit: (strategy: FnbSplitStrategy, numberOfChecks: number) => void;
  updateSplitCheck: (checkIndex: number, updates: Partial<FnbSplitCheck>) => void;
  moveLineToCheck: (lineId: string, fromCheckIndex: number, toCheckIndex: number) => void;
  clearSplit: () => void;

  // UI preferences
  setFloorViewMode: (mode: 'layout' | 'grid') => void;
  setSidebarMode: (mode: 'my-tables' | 'stats' | 'waitlist') => void;
  toggleSidebar: () => void;
  setMenuColumns: (columns: 2 | 3 | 4) => void;
  toggleMySectionOnly: () => void;

  // Connection
  setOnline: (online: boolean) => void;

  // Reset
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────

const initialState: FnbPosState = {
  currentScreen: 'floor',
  previousScreen: null,
  activeTabId: null,
  activeRoomId: null,
  draftLines: {},
  activeSeatNumber: 1,
  activeCourseNumber: 1,
  splitWorkspace: null,
  floorViewMode: 'layout',
  sidebarMode: 'my-tables',
  sidebarOpen: true,
  menuColumns: 3,
  mySectionOnly: false,
  isOnline: true,
};

// ── Store ────────────────────────────────────────────────────────

export const useFnbPosStore = create<FnbPosState & FnbPosActions>()(
  immer((set, get) => ({
    ...initialState,

    // ── Navigation ──────────────────────────────────────────────

    navigateTo: (screen, params) => {
      set((state) => {
        state.previousScreen = state.currentScreen;
        state.currentScreen = screen;

        if (params?.tabId !== undefined) {
          state.activeTabId = params.tabId;
        }
        if (params?.roomId !== undefined) {
          state.activeRoomId = params.roomId;
        }

        // Reset seat/course when entering a new tab
        if (screen === 'tab' && params?.tabId && params.tabId !== get().activeTabId) {
          state.activeSeatNumber = 1;
          state.activeCourseNumber = 1;
        }
      });
    },

    goBack: () => {
      set((state) => {
        const prev = state.previousScreen;
        if (prev) {
          state.currentScreen = prev;
          state.previousScreen = null;
        } else {
          // Default: go to floor
          state.currentScreen = 'floor';
          state.activeTabId = null;
        }
      });
    },

    setActiveTab: (tabId) => {
      set((state) => {
        state.activeTabId = tabId;
      });
    },

    setActiveRoom: (roomId) => {
      set((state) => {
        state.activeRoomId = roomId;
      });
    },

    // ── Draft Line Management ───────────────────────────────────

    addDraftLine: (tabId, line) => {
      set((state) => {
        if (!state.draftLines[tabId]) {
          state.draftLines[tabId] = [];
        }
        state.draftLines[tabId].push(line);
      });
    },

    removeDraftLine: (tabId, localId) => {
      set((state) => {
        const lines = state.draftLines[tabId];
        if (lines) {
          state.draftLines[tabId] = lines.filter((l) => l.localId !== localId);
        }
      });
    },

    updateDraftLineQty: (tabId, localId, qty) => {
      set((state) => {
        const lines = state.draftLines[tabId];
        if (lines) {
          const line = lines.find((l) => l.localId === localId);
          if (line) {
            line.qty = qty;
          }
        }
      });
    },

    clearDraft: (tabId) => {
      set((state) => {
        delete state.draftLines[tabId];
      });
    },

    getDraftLines: (tabId) => {
      return get().draftLines[tabId] ?? [];
    },

    getDraftCount: (tabId) => {
      return (get().draftLines[tabId] ?? []).length;
    },

    // ── Seat + Course ───────────────────────────────────────────

    setSeat: (seatNumber) => {
      set((state) => {
        state.activeSeatNumber = seatNumber;
      });
    },

    setCourse: (courseNumber) => {
      set((state) => {
        state.activeCourseNumber = courseNumber;
      });
    },

    nextSeat: () => {
      set((state) => {
        state.activeSeatNumber += 1;
      });
    },

    // ── Split Check ─────────────────────────────────────────────

    initSplit: (strategy, numberOfChecks) => {
      set((state) => {
        const checks: FnbSplitCheck[] = Array.from({ length: numberOfChecks }, (_, i) => ({
          checkIndex: i,
          label: `Check ${i + 1}`,
          lineIds: [],
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          isPaid: false,
        }));
        state.splitWorkspace = { strategy, checks, numberOfChecks };
        state.currentScreen = 'split';
        state.previousScreen = 'tab';
      });
    },

    updateSplitCheck: (checkIndex, updates) => {
      set((state) => {
        if (state.splitWorkspace && state.splitWorkspace.checks[checkIndex]) {
          Object.assign(state.splitWorkspace.checks[checkIndex], updates);
        }
      });
    },

    moveLineToCheck: (lineId, fromCheckIndex, toCheckIndex) => {
      set((state) => {
        if (!state.splitWorkspace) return;
        const from = state.splitWorkspace.checks[fromCheckIndex];
        const to = state.splitWorkspace.checks[toCheckIndex];
        if (from && to) {
          from.lineIds = from.lineIds.filter((id) => id !== lineId);
          if (!to.lineIds.includes(lineId)) {
            to.lineIds.push(lineId);
          }
        }
      });
    },

    clearSplit: () => {
      set((state) => {
        state.splitWorkspace = null;
        state.currentScreen = 'tab';
      });
    },

    // ── UI Preferences ──────────────────────────────────────────

    setFloorViewMode: (mode) => {
      set((state) => {
        state.floorViewMode = mode;
      });
    },

    setSidebarMode: (mode) => {
      set((state) => {
        state.sidebarMode = mode;
      });
    },

    toggleSidebar: () => {
      set((state) => {
        state.sidebarOpen = !state.sidebarOpen;
      });
    },

    setMenuColumns: (columns) => {
      set((state) => {
        state.menuColumns = columns;
      });
    },

    toggleMySectionOnly: () => {
      set((state) => {
        state.mySectionOnly = !state.mySectionOnly;
      });
    },

    // ── Connection ──────────────────────────────────────────────

    setOnline: (online) => {
      set((state) => {
        state.isOnline = online;
      });
    },

    // ── Reset ───────────────────────────────────────────────────

    reset: () => {
      set(() => ({ ...initialState }));
    },
  })),
);
