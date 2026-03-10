'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  BedDouble,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Printer,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Select } from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface TimePeriodValue {
  today: number;
  ptd: number;
  ytd: number;
}

interface ManagersReport {
  businessDate: string;
  propertyName: string;
  revenue: {
    roomRevenueCents: TimePeriodValue;
    otherRevenueCents: TimePeriodValue;
    adjustmentsCents: TimePeriodValue;
    totalNetRevenueCents: TimePeriodValue;
    taxesCents: TimePeriodValue;
    feesCents: TimePeriodValue;
  };
  payments: {
    paymentsCents: TimePeriodValue;
    refundsCents: TimePeriodValue;
    netPaymentsCents: TimePeriodValue;
  };
  roomInventory: {
    totalRooms: number;
    vacantRooms: number;
    occupiedRooms: number;
    groupRoomsOccupied: number;
    outOfOrderRooms: number;
  };
  guestActivity: {
    arrivals: TimePeriodValue;
    walkInArrivals: TimePeriodValue;
    groupArrivals: TimePeriodValue;
    departures: TimePeriodValue;
    stayovers: number;
    noShows: TimePeriodValue;
    cancellations: TimePeriodValue;
  };
  statistics: {
    roomsSold: TimePeriodValue;
    occupancyPct: TimePeriodValue;
    occupancyPctWithoutOoo: TimePeriodValue;
    adrCents: TimePeriodValue;
    revParCents: TimePeriodValue;
    avgLos: TimePeriodValue;
  };
  forecast: Array<{
    date: string;
    arrivals: number;
    departures: number;
    stayovers: number;
    roomsSold: number;
    occupancyPct: number;
    adrCents: number;
    revParCents: number;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCents(cents: number | null | undefined): string {
  const v = Number(cents) || 0;
  return (v / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatPct(pct: number | null | undefined): string {
  const v = Number(pct) || 0;
  return `${v.toFixed(2)}%`;
}

function formatNum(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

function formatLos(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Row renderers ────────────────────────────────────────────────
// Each row: Section? | Label | Today | PTD | YTD

const TD_VAL = 'whitespace-nowrap px-4 py-1.5 text-right text-sm tabular-nums text-foreground print:text-gray-900';
const TD_VAL_BOLD = 'whitespace-nowrap px-4 py-1.5 text-right text-sm tabular-nums font-semibold text-foreground print:text-gray-900';
const TD_LABEL = 'px-4 py-1.5 text-sm text-foreground print:text-gray-900';
const TD_LABEL_BOLD = 'px-4 py-1.5 text-sm font-semibold text-foreground print:text-gray-900';
const TD_SECTION = 'px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground align-top print:text-gray-600';

interface RowDef {
  section?: string;
  sectionSpan?: number;
  label: string;
  today: string;
  ptd: string;
  ytd: string;
  bold?: boolean;
  divider?: boolean; // thicker border above
}

function ReportRow({ row }: { row: RowDef }) {
  const valCls = row.bold ? TD_VAL_BOLD : TD_VAL;
  const labelCls = row.bold ? TD_LABEL_BOLD : TD_LABEL;
  return (
    <tr className={`border-b border-border/40 print:border-gray-200 ${row.divider ? 'border-t-2 border-t-border print:border-t-gray-400' : ''}`}>
      {row.section !== undefined && (
        <td className={TD_SECTION} rowSpan={row.sectionSpan}>
          {row.section}
        </td>
      )}
      <td className={labelCls}>{row.label}</td>
      <td className={valCls}>{row.today}</td>
      <td className={valCls}>{row.ptd}</td>
      <td className={valCls}>{row.ytd}</td>
    </tr>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground print:text-gray-600">{label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground print:text-gray-900">{value}</p>
          {sub && <p className="text-xs tabular-nums text-muted-foreground print:text-gray-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Report Table ────────────────────────────────────────────

function ManagersReportTable({ data }: { data: ManagersReport }) {
  const { revenue, payments, roomInventory, guestActivity, statistics } = data;

  // Build rows array with section grouping
  const moneyTpv = (v: TimePeriodValue) => [formatCents(v.today), formatCents(v.ptd), formatCents(v.ytd)] as const;
  const countTpv = (v: TimePeriodValue) => [formatNum(v.today), formatNum(v.ptd), formatNum(v.ytd)] as const;
  const pctTpv = (v: TimePeriodValue) => [formatPct(v.today), formatPct(v.ptd), formatPct(v.ytd)] as const;
  const losTpv = (v: TimePeriodValue) => [formatLos(v.today), formatLos(v.ptd), formatLos(v.ytd)] as const;

  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
      <table className="min-w-full print:text-xs">
        <thead className="bg-muted print:bg-gray-100">
          <tr>
            <th className="w-28 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600" />
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600" />
            <th className="w-32 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
              Today
            </th>
            <th className="w-32 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
              Period to Date
            </th>
            <th className="w-32 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
              Year to Date
            </th>
          </tr>
        </thead>
        <tbody>
          {/* ── Revenue ─────────────────────────────────────── */}
          <ReportRow row={{ section: 'Revenue', sectionSpan: 6, label: 'Room Revenue', today: moneyTpv(revenue.roomRevenueCents)[0], ptd: moneyTpv(revenue.roomRevenueCents)[1], ytd: moneyTpv(revenue.roomRevenueCents)[2] }} />
          <ReportRow row={{ label: 'Other Revenue', today: moneyTpv(revenue.otherRevenueCents)[0], ptd: moneyTpv(revenue.otherRevenueCents)[1], ytd: moneyTpv(revenue.otherRevenueCents)[2] }} />
          <ReportRow row={{ label: 'Adjustments', today: moneyTpv(revenue.adjustmentsCents)[0], ptd: moneyTpv(revenue.adjustmentsCents)[1], ytd: moneyTpv(revenue.adjustmentsCents)[2] }} />
          <ReportRow row={{ label: 'Total Net Revenue', ...spread3(moneyTpv(revenue.totalNetRevenueCents)), bold: true }} />
          <ReportRow row={{ label: 'Total Taxes', ...spread3(moneyTpv(revenue.taxesCents)) }} />
          <ReportRow row={{ label: 'Total Fees', ...spread3(moneyTpv(revenue.feesCents)) }} />

          {/* ── Payments ────────────────────────────────────── */}
          <ReportRow row={{ section: 'Payment', sectionSpan: 3, label: 'Payments Received', ...spread3(moneyTpv(payments.paymentsCents)), divider: true }} />
          <ReportRow row={{ label: 'Refunds', ...spread3(moneyTpv(payments.refundsCents)) }} />
          <ReportRow row={{ label: 'Net Payments', ...spread3(moneyTpv(payments.netPaymentsCents)), bold: true }} />

          {/* ── Room Inventory (point-in-time, today col only) */}
          <ReportRow row={{ section: 'Room\nInventory', sectionSpan: 5, label: 'Total Rooms', today: formatNum(roomInventory.totalRooms), ptd: '', ytd: '', divider: true }} />
          <ReportRow row={{ label: 'Vacant Rooms', today: formatNum(roomInventory.vacantRooms), ptd: '', ytd: '' }} />
          <ReportRow row={{ label: 'Total Occupied Rooms', today: formatNum(roomInventory.occupiedRooms), ptd: '', ytd: '' }} />
          <ReportRow row={{ label: 'Group Rooms Occupied', today: formatNum(roomInventory.groupRoomsOccupied), ptd: '', ytd: '' }} />
          <ReportRow row={{ label: 'Out of Order Rooms', today: formatNum(roomInventory.outOfOrderRooms), ptd: '', ytd: '' }} />

          {/* ── Guest Activity ──────────────────────────────── */}
          <ReportRow row={{ section: 'Guest\nActivity', sectionSpan: 7, label: 'Arrivals', ...spread3(countTpv(guestActivity.arrivals)), divider: true }} />
          <ReportRow row={{ label: 'Walk-In Arrivals', ...spread3(countTpv(guestActivity.walkInArrivals)) }} />
          <ReportRow row={{ label: 'Group Arrivals', ...spread3(countTpv(guestActivity.groupArrivals)) }} />
          <ReportRow row={{ label: 'Departures', ...spread3(countTpv(guestActivity.departures)) }} />
          <tr className="border-b border-border/40 print:border-gray-200">
            <td className={TD_LABEL}>Stayovers</td>
            <td className={TD_VAL}>{formatNum(guestActivity.stayovers)}</td>
            <td className={`${TD_VAL} text-muted-foreground`}>&mdash;</td>
            <td className={`${TD_VAL} text-muted-foreground`}>&mdash;</td>
          </tr>
          <ReportRow row={{ label: 'No Shows', ...spread3(countTpv(guestActivity.noShows)) }} />
          <ReportRow row={{ label: 'Cancellations', ...spread3(countTpv(guestActivity.cancellations)) }} />

          {/* ── Statistics ──────────────────────────────────── */}
          <ReportRow row={{ section: 'Statistics', sectionSpan: 6, label: 'Rooms Sold', ...spread3(countTpv(statistics.roomsSold)), bold: true, divider: true }} />
          <ReportRow row={{ label: 'Occupancy %', ...spread3(pctTpv(statistics.occupancyPct)), bold: true }} />
          <ReportRow row={{ label: 'Occ % (excl. OOO)', ...spread3(pctTpv(statistics.occupancyPctWithoutOoo)) }} />
          <ReportRow row={{ label: 'ADR', ...spread3(moneyTpv(statistics.adrCents)), bold: true }} />
          <ReportRow row={{ label: 'RevPAR', ...spread3(moneyTpv(statistics.revParCents)), bold: true }} />
          <ReportRow row={{ label: 'Average LOS', ...spread3(losTpv(statistics.avgLos)) }} />
        </tbody>
      </table>
    </div>
  );
}

/** Spread a 3-tuple into { today, ptd, ytd } */
function spread3(arr: readonly [string, string, string]) {
  return { today: arr[0], ptd: arr[1], ytd: arr[2] };
}

// ── Mobile Card Layout ───────────────────────────────────────────

function MobileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface md:hidden print:hidden">
      <div className="border-b border-border bg-muted/60 px-4 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  );
}

function MobileRow({ label, today, ptd, ytd, bold }: {
  label: string; today: string; ptd: string; ytd: string; bold?: boolean;
}) {
  const cls = bold ? 'font-semibold' : '';
  return (
    <div className="grid grid-cols-4 gap-1 px-4 py-1.5">
      <span className={`text-sm text-foreground ${cls}`}>{label}</span>
      <span className={`text-right text-sm tabular-nums text-foreground ${cls}`}>{today}</span>
      <span className={`text-right text-sm tabular-nums text-foreground ${cls}`}>{ptd}</span>
      <span className={`text-right text-sm tabular-nums text-foreground ${cls}`}>{ytd}</span>
    </div>
  );
}

function MobileReport({ data }: { data: ManagersReport }) {
  const { revenue, payments, roomInventory, guestActivity, statistics } = data;
  const m = (v: TimePeriodValue) => ({ today: formatCents(v.today), ptd: formatCents(v.ptd), ytd: formatCents(v.ytd) });
  const c = (v: TimePeriodValue) => ({ today: formatNum(v.today), ptd: formatNum(v.ptd), ytd: formatNum(v.ytd) });
  const p = (v: TimePeriodValue) => ({ today: formatPct(v.today), ptd: formatPct(v.ptd), ytd: formatPct(v.ytd) });

  return (
    <div className="space-y-3 md:hidden print:hidden">
      {/* Column labels */}
      <div className="grid grid-cols-4 gap-1 px-4">
        <span />
        <span className="text-right text-xs font-medium uppercase text-muted-foreground">Today</span>
        <span className="text-right text-xs font-medium uppercase text-muted-foreground">PTD</span>
        <span className="text-right text-xs font-medium uppercase text-muted-foreground">YTD</span>
      </div>

      <MobileSection title="Revenue">
        <MobileRow label="Room Revenue" {...m(revenue.roomRevenueCents)} />
        <MobileRow label="Other Revenue" {...m(revenue.otherRevenueCents)} />
        <MobileRow label="Adjustments" {...m(revenue.adjustmentsCents)} />
        <MobileRow label="Net Revenue" {...m(revenue.totalNetRevenueCents)} bold />
        <MobileRow label="Taxes" {...m(revenue.taxesCents)} />
        <MobileRow label="Fees" {...m(revenue.feesCents)} />
      </MobileSection>

      <MobileSection title="Payment">
        <MobileRow label="Payments" {...m(payments.paymentsCents)} />
        <MobileRow label="Refunds" {...m(payments.refundsCents)} />
        <MobileRow label="Net Payments" {...m(payments.netPaymentsCents)} bold />
      </MobileSection>

      <MobileSection title="Room Inventory">
        <MobileRow label="Total Rooms" today={formatNum(roomInventory.totalRooms)} ptd="" ytd="" />
        <MobileRow label="Vacant" today={formatNum(roomInventory.vacantRooms)} ptd="" ytd="" />
        <MobileRow label="Occupied" today={formatNum(roomInventory.occupiedRooms)} ptd="" ytd="" />
        <MobileRow label="Group Occ." today={formatNum(roomInventory.groupRoomsOccupied)} ptd="" ytd="" />
        <MobileRow label="OOO" today={formatNum(roomInventory.outOfOrderRooms)} ptd="" ytd="" />
      </MobileSection>

      <MobileSection title="Guest Activity">
        <MobileRow label="Arrivals" {...c(guestActivity.arrivals)} />
        <MobileRow label="Walk-Ins" {...c(guestActivity.walkInArrivals)} />
        <MobileRow label="Group Arr." {...c(guestActivity.groupArrivals)} />
        <MobileRow label="Departures" {...c(guestActivity.departures)} />
        <MobileRow label="Stayovers" today={formatNum(guestActivity.stayovers)} ptd="\u2014" ytd="\u2014" />
        <MobileRow label="No Shows" {...c(guestActivity.noShows)} />
        <MobileRow label="Cancellations" {...c(guestActivity.cancellations)} />
      </MobileSection>

      <MobileSection title="Statistics">
        <MobileRow label="Rooms Sold" {...c(statistics.roomsSold)} bold />
        <MobileRow label="Occ %" {...p(statistics.occupancyPct)} bold />
        <MobileRow label="Occ % (no OOO)" {...p(statistics.occupancyPctWithoutOoo)} />
        <MobileRow label="ADR" {...m(statistics.adrCents)} bold />
        <MobileRow label="RevPAR" {...m(statistics.revParCents)} bold />
        <MobileRow label="Avg LOS" today={formatLos(statistics.avgLos.today)} ptd={formatLos(statistics.avgLos.ptd)} ytd={formatLos(statistics.avgLos.ytd)} />
      </MobileSection>
    </div>
  );
}

// ── Forecast Table ───────────────────────────────────────────────

function ForecastTable({ data }: { data: ManagersReport['forecast'] }) {
  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">
        Forecast
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border print:border-gray-300">
        <table className="min-w-full print:text-xs">
          <thead className="bg-muted print:bg-gray-100">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Date
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Arrivals
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Depart.
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Stay Overs
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Rooms Sold
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                Occupancy %
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                ADR
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-600">
                RevPAR
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface print:divide-gray-200">
            {data.map((day) => (
              <tr key={day.date} className="hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-foreground print:text-gray-900">
                  {formatDateShort(day.date)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{day.arrivals}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{day.departures}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{day.stayovers}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{day.roomsSold}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      day.occupancyPct >= 85
                        ? 'bg-red-500/20 text-red-500 print:bg-red-100 print:text-red-700'
                        : day.occupancyPct >= 60
                          ? 'bg-amber-500/20 text-amber-500 print:bg-amber-100 print:text-amber-700'
                          : 'bg-green-500/20 text-green-500 print:bg-green-100 print:text-green-700'
                    }`}
                  >
                    {formatPct(day.occupancyPct)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{formatCents(day.adrCents)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">{formatCents(day.revParCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface">
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
      <BedDouble className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-sm font-semibold text-foreground">No data</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function ManagersReportContent() {
  const today = useMemo(() => todayISO(), []);

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [businessDate, setBusinessDate] = useState(today);
  const [data, setData] = useState<ManagersReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load properties (mount-only)
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>(
          '/api/v1/pms/properties',
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle — user can refresh
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  // Load report data
  useEffect(() => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId, businessDate });
        const res = await apiFetch<{ data: ManagersReport }>(
          `/api/v1/pms/reports/managers-report${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setData(res.data ?? null);
          setError(null);
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setData(null);
          const msg = err instanceof Error ? err.message : 'Failed to load report';
          setError(msg);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [selectedPropertyId, businessDate, refreshKey]);

  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const handlePrint = useCallback(() => window.print(), []);

  return (
    <div className="space-y-6">
      {/* ── Screen Header ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Managers Report</h1>
            <p className="text-sm text-muted-foreground">
              Comprehensive daily property performance summary
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {properties.length > 1 && (
          <div className="w-full sm:w-56">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Property
            </label>
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
            />
          </div>
        )}
        <div className="w-full sm:w-44">
          <label htmlFor="mgr-report-date" className="mb-1 block text-xs font-medium text-muted-foreground">
            Business Date
          </label>
          <input
            id="mgr-report-date"
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      {!selectedPropertyId ? (
        <EmptyState message="Select a property to view the Managers Report." />
      ) : isLoading ? (
        <ReportSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 py-16">
          <BedDouble className="h-12 w-12 text-red-500" />
          <h3 className="mt-4 text-sm font-semibold text-foreground">Error loading report</h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : !data ? (
        <EmptyState message="No data available for this date." />
      ) : (
        <>
          {/* Print header */}
          <div className="hidden print:block print:mb-4">
            <h1 className="text-center text-xl font-bold">Managers Report</h1>
            <p className="text-center text-sm text-gray-700">{data.propertyName}</p>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>Business Date: {formatDateFull(data.businessDate)}</span>
              <span>Printed: {new Date().toLocaleString()}</span>
            </div>
          </div>

          {/* Property banner (screen) */}
          <div className="rounded-lg border border-border bg-surface px-4 py-3 print:hidden">
            <p className="text-lg font-semibold text-foreground">{data.propertyName}</p>
            <p className="text-sm text-muted-foreground">
              Business Date: {formatDateFull(data.businessDate)}
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
            <KpiCard
              label="Occupancy"
              value={formatPct(data.statistics.occupancyPct.today)}
              sub={`${data.roomInventory.occupiedRooms} / ${data.roomInventory.totalRooms} rooms`}
              color={
                data.statistics.occupancyPct.today >= 85
                  ? 'bg-red-500/20 text-red-500'
                  : data.statistics.occupancyPct.today >= 60
                    ? 'bg-amber-500/20 text-amber-500'
                    : 'bg-green-500/20 text-green-500'
              }
              icon={BedDouble}
            />
            <KpiCard
              label="ADR"
              value={formatCents(data.statistics.adrCents.today)}
              color="bg-indigo-500/20 text-indigo-500"
              icon={TrendingUp}
            />
            <KpiCard
              label="RevPAR"
              value={formatCents(data.statistics.revParCents.today)}
              color="bg-purple-500/20 text-purple-500"
              icon={DollarSign}
            />
            <KpiCard
              label="Total Net Revenue"
              value={formatCents(data.revenue.totalNetRevenueCents.today)}
              sub={`YTD ${formatCents(data.revenue.totalNetRevenueCents.ytd)}`}
              color="bg-emerald-500/20 text-emerald-500"
              icon={DollarSign}
            />
          </div>

          {/* Desktop table */}
          <ManagersReportTable data={data} />

          {/* Mobile cards */}
          <MobileReport data={data} />

          {/* Forecast */}
          <ForecastTable data={data.forecast} />
        </>
      )}
    </div>
  );
}
