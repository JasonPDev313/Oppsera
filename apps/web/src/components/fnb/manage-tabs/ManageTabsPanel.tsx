'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Trash2, ArrowRightLeft, CheckSquare, AlertTriangle,
  Filter, SortAsc, ChevronDown, ChevronRight, SquareCheck, Square, MinusSquare,
} from 'lucide-react';
import { useManageTabs } from '@/hooks/use-manage-tabs';
import { ManageTabCard } from './ManageTabCard';
import { BulkActionConfirmDialog } from './BulkActionConfirmDialog';
import { TransferTargetPicker } from './TransferTargetPicker';
import { EmergencyCleanupDialog } from './EmergencyCleanupDialog';
import { UndoBanner } from './UndoBanner';

interface ManageTabsPanelProps {
  locationId: string;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'ordering', label: 'Ordering' },
  { value: 'sent_to_kitchen', label: 'Sent to Kitchen' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'check_requested', label: 'Check Requested' },
  { value: 'paying', label: 'Paying' },
];

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest First' },
  { value: 'newest', label: 'Newest First' },
  { value: 'highest_balance', label: 'Highest Balance' },
  { value: 'recently_updated', label: 'Recently Updated' },
];

type BulkAction = 'void' | 'transfer' | 'close';

export function ManageTabsPanel({ locationId, onClose }: ManageTabsPanelProps) {
  const mgr = useManageTabs(locationId);

  // Local UI state
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState('oldest');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);

  // Action dialogs
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferTargetName, setTransferTargetName] = useState<string | null>(null);

  // Undo
  const [undoBanner, setUndoBanner] = useState<{ message: string; tabIds: string[] } | null>(null);

  // Apply local filters/search
  const filteredTabs = useMemo(() => {
    let items = mgr.tabs ?? [];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          String(t.tabNumber).includes(q) ||
          t.guestName?.toLowerCase().includes(q) ||
          t.tableName?.toLowerCase().includes(q) ||
          t.serverName?.toLowerCase().includes(q),
      );
    }
    if (statusFilters.size > 0) {
      items = items.filter((t) => statusFilters.has(t.status));
    }
    return items;
  }, [mgr.tabs, search, statusFilters]);

  // Group by server
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredTabs>();
    for (const tab of filteredTabs) {
      const key = tab.serverName ?? 'Unknown';
      const arr = map.get(key) ?? [];
      arr.push(tab);
      map.set(key, arr);
    }
    return map;
  }, [filteredTabs]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleStatus(s: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  // Update sort + refetch
  function handleSortChange(val: string) {
    setSortBy(val);
    setShowSort(false);
    mgr.setFilters({ ...mgr.filters, sortBy: val });
  }

  // Bulk action execution
  async function handleBulkExecute(reasonCode: string, reasonText?: string) {
    const ids = Array.from(mgr.selectedIds);
    if (bulkAction === 'void') {
      return mgr.bulkVoid(ids, reasonCode as any, reasonText);
    } else if (bulkAction === 'close') {
      return mgr.bulkClose(ids, reasonCode as any, reasonText);
    }
    return { succeeded: [], failed: [] };
  }

  async function handleTransferSelect(serverId: string, serverName: string) {
    setTransferTargetId(serverId);
    setTransferTargetName(serverName);
    setShowTransfer(false);
    // Open transfer confirm dialog
    setBulkAction('transfer');
  }

  async function handleTransferExecute(reasonCode: string, reasonText?: string) {
    if (!transferTargetId) return { succeeded: [], failed: [] };
    const ids = Array.from(mgr.selectedIds);
    return mgr.bulkTransfer(ids, transferTargetId, reasonCode as any, reasonText);
  }

  const selCount = mgr.selectionSummary.count;
  const selBalance = mgr.selectionSummary.totalBalance;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
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

            {/* Status filter */}
            <div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-xs font-medium mb-2"
                style={{ color: 'var(--fnb-text-secondary)' }}
              >
                <Filter size={12} />
                Status Filter
                {statusFilters.size > 0 && (
                  <span
                    className="px-1.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--fnb-accent-primary)', color: '#fff' }}
                  >
                    {statusFilters.size}
                  </span>
                )}
              </button>
              {showFilters && (
                <div className="flex flex-col gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
                      <input
                        type="checkbox"
                        checked={statusFilters.has(opt.value)}
                        onChange={() => toggleStatus(opt.value)}
                        className="w-3.5 h-3.5 rounded accent-indigo-500"
                      />
                      <span style={{ color: 'var(--fnb-text-primary)' }}>{opt.label}</span>
                    </label>
                  ))}
                  {statusFilters.size > 0 && (
                    <button
                      onClick={() => setStatusFilters(new Set())}
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
                        color: sortBy === opt.value ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-primary)',
                        background: sortBy === opt.value ? 'var(--fnb-accent-primary-muted)' : 'transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--fnb-border-subtle)' }}>
              <div className="text-xs space-y-1" style={{ color: 'var(--fnb-text-muted)' }}>
                <div>Total: {filteredTabs.length} tab{filteredTabs.length !== 1 ? 's' : ''}</div>
                <div>Servers: {grouped.size}</div>
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
                  if (selCount === filteredTabs.length) mgr.clearSelection();
                  else mgr.selectAll(filteredTabs.map((t) => t.id));
                }}
                className="p-0.5"
                style={{ color: 'var(--fnb-text-secondary)' }}
                title={selCount === filteredTabs.length ? 'Deselect all' : 'Select all'}
              >
                {selCount === 0 ? (
                  <Square size={18} />
                ) : selCount === filteredTabs.length ? (
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
                  {filteredTabs.length} tab{filteredTabs.length !== 1 ? 's' : ''}
                </span>
              )}

              {selCount > 0 && (
                <>
                  <button
                    onClick={() => mgr.invertSelection(filteredTabs.map((t) => t.id))}
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
              ) : filteredTabs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No tabs found</p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([serverName, tabs]) => (
                  <div key={serverName}>
                    <button
                      onClick={() => toggleGroup(serverName)}
                      className="flex items-center gap-2 mb-2 w-full text-left"
                    >
                      {collapsedGroups.has(serverName) ? (
                        <ChevronRight size={14} style={{ color: 'var(--fnb-text-muted)' }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: 'var(--fnb-text-muted)' }} />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fnb-text-secondary)' }}>
                        {serverName}
                      </span>
                      <span
                        className="text-[10px] px-1.5 rounded-full"
                        style={{ background: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
                      >
                        {tabs.length}
                      </span>
                    </button>
                    {!collapsedGroups.has(serverName) && (
                      <div className="space-y-2">
                        {tabs.map((tab) => (
                          <ManageTabCard
                            key={tab.id}
                            tab={tab}
                            selected={mgr.selectedIds.has(tab.id)}
                            onToggle={mgr.toggleSelect}
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
                    <span style={{ color: 'var(--fnb-text-primary)' }}>{mgr.selectionSummary.servers.length}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setBulkAction('void')}
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
                onClick={() => setBulkAction('close')}
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
            mgr.refreshTabs();
            mgr.clearSelection();
          }}
          actionType={bulkAction}
          selectedCount={selCount}
          totalBalance={selBalance}
          requirePin={
            bulkAction === 'void'
              ? mgr.settings?.requirePinForVoid !== false
              : false
          }
          onVerifyPin={mgr.verifyPin}
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
            mgr.refreshTabs();
            mgr.clearSelection();
          }}
          actionType="transfer"
          selectedCount={selCount}
          totalBalance={selBalance}
          requirePin={mgr.settings?.requirePinForTransfer === true}
          onVerifyPin={mgr.verifyPin}
          onExecute={handleTransferExecute}
        />
      )}

      {showTransfer && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center">
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

      <EmergencyCleanupDialog
        open={showEmergency}
        onClose={() => {
          setShowEmergency(false);
          mgr.refreshTabs();
        }}
        onExecute={mgr.runEmergencyCleanup}
        approverUserId=""
      />

      {undoBanner && (
        <UndoBanner
          message={undoBanner.message}
          onUndo={async () => {
            // Undo not implemented in V1
          }}
          onDismiss={() => setUndoBanner(null)}
        />
      )}
    </div>,
    document.body,
  );
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
