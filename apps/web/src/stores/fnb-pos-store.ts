'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  FnbScreen,
  FnbNavTab,
  FnbNavigateParams,
  FnbDraftLine,
  FnbSplitWorkspace,
  FnbSplitStrategy,
  FnbSplitCheck,
} from '@/types/fnb';

// ── State Interface ──────────────────────────────────────────────

export interface FnbServerLock {
  isLocked: boolean;
  serverName: string | null;
  serverId: string | null;
}

export interface FnbPosState {
  // Screen navigation (internal to fnb-pos-content)
  currentScreen: FnbScreen;
  previousScreen: FnbScreen | null;
  activeNavTab: FnbNavTab;
  activeTabId: string | null;
  activeRoomId: string | null;

  // Draft order (unsent items staging area per tab)
  draftLines: Record<string, FnbDraftLine[]>;

  // Seat + course selection
  activeSeatNumber: number;
  activeCourseNumber: number;

  // Split check workspace (active only during split flow)
  splitWorkspace: FnbSplitWorkspace | null;

  // Course configuration (loaded from fnb_ordering settings)
  courseNames: string[];

  // Server lock
  serverLock: FnbServerLock;

  // UI preferences
  floorViewMode: 'layout' | 'grid';
  floorDisplayMode: 'status' | 'covers' | 'revenue' | 'time' | 'course';
  sidebarMode: 'my-tables' | 'stats' | 'waitlist';
  sidebarOpen: boolean;
  menuColumns: 2 | 3 | 4;
  menuMode: 'all_items' | 'hot_sellers' | 'tools';
  mySectionOnly: boolean;
  mySectionEditing: boolean;
  leftHandMode: boolean;
  tileSize: 'compact' | 'standard' | 'large';
  skipPaymentConfirm: boolean;

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
  setNavTab: (tab: FnbNavTab) => void;

  // Draft line management
  addDraftLine: (tabId: string, line: FnbDraftLine) => void;
  removeDraftLine: (tabId: string, localId: string) => void;
  updateDraftLineQty: (tabId: string, localId: string, qty: number) => void;
  clearDraft: (tabId: string) => void;
  getDraftLines: (tabId: string) => FnbDraftLine[];
  getDraftCount: (tabId: string) => number;
  repeatLastItem: (tabId: string) => void;

  // Seat + course
  setSeat: (seatNumber: number) => void;
  setCourse: (courseNumber: number) => void;
  nextSeat: () => void;

  // Split check
  initSplit: (strategy: FnbSplitStrategy, numberOfChecks: number) => void;
  updateSplitCheck: (checkIndex: number, updates: Partial<FnbSplitCheck>) => void;
  moveLineToCheck: (lineId: string, fromCheckIndex: number, toCheckIndex: number) => void;
  clearSplit: () => void;

  // Course config
  setCourseNames: (names: string[]) => void;

  // UI preferences
  setFloorViewMode: (mode: 'layout' | 'grid') => void;
  setFloorDisplayMode: (mode: 'status' | 'covers' | 'revenue' | 'time' | 'course') => void;
  setSidebarMode: (mode: 'my-tables' | 'stats' | 'waitlist') => void;
  toggleSidebar: () => void;
  setMenuColumns: (columns: 2 | 3 | 4) => void;
  setMenuMode: (mode: 'all_items' | 'hot_sellers' | 'tools') => void;
  toggleMySectionOnly: () => void;
  setMySectionEditing: (editing: boolean) => void;
  toggleLeftHandMode: () => void;
  setTileSize: (size: 'compact' | 'standard' | 'large') => void;
  toggleSkipPaymentConfirm: () => void;

  // Server lock
  lockToServer: (name: string, id: string) => void;
  unlockServer: (pin: string) => boolean;

  // Connection
  setOnline: (online: boolean) => void;

  // Reset
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────

function getPersistedRoomId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('oppsera:fnb-active-room') ?? null;
  } catch {
    return null;
  }
}

function getPersistedLeftHandMode(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem('oppsera:fnb-left-hand') === 'true'; } catch { return false; }
}

function getPersistedTileSize(): 'compact' | 'standard' | 'large' {
  if (typeof window === 'undefined') return 'standard';
  try {
    const v = localStorage.getItem('oppsera:fnb-tile-size');
    return v === 'compact' || v === 'large' ? v : 'standard';
  } catch { return 'standard'; }
}

function getPersistedSkipConfirm(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem('oppsera:fnb-skip-confirm') === 'true'; } catch { return false; }
}

function getPersistedServerLock(): FnbServerLock {
  if (typeof window === 'undefined') return { isLocked: false, serverName: null, serverId: null };
  try {
    const raw = localStorage.getItem('oppsera:fnb-server-lock');
    if (!raw) return { isLocked: false, serverName: null, serverId: null };
    const parsed = JSON.parse(raw) as FnbServerLock;
    return parsed.isLocked ? parsed : { isLocked: false, serverName: null, serverId: null };
  } catch { return { isLocked: false, serverName: null, serverId: null }; }
}

const DEFAULT_COURSE_NAMES = ['Apps', 'Entrees', 'Desserts'];

const initialState: FnbPosState = {
  currentScreen: 'floor',
  previousScreen: null,
  activeNavTab: 'tables',
  activeTabId: null,
  activeRoomId: getPersistedRoomId(),
  draftLines: {},
  activeSeatNumber: 1,
  activeCourseNumber: 1,
  courseNames: DEFAULT_COURSE_NAMES,
  splitWorkspace: null,
  serverLock: getPersistedServerLock(),
  floorViewMode: 'layout',
  floorDisplayMode: 'status',
  sidebarMode: 'my-tables',
  sidebarOpen: true,
  menuColumns: 3,
  menuMode: 'all_items' as const,
  mySectionOnly: false,
  mySectionEditing: false,
  leftHandMode: getPersistedLeftHandMode(),
  tileSize: getPersistedTileSize(),
  skipPaymentConfirm: getPersistedSkipConfirm(),
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
      try {
        localStorage.setItem('oppsera:fnb-active-room', roomId);
      } catch { /* ignore */ }
    },

    setNavTab: (tab) => {
      const screenMap: Record<string, FnbScreen> = {
        tables: 'floor',
        open_tickets: 'open_tickets',
        closed_tickets: 'closed_tickets',
        sales: 'sales_summary',
      };
      set((state) => {
        state.activeNavTab = tab;
        state.previousScreen = state.currentScreen;
        state.currentScreen = screenMap[tab] ?? 'floor';
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

    repeatLastItem: (tabId) => {
      const lines = get().draftLines[tabId];
      if (!lines || lines.length === 0) return;
      const last = lines[lines.length - 1]!;
      set((state) => {
        if (!state.draftLines[tabId]) state.draftLines[tabId] = [];
        state.draftLines[tabId].push({
          ...last,
          localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          seatNumber: state.activeSeatNumber,
          courseNumber: state.activeCourseNumber,
          addedAt: Date.now(),
        });
      });
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

    // ── Course Config ─────────────────────────────────────────

    setCourseNames: (names) => {
      set((state) => {
        state.courseNames = names.length > 0 ? names : DEFAULT_COURSE_NAMES;
        // Reset active course if it exceeds new course count
        if (state.activeCourseNumber > names.length && names.length > 0) {
          state.activeCourseNumber = 1;
        }
      });
    },

    // ── UI Preferences ──────────────────────────────────────────

    setFloorViewMode: (mode) => {
      set((state) => {
        state.floorViewMode = mode;
      });
    },

    setFloorDisplayMode: (mode) => {
      set((state) => {
        state.floorDisplayMode = mode;
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

    setMenuMode: (mode) => {
      set((state) => {
        state.menuMode = mode;
      });
    },

    toggleMySectionOnly: () => {
      set((state) => {
        state.mySectionOnly = !state.mySectionOnly;
      });
    },

    setMySectionEditing: (editing) => {
      set((state) => {
        state.mySectionEditing = editing;
      });
    },

    toggleLeftHandMode: () => {
      set((state) => {
        state.leftHandMode = !state.leftHandMode;
      });
      try { localStorage.setItem('oppsera:fnb-left-hand', String(!get().leftHandMode)); } catch { /* ignore */ }
    },

    setTileSize: (size) => {
      set((state) => {
        state.tileSize = size;
      });
      try { localStorage.setItem('oppsera:fnb-tile-size', size); } catch { /* ignore */ }
    },

    toggleSkipPaymentConfirm: () => {
      set((state) => {
        state.skipPaymentConfirm = !state.skipPaymentConfirm;
      });
      try { localStorage.setItem('oppsera:fnb-skip-confirm', String(!get().skipPaymentConfirm)); } catch { /* ignore */ }
    },

    // ── Server Lock ──────────────────────────────────────────────

    lockToServer: (name, id) => {
      const lock: FnbServerLock = { isLocked: true, serverName: name, serverId: id };
      set((state) => { state.serverLock = lock; });
      try { localStorage.setItem('oppsera:fnb-server-lock', JSON.stringify(lock)); } catch { /* ignore */ }
      try { localStorage.setItem('oppsera:fnb-server-pin', ''); } catch { /* ignore */ }
    },

    unlockServer: (pin) => {
      try {
        const storedPin = localStorage.getItem('oppsera:fnb-server-pin') ?? '';
        if (storedPin && pin !== storedPin) return false;
      } catch { /* ignore — allow unlock if storage unavailable */ }
      const unlock: FnbServerLock = { isLocked: false, serverName: null, serverId: null };
      set((state) => { state.serverLock = unlock; });
      try { localStorage.removeItem('oppsera:fnb-server-lock'); } catch { /* ignore */ }
      try { localStorage.removeItem('oppsera:fnb-server-pin'); } catch { /* ignore */ }
      return true;
    },

    // ── Connection ──────────────────────────────────────────────

    setOnline: (online) => {
      set((state) => {
        state.isOnline = online;
      });
    },

    // ── Reset ───────────────────────────────────────────────────

    reset: () => {
      try { localStorage.removeItem('oppsera:fnb-active-room'); } catch { /* ignore */ }
      set(() => ({
        ...initialState,
        activeRoomId: null, // override persisted value on explicit reset
        leftHandMode: getPersistedLeftHandMode(), // preserve preference
        tileSize: getPersistedTileSize(), // preserve preference
        skipPaymentConfirm: getPersistedSkipConfirm(), // preserve preference
        serverLock: getPersistedServerLock(), // preserve server lock
      }));
    },
  })),
);
