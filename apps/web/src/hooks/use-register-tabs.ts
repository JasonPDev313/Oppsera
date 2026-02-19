'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
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
        // Sync to server
        apiFetch(`/api/v1/register-tabs/${currentActiveTab.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderId: order.id }),
        }).catch(() => {});
      }
    } else if (currentActiveTab.orderId) {
      // Order was cleared (payment complete, void, etc.)
      setTabs((prev) =>
        prev.map((t) =>
          t.tabNumber === activeTabNumber ? { ...t, orderId: null } : t,
        ),
      );
      // Sync to server
      apiFetch(`/api/v1/register-tabs/${currentActiveTab.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ orderId: null }),
      }).catch(() => {});
    }
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
      pos.setOrder(null);

      // Load active tab's order from cache or fetch it
      const activeOrderTab = cached.find((t) => t.tabNumber === activeNumber && t.orderId);
      if (activeOrderTab?.orderId) {
        pos.fetchOrder(activeOrderTab.orderId).then((order) => {
          if (!cancelled && order.status === 'open') {
            orderCache.current.set(activeOrderTab.orderId!, order);
            if (activeTabRef.current === activeNumber) {
              pos.setOrder(order);
            }
          }
        }).catch(() => {});
      }
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
        }).catch(() => {});
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
        pos.setOrder(null);

        // Fetch orders in background — active tab first for fastest UX
        const tabsWithOrders = serverTabs.filter((t) => t.orderId !== null);

        if (tabsWithOrders.length > 0) {
          // Prioritize active tab's order
          const activeOrderTab = tabsWithOrders.find((t) => t.tabNumber === activeNumber);
          if (activeOrderTab) {
            try {
              const order = await pos.fetchOrder(activeOrderTab.orderId!);
              if (!cancelled && order.status === 'open') {
                orderCache.current.set(activeOrderTab.orderId!, order);
                pos.setOrder(order);
              } else if (!cancelled) {
                clearTabOrder(activeOrderTab);
              }
            } catch {
              if (!cancelled) clearTabOrder(activeOrderTab);
            }
          }

          // Fetch remaining tabs' orders in parallel (fire-and-forget)
          const otherTabs = tabsWithOrders.filter((t) => t.tabNumber !== activeNumber);
          if (otherTabs.length > 0 && !cancelled) {
            Promise.allSettled(otherTabs.map((t) => pos.fetchOrder(t.orderId!)))
              .then((results) => {
                if (cancelled) return;
                results.forEach((result, idx) => {
                  const tab = otherTabs[idx]!;
                  if (result.status === 'fulfilled' && result.value.status === 'open') {
                    orderCache.current.set(tab.orderId!, result.value);
                  } else {
                    clearTabOrder(tab);
                  }
                });
              });
          }
        }
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
          }).catch(() => {});
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
      .catch(() => {
        // Keep tab locally — it will sync on next page load
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
        }).catch(() => {});
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
        }).catch(() => {});
      }
    },
    [tabs],
  );

  const clearActiveTab = useCallback(() => {
    const currentTab = tabs.find((t) => t.tabNumber === activeTabNumber);

    setTabs((prev) =>
      prev.map((t) =>
        t.tabNumber === activeTabNumber ? { ...t, orderId: null } : t,
      ),
    );

    // Sync to server
    if (currentTab && !currentTab.id.startsWith('pending-')) {
      apiFetch(`/api/v1/register-tabs/${currentTab.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ orderId: null }),
      }).catch(() => {});
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
        }).catch(() => {});
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
