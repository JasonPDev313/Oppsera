'use client';

import { useState, useCallback } from 'react';
import { ArrowRightLeft, RefreshCw, Loader2, Inbox } from 'lucide-react';
import { useTransferTabs } from '@/hooks/use-transfer-tabs';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function terminalLabel(terminalId: string): string {
  if (terminalId.endsWith('_fnb')) return 'F&B';
  if (terminalId.endsWith('_retail')) return 'Retail';
  return terminalId;
}

interface TransferTabPanelProps {
  currentTerminalId: string;
  onTransfer: (orderId: string) => void;
  isTransferring?: boolean;
}

export function TransferTabPanel({
  currentTerminalId,
  onTransfer,
  isTransferring,
}: TransferTabPanelProps) {
  const [employeeFilter, setEmployeeFilter] = useState('');
  const { tabs, isLoading, mutate, transferTab } = useTransferTabs(currentTerminalId);

  const filteredTabs = employeeFilter
    ? tabs.filter(
        (t) =>
          t.employeeName?.toLowerCase().includes(employeeFilter.toLowerCase()) ||
          t.employeeId === employeeFilter,
      )
    : tabs;

  const handleTransfer = useCallback(
    async (sourceTabId: string) => {
      try {
        // Find next available tab number on our terminal
        const orderId = await transferTab(sourceTabId, currentTerminalId, Date.now());
        onTransfer(orderId);
      } catch {
        // Error handled in hook
      }
    },
    [transferTab, currentTerminalId, onTransfer],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Transfer Tab</h3>
          {filteredTabs.length > 0 && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {filteredTabs.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isLoading}
            className="ml-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="shrink-0 border-b border-gray-100 px-4 py-2">
        <input
          type="text"
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          placeholder="Filter by server name..."
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
        />
        {employeeFilter && (
          <button
            type="button"
            onClick={() => setEmployeeFilter('')}
            className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <p className="mt-2 text-sm text-gray-400">Loading tabs...</p>
          </div>
        ) : filteredTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Inbox className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No transferable tabs</p>
            <p className="mt-1 text-xs text-gray-400">
              Open tabs on other registers will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTabs.map((tab) => (
              <div
                key={tab.id}
                className="rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-amber-200 hover:bg-amber-50/50"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {terminalLabel(tab.terminalId)}
                      </span>
                      <p className="text-sm font-semibold text-gray-900">
                        #{tab.orderNumber}
                      </p>
                      {tab.employeeName && (
                        <span className="truncate text-xs text-gray-500">
                          {tab.employeeName}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Tab {tab.tabNumber} &middot; {formatTime(tab.orderCreatedAt)}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatMoney(tab.total)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleTransfer(tab.id)}
                      disabled={isTransferring}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                      Transfer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
