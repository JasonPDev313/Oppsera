'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { Order, RegisterTab, TabNumber } from '@/types/pos';

// ── Types ───────────────────────────────────────────────────────────

interface UseRegisterTabsOptions {
  terminalId: string;
  /** The POS hook instance */
  pos: {
    currentOrder: Order | null;
    setOrder: (order: Order | null) => void;
    fetchOrder: (orderId: string) => Promise<Order>;
  };
  employeeId: string;
  employeeName: string;
}

interface UseRegisterTabsReturn {
  tabs: RegisterTab[];
  activeTabNumber: TabNumber;
  activeTab: RegisterTab;
  switchTab: (tabNumber: TabNumber) => void;
  addTab: () => void;
  closeTab: (tabNumber: TabNumber) => void;
  renameTab: (tabNumber: TabNumber, label: string) => void;
  /** Called after placeOrder/voidOrder/clearOrder to reset the active tab */
  clearActiveTab: () => void;
  changeServer: (tabNumber: TabNumber, employeeId: string, employeeName: string) => void;
  isLoading: boolean;
}

// ── Server API helpers ──────────────────────────────────────────────

interface ServerTab {
  id: string;
  tenantId: string;
  terminalId: string;
  tabNumber: number;
  orderId: string | null;
  label: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRegisterTab(s: ServerTab): RegisterTab {
  return {
    id: s.id,
    tabNumber: s.tabNumber,
    orderId: s.orderId,
    label: s.label,
    employeeId: s.employeeId,
    employeeName: s.employeeName,
  };
}

// ── Active tab localStorage (only stores which tab is active) ───────

function activeTabKey(terminalId: string): string {
  return `oppsera:active-tab:${terminalId}`;
}

function loadActiveTab(terminalId: string): TabNumber | null {
  try {
    const raw = localStorage.getItem(activeTabKey(terminalId));
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function saveActiveTab(terminalId: string, tabNumber: TabNumber): void {
  try {
    localStorage.setItem(activeTabKey(terminalId), String(tabNumber));
  } catch {
    // Ignore
  }
}

// ── Tab list sessionStorage cache ─────────────────────────────────

const TABS_CACHE_PREFIX = 'oppsera:tabs-cache:';

interface CachedTabs {
  tabs: RegisterTab[];
  cachedAt: number;
}

function loadCachedTabs(terminalId: string): RegisterTab[] | null {
  try {
    const raw = sessionStorage.getItem(`${TABS_CACHE_PREFIX}${terminalId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedTabs;
    // 10 minute TTL
    if (Date.now() - cached.cachedAt > 10 * 60 * 1000) return null;
    return cached.tabs;
  } catch {
    return null;
  }
}

function saveCachedTabs(terminalId: string, tabs: RegisterTab[]): void {
  try {
    const data: CachedTabs = { tabs, cachedAt: Date.now() };
    sessionStorage.setItem(`${TABS_CACHE_PREFIX}${terminalId}`, JSON.stringify(data));
  } catch {
    // Ignore
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useRegisterTabs({
  terminalId,
  pos,
  employeeId,
  employeeName,
}: UseRegisterTabsOptions): UseRegisterTabsReturn {
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────

  const [tabs, setTabs] = useState<RegisterTab[]>([]);
  const [activeTabNumber, setActiveTabNumber] = useState<TabNumber>(1);
  const [isLoading, setIsLoading] = useState(true);

  // In-memory order cache: orderId → Order
  const orderCache = useRef<Map<string, Order>>(new Map());

  // Track whether we're in the middle of a programmatic tab switch
  const isSwitching = useRef(false);

  // Prevent sync-back during initial load
  const hasLoaded = useRef(false);

  // Track active tab number via ref for async callbacks
  const activeTabRef = useRef<TabNumber>(1);

  // Keep activeTabRef in sync
  activeTabRef.current = activeTabNumber;

  // ── Derived ────────────────────────────────────────────────────────

  const activeTab = useMemo(
    () => tabs.find((t) => t.tabNumber === activeTabNumber) ?? tabs[0]!,
    [tabs, activeTabNumber],
  );

  // ── Sync current order back into cache + active tab ────────────────

  useEffect(() => {
    if (isSwitching.current || !hasLoaded.current) return;

    const order = pos.currentOrder;
    const currentActiveTab = tabs.find((t) => t.tabNumber === activeTabNumber);
    if (!currentActiveTab) return;

    if (order) {
      // Update cache
      orderCache.current.set(order.id, order);

      // Update tab's orderId if it changed (e.g. openOrder created a new one)
      if (currentActiveTab.orderId !== order.id) {
        setTabs((prev) =>
          prev.map((t) =>
            t.tabNumber === activeTabNumber ? { ...t, orderId: order.id } : t,
          ),
        );
        // Sync to server (skip pending tabs that don't have a real server id yet)
        if (!currentActiveTab.id.startsWith('pending-')) {
          apiFetch(`/api/v1/register-tabs/${currentActiveTab.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ orderId: order.id }),
          }).catch((err) => { console.error('Tab orderId sync failed:', err); });
        }
      }
    }
    // IMPORTANT: orderId clearing is handled ONLY by clearActiveTab() which is
    // called explicitly after payment/void/hold. Never auto-clear here — doing
    // so races with order rehydration on POS remount and detaches customers.
  }, [pos.currentOrder, activeTabNumber]);

  // ── Save active tab to localStorage ────────────────────────────────

  useEffect(() => {
    if (!terminalId || !hasLoaded.current) return;
    saveActiveTab(terminalId, activeTabNumber);
  }, [activeTabNumber, terminalId]);

  // ── Persist tab list to sessionStorage cache ──────────────────────

  useEffect(() => {
    if (!terminalId || !hasLoaded.current || tabs.length === 0) return;
    saveCachedTabs(terminalId, tabs);
  }, [tabs, terminalId]);

  // ── Load tabs from server on mount ─────────────────────────────────

  useEffect(() => {
    if (!terminalId) {
      setIsLoading(false);
      return;
    }

    // Clean up old localStorage tabs (migrated to server)
    try {
      localStorage.removeItem(`oppsera:register-tabs:${terminalId}`);
    } catch {
      // Ignore
    }

    let cancelled = false;

    // ── Show cached tabs instantly (stale-while-revalidate) ─────────
    const cached = loadCachedTabs(terminalId);
    if (cached && cached.length > 0) {
      setTabs(cached);
      const savedActive = loadActiveTab(terminalId);
      const activeNumber =
        savedActive && cached.some((t) => t.tabNumber === savedActive)
          ? savedActive
          : cached[0]!.tabNumber;
      setActiveTabNumber(activeNumber);
      hasLoaded.current = true;
      setIsLoading(false);

      // Block sync-back during rehydration so it doesn't auto-clear orderId
      isSwitching.current = true;

      // If active tab has no order, clear POS state; otherwise leave it for fetch below
      const activeHasOrder = cached.find((t) => t.tabNumber === activeNumber)?.orderId;
      if (!activeHasOrder) {
        pos.setOrder(null);
      }

      // Pre-fetch ALL cached tabs' orders in parallel so tab switching is instant
      const tabsWithOrders = cached.filter((t) => t.orderId);
      if (tabsWithOrders.length > 0) {
        for (const tab of tabsWithOrders) {
          pos.fetchOrder(tab.orderId!).then((order) => {
            if (cancelled) return;
            if (order.status === 'open') {
              orderCache.current.set(tab.orderId!, order);
              // Display immediately if this is the active tab
              if (activeTabRef.current === tab.tabNumber) {
                pos.setOrder(order);
              }
            }
          }).catch((err) => { console.error('Tab order pre-fetch failed:', err); });
        }
      }

      // Unblock sync-back after all fetches have been dispatched
      requestAnimationFrame(() => {
        isSwitching.current = false;
      });
    }

    // ── Helper to clear a tab's invalid order ───────────────────────
    const clearTabOrder = (tab: RegisterTab) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, orderId: null } : t)),
      );
      if (!tab.id.startsWith('pending-')) {
        apiFetch(`/api/v1/register-tabs/${tab.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderId: null }),
        }).catch((err) => { console.error('Tab order clear failed:', err); });
      }
    };

    // ── Background refresh from server ──────────────────────────────
    async function loadTabs() {
      try {
        const resp = await apiFetch<{ data: ServerTab[] }>(
          `/api/v1/register-tabs?terminalId=${encodeURIComponent(terminalId)}`,
        );

        if (cancelled) return;

        let serverTabs = resp.data.map(toRegisterTab);

        // If no tabs exist on server, create the default Tab 1
        if (serverTabs.length === 0) {
          const createResp = await apiFetch<{ data: ServerTab }>(
            '/api/v1/register-tabs',
            {
              method: 'POST',
              body: JSON.stringify({ terminalId, tabNumber: 1, employeeId, employeeName }),
            },
          );
          if (cancelled) return;
          serverTabs = [toRegisterTab(createResp.data)];
        }

        // Update cache for next visit
        saveCachedTabs(terminalId, serverTabs);

        setTabs(serverTabs);

        // Restore active tab from localStorage, or use first tab
        const savedActive = loadActiveTab(terminalId);
        const activeNumber =
          savedActive && serverTabs.some((t) => t.tabNumber === savedActive)
            ? savedActive
            : serverTabs[0]!.tabNumber;

        setActiveTabNumber(activeNumber);

        // Show tabs immediately — don't block on order fetching
        hasLoaded.current = true;
        setIsLoading(false);

        // Block sync-back during rehydration so it doesn't auto-clear orderId
        isSwitching.current = true;

        // If active tab has no order, clear POS state; otherwise leave for fetch
        const activeServerTab = serverTabs.find((t) => t.tabNumber === activeNumber);
        if (!activeServerTab?.orderId) {
          pos.setOrder(null);
        }

        // Fetch ALL tab orders in parallel — don't block other tabs behind active tab.
        // Display the active tab's order as soon as it resolves.
        const tabsWithOrders = serverTabs.filter((t) => t.orderId !== null);

        if (tabsWithOrders.length > 0) {
          const fetches = tabsWithOrders.map(async (tab) => {
            try {
              const order = await pos.fetchOrder(tab.orderId!);
              if (cancelled) return;
              if (order.status === 'open') {
                orderCache.current.set(tab.orderId!, order);
                // If this is the active tab, display immediately
                if (activeTabRef.current === tab.tabNumber) {
                  pos.setOrder(order);
                }
              } else {
                clearTabOrder(tab);
              }
            } catch {
              if (!cancelled) clearTabOrder(tab);
            }
          });
          await Promise.allSettled(fetches);
        }

        // Unblock sync-back after all fetches have settled
        requestAnimationFrame(() => {
          isSwitching.current = false;
        });
      } catch {
        // If server load fails and no cached data, create a local fallback tab
        if (!cancelled && !cached) {
          setTabs([{ id: 'local-1', tabNumber: 1, orderId: null, employeeId, employeeName }]);
          setActiveTabNumber(1);
          hasLoaded.current = true;
          setIsLoading(false);
        }
      }
    }

    loadTabs();

    return () => {
      cancelled = true;
    };
  }, [terminalId]);

  // ── Actions ────────────────────────────────────────────────────────

  const switchTab = useCallback(
    (tabNumber: TabNumber) => {
      if (tabNumber === activeTabNumber) return;

      // Save current order to cache before switching
      const currentOrder = pos.currentOrder;
      if (currentOrder && currentOrder.id) {
        orderCache.current.set(currentOrder.id, currentOrder);
      }

      isSwitching.current = true;
      setActiveTabNumber(tabNumber);

      // Load the target tab's order from cache
      const targetTab = tabs.find((t) => t.tabNumber === tabNumber);
      if (targetTab?.orderId) {
        const cachedOrder = orderCache.current.get(targetTab.orderId) ?? null;
        pos.setOrder(cachedOrder);

        // If not in cache yet, fetch in background
        if (!cachedOrder) {
          pos.fetchOrder(targetTab.orderId).then((order) => {
            if (order.status === 'open') {
              orderCache.current.set(order.id, order);
              // Only update POS if user is still on this tab
              if (activeTabRef.current === tabNumber) {
                pos.setOrder(order);
              }
            }
          }).catch((err) => { console.error('Tab order fetch failed:', err); });
        }
      } else {
        pos.setOrder(null);
      }

      // Allow sync-back after a tick
      requestAnimationFrame(() => {
        isSwitching.current = false;
      });
    },
    [activeTabNumber, tabs, pos],
  );

  const addTab = useCallback(() => {
    const maxNumber = tabs.reduce((max, t) => Math.max(max, t.tabNumber), 0);
    const newTabNumber = maxNumber + 1;

    // Save current order before switching
    const currentOrder = pos.currentOrder;
    if (currentOrder) {
      orderCache.current.set(currentOrder.id, currentOrder);
    }

    isSwitching.current = true;

    // Optimistic: add a placeholder tab immediately
    const placeholderId = `pending-${newTabNumber}`;
    const optimisticTab: RegisterTab = { id: placeholderId, tabNumber: newTabNumber, orderId: null, employeeId, employeeName };
    setTabs((prev) => [...prev, optimisticTab]);
    setActiveTabNumber(newTabNumber);
    pos.setOrder(null);

    requestAnimationFrame(() => {
      isSwitching.current = false;
    });

    // Sync to server — replace placeholder id with real id
    apiFetch<{ data: ServerTab }>('/api/v1/register-tabs', {
      method: 'POST',
      body: JSON.stringify({ terminalId, tabNumber: newTabNumber, employeeId, employeeName }),
    })
      .then((resp) => {
        const realTab = toRegisterTab(resp.data);
        setTabs((prev) =>
          prev.map((t) => (t.id === placeholderId ? realTab : t)),
        );
      })
      .catch((err) => {
        console.error('Tab creation sync failed:', err);
        toast.error('Tab sync failed — will sync on next load.');
      });
  }, [tabs, pos, terminalId]);

  const closeTab = useCallback(
    (tabNumber: TabNumber) => {
      // Don't close the last tab
      if (tabs.length <= 1) return;

      const closingTab = tabs.find((t) => t.tabNumber === tabNumber);
      if (!closingTab) return;

      setTabs((prev) => {
        const remaining = prev.filter((t) => t.tabNumber !== tabNumber);

        // If we're closing the active tab, switch to nearest neighbor
        if (tabNumber === activeTabNumber) {
          const closedIdx = prev.findIndex((t) => t.tabNumber === tabNumber);
          const nextTab = remaining[Math.min(closedIdx, remaining.length - 1)]!;

          isSwitching.current = true;
          setActiveTabNumber(nextTab.tabNumber);

          if (nextTab.orderId) {
            const cachedOrder = orderCache.current.get(nextTab.orderId) ?? null;
            pos.setOrder(cachedOrder);
          } else {
            pos.setOrder(null);
          }

          requestAnimationFrame(() => {
            isSwitching.current = false;
          });
        }

        return remaining;
      });

      // Delete from server
      if (!closingTab.id.startsWith('pending-')) {
        apiFetch(`/api/v1/register-tabs/${closingTab.id}`, {
          method: 'DELETE',
        }).catch((err) => {
          console.error('Tab close sync failed:', err);
          toast.error('Tab close sync failed — will resolve on next load.');
        });
      }
    },
    [tabs, activeTabNumber, pos],
  );

  const renameTab = useCallback(
    (tabNumber: TabNumber, label: string) => {
      const trimmed = label.trim() || null;

      setTabs((prev) =>
        prev.map((t) =>
          t.tabNumber === tabNumber ? { ...t, label: trimmed } : t,
        ),
      );

      // Sync to server
      const tab = tabs.find((t) => t.tabNumber === tabNumber);
      if (tab && !tab.id.startsWith('pending-')) {
        apiFetch(`/api/v1/register-tabs/${tab.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ label: trimmed }),
        }).catch((err) => {
          console.error('Tab rename sync failed:', err);
          toast.error('Tab rename sync failed — will resolve on next load.');
        });
      }
    },
    [tabs],
  );

  const clearActiveTab = useCallback(() => {
    const currentTab = tabs.find((t) => t.tabNumber === activeTabNumber);

    // Clear orderId AND label — the customer name in the label came from the
    // order's customer, so it must be wiped when the order completes/voids.
    setTabs((prev) =>
      prev.map((t) =>
        t.tabNumber === activeTabNumber ? { ...t, orderId: null, label: null } : t,
      ),
    );

    // Sync to server
    if (currentTab && !currentTab.id.startsWith('pending-')) {
      apiFetch(`/api/v1/register-tabs/${currentTab.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ orderId: null, label: null }),
      }).catch((err) => { console.error('Tab clear sync failed:', err); });
    }
  }, [activeTabNumber, tabs]);

  const changeServer = useCallback(
    (tabNumber: TabNumber, newEmployeeId: string, newEmployeeName: string) => {
      const tab = tabs.find((t) => t.tabNumber === tabNumber);
      if (!tab) return;

      // Optimistic update
      setTabs((prev) =>
        prev.map((t) =>
          t.tabNumber === tabNumber
            ? { ...t, employeeId: newEmployeeId, employeeName: newEmployeeName }
            : t,
        ),
      );

      // Sync to server
      if (!tab.id.startsWith('pending-')) {
        apiFetch(`/api/v1/register-tabs/${tab.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            employeeId: newEmployeeId,
            employeeName: newEmployeeName,
          }),
        }).catch((err) => { console.error('Tab server change sync failed:', err); });
      }
    },
    [tabs],
  );

  return {
    tabs,
    activeTabNumber,
    activeTab,
    switchTab,
    addTab,
    closeTab,
    renameTab,
    clearActiveTab,
    changeServer,
    isLoading,
  };
}
