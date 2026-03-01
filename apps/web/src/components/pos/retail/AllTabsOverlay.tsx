'use client';

/**
 * Phase 3C: Manager "All Tabs" overlay.
 *
 * Shows all register tabs at a location grouped by employee.
 * "Take Over" transfers a tab to the current user.
 * Gated by the `pos.register_tabs.view_all` permission.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api-client';
import { X, Users, ArrowRightLeft } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface AllTabsTab {
  id: string;
  tabNumber: number;
  orderId: string | null;
  label: string | null;
  employeeId: string | null;
  employeeName: string | null;
  status: string;
  version: number;
}

interface AllTabsOverlayProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  currentEmployeeId: string;
  onTransfer: (tabId: string, fromEmployeeName: string) => void;
}

// ── Component ───────────────────────────────────────────────────────

export function AllTabsOverlay({
  open,
  onClose,
  locationId,
  currentEmployeeId,
  onTransfer,
}: AllTabsOverlayProps) {
  const [tabs, setTabs] = useState<AllTabsTab[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  // ── Fetch all tabs at this location ────────────────────────────────

  const loadTabs = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await apiFetch<{ data: AllTabsTab[] }>(
        `/api/v1/register-tabs?locationId=${encodeURIComponent(locationId)}`,
      );
      setTabs(resp.data.filter((t) => t.status === 'active'));
    } catch (err) {
      console.error('[AllTabsOverlay] Failed to load tabs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (open) loadTabs();
  }, [open, loadTabs]);

  // ── Transfer tab to current user ───────────────────────────────────

  const handleTransfer = async (tab: AllTabsTab) => {
    setTransferring(tab.id);
    try {
      await apiFetch(`/api/v1/register-tabs/${tab.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          toEmployeeId: currentEmployeeId,
          expectedVersion: tab.version,
        }),
      });
      onTransfer(tab.id, tab.employeeName ?? 'Unknown');
      await loadTabs();
    } catch (err) {
      console.error('[AllTabsOverlay] Transfer failed:', err);
    } finally {
      setTransferring(null);
    }
  };

  // ── Close on Escape ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // ── Group tabs by employee ─────────────────────────────────────────

  const grouped = new Map<string, AllTabsTab[]>();
  for (const tab of tabs) {
    const key = tab.employeeId ?? 'unassigned';
    const group = grouped.get(key) ?? [];
    group.push(tab);
    grouped.set(key, group);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">
              All Tabs at Location
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading tabs...
            </div>
          ) : tabs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No active tabs at this location
            </div>
          ) : (
            Array.from(grouped.entries()).map(([empId, employeeTabs]) => (
              <div key={empId} className="space-y-2">
                {/* Employee header */}
                <h3 className="text-sm font-medium text-muted-foreground">
                  {employeeTabs[0]?.employeeName ?? 'Unassigned'}
                  <span className="ml-2 text-xs bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded">
                    {employeeTabs.length} tab
                    {employeeTabs.length !== 1 ? 's' : ''}
                  </span>
                  {empId === currentEmployeeId && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </h3>

                {/* Tab rows */}
                <div className="space-y-1">
                  {employeeTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="flex items-center justify-between px-3 py-2 rounded bg-surface border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-foreground">
                          Tab {tab.tabNumber}
                        </span>
                        {tab.label && (
                          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {tab.label}
                          </span>
                        )}
                        {tab.orderId && (
                          <span className="text-xs bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded">
                            Has Order
                          </span>
                        )}
                      </div>

                      {empId !== currentEmployeeId && (
                        <button
                          onClick={() => handleTransfer(tab)}
                          disabled={transferring === tab.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                          {transferring === tab.id ? 'Transferring...' : 'Take Over'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
