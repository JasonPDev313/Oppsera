'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  UserPlus,
  UserMinus,
  Search,
  Loader2,
  Archive,
  UserCog,
  Eye,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  type CachedCustomer,
  filterCustomersLocal,
  searchCustomersServer,
  cancelServerSearch,
  isCacheComplete,
} from '@/lib/customer-cache';
import type { RegisterTab, TabNumber } from '@/types/pos';

// ── Props ────────────────────────────────────────────────────────────

interface RegisterTabsProps {
  tabs: RegisterTab[];
  activeTabNumber: TabNumber;
  onSwitchTab: (tabNumber: TabNumber) => void;
  onAddTab: () => void;
  onCloseTab: (tabNumber: TabNumber) => void;
  onRenameTab: (tabNumber: TabNumber, label: string) => void;
  /** Map of orderId → orderNumber for display */
  orderLabels?: Map<string, string>;
  /** Current order's customerId (for showing detach option) */
  customerId?: string | null;
  customerName?: string | null;
  onAttachCustomer?: (customerId: string, customerName?: string) => void;
  onDetachCustomer?: () => void;
  onSaveTab?: (tabNumber: TabNumber) => void;
  onChangeServer?: (tabNumber: TabNumber, employeeId: string, employeeName: string) => void;
  onViewProfile?: (customerId: string) => void;
  onAddNewCustomer?: () => void;
}

export function RegisterTabs({
  tabs,
  activeTabNumber,
  onSwitchTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
  orderLabels,
  customerId,
  customerName,
  onAttachCustomer,
  onDetachCustomer,
  onSaveTab,
  onChangeServer,
  onViewProfile,
  onAddNewCustomer,
}: RegisterTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabNumber: TabNumber;
  } | null>(null);

  // Rename popover state
  const [renaming, setRenaming] = useState<{
    tabNumber: TabNumber;
    x: number;
    y: number;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Customer search popover state
  const [customerSearch, setCustomerSearch] = useState<{
    tabNumber: TabNumber;
    x: number;
    y: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CachedCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server search popover state
  const [serverSearch, setServerSearch] = useState<{
    tabNumber: TabNumber;
    x: number;
    y: number;
  } | null>(null);
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [serverSearchResults, setServerSearchResults] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [isServerSearching, setIsServerSearching] = useState(false);
  const serverSearchInputRef = useRef<HTMLInputElement>(null);
  const serverSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scroll overflow detection ──────────────────────────────────────

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, tabs.length]);

  // Auto-scroll to the active tab when it changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector(
      `[data-tab="${activeTabNumber}"]`,
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeTabNumber]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === 'left' ? -200 : 200,
      behavior: 'smooth',
    });
  }, []);

  // ── Context menu ───────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabNumber: TabNumber) => {
      e.preventDefault();
      e.stopPropagation();
      // Auto-switch to the right-clicked tab so the order (and customerId) loads
      if (tabNumber !== activeTabNumber) {
        onSwitchTab(tabNumber);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, tabNumber });
    },
    [activeTabNumber, onSwitchTab],
  );

  // Close context menu on outside click / scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  // ── Rename popover ─────────────────────────────────────────────────

  const openRename = useCallback(
    (tabNumber: TabNumber, x: number, y: number) => {
      const tab = tabs.find((t) => t.tabNumber === tabNumber);
      setRenameValue(tab?.label ?? '');
      setRenaming({ tabNumber, x, y });
      setContextMenu(null);
    },
    [tabs],
  );

  useEffect(() => {
    if (renaming) {
      // Focus after portal renders
      requestAnimationFrame(() => renameInputRef.current?.focus());
    }
  }, [renaming]);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    onRenameTab(renaming.tabNumber, renameValue);
    setRenaming(null);
    setRenameValue('');
  }, [renaming, renameValue, onRenameTab]);

  // Close rename on outside click
  useEffect(() => {
    if (!renaming) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-rename-popover]')) return;
      commitRename();
    };
    window.addEventListener('mousedown', handleDown);
    return () => window.removeEventListener('mousedown', handleDown);
  }, [renaming, commitRename]);

  // ── Customer search popover ────────────────────────────────────────

  const openCustomerSearch = useCallback(
    (tabNumber: TabNumber, x: number, y: number) => {
      // First switch to the tab if not already active
      if (tabNumber !== activeTabNumber) {
        onSwitchTab(tabNumber);
      }
      setSearchQuery('');
      setSearchResults([]);
      setCustomerSearch({ tabNumber, x, y });
      setContextMenu(null);
    },
    [activeTabNumber, onSwitchTab],
  );

  useEffect(() => {
    if (customerSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [customerSearch]);

  // Customer search — instant local filter, debounced server fallback
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    // Instant: filter from shared cache
    const localHits = filterCustomersLocal(trimmed);
    setSearchResults(localHits);

    // If cache covers all customers or we have enough local hits, skip server call
    if (isCacheComplete() || localHits.length >= 5) return;

    // Debounced server fallback for large customer bases
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const serverHits = await searchCustomersServer(trimmed);
        const localIds = new Set(localHits.map((c) => c.id));
        const extra = serverHits.filter((c) => !localIds.has(c.id));
        setSearchResults([...localHits, ...extra].slice(0, 10));
      } catch {
        // Keep local results
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Cleanup server search on unmount
  useEffect(() => () => cancelServerSearch(), []);

  // Close customer search on outside click
  useEffect(() => {
    if (!customerSearch) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-customer-search]')) return;
      setCustomerSearch(null);
    };
    window.addEventListener('mousedown', handleDown);
    return () => window.removeEventListener('mousedown', handleDown);
  }, [customerSearch]);

  const handleSelectCustomer = useCallback(
    (customer: CachedCustomer) => {
      if (!customerSearch) return;
      onAttachCustomer?.(customer.id, customer.displayName);

      // Auto-rename tab to "FirstName LastInitial" (e.g. "Jason P")
      const parts = customer.displayName.trim().split(/\s+/);
      const shortName =
        parts.length >= 2
          ? `${parts[0]} ${(parts[parts.length - 1] ?? '').charAt(0).toUpperCase()}`
          : parts[0] ?? '';
      onRenameTab(customerSearch.tabNumber, shortName);

      setCustomerSearch(null);
      setSearchQuery('');
      setSearchResults([]);
    },
    [onAttachCustomer, onRenameTab, customerSearch],
  );

  const handleDetachCustomer = useCallback(() => {
    onDetachCustomer?.();
    setContextMenu(null);
  }, [onDetachCustomer]);

  // ── Server search popover ──────────────────────────────────────────

  const openServerSearch = useCallback(
    (tabNumber: TabNumber, x: number, y: number) => {
      setContextMenu(null);
      setServerSearchQuery('');
      setServerSearchResults([]);
      setServerSearch({ tabNumber, x, y });
      // Pre-load all team members
      apiFetch<{ data: Array<{ id: string; name: string; email: string }> }>(
        '/api/v1/team-members',
      ).then((res) => setServerSearchResults(res.data))
       .catch(() => {});
    },
    [],
  );

  const handleSelectServer = useCallback(
    (member: { id: string; name: string; email: string }) => {
      if (!serverSearch || !onChangeServer) return;
      onChangeServer(serverSearch.tabNumber, member.id, member.name);
      setServerSearch(null);
      setServerSearchQuery('');
      setServerSearchResults([]);
    },
    [onChangeServer, serverSearch],
  );

  // Debounced server search
  useEffect(() => {
    if (serverSearchDebounceRef.current) clearTimeout(serverSearchDebounceRef.current);
    if (!serverSearch) return;
    const trimmed = serverSearchQuery.trim();
    if (trimmed.length < 1) {
      // Re-load all members when search is cleared
      apiFetch<{ data: Array<{ id: string; name: string; email: string }> }>(
        '/api/v1/team-members',
      ).then((res) => setServerSearchResults(res.data))
       .catch(() => {});
      return;
    }
    setIsServerSearching(true);
    serverSearchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: Array<{ id: string; name: string; email: string }> }>(
          `/api/v1/team-members?search=${encodeURIComponent(trimmed)}`,
        );
        setServerSearchResults(res.data);
      } catch {
        setServerSearchResults([]);
      } finally {
        setIsServerSearching(false);
      }
    }, 250);
    return () => {
      if (serverSearchDebounceRef.current) clearTimeout(serverSearchDebounceRef.current);
    };
  }, [serverSearchQuery, serverSearch]);

  // Close server search on outside click
  useEffect(() => {
    if (!serverSearch) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-server-search]')) return;
      setServerSearch(null);
      setServerSearchQuery('');
    };
    window.addEventListener('mousedown', handleDown);
    return () => window.removeEventListener('mousedown', handleDown);
  }, [serverSearch]);

  // Auto-focus server search input
  useEffect(() => {
    if (serverSearch && serverSearchInputRef.current) {
      requestAnimationFrame(() => serverSearchInputRef.current?.focus());
    }
  }, [serverSearch]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex shrink-0 items-center border-b border-border bg-muted">
        {/* Left scroll arrow */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="flex shrink-0 items-center justify-center px-1 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Scrollable tab container */}
        <div
          ref={scrollRef}
          className="flex flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 scrollbar-none"
        >
          {tabs.map((tab) => {
            const isActive = tab.tabNumber === activeTabNumber;
            const hasOrder = tab.orderId !== null;
            const label =
              tab.label ??
              (tab.orderId && orderLabels?.get(tab.orderId)) ??
              `Tab ${tab.tabNumber}`;

            return (
              <button
                key={tab.tabNumber}
                type="button"
                data-tab={tab.tabNumber}
                onClick={() => onSwitchTab(tab.tabNumber)}
                onContextMenu={(e) => handleContextMenu(e, tab.tabNumber)}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : hasOrder
                      ? 'bg-surface border border-border text-foreground hover:border-indigo-500/30 hover:bg-indigo-500/10'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {/* Occupied dot indicator (non-active tabs with orders) */}
                {!isActive && hasOrder && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                )}

                <span className="whitespace-nowrap">{label}</span>

                {tab.employeeName && (
                  <span className={`ml-1 text-[10px] ${isActive ? 'text-indigo-200' : 'text-muted-foreground'}`}>
                    ({tab.employeeName.split(' ')[0]})
                  </span>
                )}

                {/* Close button (hidden when only 1 tab) */}
                {tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.tabNumber);
                    }}
                    className={`ml-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                      isActive
                        ? 'hover:bg-indigo-500 text-indigo-200 hover:text-white'
                        : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={`Close ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}

          {/* Add tab button */}
          <button
            type="button"
            onClick={onAddTab}
            className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Add new tab"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Right scroll arrow */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="flex shrink-0 items-center justify-center px-1 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            aria-label="Scroll tabs right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Context Menu ─────────────────────────────────────────────── */}
      {contextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Rename */}
            <button
              type="button"
              onClick={() =>
                openRename(contextMenu.tabNumber, contextMenu.x, contextMenu.y)
              }
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
              Rename Tab
            </button>

            {/* Attach / Detach Customer */}
            {customerId ? (
              <button
                type="button"
                onClick={handleDetachCustomer}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <UserMinus className="h-4 w-4 text-muted-foreground" />
                Detach Customer
                {customerName && (
                  <span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">
                    {customerName}
                  </span>
                )}
              </button>
            ) : onAttachCustomer ? (
              <button
                type="button"
                onClick={() =>
                  openCustomerSearch(
                    contextMenu.tabNumber,
                    contextMenu.x,
                    contextMenu.y,
                  )
                }
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                Attach Customer
              </button>
            ) : null}

            {/* View Profile */}
            {customerId && onViewProfile && (
              <button
                type="button"
                onClick={() => {
                  onViewProfile(customerId);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
                View Profile
              </button>
            )}

            {/* Add New Customer */}
            {onAddNewCustomer && (
              <button
                type="button"
                onClick={() => {
                  onAddNewCustomer();
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                Add New Customer
              </button>
            )}

            {/* Change Server */}
            {onChangeServer && (
              <button
                type="button"
                onClick={() =>
                  openServerSearch(
                    contextMenu.tabNumber,
                    contextMenu.x,
                    contextMenu.y,
                  )
                }
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <UserCog className="h-4 w-4 text-muted-foreground" />
                Change Server
              </button>
            )}

            {/* Save Tab */}
            {onSaveTab && (() => {
              const tab = tabs.find((t) => t.tabNumber === contextMenu.tabNumber);
              return tab?.orderId ? (
                <button
                  type="button"
                  onClick={() => {
                    onSaveTab(contextMenu.tabNumber);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                  Save Tab
                </button>
              ) : null;
            })()}

            {/* Close tab (if more than 1) */}
            {tabs.length > 1 && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    onCloseTab(contextMenu.tabNumber);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <X className="h-4 w-4 text-red-400" />
                  Close Tab
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

      {/* ── Rename Popover ───────────────────────────────────────────── */}
      {renaming &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-rename-popover
            className="fixed z-50 w-64 rounded-lg border border-border bg-surface p-3 shadow-xl"
            style={{ left: renaming.x, top: renaming.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Rename Tab {renaming.tabNumber}
            </p>
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setRenaming(null);
                  setRenameValue('');
                }
              }}
              placeholder="e.g., White Hat, Table 5..."
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenaming(null);
                  setRenameValue('');
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitRename}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Customer Search Popover ───────────────────────────────────── */}
      {customerSearch &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-customer-search
            className="fixed z-50 w-80 rounded-lg border border-border bg-surface shadow-xl"
            style={{ left: customerSearch.x, top: customerSearch.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Attach Customer
              </p>
            </div>
            <div className="relative px-3 py-2">
              <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setCustomerSearch(null);
                    setSearchQuery('');
                  }
                }}
                placeholder="Search by name, phone, or email..."
                className="w-full rounded-md border border-border py-2 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {isSearching && (
                <Loader2 className="absolute right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Results */}
            <div className="max-h-48 overflow-y-auto">
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No customers found
                </div>
              ) : (
                searchResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleSelectCustomer(customer)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {customer.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {customer.displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[customer.email, customer.phone]
                          .filter(Boolean)
                          .join(' \u00B7 ') || customer.type}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setCustomerSearch(null);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Server search popover ─────────────────── */}
      {serverSearch &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-server-search
            className="fixed z-50 w-80 rounded-lg border border-border bg-surface shadow-xl"
            style={{ left: serverSearch.x, top: serverSearch.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Change Server
              </p>
            </div>
            <div className="relative px-3 py-2">
              <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={serverSearchInputRef}
                type="text"
                value={serverSearchQuery}
                onChange={(e) => setServerSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setServerSearch(null);
                    setServerSearchQuery('');
                  }
                }}
                placeholder="Search by name or email..."
                className="w-full rounded-md border border-border py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {isServerSearching && (
                <Loader2 className="absolute right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {serverSearchResults.length === 0 && !isServerSearching ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {serverSearchQuery.trim().length >= 1 ? 'No team members found' : 'Loading...'}
                </div>
              ) : (
                serverSearchResults.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleSelectServer(member)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-500">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setServerSearch(null);
                  setServerSearchQuery('');
                  setServerSearchResults([]);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
