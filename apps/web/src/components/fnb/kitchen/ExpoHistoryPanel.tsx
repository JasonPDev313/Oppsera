'use client';

import { useState, useMemo } from 'react';
import type { ExpoHistory, ExpoHistoryTicket } from '@/types/fnb';
import { formatTimer } from './TimerBar';
import { RefreshCw, Search } from 'lucide-react';

interface ExpoHistoryPanelProps {
  history: ExpoHistory | null;
  isLoading: boolean;
  error?: string | null;
  onRefresh: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function HistoryRow({ ticket }: { ticket: ExpoHistoryTicket }) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b"
      style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}
    >
      {/* Ticket # + table */}
      <div className="shrink-0 w-16 text-center">
        <span
          className="text-sm font-bold fnb-mono"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          #{ticket.ticketNumber}
        </span>
        {ticket.tableNumber != null && (
          <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            T{ticket.tableNumber}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 min-w-0">
        {ticket.items.map((item) => (
          <div key={item.itemId} className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--fnb-text-primary)' }}>
              {item.quantity > 1 ? `${item.quantity}x ` : ''}
              {item.kitchenLabel || item.itemName}
            </span>
            {item.stationName && (
              <span className="text-[9px] px-1 rounded" style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-muted)',
              }}>
                {item.stationName}
              </span>
            )}
          </div>
        ))}
        {ticket.serverName && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
            {ticket.serverName}
            {ticket.customerName ? ` — ${ticket.customerName}` : ''}
          </p>
        )}
      </div>

      {/* Timing */}
      <div className="shrink-0 text-right">
        <span className="text-xs fnb-mono" style={{ color: 'var(--fnb-status-available)' }}>
          {formatTime(ticket.servedAt)}
        </span>
        <p className="text-[10px] fnb-mono" style={{ color: 'var(--fnb-text-muted)' }}>
          {formatTimer(ticket.durationSeconds)}
        </p>
      </div>
    </div>
  );
}

export function ExpoHistoryPanel({ history, isLoading, error, onRefresh }: ExpoHistoryPanelProps) {
  const [search, setSearch] = useState('');

  const filteredTickets = useMemo(() => {
    if (!history?.tickets) return [];
    if (!search.trim()) return history.tickets;
    const q = search.toLowerCase();
    return history.tickets.filter((t) => {
      const ticketNum = String(t.ticketNumber);
      const table = t.tableNumber != null ? String(t.tableNumber) : '';
      const server = t.serverName?.toLowerCase() ?? '';
      const customer = t.customerName?.toLowerCase() ?? '';
      const items = t.items.map((i) => (i.kitchenLabel || i.itemName).toLowerCase()).join(' ');
      return ticketNum.includes(q) || table.includes(q) || server.includes(q) || customer.includes(q) || items.includes(q);
    });
  }, [history?.tickets, search]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0 border-b"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Order History
          </h2>
          {history && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
            >
              {history.totalServed} served today
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded transition-colors disabled:opacity-40"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search bar */}
      {history && history.tickets.length > 0 && (
        <div className="px-4 py-1.5 shrink-0 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
            <input
              type="text"
              placeholder="Search ticket #, table, server, item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs rounded-md border"
              style={{
                backgroundColor: 'var(--fnb-bg-primary)',
                borderColor: 'rgba(148, 163, 184, 0.15)',
                color: 'var(--fnb-text-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && !history ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 px-4">
            <div className="text-center">
              <p className="text-sm" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
              <button type="button" onClick={onRefresh}
                className="mt-2 text-xs underline" style={{ color: 'var(--fnb-text-muted)' }}>
                Retry
              </button>
            </div>
          </div>
        ) : !history?.tickets.length ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
              No served orders yet today
            </p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
              No matching tickets
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <HistoryRow key={ticket.ticketId} ticket={ticket} />
          ))
        )}
      </div>
    </div>
  );
}
