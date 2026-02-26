'use client';

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function thisMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUICK_RANGES = [
  { label: '7 days', from: () => daysAgo(6), to: () => today() },
  { label: '30 days', from: () => daysAgo(29), to: () => today() },
  { label: 'This month', from: () => thisMonthStart(), to: () => today() },
] as const;

export function DateRangePicker({ dateFrom, dateTo, onChange }: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="dateFrom" className="text-sm font-medium text-muted-foreground">
          From
        </label>
        <input
          id="dateFrom"
          type="date"
          value={dateFrom}
          onChange={(e) => onChange(e.target.value, dateTo)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="dateTo" className="text-sm font-medium text-muted-foreground">
          To
        </label>
        <input
          id="dateTo"
          type="date"
          value={dateTo}
          onChange={(e) => onChange(dateFrom, e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="flex items-center gap-1.5">
        {QUICK_RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => onChange(r.from(), r.to())}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
