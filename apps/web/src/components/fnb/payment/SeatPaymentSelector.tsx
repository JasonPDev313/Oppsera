'use client';

import { useState, useMemo } from 'react';
import { formatCents } from '@oppsera/shared';
import type { FnbTabLine } from '@/types/fnb';
import type { CheckSummary } from '@/types/fnb';
import { CheckCircle, Users, ArrowRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

export interface SeatTotal {
  seatNumber: number;
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Item names for display (e.g., "Burger, Fries, Coke") */
  itemSummary: string;
}

interface SeatPaymentSelectorProps {
  lines: FnbTabLine[];
  check: CheckSummary;
  partySize: number;
  paidSeats: number[];
  onConfirm: (selectedSeats: number[], totalCents: number) => void;
  onBack: () => void;
  disabled?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Compute per-seat totals from tab lines, proportionally allocating tax/discount/service charge */
export function computeSeatTotals(
  lines: FnbTabLine[],
  check: CheckSummary,
  partySize: number,
): SeatTotal[] {
  const activeLines = lines.filter((l) => l.status !== 'voided');

  // Group by seat number — lines without a seat default to seat 1
  const bySeat = new Map<number, FnbTabLine[]>();
  for (const line of activeLines) {
    const seat = line.seatNumber ?? 1;
    const group = bySeat.get(seat) ?? [];
    group.push(line);
    bySeat.set(seat, group);
  }

  // Include all seats up to partySize even if empty
  for (let s = 1; s <= Math.max(partySize, 1); s++) {
    if (!bySeat.has(s)) bySeat.set(s, []);
  }

  const totalSubtotal = check.subtotalCents;
  const seats: SeatTotal[] = [];
  let allocatedTax = 0;
  let allocatedDiscount = 0;
  let allocatedServiceCharge = 0;
  const seatNumbers = Array.from(bySeat.keys()).sort((a, b) => a - b);

  // Find last seat that actually has items (for rounding remainder)
  const lastSeatWithItems = [...seatNumbers].reverse().find((sn) => {
    const seatLines = bySeat.get(sn)!;
    return seatLines.length > 0;
  });

  for (let i = 0; i < seatNumbers.length; i++) {
    const seatNum = seatNumbers[i]!;
    const seatLines = bySeat.get(seatNum)!;
    const subtotal = seatLines.reduce((sum, l) => sum + l.extendedPriceCents, 0);
    const itemCount = seatLines.reduce((sum, l) => sum + l.qty, 0);
    const hasItems = seatLines.length > 0;
    const isLastWithItems = seatNum === lastSeatWithItems;

    // Build human-readable item summary
    const itemSummary = seatLines
      .map((l) => {
        const name = l.catalogItemName ?? 'Item';
        return l.qty > 1 ? `${l.qty}x ${name}` : name;
      })
      .join(', ');

    // Proportional allocation — last seat WITH items gets the remainder to avoid rounding drift.
    // Empty seats get zero tax/discount/service charge regardless of position.
    // Skip allocation entirely when subtotal is zero (nothing to split).
    let tax = 0;
    let discount = 0;
    let serviceCharge = 0;

    if (hasItems && totalSubtotal > 0) {
      if (isLastWithItems) {
        tax = check.taxTotalCents - allocatedTax;
        discount = check.discountTotalCents - allocatedDiscount;
        serviceCharge = check.serviceChargeTotalCents - allocatedServiceCharge;
      } else {
        const share = subtotal / totalSubtotal;
        tax = Math.round(check.taxTotalCents * share);
        discount = Math.round(check.discountTotalCents * share);
        serviceCharge = Math.round(check.serviceChargeTotalCents * share);
        allocatedTax += tax;
        allocatedDiscount += discount;
        allocatedServiceCharge += serviceCharge;
      }
    }

    // Seat total: subtotal + tax + service charge - discount
    const seatTotal = subtotal + tax + serviceCharge - discount;

    seats.push({
      seatNumber: seatNum,
      itemCount,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: Math.max(0, seatTotal),
      itemSummary,
    });
  }

  return seats;
}

// ── Component ────────────────────────────────────────────────────

export function SeatPaymentSelector({
  lines,
  check,
  partySize,
  paidSeats,
  onConfirm,
  onBack,
  disabled,
}: SeatPaymentSelectorProps) {
  const seatTotals = useMemo(
    () => computeSeatTotals(lines, check, partySize),
    [lines, check, partySize],
  );

  // Unpaid seats that have items — these are the actionable ones
  const unpaidWithItems = useMemo(
    () =>
      seatTotals
        .filter((s) => !paidSeats.includes(s.seatNumber) && s.itemCount > 0)
        .map((s) => s.seatNumber),
    [seatTotals, paidSeats],
  );

  // Default: select all unpaid seats that have items
  const [selectedSeats, setSelectedSeats] = useState<Set<number>>(
    () => new Set(unpaidWithItems),
  );

  const selectedTotal = useMemo(() => {
    return seatTotals
      .filter((s) => selectedSeats.has(s.seatNumber))
      .reduce((sum, s) => sum + s.totalCents, 0);
  }, [seatTotals, selectedSeats]);

  const toggleSeat = (seatNumber: number) => {
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seatNumber)) {
        next.delete(seatNumber);
      } else {
        next.add(seatNumber);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSeats(new Set(unpaidWithItems));
  };

  const hasSelection = selectedSeats.size > 0 && selectedTotal > 0;

  // Only show seats that have items or are paid (hide truly empty seats)
  const visibleSeats = seatTotals.filter(
    (s) => s.itemCount > 0 || paidSeats.includes(s.seatNumber),
  );

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      {/* Header */}
      <div className="text-center">
        <div
          className="inline-flex items-center justify-center h-12 w-12 rounded-full mb-2"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
        >
          <Users className="h-6 w-6" style={{ color: 'var(--fnb-info)' }} />
        </div>
        <h3
          className="text-sm font-bold"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          Pay by Seat
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--fnb-text-muted)' }}>
          Tap seats to select who&apos;s paying
        </p>
      </div>

      {/* Seat cards */}
      <div className="flex flex-col gap-2">
        {visibleSeats.map((seat) => {
          const isPaid = paidSeats.includes(seat.seatNumber);
          const isSelected = selectedSeats.has(seat.seatNumber);
          const isDisabled = isPaid || disabled;

          return (
            <button
              key={seat.seatNumber}
              type="button"
              onClick={() => !isDisabled && toggleSeat(seat.seatNumber)}
              disabled={isDisabled}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-all disabled:cursor-default"
              style={{
                backgroundColor: isPaid
                  ? 'var(--fnb-payment-success-bg)'
                  : isSelected
                    ? 'var(--fnb-bg-elevated)'
                    : 'var(--fnb-bg-surface)',
                border: isSelected && !isPaid
                  ? '2px solid var(--fnb-info)'
                  : '2px solid transparent',
                opacity: isPaid ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                {/* Seat indicator */}
                <div
                  className="flex items-center justify-center rounded-lg font-bold shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    fontSize: 'calc(13px * var(--pos-font-scale, 1))',
                    backgroundColor: isPaid
                      ? 'var(--fnb-status-available)'
                      : isSelected
                        ? 'var(--fnb-info)'
                        : 'var(--fnb-bg-elevated)',
                    color: isPaid || isSelected ? '#fff' : 'var(--fnb-text-secondary)',
                  }}
                >
                  {isPaid ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    `S${seat.seatNumber}`
                  )}
                </div>

                <div className="text-left min-w-0">
                  <div
                    className="text-xs font-bold"
                    style={{ color: 'var(--fnb-text-primary)' }}
                  >
                    Seat {seat.seatNumber}
                    {isPaid && (
                      <span
                        className="ml-1.5 text-[10px] font-medium"
                        style={{ color: 'var(--fnb-status-available)' }}
                      >
                        Paid
                      </span>
                    )}
                  </div>
                  {/* Item names — gives server confidence they're paying for the right seat */}
                  <div
                    className="text-[10px] truncate max-w-45"
                    style={{ color: 'var(--fnb-text-muted)' }}
                    title={seat.itemSummary}
                  >
                    {seat.itemSummary || 'No items'}
                  </div>
                </div>
              </div>

              {/* Amount */}
              {seat.itemCount > 0 && (
                <span
                  className="text-sm font-mono font-bold shrink-0 ml-2"
                  style={{
                    color: isPaid
                      ? 'var(--fnb-status-available)'
                      : 'var(--fnb-text-primary)',
                    fontFamily: 'var(--fnb-font-mono)',
                  }}
                >
                  {formatCents(seat.totalCents)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Select all / Deselect all shortcut */}
      {unpaidWithItems.length > 1 && (
        <button
          type="button"
          onClick={() => {
            if (selectedSeats.size === unpaidWithItems.length) {
              setSelectedSeats(new Set());
            } else {
              selectAll();
            }
          }}
          disabled={disabled}
          className="text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ color: 'var(--fnb-info)' }}
        >
          {selectedSeats.size === unpaidWithItems.length ? 'Deselect All' : 'Select All Seats'}
        </button>
      )}

      {/* Selected total */}
      <div
        className="rounded-xl p-4 text-center"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        {hasSelection ? (
          <>
            <div
              className="text-[10px] font-bold uppercase mb-1"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              {selectedSeats.size === 1 ? 'Seat Total' : `${selectedSeats.size} Seats Total`}
            </div>
            <div
              className="font-mono font-black"
              style={{
                fontSize: 'calc(2rem * var(--pos-font-scale, 1))',
                lineHeight: 1,
                color: 'var(--fnb-accent-primary, var(--fnb-info))',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {formatCents(selectedTotal)}
            </div>
          </>
        ) : (
          <div
            className="text-xs font-medium py-2"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            Tap a seat to select it
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="flex-1 rounded-lg py-3 text-sm font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(Array.from(selectedSeats).sort((a, b) => a - b), selectedTotal)}
          disabled={!hasSelection || disabled}
          className="flex-2 flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-action-pay)' }}
        >
          <ArrowRight className="h-4 w-4" />
          {hasSelection
            ? `Pay for Seat${selectedSeats.size > 1 ? `s ${Array.from(selectedSeats).sort((a, b) => a - b).join(', ')}` : ` ${Array.from(selectedSeats)[0]}`}`
            : 'Select Seats'}
        </button>
      </div>
    </div>
  );
}
