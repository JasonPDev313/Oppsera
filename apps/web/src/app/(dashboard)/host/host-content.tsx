'use client';

import '@/styles/fnb-design-tokens.css';

import { useState, useCallback } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import {
  useHostDashboard,
  useHostTables,
  useHostSettings,
  useWaitTimeEstimate,
  useTableAvailability,
  useWaitlistMutations,
  useReservationMutations,
  usePreShift,
} from '@/hooks/use-fnb-host';
import { StatsBar } from '@/components/fnb/host/StatsBar';
import { WaitlistPanel } from '@/components/fnb/host/WaitlistPanel';
import { ReservationTimeline } from '@/components/fnb/host/ReservationTimeline';
import { RotationQueue } from '@/components/fnb/host/RotationQueue';
import { PreShiftPanel } from '@/components/fnb/host/PreShiftPanel';
import { HostFloorMap } from '@/components/fnb/host/HostFloorMap';
import { HostGridView } from '@/components/fnb/host/HostGridView';
import { AddGuestDialog } from '@/components/fnb/host/AddGuestDialog';
import { NewReservationDialog } from '@/components/fnb/host/NewReservationDialog';
import { SeatGuestDialog } from '@/components/fnb/host/SeatGuestDialog';
import { SeatConfirmDialog } from '@/components/fnb/host/SeatConfirmDialog';
import { NotificationCenter } from '@/components/fnb/host/NotificationCenter';
import { NotificationComposer } from '@/components/fnb/host/NotificationComposer';
import { QrCodeDisplay } from '@/components/fnb/host/QrCodeDisplay';
import { AssignModeProvider, useAssignMode } from '@/components/fnb/host/AssignModeContext';
import HostSettingsPanel from '@/components/host/HostSettingsPanel';
import { useSectionActions } from '@/hooks/use-fnb-manager';
import { FeaturePlaceholderBlock, FeatureBadge } from '@/components/fnb/host/FeaturePlaceholder';
import {
  Users,
  ArrowLeft,
  RefreshCw,
  Settings,
  LayoutGrid,
  List,
  ClipboardList,
  Bell,
  QrCode,
  ShoppingBag,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type RightPanelTab = 'reservations' | 'floor' | 'preshift' | 'pickup';
type FloorViewMode = 'map' | 'grid';

function HostContentInner() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

  // ── Assign mode ────────────────────────────────────
  const { selectedParty, assignMode, cancelAssign } = useAssignMode();

  // ── UI State ─────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightPanelTab>('reservations');
  const [floorViewMode, setFloorViewMode] = useState<FloorViewMode>('map');

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

  const { tables } = useHostTables(locationId);
  const { settings: hostSettings } = useHostSettings(locationId);
  const { data: preShiftData, isLoading: preShiftLoading } = usePreShift(
    rightTab === 'preshift' ? locationId : null,
  );

  const { advanceRotation, isActing } = useSectionActions();

  // ── Dialogs ─────────────────────────────────────────
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [seatTarget, setSeatTarget] = useState<{
    id: string;
    guestName: string;
    partySize: number;
    type: 'waitlist' | 'reservation';
  } | null>(null);

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
      setShowAddGuest(false);
    },
    [waitlistMut],
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
      if (seatTarget.type === 'waitlist') {
        await waitlistMut.seatGuest({ id: seatTarget.id, tableId });
      } else {
        await resMut.checkIn({ id: seatTarget.id, tableId });
      }
      setSeatTarget(null);
    },
    [seatTarget, waitlistMut, resMut],
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
      setAssignSeatTable(null);
      cancelAssign();
    } finally {
      setIsAssignSeating(false);
    }
  }, [selectedParty, assignSeatTable, waitlistMut, resMut, cancelAssign]);

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
              <Users className="h-[18px] w-[18px] text-indigo-600" />
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
            <RefreshCw className={`h-[18px] w-[18px] ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowQrCode(true)}
            aria-label="Show QR code"
            className={iconBtnCls}
          >
            <QrCode className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            aria-label={`Notifications${sentNotifications.length > 0 ? ` (${sentNotifications.length})` : ''}`}
            className={`relative ${iconBtnCls}`}
          >
            <Bell className="h-[18px] w-[18px]" />
            {sentNotifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full text-[9px] font-bold px-1 bg-red-500 text-white">
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
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* ── Stats Bar ─────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-3 pb-1">
        <StatsBar stats={stats} tableSummary={tableSummary} />
      </div>

      {/* ── Main Content (42/58 split) ──────────────── */}
      <div className="flex-1 overflow-hidden grid grid-cols-[42fr_58fr] gap-3 px-4 pb-3 pt-2">
        {/* Left: Waitlist */}
        <div className="min-w-0 overflow-hidden flex flex-col">
          <WaitlistPanel
            entries={waitlist}
            onSeat={handleSeatFromWaitlist}
            onNotify={(id) => {
              const entry = waitlist.find((w) => w.id === id);
              if (entry) {
                setNotifyTarget({
                  id,
                  guestName: entry.guestName,
                  guestPhone: entry.guestPhone ?? '',
                });
              } else {
                waitlistMut.notifyGuest({ id });
              }
            }}
            onRemove={(id) => waitlistMut.removeGuest({ id })}
            onAdd={() => setShowAddGuest(true)}
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
                  onClick={() => setFloorViewMode('map')}
                  aria-label="Map view"
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
                    onCancel={(id) => resMut.cancelReservation({ id })}
                    onNoShow={(id) => resMut.markNoShow(id)}
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
                {floorViewMode === 'map' ? (
                  <HostFloorMap
                    tables={tables}
                    onSeatTable={handleFloorSeatTable}
                    onTableAction={handleTableAction}
                  />
                ) : (
                  <HostGridView
                    tables={tables}
                    onSeatTable={handleFloorSeatTable}
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
          </div>
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────── */}
      <AddGuestDialog
        open={showAddGuest}
        onClose={() => setShowAddGuest(false)}
        onSubmit={handleAddGuest}
        waitEstimate={estimate}
        isSubmitting={waitlistMut.isAdding}
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
        }}
        smsConfigured
      />

      {/* QR Code Display */}
      <QrCodeDisplay
        open={showQrCode}
        onClose={() => setShowQrCode(false)}
        locationId={locationId}
        venueName={locations[0]?.name ?? 'Venue'}
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
