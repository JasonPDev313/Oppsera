'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Level = 'days' | 'months' | 'years';

interface DateJumpPickerProps {
  /** Currently selected date as YYYY-MM-DD */
  value: string;
  /** Called when user picks a date */
  onSelect: (date: string) => void;
  /** The trigger element — the date display text */
  children: React.ReactNode;
}

export default function DateJumpPicker({ value, onSelect, children }: DateJumpPickerProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>('days');
  const containerRef = useRef<HTMLDivElement>(null);

  // The "cursor" month/year the picker is looking at (independent of selected value)
  const valueParts = useMemo(() => {
    const d = new Date(`${value}T00:00:00`);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }, [value]);

  const [cursorYear, setCursorYear] = useState(valueParts.year);
  const [cursorMonth, setCursorMonth] = useState(valueParts.month);

  // Sync cursor to value when picker opens
  useEffect(() => {
    if (open) {
      setCursorYear(valueParts.year);
      setCursorMonth(valueParts.month);
      setLevel('days');
    }
  }, [open, valueParts]);

  // Year range for the year grid (show a 12-year window centered on cursor)
  const yearRangeStart = useMemo(() => cursorYear - (cursorYear % 12), [cursorYear]);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  // ── Day grid for current cursor month ──────────────────────────
  const dayGrid = useMemo(() => {
    const firstDay = new Date(cursorYear, cursorMonth, 1);
    // Monday=0 ... Sunday=6
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();
    const prevMonthDays = new Date(cursorYear, cursorMonth, 0).getDate();

    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

    // Previous month trailing days
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = cursorMonth === 0 ? 11 : cursorMonth - 1;
      const y = cursorMonth === 0 ? cursorYear - 1 : cursorYear;
      cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: cursorMonth, year: cursorYear, isCurrentMonth: true });
    }

    // Next month leading days (fill to 42 cells = 6 rows)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = cursorMonth === 11 ? 0 : cursorMonth + 1;
      const y = cursorMonth === 11 ? cursorYear + 1 : cursorYear;
      cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
    }

    return cells;
  }, [cursorYear, cursorMonth]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // ── Handlers ───────────────────────────────────────────────────
  const handleDayClick = useCallback((year: number, month: number, day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelect(dateStr);
    setOpen(false);
  }, [onSelect]);

  const handleMonthClick = useCallback((month: number) => {
    setCursorMonth(month);
    setLevel('days');
  }, []);

  const handleYearClick = useCallback((year: number) => {
    setCursorYear(year);
    setLevel('months');
  }, []);

  const prevMonth = useCallback(() => {
    if (cursorMonth === 0) {
      setCursorMonth(11);
      setCursorYear((y) => y - 1);
    } else {
      setCursorMonth((m) => m - 1);
    }
  }, [cursorMonth]);

  const nextMonth = useCallback(() => {
    if (cursorMonth === 11) {
      setCursorMonth(0);
      setCursorYear((y) => y + 1);
    } else {
      setCursorMonth((m) => m + 1);
    }
  }, [cursorMonth]);

  const handleTodayClick = useCallback(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    onSelect(dateStr);
    setOpen(false);
  }, [onSelect]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger — wraps the children (date display text) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent/50"
        title="Jump to date"
      >
        {children}
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Popover */}
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-xl border border-border bg-surface shadow-xl">
          <div className="w-[300px] p-3">
            {/* ── Days level ──────────────────────────────── */}
            {level === 'days' && (
              <>
                {/* Header: month/year navigation */}
                <div className="mb-2 flex items-center justify-between">
                  <button
                    onClick={prevMonth}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLevel('months')}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                    >
                      {MONTHS[cursorMonth]}
                    </button>
                    <button
                      onClick={() => setLevel('years')}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                    >
                      {cursorYear}
                    </button>
                  </div>

                  <button
                    onClick={nextMonth}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="mb-1 grid grid-cols-7 gap-0">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-0">
                  {dayGrid.map((cell, i) => {
                    const cellDate = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
                    const isSelected = cellDate === value;
                    const isToday = cellDate === todayStr;

                    return (
                      <button
                        key={i}
                        onClick={() => handleDayClick(cell.year, cell.month, cell.day)}
                        className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-indigo-600 font-semibold text-white shadow-sm'
                            : isToday
                              ? 'font-semibold text-indigo-600'
                              : cell.isCurrentMonth
                                ? 'text-foreground hover:bg-accent/70'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        }`}
                      >
                        {cell.day}
                        {isToday && !isSelected && (
                          <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Footer: Today shortcut */}
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                  <span className="text-[10px] text-muted-foreground">Click month or year to jump</span>
                  <button
                    onClick={handleTodayClick}
                    className="rounded-md bg-muted/80 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent/80"
                  >
                    Today
                  </button>
                </div>
              </>
            )}

            {/* ── Months level ────────────────────────────── */}
            {level === 'months' && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setCursorYear((y) => y - 1)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setLevel('years')}
                    className="rounded-lg px-3 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                  >
                    {cursorYear}
                  </button>

                  <button
                    onClick={() => setCursorYear((y) => y + 1)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {MONTHS_SHORT.map((m, i) => {
                    const isCurrentMonth = i === valueParts.month && cursorYear === valueParts.year;
                    const isNowMonth = i === new Date().getMonth() && cursorYear === new Date().getFullYear();

                    return (
                      <button
                        key={m}
                        onClick={() => handleMonthClick(i)}
                        className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                          isCurrentMonth
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : isNowMonth
                              ? 'bg-indigo-500/10 font-semibold text-indigo-500 hover:bg-indigo-500/20'
                              : 'text-foreground hover:bg-accent/70'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 border-t border-border pt-2">
                  <button
                    onClick={() => setLevel('days')}
                    className="text-xs text-muted-foreground transition-colors hover:text-indigo-600"
                  >
                    &larr; Back to days
                  </button>
                </div>
              </>
            )}

            {/* ── Years level ─────────────────────────────── */}
            {level === 'years' && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={() => setCursorYear((y) => y - 12)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="text-sm font-semibold text-foreground">
                    {yearRangeStart} &ndash; {yearRangeStart + 11}
                  </span>

                  <button
                    onClick={() => setCursorYear((y) => y + 12)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((yr) => {
                    const isCurrentYear = yr === valueParts.year;
                    const isNowYear = yr === new Date().getFullYear();

                    return (
                      <button
                        key={yr}
                        onClick={() => handleYearClick(yr)}
                        className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                          isCurrentYear
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : isNowYear
                              ? 'bg-indigo-500/10 font-semibold text-indigo-500 hover:bg-indigo-500/20'
                              : 'text-foreground hover:bg-accent/70'
                        }`}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 border-t border-border pt-2">
                  <button
                    onClick={() => setLevel('months')}
                    className="text-xs text-muted-foreground transition-colors hover:text-indigo-600"
                  >
                    &larr; Back to months
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
