'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { apiFetch } from '@/lib/api-client';
import { Clock, CheckCircle2, ChefHat, Package } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerOrder {
  ticketNumber: number;
  customerName: string | null;
  orderType: string | null;
  status: 'preparing' | 'ready';
  itemCount: number;
  estimatedPickupAt: string | null;
  /** ISO string — sentAt for preparing, readyAt for ready (used for sorting) */
  _sortKey: string;
}

interface ExpoTicketRaw {
  ticketNumber: number;
  customerName: string | null;
  orderType: string | null;
  allItemsReady: boolean;
  totalCount: number;
  sentAt: string;
  estimatedPickupAt: string | null;
  items: Array<{ readyAt: string | null }>;
}

interface ExpoViewResponse {
  tickets: ExpoTicketRaw[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPickupOrder(orderType: string | null): boolean {
  if (!orderType) return false;
  const t = orderType.toLowerCase();
  return t.includes('takeout') || t.includes('take_out') || t.includes('take-out') ||
    t.includes('delivery') || t.includes('pickup') || t.includes('pick_up') || t.includes('pick-up') ||
    t.includes('to_go') || t.includes('to-go') || t.includes('togo');
}

function formatOrderType(orderType: string | null): string {
  if (!orderType) return '';
  const t = orderType.toLowerCase();
  if (t.includes('delivery')) return 'Delivery';
  if (t.includes('takeout') || t.includes('take_out') || t.includes('take-out')) return 'Takeout';
  if (t.includes('pickup') || t.includes('pick_up') || t.includes('pick-up')) return 'Pickup';
  if (t.includes('togo') || t.includes('to_go') || t.includes('to-go')) return 'To Go';
  // Title-case fallback
  return orderType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function mapToCustomerOrder(t: ExpoTicketRaw): CustomerOrder {
  const status: 'preparing' | 'ready' = t.allItemsReady ? 'ready' : 'preparing';
  // For ready orders, use the latest item readyAt as sort key; fall back to sentAt
  let sortKey = t.sentAt;
  if (status === 'ready') {
    const readyTimes = t.items.map((i) => i.readyAt).filter(Boolean) as string[];
    if (readyTimes.length > 0) {
      const first = readyTimes[0]!;
      sortKey = readyTimes.reduce((latest, ts) => (ts > latest ? ts : latest), first);
    }
  }
  return {
    ticketNumber: t.ticketNumber,
    customerName: t.customerName,
    orderType: t.orderType,
    status,
    itemCount: t.totalCount,
    estimatedPickupAt: t.estimatedPickupAt,
    _sortKey: sortKey,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OrderCard({ order }: { order: CustomerOrder }) {
  const isReady = order.status === 'ready';
  const accentColor = isReady ? '#22c55e' : '#f97316';
  const pickupTime = formatTime(order.estimatedPickupAt);
  const typeLabel = formatOrderType(order.orderType);

  return (
    <div
      style={{
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: '12px',
        padding: '20px 24px',
        animation: isReady ? 'readyPulse 3s ease-in-out infinite' : 'none',
      }}
    >
      {/* Ticket number */}
      <div
        className="fnb-mono"
        style={{
          fontSize: '2.5rem',
          fontWeight: 700,
          lineHeight: 1,
          color: accentColor,
          letterSpacing: '-0.02em',
        }}
      >
        #{order.ticketNumber}
      </div>

      {/* Customer name */}
      {order.customerName && (
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            marginTop: '8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {order.customerName}
        </div>
      )}

      {/* Badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        {typeLabel && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: accentColor,
              backgroundColor: `${accentColor}22`,
              border: `1px solid ${accentColor}44`,
              borderRadius: '20px',
              padding: '2px 10px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {typeLabel}
          </span>
        )}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <Package style={{ width: '12px', height: '12px' }} />
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Pickup time */}
      {pickupTime && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          <Clock style={{ width: '13px', height: '13px' }} />
          Pickup at {pickupTime}
        </div>
      )}
    </div>
  );
}

function ColumnHeader({
  label,
  count,
  color,
  icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: `2px solid ${color}`,
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color }}>{icon}</span>
        <span
          style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            color,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      {count > 0 && (
        <span
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color,
            backgroundColor: `${color}22`,
            borderRadius: '20px',
            padding: '2px 14px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CustomerBoardContent() {
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();
  const searchParams = useSearchParams();

  const locationId = (() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && locations?.some((l) => l.id === fromUrl)) return fromUrl;
    return terminalSession?.locationId ?? locations?.[0]?.id ?? '';
  })();
  const locationName =
    locations?.find((l) => l.id === locationId)?.name ?? null;

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchingRef = useRef(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const prevReadyCountRef = useRef(0);

  const [flashReady, setFlashReady] = useState(false);

  // Clock tick — hydration-safe: initialize after mount
  useEffect(() => {
    setCurrentTime(new Date());
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!locationId) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    const gen = ++generationRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const today = new Date().toLocaleDateString('en-CA');

    try {
      const data = await apiFetch<{ data: ExpoViewResponse }>(
        `/api/v1/fnb/stations/expo?businessDate=${today}&locationId=${locationId}`,
        { signal: controller.signal },
      );

      if (gen !== generationRef.current) return;

      const rawTickets: ExpoTicketRaw[] = data?.data?.tickets ?? [];

      const mapped = rawTickets
        .filter((t) => isPickupOrder(t.orderType))
        .map(mapToCustomerOrder);

      // Sort: preparing = longest elapsed first (sentAt asc), ready = most recent readyAt first (desc)
      const preparing = mapped
        .filter((o) => o.status === 'preparing')
        .sort((a, b) => a._sortKey.localeCompare(b._sortKey)); // oldest sentAt first

      const ready = mapped
        .filter((o) => o.status === 'ready')
        .sort((a, b) => b._sortKey.localeCompare(a._sortKey)); // most recent ready first

      setOrders([...preparing, ...ready]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silently swallow errors — this is a public display, no error UX needed
    } finally {
      if (gen === generationRef.current) {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [locationId]);

  // Initial fetch + 10-second polling, paused when tab hidden
  useEffect(() => {
    fetchOrders();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        fetchOrders();
      }, 10_000);
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchOrders();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      abortRef.current?.abort();
    };
  }, [fetchOrders]);

  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  // Alert when new orders become ready
  useEffect(() => {
    const currentReadyCount = readyOrders.length;
    const prevCount = prevReadyCountRef.current;
    prevReadyCountRef.current = currentReadyCount;

    if (currentReadyCount > prevCount && prevCount >= 0 && !isLoading) {
      // Visual flash
      setFlashReady(true);
      setTimeout(() => setFlashReady(false), 2000);

      // Audio alert — Web Audio API (no file needed)
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        // Pleasant two-tone chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15); // C#6
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);

        // Cleanup
        setTimeout(() => ctx.close(), 600);
      } catch {
        // Audio not available — visual-only alert
      }
    }
  }, [readyOrders.length, isLoading]);

  const timeStr = currentTime?.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }) ?? '';
  const dateStr = currentTime?.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }) ?? '';

  return (
    <>
      {/* Keyframe for ready card pulse */}
      <style>{`
        @keyframes readyPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
          50% { box-shadow: 0 0 0 8px rgba(34,197,94,0.12); }
        }
        @keyframes readyFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0a',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Top bar */}
        {/* ------------------------------------------------------------------ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 32px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            flexShrink: 0,
          }}
        >
          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {locationName ? (
              <>
                <Package style={{ width: '18px', height: '18px', color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  {locationName}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em' }}>
                ORDER STATUS
              </span>
            )}
          </div>

          {/* Center title */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.9)' }}>
              ORDER STATUS
            </div>
          </div>

          {/* Clock */}
          <div style={{ textAlign: 'right' }}>
            <div
              className="fnb-mono"
              style={{ fontSize: '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em' }}
            >
              {timeStr}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
              {dateStr}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Main two-column layout */}
        {/* ------------------------------------------------------------------ */}
        {isLoading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid rgba(255,255,255,0.1)',
                  borderTop: '3px solid #f97316',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 12px',
                }}
              />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>Loading orders…</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : orders.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <CheckCircle2 style={{ width: '64px', height: '64px', color: 'rgba(255,255,255,0.15)' }} />
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)' }}>
              No active orders
            </p>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.15)' }}>
              Takeout and delivery orders will appear here
            </p>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0',
              overflow: 'hidden',
            }}
          >
            {/* ---------------------------------------------------------------- */}
            {/* LEFT — PREPARING */}
            {/* ---------------------------------------------------------------- */}
            <div
              style={{
                borderRight: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <ColumnHeader
                label="Preparing"
                count={preparingOrders.length}
                color="#f97316"
                icon={<ChefHat style={{ width: '22px', height: '22px' }} />}
              />
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '0 20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {preparingOrders.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingTop: '48px',
                    }}
                  >
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem' }}>
                      No orders being prepared
                    </p>
                  </div>
                ) : (
                  preparingOrders.map((order) => (
                    <OrderCard key={order.ticketNumber} order={order} />
                  ))
                )}
              </div>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* RIGHT — READY */}
            {/* ---------------------------------------------------------------- */}
            <div
              style={{
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              <ColumnHeader
                label="Ready for Pickup"
                count={readyOrders.length}
                color="#22c55e"
                icon={<CheckCircle2 style={{ width: '22px', height: '22px' }} />}
              />
              {flashReady && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    pointerEvents: 'none',
                    animation: 'readyFlash 2s ease-out forwards',
                    zIndex: 1,
                  }}
                />
              )}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '0 20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {readyOrders.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingTop: '48px',
                    }}
                  >
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem' }}>
                      No orders ready yet
                    </p>
                  </div>
                ) : (
                  readyOrders.map((order) => (
                    <OrderCard key={order.ticketNumber} order={order} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Footer */}
        {/* ------------------------------------------------------------------ */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '10px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock style={{ width: '13px', height: '13px', color: 'rgba(255,255,255,0.25)' }} />
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
              Updates every 10 seconds
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.15)' }}>
            Please approach counter when your order is ready
          </span>
        </div>
      </div>
    </>
  );
}
