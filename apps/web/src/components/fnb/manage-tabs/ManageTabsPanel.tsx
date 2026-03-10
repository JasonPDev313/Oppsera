'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Trash2, ArrowRightLeft, CheckSquare, AlertTriangle,
  Filter, SortAsc, ChevronDown, ChevronRight, SquareCheck, Square, MinusSquare,
  Eye, List,
} from 'lucide-react';
import {
  useManageTabs,
  type ManageTabsSortBy,
  type ManageTabsViewMode,
  type ManageTabsGroupBy,
} from '@/hooks/use-manage-tabs';
import { ApiError } from '@/lib/api-client';
import { ManageTabCard } from './ManageTabCard';
import { BulkActionConfirmDialog } from './BulkActionConfirmDialog';
import { TransferTargetPicker } from './TransferTargetPicker';
import { EmergencyCleanupDialog } from './EmergencyCleanupDialog';
import { UndoBanner } from './UndoBanner';

// Maps BulkAction short names to the actionType enum the API schema requires.
// Defined at module level so it isn't recreated on every render.
function mapActionType(action: string): string {
  if (action === 'void') return 'bulk_void';
  if (action === 'close') return 'bulk_close';
  if (action === 'transfer') return 'bulk_transfer';
  return action; // already prefixed (e.g. 'emergency_cleanup')
}

interface ManageTabsPanelProps {
  locationId: string;
  onClose: () => void;
}

// Fix #10: added 'split' and 'abandoned'
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'ordering', label: 'Ordering' },
  { value: 'sent_to_kitchen', label: 'Sent to Kitchen' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'check_requested', label: 'Check Requested' },
  { value: 'paying', label: 'Paying' },
  { value: 'split', label: 'Split' },
  { value: 'abandoned', label: 'Abandoned' },
];

const SORT_OPTIONS: { value: ManageTabsSortBy; label: string }[] = [
  { value: 'oldest', label: 'Oldest First' },
  { value: 'newest', label: 'Newest First' },
  { value: 'highest_balance', label: 'Highest Balance' },
  { value: 'recently_updated', label: 'Recently Updated' },
];

// Fix #11: view mode options
const VIEW_MODE_OPTIONS: { value: ManageTabsViewMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open_only', label: 'Open Only' },
  { value: 'needs_attention', label: 'Needs Attention' },
];

// Fix #12: group by options
const GROUP_BY_OPTIONS: { value: ManageTabsGroupBy | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'server', label: 'Server' },
  { value: 'table', label: 'Table' },
  { value: 'status', label: 'Status' },
  { value: 'age', label: 'Age' },
];

type BulkAction = 'void' | 'transfer' | 'close';

export function ManageTabsPanel({ locationId, onClose }: ManageTabsPanelProps) {
  const mgr = useManageTabs(locationId);

  // Local UI state — search is local-only (instant filter); filters/sort/viewMode/groupBy delegate to mgr
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);

  // Action dialogs
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [_transferTargetName, setTransferTargetName] = useState<string | null>(null);

  // Fix #8/#9: verifiedApprover state — captured from PIN bridge
  const [verifiedApprover, setVerifiedApprover] = useState<{ userId: string; userName: string } | null>(null);

  // Collapsed group sections
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Apply local search on top of hook-managed tabs
  const filteredTabs = useMemo(() => {
    let items = mgr.tabs ?? [];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          String(t.tabNumber).includes(q) ||
          t.guestName?.toLowerCase().includes(q) ||
          t.tableLabel?.toLowerCase().includes(q) || // Fix #1: tableLabel not tableName
          t.serverName?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [mgr.tabs, search]);

  // Fix #3: use mgr.groupedTabs from hook (server-computed groups) instead of local Map
  // Fallback: if no groupBy is active, show flat list wrapped in a single group
  const displayGroups = useMemo(() => {
    if (mgr.groupedTabs) return mgr.groupedTabs;
    // No grouping — single virtual group
    return [{ key: '__all__', label: '', tabs: filteredTabs }];
  }, [mgr.groupedTabs, filteredTabs]);

  // Flat list of IDs actually rendered on screen (respects groupBy + local search).
  // Used to scope select-all and invert operations to visible tabs only.
  const allDisplayedTabIds = useMemo(
    () => displayGroups.flatMap((g) => g.tabs.map((t) => t.id)),
    [displayGroups],
  );

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  // Fix: delegate status filter changes to mgr.setFilters
  function toggleStatus(s: string) {
    const current = new Set(mgr.filters.statuses ?? []);
    if (current.has(s)) { current.delete(s); } else { current.add(s); }
    const statuses = Array.from(current);
    mgr.setFilters({ ...mgr.filters, statuses: statuses.length > 0 ? statuses : undefined });
  }

  function clearStatusFilters() {
    mgr.setFilters({ ...mgr.filters, statuses: undefined });
  }

  // Fix: delegate sort to mgr.setFilters
  function handleSortChange(val: ManageTabsSortBy) {
    setShowSort(false);
    mgr.setFilters({ ...mgr.filters, sortBy: val });
  }

  // Fix #11: view mode change
  function handleViewModeChange(val: ManageTabsViewMode) {
    mgr.setFilters({ ...mgr.filters, viewMode: val });
  }

  // Fix #12: group by change
  function handleGroupByChange(val: ManageTabsGroupBy | 'none') {
    setShowGroupBy(false);
    mgr.setFilters({ ...mgr.filters, groupBy: val === 'none' ? undefined : val });
  }

  // Fix #8: PIN bridge — captures approver info into state, returns boolean for dialog.
  // Re-throws rate-limit ApiErrors so the dialog can show a distinct "Too many attempts"
  // message instead of the generic "Invalid PIN".
  async function pinBridge(pin: string, actionType: string): Promise<boolean> {
    try {
      const result = await mgr.verifyPin(pin, mapActionType(actionType));
      if (result.verified) {
        setVerifiedApprover({ userId: result.userId, userName: result.userName });
        return true;
      }
      return false;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.code === 'RATE_LIMITED')) {
        throw err; // propagate so BulkActionConfirmDialog can show the right message
      }
      return false; // wrong PIN or transient error — caller shows generic message
    }
  }

  // Fix #6/#9: bulk action execution with object params + approverUserId from PIN state
  async function handleBulkExecute(reasonCode: string, reasonText?: string) {
    const clientRequestId = crypto.randomUUID();
    const approverUserId = verifiedApprover?.userId ?? '';
    if (bulkAction === 'void') {
      return mgr.bulkVoid({ reasonCode, reasonText, approverUserId, clientRequestId });
    } else if (bulkAction === 'close') {
      return mgr.bulkClose({ reasonCode, reasonText, approverUserId, clientRequestId });
    }
    return { succeeded: [], failed: [] };
  }

  async function handleTransferSelect(serverId: string, serverName: string) {
    setTransferTargetId(serverId);
    setTransferTargetName(serverName);
    setShowTransfer(false);
    setVerifiedApprover(null); // Clear stale approver from previous action
    setBulkAction('transfer');
  }

  // Fix #7: bulkTransfer with object params
  async function handleTransferExecute(reasonCode: string, reasonText?: string) {
    if (!transferTargetId) return { succeeded: [], failed: [] };
    const clientRequestId = crypto.randomUUID();
    const approverUserId = verifiedApprover?.userId ?? '';
    return mgr.bulkTransfer({ toServerUserId: transferTargetId, reasonCode, reasonText, approverUserId, clientRequestId });
  }

  const selCount = mgr.selectionSummary.count;
  const selBalance = mgr.selectionSummary.totalBalance;
  const activeStatuses = new Set(mgr.filters.statuses ?? []);
  const currentSortBy = mgr.filters.sortBy ?? 'oldest';
  const currentViewMode = mgr.filters.viewMode ?? 'all';
  const currentGroupBy = mgr.filters.groupBy;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative ml-auto w-full max-w-[960px] h-full flex flex-col shadow-2xl"
        style={{ background: 'var(--fnb-bg-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--fnb-border-subtle)' }}
        >
          <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Manage Tabs</h1>
          <button onClick={onClose} className="p-1.5 rounded-md" style={{ color: 'var(--fnb-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body: 3-pane */}
        <div className="flex flex-1 min-h-0">
          {/* Left Pane: Filters */}
          <div
            className="w-[220px] shrink-0 flex flex-col gap-3 p-4 overflow-y-auto"
            style={{ borderRight: '1px solid var(--fnb-border-subtle)' }}
          >
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'var(--fnb-text-muted)' }} />
              <input
                type="text"
                placeholder="Search tabs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-md text-sm outline-none"
                style={{
                  background: 'var(--fnb-bg-surface)',
                  color: 'var(--fnb-text-primary)',
                  border: '1px solid var(--fnb-border-subtle)',
                }}
              />
            </div>

            {/* Fix #11: View mode selector */}
            <div>
              <div className="flex items-center gap-2 text-xs font-medium mb-2" style={{ color: 'var(--fnb-text-secondary)' }}>
                <Eye size={12} />
                View
              </div>
              <div className="flex flex-col gap-1">
                {VIEW_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleViewModeChange(opt.value)}
                    className="text-left text-xs py-1 px-2 rounded"
                    style={{
                      color: currentViewMode === opt.value ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-primary)',
                      background: currentViewMode === opt.value ? 'var(--fnb-accent-primary-muted)' : 'transparent',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-xs font-medium mb-2"
                style={{ color: 'var(--fnb-text-secondary)' }}
              >
                <Filter size={12} />
                Status Filter
                {activeStatuses.size > 0 && (
                  <span
                    className="px-1.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--fnb-accent-primary)', color: '#fff' }}
                  >
                    {activeStatuses.size}
                  </span>
                )}
              </button>
              {showFilters && (
                <div className="flex flex-col gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
                      <input
                        type="checkbox"
                        checked={activeStatuses.has(opt.value)}
                        onChange={() => toggleStatus(opt.value)}
                        className="w-3.5 h-3.5 rounded accent-indigo-500"
                      />
                      <span style={{ color: 'var(--fnb-text-primary)' }}>{opt.label}</span>
                    </label>
                  ))}
                  {activeStatuses.size > 0 && (
                    <button
                      onClick={clearStatusFilters}
                      className="text-[10px] mt-1"
                      style={{ color: 'var(--fnb-accent-primary)' }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <div>
              <button
                onClick={() => setShowSort(!showSort)}
                className="flex items-center gap-2 text-xs font-medium mb-2"
                style={{ color: 'var(--fnb-text-secondary)' }}
              >
                <SortAsc size={12} />
                Sort
                <ChevronDown size={10} />
              </button>
              {showSort && (
                <div className="flex flex-col gap-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSortChange(opt.value)}
                      className="text-left text-xs py-1 px-2 rounded"
                      style={{
                        color: currentSortBy === opt.value ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-primary)',
                        background: currentSortBy === opt.value ? 'var(--fnb-accent-primary-muted)' : 'transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fix #12: Group By selector */}
            <div>
              <button
                onClick={() => setShowGroupBy(!showGroupBy)}
                className="flex items-center gap-2 text-xs font-medium mb-2"
                style={{ color: 'var(--fnb-text-secondary)' }}
              >
                <List size={12} />
                Group By
                <ChevronDown size={10} />
              </button>
              {showGroupBy && (
                <div className="flex flex-col gap-1">
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleGroupByChange(opt.value)}
                      className="text-left text-xs py-1 px-2 rounded"
                      style={{
                        color: (currentGroupBy ?? 'none') === opt.value ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-primary)',
                        background: (currentGroupBy ?? 'none') === opt.value ? 'var(--fnb-accent-primary-muted)' : 'transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fix #14: Stats derived from mgr.groupedTabs or mgr.tabs */}
            <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--fnb-border-subtle)' }}>
              <div className="text-xs space-y-1" style={{ color: 'var(--fnb-text-muted)' }}>
                <div>Total: {mgr.tabs.length} tab{mgr.tabs.length !== 1 ? 's' : ''}</div>
                {mgr.groupedTabs && (
                  <div>Groups: {mgr.groupedTabs.length}</div>
                )}
                <div>
                  Servers: {new Set(mgr.tabs.map((t) => t.serverUserId).filter(Boolean)).size}
                </div>
              </div>
            </div>
          </div>

          {/* Center Pane: Tab list */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Selection bar */}
            <div
              className="flex items-center gap-3 px-4 py-2 shrink-0"
              style={{ borderBottom: '1px solid var(--fnb-border-subtle)' }}
            >
              <button
                onClick={() => {
                  if (selCount === allDisplayedTabIds.length && selCount > 0) mgr.clearSelection();
                  else mgr.selectByIds(allDisplayedTabIds);
                }}
                className="p-0.5"
                style={{ color: 'var(--fnb-text-secondary)' }}
                title={selCount === allDisplayedTabIds.length ? 'Deselect all' : 'Select all'}
              >
                {selCount === 0 ? (
                  <Square size={18} />
                ) : selCount === allDisplayedTabIds.length ? (
                  <SquareCheck size={18} style={{ color: 'var(--fnb-accent-primary)' }} />
                ) : (
                  <MinusSquare size={18} style={{ color: 'var(--fnb-accent-primary)' }} />
                )}
              </button>

              {selCount > 0 ? (
                <span className="text-xs font-medium" style={{ color: 'var(--fnb-accent-primary)' }}>
                  {selCount} selected
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                  {allDisplayedTabIds.length} tab{allDisplayedTabIds.length !== 1 ? 's' : ''}
                </span>
              )}

              {selCount > 0 && (
                <>
                  <button
                    onClick={() => mgr.invertSelection(allDisplayedTabIds)}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: 'var(--fnb-text-secondary)', border: '1px solid var(--fnb-border-subtle)' }}
                  >
                    Invert
                  </button>
                  <button
                    onClick={mgr.clearSelection}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: 'var(--fnb-text-secondary)', border: '1px solid var(--fnb-border-subtle)' }}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>

            {/* Tab list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {mgr.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>Loading tabs...</p>
                </div>
              ) : mgr.error ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <AlertTriangle size={24} style={{ color: 'var(--fnb-status-dirty)' }} />
                  <p className="text-sm" style={{ color: 'var(--fnb-status-dirty)' }}>{mgr.error}</p>
                  <button
                    onClick={() => mgr.refreshTabs()}
                    className="text-xs px-3 py-1.5 rounded-md"
                    style={{ background: 'var(--fnb-bg-surface)', color: 'var(--fnb-text-primary)', border: '1px solid var(--fnb-border-subtle)' }}
                  >
                    Retry
                  </button>
                </div>
              ) : filteredTabs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No tabs found</p>
                </div>
              ) : (
                displayGroups.map((group) => (
                  <div key={group.key}>
                    {/* Only show group header when grouping is active */}
                    {group.label && (
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="flex items-center gap-2 mb-2 w-full text-left"
                      >
                        {collapsedGroups.has(group.key) ? (
                          <ChevronRight size={14} style={{ color: 'var(--fnb-text-muted)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: 'var(--fnb-text-muted)' }} />
                        )}
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fnb-text-secondary)' }}>
                          {group.label}
                        </span>
                        <span
                          className="text-[10px] px-1.5 rounded-full"
                          style={{ background: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
                        >
                          {group.tabs.length}
                        </span>
                      </button>
                    )}
                    {!collapsedGroups.has(group.key) && (
                      <div className="space-y-2">
                        {group.tabs.map((tab) => (
                          <ManageTabCard
                            key={tab.id}
                            tab={tab}
                            selected={mgr.selectedIds.has(tab.id)}
                            onToggle={mgr.toggleSelect}
                            isStale={mgr.staleIds.has(tab.id)} // Fix #13
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Pane: Actions */}
          <div
            className="w-[260px] shrink-0 flex flex-col gap-4 p-4"
            style={{ borderLeft: '1px solid var(--fnb-border-subtle)' }}
          >
            {/* Selection summary */}
            <div className="rounded-lg p-3" style={{ background: 'var(--fnb-bg-surface)' }}>
              <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--fnb-text-secondary)' }}>
                Selection
              </h3>
              <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--fnb-text-primary)' }}>
                {selCount}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                tab{selCount !== 1 ? 's' : ''} selected
              </div>
              {selCount > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--fnb-border-subtle)' }}>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--fnb-text-muted)' }}>Total balance</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--fnb-text-primary)' }}>
                      {formatMoney(selBalance)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span style={{ color: 'var(--fnb-text-muted)' }}>Servers</span>
                    <span style={{ color: 'var(--fnb-text-primary)' }}>{mgr.selectionSummary.serverCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setVerifiedApprover(null); setBulkAction('void'); }}
                disabled={selCount === 0 || mgr.isMutating}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: selCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--fnb-bg-elevated)',
                  color: selCount > 0 ? 'var(--fnb-status-dirty)' : 'var(--fnb-text-muted)',
                  opacity: mgr.isMutating ? 0.5 : 1,
                }}
              >
                <Trash2 size={16} />
                Void Selected
              </button>

              <button
                onClick={() => setShowTransfer(true)}
                disabled={selCount === 0 || mgr.isMutating}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: selCount > 0 ? 'var(--fnb-accent-primary-muted)' : 'var(--fnb-bg-elevated)',
                  color: selCount > 0 ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-muted)',
                  opacity: mgr.isMutating ? 0.5 : 1,
                }}
              >
                <ArrowRightLeft size={16} />
                Transfer Selected
              </button>

              <button
                onClick={() => { setVerifiedApprover(null); setBulkAction('close'); }}
                disabled={selCount === 0 || mgr.isMutating}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: selCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--fnb-bg-elevated)',
                  color: selCount > 0 ? '#f59e0b' : 'var(--fnb-text-muted)',
                  opacity: mgr.isMutating ? 0.5 : 1,
                }}
              >
                <CheckSquare size={16} />
                Close Selected
              </button>
            </div>

            {/* Emergency */}
            <div className="mt-auto">
              <button
                onClick={() => setShowEmergency(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--fnb-status-dirty)',
                  border: '1px solid var(--fnb-status-dirty)',
                }}
              >
                <AlertTriangle size={16} />
                Emergency Cleanup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {bulkAction && bulkAction !== 'transfer' && (
        <BulkActionConfirmDialog
          open={true}
          onClose={() => {
            setBulkAction(null);
            setVerifiedApprover(null);
            mgr.refreshTabs();
            mgr.clearSelection();
          }}
          actionType={bulkAction}
          selectedCount={selCount}
          totalBalance={selBalance}
          requirePin={
            (bulkAction === 'void' || bulkAction === 'close')
              ? mgr.settings?.requirePinForVoid !== false
              : false
          }
          onVerifyPin={(pin: string) => pinBridge(pin, bulkAction ?? 'void')}
          onExecute={handleBulkExecute}
        />
      )}

      {bulkAction === 'transfer' && (
        <BulkActionConfirmDialog
          open={true}
          onClose={() => {
            setBulkAction(null);
            setTransferTargetId(null);
            setTransferTargetName(null);
            setVerifiedApprover(null);
            mgr.refreshTabs();
            mgr.clearSelection();
          }}
          actionType="transfer"
          selectedCount={selCount}
          totalBalance={selBalance}
          requirePin={mgr.settings?.requirePinForTransfer === true}
          onVerifyPin={(pin: string) => pinBridge(pin, 'transfer')}
          onExecute={handleTransferExecute}
        />
      )}

      {showTransfer && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTransfer(false)} />
          <div
            className="relative w-full max-w-sm rounded-xl shadow-2xl p-5"
            style={{ background: 'var(--fnb-bg-surface)' }}
          >
            <TransferTargetPicker
              locationId={locationId}
              onSelect={handleTransferSelect}
              onCancel={() => setShowTransfer(false)}
            />
          </div>
        </div>
      )}

      {/* Fix #15: EmergencyCleanupDialog — no approverUserId prop, handles PIN inline */}
      <EmergencyCleanupDialog
        open={showEmergency}
        onClose={() => {
          setShowEmergency(false);
          mgr.refreshTabs();
        }}
        onExecute={mgr.runEmergencyCleanup}
        locationId={locationId}
        verifyPin={mgr.verifyPin}
      />

      {/* Fix #2: Use mgr.undoSnapshot / mgr.dismissUndo instead of local undoBanner state */}
      {mgr.undoSnapshot && (
        <UndoBanner
          message={getUndoMessage(mgr.undoSnapshot)}
          durationMs={30_000}
          onUndo={async () => {
            // Undo not implemented in V1
          }}
          onDismiss={mgr.dismissUndo}
        />
      )}
    </div>,
    document.body,
  );
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getUndoMessage(snapshot: { action: string; tabIds: string[]; result: unknown }): string {
  const count = snapshot.tabIds.length;
  switch (snapshot.action) {
    case 'bulk_void': return `Voided ${count} tab${count !== 1 ? 's' : ''}`;
    case 'bulk_transfer': return `Transferred ${count} tab${count !== 1 ? 's' : ''}`;
    case 'bulk_close': return `Closed ${count} tab${count !== 1 ? 's' : ''}`;
    case 'emergency_cleanup': return 'Emergency cleanup completed';
    default: return 'Action completed';
  }
}
