'use client';

import '@/styles/fnb-design-tokens.css';

import { useState, useCallback, useEffect } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { useFnbRealtime, type ChannelName } from '@/hooks/use-fnb-realtime';
import {
  useHostDashboard,
  useHostTables,
  useHostSettings,
  useWaitTimeEstimate,
  useTableAvailability,
  useWaitlistMutations,
  useReservationMutations,
  usePreShift,
  useHostAnalytics,
} from '@/hooks/use-fnb-host';
import { StatsBar } from '@/components/fnb/host/StatsBar';
import { WaitlistPanel } from '@/components/fnb/host/WaitlistPanel';
import { ReservationTimeline } from '@/components/fnb/host/ReservationTimeline';
import { RotationQueue } from '@/components/fnb/host/RotationQueue';
import { PreShiftPanel } from '@/components/fnb/host/PreShiftPanel';
import { HostFloorMap } from '@/components/fnb/host/HostFloorMap';
import { HostGridView } from '@/components/fnb/host/HostGridView';
import { HostLayoutView } from '@/components/fnb/host/HostLayoutView';
import { AddGuestDialog } from '@/components/fnb/host/AddGuestDialog';
import { EditGuestDialog } from '@/components/fnb/host/EditGuestDialog';
import { NewReservationDialog } from '@/components/fnb/host/NewReservationDialog';
import { SeatGuestDialog } from '@/components/fnb/host/SeatGuestDialog';
import { SeatConfirmDialog } from '@/components/fnb/host/SeatConfirmDialog';
import { NotificationCenter } from '@/components/fnb/host/NotificationCenter';
import { NotificationComposer } from '@/components/fnb/host/NotificationComposer';
import { QrCodeDisplay } from '@/components/fnb/host/QrCodeDisplay';
import { AssignModeProvider, useAssignMode } from '@/components/fnb/host/AssignModeContext';
import HostSettingsPanel from '@/components/host/HostSettingsPanel';
import { WaitlistAnalytics } from '@/components/fnb/host/WaitlistAnalytics';
import { useSectionActions } from '@/hooks/use-fnb-manager';
import { useFnbRooms, useTableActions } from '@/hooks/use-fnb-floor';
import { FeaturePlaceholderBlock, FeatureBadge } from '@/components/fnb/host/FeaturePlaceholder';
import { useToast } from '@/components/ui/toast';
import {
  Users,
  ArrowLeft,
  RefreshCw,
  Settings,
  LayoutGrid,
  List,
  Map,
  ClipboardList,
  Bell,
  QrCode,
  ShoppingBag,
  BarChart3,
  Lightbulb,
  X as XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type RightPanelTab = 'reservations' | 'floor' | 'preshift' | 'pickup' | 'analytics';
type FloorViewMode = 'layout' | 'map' | 'grid';

// ── Loading skeleton ─────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className ?? ''}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Stats skeleton */}
      <div className="shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 flex-1 rounded-xl" />
          <Skeleton className="h-16 flex-1 rounded-xl" />
        </div>
      </div>

      {/* Main grid skeleton */}
      <div className="flex-1 overflow-hidden grid grid-cols-[42fr_58fr] gap-3 px-4 pb-3 pt-2">
        {/* Left: waitlist card placeholders */}
        <div className="min-w-0 overflow-hidden flex flex-col gap-2">
          <Skeleton className="h-10 rounded-xl" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Right: tab panel skeleton */}
        <div className="min-w-0 overflow-hidden flex flex-col gap-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="flex-1 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// Stable reference — host stand uses dashboard + floor channels
const HOST_REALTIME_CHANNELS: ChannelName[] = ['floor', 'dashboard'];

function HostContentInner() {
  const { tenant, locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

  // ── Host Stand Realtime — drives onChannelRefresh listeners ──
  useFnbRealtime({
    channels: HOST_REALTIME_CHANNELS,
    tenantId: tenant?.id ?? '',
    locationId,
    enabled: !!locationId,
  });

  // ── Assign mode ────────────────────────────────────
  const { selectedParty, assignMode, cancelAssign } = useAssignMode();

  // ── Toast ─────────────────────────────────────────
  const { toast } = useToast();

  // ── UI State ─────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightPanelTab>('reservations');
  const [floorViewMode, setFloorViewMode] = useState<FloorViewMode>('layout');
  const [analyticsRangeDays, setAnalyticsRangeDays] = useState(6);

  // ── Welcome banner ────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(
    () => typeof window !== 'undefined' && !localStorage.getItem('oppsera-host-welcome-dismissed'),
  );

  // ── Data ────────────────────────────────────────────
  const {
    waitlist,
    reservations,
    tableSummary,
    servers,
    stats,
    isLoading,
    refresh,
  } = useHostDashboard({ locationId, businessDate: today });

  const { tables, error: tablesError } = useHostTables(locationId);
  const { settings: hostSettings } = useHostSettings(locationId);
  const { data: preShiftData, isLoading: preShiftLoading } = usePreShift(
    rightTab === 'preshift' ? locationId : null,
  );

  // Analytics — dynamic window, only fetch when tab is active
  const analyticsEnd = today;
  const analyticsStart = new Date(Date.now() - analyticsRangeDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { analytics, isLoading: analyticsLoading } = useHostAnalytics(
    rightTab === 'analytics' ? locationId : null,
    analyticsStart,
    analyticsEnd,
  );

  const { rooms } = useFnbRooms();
  const { syncFromFloorPlan, isActing: isSyncActing } = useTableActions(() => {
    refresh();
  });

  const { advanceRotation, isActing } = useSectionActions();

  // ── Waitlist config (slug + branding for QR flyer) ──
  const [waitlistQr, setWaitlistQr] = useState<{
    slug: string;
    branding: {
      logoUrl: string | null;
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      fontFamily: string;
      welcomeHeadline: string;
      footerText: string | null;
    };
  } | null>(null);

  useEffect(() => {
    if (!locationId) return;
    fetch('/api/v1/fnb/host/waitlist-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json?.data) return;
        const d = json.data;
        setWaitlistQr({
          slug: d.slugOverride || tenant?.slug || 'waitlist',
          branding: {
            logoUrl: d.branding?.logoUrl ?? null,
            primaryColor: d.branding?.primaryColor ?? '#6366f1',
            secondaryColor: d.branding?.secondaryColor ?? '#3b82f6',
            accentColor: d.branding?.accentColor ?? '#22c55e',
            fontFamily: d.branding?.fontFamily ?? 'Inter',
            welcomeHeadline: d.branding?.welcomeHeadline ?? 'Join Our Waitlist',
            footerText: d.branding?.footerText ?? null,
          },
        });
      })
      .catch(() => {});
  }, [locationId, tenant?.slug]);

  // ── Sync all rooms ────────────────────────────────
  const handleSyncTables = useCallback(async () => {
    for (const room of rooms) {
      await syncFromFloorPlan(room.id);
    }
  }, [rooms, syncFromFloorPlan]);

  // ── Dialogs ─────────────────────────────────────────
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [seatTarget, setSeatTarget] = useState<{
    id: string;
    guestName: string;
    partySize: number;
    type: 'waitlist' | 'reservation';
  } | null>(null);

  // ── Edit guest ────────────────────────────────────
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const editEntry = editEntryId ? (waitlist.find((w) => w.id === editEntryId) ?? null) : null;

  // ── Notification, QR & Settings state ────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<{
    id: string;
    guestName: string;
    guestPhone: string;
  } | null>(null);
  const [sentNotifications, setSentNotifications] = useState<
    { id: string; recipientName: string; recipientPhone: string; type: 'table_ready'; status: 'sent' | 'delivered' | 'failed'; sentAt: string; message: string }[]
  >([]);

  // ── Assign-mode seat confirm ──────────────────────
  const [assignSeatTable, setAssignSeatTable] = useState<{
    tableId: string;
    tableNumber: number | string;
    capacity: number;
    sectionName: string | null;
    serverName: string | null;
  } | null>(null);
  const [isAssignSeating, setIsAssignSeating] = useState(false);

  // ── Wait estimate for add-guest dialog ──────────────
  const { estimate } = useWaitTimeEstimate(
    showAddGuest ? locationId : null,
    2,
    today,
  );

  // ── Table availability for seating dialog ───────────
  const { suggested, allAvailable } = useTableAvailability(
    seatTarget ? locationId : null,
    seatTarget?.partySize ?? 2,
    undefined,
    today,
  );

  // ── Mutations ───────────────────────────────────────
  const waitlistMut = useWaitlistMutations(locationId);
  const resMut = useReservationMutations(locationId);

  // ── Handlers ────────────────────────────────────────
  const handleAddGuest = useCallback(
    async (input: Parameters<typeof waitlistMut.addToWaitlist>[0]) => {
      await waitlistMut.addToWaitlist(input);
      toast.success(`${input.guestName} added to waitlist`);
      setShowAddGuest(false);
    },
    [waitlistMut, toast],
  );

  const handleCreateReservation = useCallback(
    async (input: Parameters<typeof resMut.createReservation>[0]) => {
      await resMut.createReservation(input);
      setShowNewReservation(false);
    },
    [resMut],
  );

  const handleSeatFromWaitlist = useCallback(
    (id: string) => {
      const entry = waitlist.find((w) => w.id === id);
      if (entry) {
        setSeatTarget({
          id,
          guestName: entry.guestName,
          partySize: entry.partySize,
          type: 'waitlist',
        });
      }
    },
    [waitlist],
  );

  const handleCheckInReservation = useCallback(
    (id: string) => {
      const res = reservations.find((r) => r.id === id);
      if (res) {
        setSeatTarget({
          id,
          guestName: res.guestName,
          partySize: res.partySize,
          type: 'reservation',
        });
      }
    },
    [reservations],
  );

  const handleSeatConfirm = useCallback(
    async (tableId: string) => {
      if (!seatTarget) return;
      try {
        if (seatTarget.type === 'waitlist') {
          await waitlistMut.seatGuest({ id: seatTarget.id, tableId });
        } else {
          await resMut.checkIn({ id: seatTarget.id, tableId });
        }
        toast.success(`${seatTarget.guestName} seated successfully`);
        setSeatTarget(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to seat guest');
      }
    },
    [seatTarget, waitlistMut, resMut, toast],
  );

  const handleAdvanceRotation = useCallback(() => {
    advanceRotation(locationId, today);
  }, [advanceRotation, locationId, today]);

  // ── Floor map: table tapped in assign mode ──────────
  const handleFloorSeatTable = useCallback(
    (tableId: string) => {
      if (assignMode && selectedParty) {
        const table = tables.find((t) => t.id === tableId);
        if (table) {
          setAssignSeatTable({
            tableId: table.id,
            tableNumber: table.tableNumber,
            capacity: table.capacityMax,
            sectionName: null,
            serverName: table.serverName,
          });
        }
        return;
      }
      // Non-assign mode: open the seat dialog directly
      const table = tables.find((t) => t.id === tableId);
      if (table) {
        setShowAddGuest(true);
      }
    },
    [assignMode, selectedParty, tables],
  );

  // ── Assign mode: confirm seating ─────────────────
  const handleAssignConfirm = useCallback(async () => {
    if (!selectedParty || !assignSeatTable) return;
    setIsAssignSeating(true);
    try {
      if (selectedParty.type === 'waitlist') {
        await waitlistMut.seatGuest({ id: selectedParty.id, tableId: assignSeatTable.tableId });
      } else {
        await resMut.checkIn({ id: selectedParty.id, tableId: assignSeatTable.tableId });
      }
      toast.success(`${selectedParty.guestName} seated at table ${assignSeatTable.tableNumber}`);
      setAssignSeatTable(null);
      cancelAssign();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to seat guest');
    } finally {
      setIsAssignSeating(false);
    }
  }, [selectedParty, assignSeatTable, waitlistMut, resMut, cancelAssign, toast]);

  // ── Table action from context menu ────────────────
  const handleTableAction = useCallback(
    (action: string, _tableId: string) => {
      switch (action) {
        case 'seat_walkin':
          setShowAddGuest(true);
          break;
        case 'mark_available': {
          // Clear table status
          break;
        }
        default:
          break;
      }
    },
    [],
  );

  // ── Server rotation data ────────────────────────────
  const rotationServers = servers.map((s) => ({
    id: s.serverUserId,
    name: s.serverName ?? 'Unknown',
    coverCount: s.coversServed,
    isNext: s.isNext,
  }));

  // ── Right panel tabs ────────────────────────────────
  const RIGHT_TABS: { key: RightPanelTab; label: string; icon: typeof Users }[] = [
    { key: 'reservations', label: 'Reservations', icon: Users },
    { key: 'floor', label: 'Floor', icon: LayoutGrid },
    { key: 'preshift', label: 'Pre-Shift', icon: ClipboardList },
    { key: 'pickup', label: 'Pickup', icon: ShoppingBag },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const iconBtnCls = 'flex items-center justify-center rounded-xl h-10 w-10 transition-all active:scale-95 hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none text-muted-foreground';

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden bg-background">
      {/* ── Header ────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 shrink-0 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/pos/fnb')}
            aria-label="Back to F&B POS"
            className="flex items-center justify-center rounded-xl h-9 w-9 border border-border bg-card text-muted-foreground hover:bg-accent transition-all active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-500/10">
              <Users className="h-4.5 w-4.5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-foreground leading-tight">
                Host Stand
              </h1>
              <p
                className="text-[11px] font-medium text-muted-foreground leading-tight"
                aria-live="polite"
              >
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <FeatureBadge storyId="US-HOST-RT-01" />
          <button
            type="button"
            onClick={() => refresh()}
            aria-label="Refresh data"
            className={iconBtnCls}
          >
            <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowQrCode(true)}
            aria-label="Show QR code"
            className={iconBtnCls}
          >
            <QrCode className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            aria-label={`Notifications${sentNotifications.length > 0 ? ` (${sentNotifications.length})` : ''}`}
            className={`relative ${iconBtnCls}`}
          >
            <Bell className="h-4.5 w-4.5" />
            {sentNotifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-4.5 flex items-center justify-center rounded-full text-[9px] font-bold px-1 bg-red-500 text-white">
                {sentNotifications.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Host settings"
            className={iconBtnCls}
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* ── Initial load skeleton ──────────────────────── */}
      {isLoading && waitlist.length === 0 && !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ── Stats Bar ─────────────────────────────────── */}
          <div className="shrink-0 px-4 pt-3 pb-1">
            <StatsBar
              stats={stats}
              tableSummary={tableSummary}
              longestWaitMinutes={waitlist.length > 0 ? Math.round(Math.max(...waitlist.map((w) => w.elapsedMinutes))) : undefined}
            />
          </div>

          {/* ── Welcome info box ──────────────────────────── */}
          {showWelcome && (
            <div className="mx-4 mt-2 flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3.5">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-500 mb-0.5">Welcome to the Host Stand</p>
                <p className="text-xs text-blue-400/80 leading-relaxed">
                  The waitlist is on the left — tap <strong>Add Guest</strong> for walk-ins.
                  On the right, manage reservations, view the floor plan, run pre-shift reports, and track analytics.
                  Share the <strong>QR code</strong> (top right) so guests can join from their phone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWelcome(false);
                  localStorage.setItem('oppsera-host-welcome-dismissed', '1');
                }}
                aria-label="Dismiss welcome message"
                className="shrink-0 p-1.5 rounded-md text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Main Content (42/58 split) ──────────────── */}
          <div className="flex-1 overflow-hidden grid grid-cols-[42fr_58fr] gap-3 px-4 pb-3 pt-2">
            {/* Left: Waitlist */}
            <div className="min-w-0 overflow-hidden flex flex-col">
              <WaitlistPanel
                entries={waitlist}
                onSeat={handleSeatFromWaitlist}
                onEdit={(id) => setEditEntryId(id)}
                onNotify={(id) => {
                  const entry = waitlist.find((w) => w.id === id);
                  if (entry) {
                    setNotifyTarget({
                      id,
                      guestName: entry.guestName,
                      guestPhone: entry.guestPhone ?? '',
                    });
                  } else {
                    waitlistMut
                      .notifyGuest({ id })
                      .then(() => toast.success('Guest notified'))
                      .catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : 'Failed to notify guest'),
                      );
                  }
                }}
                onRemove={(id) => {
                  const entry = waitlist.find((w) => w.id === id);
                  waitlistMut
                    .removeGuest({ id })
                    .then(() => toast.success(`${entry?.guestName ?? 'Guest'} removed from waitlist`))
                    .catch((e: unknown) =>
                      toast.error(e instanceof Error ? e.message : 'Failed to remove guest'),
                    );
                }}
                onAdd={() => setShowAddGuest(true)}
                onBumpUp={(id) =>
                  waitlistMut
                    .bumpPosition({ id, direction: 'up' })
                    .then(() => toast.info('Guest moved up'))
                    .catch((e: unknown) =>
                      toast.error(e instanceof Error ? e.message : 'Failed to move guest'),
                    )
                }
                onBumpDown={(id) =>
                  waitlistMut
                    .bumpPosition({ id, direction: 'down' })
                    .then(() => toast.info('Guest moved down'))
                    .catch((e: unknown) =>
                      toast.error(e instanceof Error ? e.message : 'Failed to move guest'),
                    )
                }
                onMerge={(primaryId, secondaryId) =>
                  waitlistMut
                    .mergeEntries({ primaryId, secondaryId })
                    .then(() => toast.success('Parties merged'))
                    .catch((e: unknown) =>
                      toast.error(e instanceof Error ? e.message : 'Failed to merge parties'),
                    )
                }
                onSplit={(id) => {
                  const entry = waitlist.find((w) => w.id === id);
                  if (entry && entry.partySize > 1) {
                    const splitSize = Math.floor(entry.partySize / 2);
                    waitlistMut
                      .splitEntry({ id, newPartySize: splitSize, newGuestName: `${entry.guestName} (split)` })
                      .then(() => toast.success(`${entry.guestName} split into two parties`))
                      .catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : 'Failed to split party'),
                      );
                  }
                }}
                graceMinutes={hostSettings?.waitlist?.notifyExpiryMinutes ?? 10}
                maxCapacity={hostSettings?.waitlist?.maxSize}
              />
            </div>

            {/* Right: Tabbed Panel */}
            <div className="min-w-0 overflow-hidden flex flex-col gap-2">
              {/* Tab Bar */}
              <div className="flex items-center justify-between shrink-0 rounded-xl bg-card border border-border px-1.5 py-1.5 shadow-sm">
                <div className="flex items-center gap-1">
                  {RIGHT_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = rightTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setRightTab(tab.key)}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-indigo-500/10 text-indigo-400 shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                      >
                        <Icon size={14} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Floor view mode toggle (only on floor tab) */}
                {rightTab === 'floor' && (
                  <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => setFloorViewMode('layout')}
                      aria-label="Layout view"
                      title="Room layout"
                      className={`p-1.5 rounded-md transition-all ${
                        floorViewMode === 'layout'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Map size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFloorViewMode('map')}
                      aria-label="Map view"
                      title="Quick map"
                      className={`p-1.5 rounded-md transition-all ${
                        floorViewMode === 'map'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFloorViewMode('grid')}
                      aria-label="Grid view"
                      title="Table list"
                      className={`p-1.5 rounded-md transition-all ${
                        floorViewMode === 'grid'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <List size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden flex flex-col gap-2">
                {rightTab === 'reservations' && (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <ReservationTimeline
                        reservations={reservations}
                        onCheckIn={handleCheckInReservation}
                        onCancel={(id) => {
                          const res = reservations.find((r) => r.id === id);
                          resMut
                            .cancelReservation({ id })
                            .then(() =>
                              toast.success(`${res?.guestName ?? 'Reservation'} cancelled`),
                            )
                            .catch((e: unknown) =>
                              toast.error(
                                e instanceof Error ? e.message : 'Failed to cancel reservation',
                              ),
                            );
                        }}
                        onNoShow={(id) => {
                          const res = reservations.find((r) => r.id === id);
                          resMut
                            .markNoShow(id)
                            .then(() =>
                              toast.info(`${res?.guestName ?? 'Guest'} marked as no-show`),
                            )
                            .catch((e: unknown) =>
                              toast.error(
                                e instanceof Error ? e.message : 'Failed to mark no-show',
                              ),
                            );
                        }}
                        onAdd={() => setShowNewReservation(true)}
                      />
                    </div>
                    <div className="shrink-0">
                      <RotationQueue
                        servers={rotationServers}
                        onAdvance={handleAdvanceRotation}
                        disabled={isActing}
                      />
                    </div>
                  </>
                )}

                {rightTab === 'floor' && (
                  <div className="flex-1 overflow-hidden rounded-xl bg-card border border-border shadow-sm">
                    {floorViewMode === 'layout' ? (
                      <HostLayoutView
                        onSeatTable={handleFloorSeatTable}
                        onTableAction={handleTableAction}
                      />
                    ) : floorViewMode === 'map' ? (
                      <HostFloorMap
                        tables={tables}
                        onSeatTable={handleFloorSeatTable}
                        onTableAction={handleTableAction}
                        rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
                        onSyncTables={handleSyncTables}
                        isSyncing={isSyncActing}
                        error={tablesError}
                      />
                    ) : (
                      <HostGridView
                        tables={tables}
                        onSeatTable={handleFloorSeatTable}
                        onSyncTables={handleSyncTables}
                        isSyncing={isSyncActing}
                        error={tablesError}
                      />
                    )}
                  </div>
                )}

                {rightTab === 'preshift' && (
                  <div className="flex-1 overflow-hidden rounded-xl bg-card border border-border shadow-sm p-4">
                    <PreShiftPanel data={preShiftData} isLoading={preShiftLoading} />
                  </div>
                )}

                {rightTab === 'pickup' && (
                  <div className="flex-1 overflow-hidden rounded-xl bg-card border border-border shadow-sm p-4 space-y-3">
                    <FeaturePlaceholderBlock storyId="US-HOST-PICKUP-01" />
                    <FeaturePlaceholderBlock storyId="US-HOST-PICKUP-02" compact />
                  </div>
                )}

                {rightTab === 'analytics' && (
                  <div className="flex-1 overflow-y-auto rounded-xl bg-card border border-border shadow-sm p-4">
                    <div className="flex items-center gap-1.5 mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-2">
                        Period
                      </span>
                      {[
                        { label: 'Today', days: 0 },
                        { label: '7 days', days: 6 },
                        { label: '14 days', days: 13 },
                        { label: '30 days', days: 29 },
                      ].map((range) => (
                        <button
                          key={range.days}
                          type="button"
                          onClick={() => setAnalyticsRangeDays(range.days)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            analyticsRangeDays === range.days
                              ? 'bg-indigo-500/10 text-indigo-400 shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                    <WaitlistAnalytics analytics={analytics} isLoading={analyticsLoading} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Dialogs ───────────────────────────────────── */}
      <AddGuestDialog
        open={showAddGuest}
        onClose={() => { setShowAddGuest(false); waitlistMut.clearError(); }}
        onSubmit={handleAddGuest}
        waitEstimate={estimate}
        isSubmitting={waitlistMut.isAdding}
        error={waitlistMut.error}
      />

      <NewReservationDialog
        open={showNewReservation}
        onClose={() => setShowNewReservation(false)}
        onSubmit={handleCreateReservation}
        isSubmitting={resMut.isCreating}
        defaultDuration={hostSettings?.reservations?.defaultDurationMinutes?.dinner ?? 90}
      />

      {seatTarget && (
        <SeatGuestDialog
          open={!!seatTarget}
          onClose={() => setSeatTarget(null)}
          onSeat={handleSeatConfirm}
          guestName={seatTarget.guestName}
          partySize={seatTarget.partySize}
          suggestedTables={suggested.map((t) => ({
            tableId: t.tableId,
            displayLabel: t.displayLabel,
            maxCapacity: t.maxCapacity,
            serverName: t.serverName,
            fitScore: t.fitScore,
            fitReason: t.fitReason,
          }))}
          allTables={allAvailable.map((t) => ({
            tableId: t.tableId,
            displayLabel: t.displayLabel,
            maxCapacity: t.maxCapacity,
            serverName: t.serverName,
            currentStatus: t.currentStatus,
          }))}
          isSeating={waitlistMut.isSeating || resMut.isCheckingIn}
        />
      )}

      {/* Assign mode seat confirmation */}
      {assignSeatTable && selectedParty && (
        <SeatConfirmDialog
          open={!!assignSeatTable}
          onClose={() => setAssignSeatTable(null)}
          onConfirm={handleAssignConfirm}
          isSeating={isAssignSeating}
          party={{
            guestName: selectedParty.guestName,
            partySize: selectedParty.partySize,
            type: selectedParty.type,
          }}
          table={{
            tableNumber: assignSeatTable.tableNumber,
            capacity: assignSeatTable.capacity,
            sectionName: assignSeatTable.sectionName,
            serverName: assignSeatTable.serverName,
          }}
        />
      )}

      {/* Edit Guest Dialog */}
      {editEntry && (
        <EditGuestDialog
          open={!!editEntry}
          onClose={() => { setEditEntryId(null); waitlistMut.clearError(); }}
          onSubmit={async (changes) => {
            await waitlistMut.updateEntry({ id: editEntry.id, ...changes });
            toast.success(`${editEntry.guestName} updated`);
            setEditEntryId(null);
          }}
          entry={editEntry}
          isSubmitting={waitlistMut.isUpdating}
          error={waitlistMut.error}
        />
      )}

      {/* Notification Center (slide-out panel) */}
      <NotificationCenter
        open={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={sentNotifications}
        incoming={[]}
      />

      {/* Notification Composer */}
      <NotificationComposer
        open={!!notifyTarget}
        onClose={() => setNotifyTarget(null)}
        recipientName={notifyTarget?.guestName ?? ''}
        recipientPhone={notifyTarget?.guestPhone ?? ''}
        templateMessage={
          notifyTarget
            ? `Hi ${notifyTarget.guestName}, your table is ready! Please head to the host stand.`
            : ''
        }
        onSend={async (message) => {
          if (!notifyTarget) return;
          await waitlistMut.notifyGuest({ id: notifyTarget.id });
          setSentNotifications((prev) => [
            {
              id: `notif-${Date.now()}`,
              recipientName: notifyTarget.guestName,
              recipientPhone: notifyTarget.guestPhone,
              type: 'table_ready' as const,
              status: 'sent' as const,
              sentAt: new Date().toISOString(),
              message,
            },
            ...prev,
          ]);
          toast.success(`Table-ready notification sent to ${notifyTarget.guestName}`);
        }}
        smsConfigured
      />

      {/* QR Code Display */}
      <QrCodeDisplay
        open={showQrCode}
        onClose={() => setShowQrCode(false)}
        venueName={locations[0]?.name ?? 'Venue'}
        slug={waitlistQr?.slug || tenant?.slug || 'waitlist'}
        branding={waitlistQr?.branding}
      />

      {/* Host Settings Slide-Out */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowSettings(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-lg bg-card border-l border-border shadow-xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-card border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Host Settings</h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                aria-label="Close settings"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <HostSettingsPanel locationId={locationId} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HostContent() {
  return (
    <AssignModeProvider>
      <HostContentInner />
    </AssignModeProvider>
  );
}
