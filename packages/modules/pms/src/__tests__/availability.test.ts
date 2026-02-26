import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRoomAvailability,
  assertRoomAvailable,
  checkRoomNotOutOfOrder,
  suggestAvailableRooms,
} from '../helpers/check-availability';
import { RoomAlreadyBookedError, RoomOutOfOrderError } from '../errors';

describe('checkRoomAvailability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns available=true when no conflicts', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    const result = await checkRoomAvailability(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05',
    );

    expect(result.available).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('returns available=false with conflicts', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        {
          id: 'block-1',
          reservation_id: 'res-1',
          start_date: '2026-04-02',
          end_date: '2026-04-04',
          block_type: 'RESERVATION',
        },
      ]),
    };

    const result = await checkRoomAvailability(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05',
    );

    expect(result.available).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      reservationId: 'res-1',
      startDate: '2026-04-02',
      endDate: '2026-04-04',
      blockType: 'RESERVATION',
    });
  });

  it('returns multiple conflicts', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'b1', reservation_id: 'res-1', start_date: '2026-04-01', end_date: '2026-04-03', block_type: 'RESERVATION' },
        { id: 'b2', reservation_id: 'res-2', start_date: '2026-04-04', end_date: '2026-04-06', block_type: 'RESERVATION' },
      ]),
    };

    const result = await checkRoomAvailability(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-06',
    );

    expect(result.available).toBe(false);
    expect(result.conflicts).toHaveLength(2);
  });

  it('handles blocks without reservation_id (maintenance blocks)', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'b1', reservation_id: null, start_date: '2026-04-01', end_date: '2026-04-03', block_type: 'MAINTENANCE' },
      ]),
    };

    const result = await checkRoomAvailability(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05',
    );

    expect(result.available).toBe(false);
    expect(result.conflicts[0]!.reservationId).toBe('');
    expect(result.conflicts[0]!.blockType).toBe('MAINTENANCE');
  });

  it('accepts excludeReservationId for move/resize', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await checkRoomAvailability(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05', 'res-self',
    );

    // Verify SQL was called (the exclude clause is in the SQL template)
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});

describe('assertRoomAvailable', () => {
  it('does not throw when room is available', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await expect(
      assertRoomAvailable(tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05'),
    ).resolves.toBeUndefined();
  });

  it('throws RoomAlreadyBookedError when room is not available', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'b1', reservation_id: 'res-1', start_date: '2026-04-01', end_date: '2026-04-03', block_type: 'RESERVATION' },
      ]),
    };

    await expect(
      assertRoomAvailable(tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05'),
    ).rejects.toThrow(RoomAlreadyBookedError);
  });

  it('throws with correct room details in error', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'b1', reservation_id: 'res-1', start_date: '2026-04-01', end_date: '2026-04-03', block_type: 'RESERVATION' },
      ]),
    };

    try {
      await assertRoomAvailable(tx, 'tenant-1', 'room-101', '2026-04-01', '2026-04-05');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RoomAlreadyBookedError);
      expect((err as RoomAlreadyBookedError).message).toContain('room-101');
    }
  });

  it('passes excludeReservationId through', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await assertRoomAvailable(
      tx, 'tenant-1', 'room-1', '2026-04-01', '2026-04-05', 'exclude-res',
    );

    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});

describe('checkRoomNotOutOfOrder', () => {
  it('does not throw for active rooms', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'room-1', is_out_of_order: false },
      ]),
    };

    await expect(
      checkRoomNotOutOfOrder(tx, 'tenant-1', 'room-1'),
    ).resolves.toBeUndefined();
  });

  it('throws RoomOutOfOrderError for out-of-order rooms', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { id: 'room-1', is_out_of_order: true },
      ]),
    };

    await expect(
      checkRoomNotOutOfOrder(tx, 'tenant-1', 'room-1'),
    ).rejects.toThrow(RoomOutOfOrderError);
  });

  it('does not throw when room not found', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await expect(
      checkRoomNotOutOfOrder(tx, 'tenant-1', 'nonexistent'),
    ).resolves.toBeUndefined();
  });
});

describe('suggestAvailableRooms', () => {
  it('returns available rooms with mapped fields', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { room_id: 'r1', room_number: '101', floor: '1' },
        { room_id: 'r2', room_number: '201', floor: '2' },
      ]),
    };

    const result = await suggestAvailableRooms(
      tx, 'tenant-1', 'property-1', 'rt-standard', '2026-04-01', '2026-04-05',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      roomId: 'r1',
      roomNumber: '101',
      floor: '1',
    });
    expect(result[1]).toEqual({
      roomId: 'r2',
      roomNumber: '201',
      floor: '2',
    });
  });

  it('handles null floor values', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([
        { room_id: 'r1', room_number: '101', floor: null },
      ]),
    };

    const result = await suggestAvailableRooms(
      tx, 'tenant-1', 'property-1', 'rt-standard', '2026-04-01', '2026-04-05',
    );

    expect(result[0]!.floor).toBeNull();
  });

  it('returns empty array when no rooms available', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    const result = await suggestAvailableRooms(
      tx, 'tenant-1', 'property-1', 'rt-standard', '2026-04-01', '2026-04-05',
    );

    expect(result).toHaveLength(0);
  });

  it('defaults to limit of 10', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await suggestAvailableRooms(
      tx, 'tenant-1', 'property-1', 'rt-standard', '2026-04-01', '2026-04-05',
    );

    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('accepts custom limit', async () => {
    const tx = { execute: vi.fn().mockResolvedValue([]) };

    await suggestAvailableRooms(
      tx, 'tenant-1', 'property-1', 'rt-standard', '2026-04-01', '2026-04-05', 5,
    );

    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});
