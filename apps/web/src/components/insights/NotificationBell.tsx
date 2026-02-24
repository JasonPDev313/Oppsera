'use client';

import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/hooks/use-session-history';

// ── Types ──────────────────────────────────────────────────────────

interface Notification {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: {
    notifications: Notification[];
    unreadCount: number;
  };
}

interface NotificationBellProps {
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const MAX_BODY_LENGTH = 100;

const SEVERITY_COLORS: Record<Notification['severity'], string> = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  success: 'bg-green-500',
};

// ── Component ──────────────────────────────────────────────────────

export function NotificationBell({ className }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch unread count (lightweight poll) ─────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch<NotificationsResponse>(
        '/api/v1/semantic/alerts/notifications?unreadOnly=true',
      );
      if (!mountedRef.current) return;
      setUnreadCount(res.data.unreadCount);
    } catch {
      // Non-fatal — badge just doesn't update
    }
  }, []);

  // ── Fetch full notifications list (when dropdown opens) ───────
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<NotificationsResponse>(
        '/api/v1/semantic/alerts/notifications',
      );
      if (!mountedRef.current) return;
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      // Non-fatal — panel shows empty state
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Mark all as read ──────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    try {
      await apiFetch('/api/v1/semantic/alerts/notifications', {
        method: 'POST',
      });
      if (!mountedRef.current) return;
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true })),
      );
    } catch {
      // Non-fatal
    }
  }, []);

  // ── Polling for unread count ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    fetchUnreadCount();

    pollTimerRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [fetchUnreadCount]);

  // ── Fetch full list when dropdown opens ───────────────────────
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // ── Click outside to close ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        bellRef.current &&
        !bellRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    // Defer listener registration to avoid the opening click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // ── Escape key to close ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ── Position the dropdown ─────────────────────────────────────
  const getDropdownPosition = useCallback(() => {
    if (!bellRef.current) return { top: 0, right: 0 };
    const rect = bellRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    };
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <>
      {/* Bell button */}
      <button
        ref={bellRef}
        type="button"
        onClick={toggleOpen}
        className={`relative p-2 rounded-lg text-gray-500 hover:bg-gray-200/50 hover:text-gray-700 transition-colors ${className ?? ''}`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel (portal) */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <NotificationPanel
            ref={panelRef}
            notifications={notifications}
            isLoading={isLoading}
            unreadCount={unreadCount}
            position={getDropdownPosition()}
            onMarkAllRead={markAllRead}
            onClose={() => setIsOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

// ── Notification Panel ─────────────────────────────────────────────

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading: boolean;
  unreadCount: number;
  position: { top: number; right: number };
  onMarkAllRead: () => void;
  onClose: () => void;
}

const NotificationPanel = forwardRef<HTMLDivElement, NotificationPanelProps>(
  function NotificationPanel(
    { notifications, isLoading, unreadCount, position, onMarkAllRead, onClose },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className="fixed z-50 w-[360px] max-h-[480px] flex flex-col rounded-xl border border-gray-200 bg-surface shadow-xl"
        style={{ top: position.top, right: position.right }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="text-sm font-semibold text-foreground">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Bell className="h-6 w-6 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">
                AI insights and alerts will appear here
              </p>
            </div>
          )}

          {!isLoading && notifications.length > 0 && (
            <div>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View all alerts
          </button>
        </div>
      </div>
    );
  },
);

// ── Notification Item ──────────────────────────────────────────────

function NotificationItem({ notification }: { notification: Notification }) {
  const truncatedBody =
    notification.body.length > MAX_BODY_LENGTH
      ? notification.body.slice(0, MAX_BODY_LENGTH) + '\u2026'
      : notification.body;

  return (
    <div
      className={`px-4 py-3 border-b border-gray-100 last:border-b-0 transition-colors ${
        notification.read ? '' : 'bg-indigo-50/30'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Severity dot */}
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            SEVERITY_COLORS[notification.severity]
          }`}
          title={notification.severity}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`text-sm leading-snug truncate ${
                notification.read
                  ? 'text-gray-700'
                  : 'text-gray-900 font-medium'
              }`}
            >
              {notification.title}
            </p>
            <span className="shrink-0 text-[11px] text-gray-400 whitespace-nowrap">
              {formatRelativeTime(notification.createdAt)}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
            {truncatedBody}
          </p>
        </div>
      </div>
    </div>
  );
}
