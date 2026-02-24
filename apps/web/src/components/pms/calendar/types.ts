/** Shared calendar types used across all calendar sub-components. */

export interface CalendarRoom {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
}

export interface CalendarSegment {
  roomId: string;
  businessDate: string;
  reservationId: string;
  status: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  sourceType: string;
  colorKey: string;
  confirmationNumber: string | null;
  nightlyRateCents: number;
  adults: number;
  children: number;
  internalNotes: string | null;
  version: number;
}

export interface OooBlock {
  roomId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface OccupancyByDate {
  occupied: number;
  available: number;
  arrivals: number;
  departures: number;
}

export interface UnassignedReservation {
  reservationId: string;
  status: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  roomTypeName: string;
  sourceType: string;
}

export interface CalendarWeekData {
  startDate: string;
  endDate: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  unassigned: UnassignedReservation[];
  meta: {
    totalRooms: number;
    occupancyByDate: Record<string, OccupancyByDate>;
    lastUpdatedAt: string;
  };
}

export interface CalendarDayData {
  date: string;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  oooBlocks: OooBlock[];
  occupancy: OccupancyByDate | null;
  unassigned: UnassignedReservation[];
}

export type ViewRange = 7 | 14 | 30;

export interface CalendarFilters {
  roomTypes: Set<string>;
  floors: Set<string>;
  statuses: Set<string>;
  sources: Set<string>;
  search: string;
}

export const EMPTY_FILTERS: CalendarFilters = {
  roomTypes: new Set(),
  floors: new Set(),
  statuses: new Set(),
  sources: new Set(),
  search: '',
};

export const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-indigo-500 text-white',
  CHECKED_IN: 'bg-blue-500 text-white',
  HOLD: 'bg-amber-400 text-gray-900',
  NO_SHOW: 'bg-red-500 text-white',
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-indigo-500',
  CHECKED_IN: 'bg-blue-500',
  HOLD: 'bg-amber-400',
  NO_SHOW: 'bg-red-500',
};

export const ROOM_STATUS_COLORS: Record<string, string> = {
  VACANT_CLEAN: 'bg-green-500',
  VACANT_DIRTY: 'bg-yellow-500',
  OCCUPIED: 'bg-blue-500',
  OUT_OF_ORDER: 'bg-red-500',
};

export const ROOM_STATUS_LABELS: Record<string, string> = {
  VACANT_CLEAN: 'Clean',
  VACANT_DIRTY: 'Dirty',
  OCCUPIED: 'Occupied',
  OUT_OF_ORDER: 'OOO',
};

export const SOURCE_ICONS: Record<string, string> = {
  DIRECT: 'D',
  OTA: 'O',
  PHONE: 'P',
  WALKIN: 'W',
  BOOKING_ENGINE: 'B',
};

// ── Date helpers ────────────────────────────────────────────────

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatWeekRange(start: Date, range: ViewRange): string {
  const end = new Date(start);
  end.setDate(end.getDate() + range - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

export function getDateRange(start: Date, count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00`);
  const b = new Date(`${checkOut}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
