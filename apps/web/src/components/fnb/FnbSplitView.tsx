'use client';

import { useState, useCallback } from 'react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { useFnbTab } from '@/hooks/use-fnb-tab';
import { apiFetch } from '@/lib/api-client';
import { SplitModeSelector } from './split/SplitModeSelector';
import { CheckPanel } from './split/CheckPanel';
import { EqualSplitSelector } from './split/EqualSplitSelector';
import { CustomAmountPanel } from './split/CustomAmountPanel';
import { DragItem } from './split/DragItem';
import type { FnbSplitStrategy } from '@/types/fnb';
import { ArrowLeft } from 'lucide-react';

interface FnbSplitViewProps {
  userId: string;
}

export function FnbSplitView({ userId: _userId }: FnbSplitViewProps) {
  const store = useFnbPosStore();
  const tabId = store.activeTabId;
  const workspace = store.splitWorkspace;

  const { tab } = useFnbTab({ tabId });
  const [activeCheckIndex, setActiveCheckIndex] = useState(0);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleBack = () => {
    store.clearSplit();
  };

  const handleModeChange = (mode: FnbSplitStrategy) => {
    store.initSplit(mode, workspace?.numberOfChecks ?? 2);
  };

  const handleEqualCountChange = (count: number) => {
    if (!workspace) return;
    store.initSplit('equal_split', count);
  };

  const handleMoveItem = useCallback((lineId: string, toCheckIndex: number) => {
    if (!workspace) return;
    const fromCheckIndex = workspace.checks.findIndex((c) => c.lineIds.includes(lineId));
    if (fromCheckIndex === -1 || fromCheckIndex === toCheckIndex) return;
    store.moveLineToCheck(lineId, fromCheckIndex, toCheckIndex);
  }, [workspace, store]);

  const handleDrop = useCallback((checkIndex: number) => {
    if (draggingLineId) {
      handleMoveItem(draggingLineId, checkIndex);
      setDraggingLineId(null);
    }
  }, [draggingLineId, handleMoveItem]);

  const handleApplySplit = async () => {
    if (!workspace || !tab || !tab.primaryOrderId) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        tabId: tab.id,
        orderId: tab.primaryOrderId,
        strategy: workspace.strategy,
        expectedVersion: tab.version,
      };

      if (workspace.strategy === 'equal_split') {
        payload.splitCount = workspace.numberOfChecks;
      } else if (workspace.strategy === 'by_seat') {
        const seatAssignments: Record<string, number[]> = {};
        workspace.checks.forEach((check, i) => {
          const seats = new Set<number>();
          const lines = tab.lines.filter((l) => check.lineIds.includes(l.id));
          for (const line of lines) {
            if (line.seatNumber) seats.add(line.seatNumber);
          }
          if (seats.size > 0) seatAssignments[String(i)] = Array.from(seats);
        });
        payload.seatAssignments = seatAssignments;
      } else if (workspace.strategy === 'by_item') {
        const itemAssignments: Record<string, string[]> = {};
        workspace.checks.forEach((check, i) => {
          if (check.lineIds.length > 0) itemAssignments[String(i)] = check.lineIds;
        });
        payload.itemAssignments = itemAssignments;
      } else if (workspace.strategy === 'custom_amount') {
        payload.customAmounts = workspace.checks.map((c) => ({
          label: c.label,
          amountCents: c.totalCents,
        }));
      }

      await apiFetch(`/api/v1/fnb/tabs/${tab.id}/split`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Navigate to payment after split
      store.clearSplit();
      store.navigateTo('payment');
    } catch (err: any) {
      console.error('Split failed:', err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!workspace || !tab) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>No split in progress</p>
      </div>
    );
  }

  // Unassigned lines (not in any check)
  const allAssignedIds = new Set(workspace.checks.flatMap((c) => c.lineIds));
  const unassignedLines = tab.lines.filter((l) => !allAssignedIds.has(l.id));

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Split Check — Tab #{tab.tabNumber}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleApplySplit}
          disabled={isSaving || unassignedLines.length > 0}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-status-seated)' }}
        >
          {isSaving ? 'Splitting...' : 'Apply Split'}
        </button>
      </div>

      {/* Mode selector */}
      <SplitModeSelector activeMode={workspace.strategy} onSelect={handleModeChange} />

      {/* Equal split selector */}
      {workspace.strategy === 'equal_split' && (
        <EqualSplitSelector
          currentCount={workspace.numberOfChecks}
          onSelect={handleEqualCountChange}
        />
      )}

      {/* Custom amount panel */}
      {workspace.strategy === 'custom_amount' && (
        <CustomAmountPanel
          totalCents={tab.runningTotalCents}
          onApply={(amounts) => {
            // Update workspace checks with custom amounts
            amounts.forEach((amt, i) => {
              store.updateSplitCheck(i, { label: amt.label, totalCents: amt.amountCents });
            });
          }}
        />
      )}

      {/* Main split area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Unassigned items (for by_item mode) */}
        {workspace.strategy === 'by_item' && unassignedLines.length > 0 && (
          <div
            className="w-48 shrink-0 border-r overflow-y-auto p-2"
            style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
          >
            <span className="text-[10px] font-bold uppercase mb-2 block" style={{ color: 'var(--fnb-text-muted)' }}>
              Unassigned ({unassignedLines.length})
            </span>
            <div className="flex flex-col gap-1">
              {unassignedLines.map((line) => (
                <DragItem
                  key={line.id}
                  line={line}
                  onDragStart={setDraggingLineId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Check panels */}
        <div className="flex-1 flex gap-3 p-3 overflow-x-auto">
          {workspace.checks.map((check, i) => (
            <div
              key={i}
              className="flex-1 min-w-[200px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
            >
              <CheckPanel
                check={check}
                lines={tab.lines}
                isActive={activeCheckIndex === i}
                onSelect={() => setActiveCheckIndex(i)}
                onRemoveItem={workspace.strategy === 'by_item' ? (lineId) => {
                  // Move item back to first check or unassigned
                  const fromIdx = workspace.checks.findIndex((c) => c.lineIds.includes(lineId));
                  if (fromIdx !== -1) {
                    store.moveLineToCheck(lineId, fromIdx, 0);
                  }
                } : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
