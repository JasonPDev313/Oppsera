'use client';

import { useState, useCallback } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import {
  useHostDashboard,
  useWaitTimeEstimate,
  useTableAvailability,
  useWaitlistMutations,
  useReservationMutations,
} from '@/hooks/use-fnb-host';
import { StatsBar } from '@/components/fnb/host/StatsBar';
import { WaitlistPanel } from '@/components/fnb/host/WaitlistPanel';
import { ReservationTimeline } from '@/components/fnb/host/ReservationTimeline';
import { RotationQueue } from '@/components/fnb/host/RotationQueue';
import { AddGuestDialog } from '@/components/fnb/host/AddGuestDialog';
import { NewReservationDialog } from '@/components/fnb/host/NewReservationDialog';
import { SeatGuestDialog } from '@/components/fnb/host/SeatGuestDialog';
import { useSectionActions } from '@/hooks/use-fnb-manager';
import { Users, ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HostContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

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

  // ── Wait estimate for add-guest dialog ──────────────
  const { estimate } = useWaitTimeEstimate(
    showAddGuest ? locationId : null,
    2,
    today,
  );

  // ── Table availability for seating dialog ───────────
  const {
    suggested,
    allAvailable,
  } = useTableAvailability(
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

  // ── Server rotation data ────────────────────────────
  const rotationServers = servers.map((s) => ({
    id: s.serverUserId,
    name: s.serverName ?? 'Unknown',
    coverCount: s.coversServed,
    isNext: s.isNext,
  }));

  return (
    <div
      className="h-[calc(100vh-64px)] flex flex-col"
      style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
    >
      {/* ── Header ────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/pos/fnb')}
            className="flex items-center justify-center rounded-lg h-9 w-9 transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Users
              className="h-5 w-5"
              style={{ color: 'var(--fnb-status-seated)' }}
            />
            <h1
              className="text-lg font-bold"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              Host Stand
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="flex items-center justify-center rounded-lg h-9 w-9 transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => router.push('/settings/merchant-services')}
            className="flex items-center justify-center rounded-lg h-9 w-9 transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Stats Bar ─────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3">
        <StatsBar stats={stats} tableSummary={tableSummary} />
      </div>

      {/* ── Main Content: Split Layout ────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Waitlist */}
        <div
          className="w-1/2 border-r overflow-y-auto p-4"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          <WaitlistPanel
            entries={waitlist}
            onSeat={handleSeatFromWaitlist}
            onNotify={(id) => waitlistMut.notifyGuest({ id })}
            onRemove={(id) => waitlistMut.removeGuest({ id })}
            onAdd={() => setShowAddGuest(true)}
          />
        </div>

        {/* Right: Reservations + Server Rotation */}
        <div className="w-1/2 overflow-y-auto p-4 space-y-4">
          <ReservationTimeline
            reservations={reservations}
            onCheckIn={handleCheckInReservation}
            onCancel={(id) => resMut.cancelReservation({ id })}
            onNoShow={(id) => resMut.markNoShow(id)}
            onAdd={() => setShowNewReservation(true)}
          />

          <RotationQueue
            servers={rotationServers}
            onAdvance={handleAdvanceRotation}
            disabled={isActing}
          />
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
        defaultDuration={90}
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
    </div>
  );
}
