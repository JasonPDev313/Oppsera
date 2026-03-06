'use client';

import { memo, useMemo, useState } from 'react';
import { List, Layers } from 'lucide-react';
import type { FnbTabDetail, FnbDraftLine } from '@/types/fnb';
import { CourseSection } from './CourseSection';
import { FnbOrderLine } from './FnbOrderLine';

interface OrderTicketProps {
  tab: FnbTabDetail;
  activeSeat: number;
  activeCourse: number;
  courseNames: string[];
  draftLines?: FnbDraftLine[];
  onSendCourse: (courseNumber: number) => void;
  onFireCourse: (courseNumber: number) => void;
  onLineTap?: (lineId: string) => void;
  onMoveLineToCourse?: (lineId: string, newCourseNumber: number) => void;
  /** When false, hides per-course Send/Fire buttons (KDS routing mode) */
  kdsSendEnabled?: boolean;
  /** Disables action buttons while a mutation is in-flight */
  disabled?: boolean;
}

export const OrderTicket = memo(function OrderTicket({
  tab,
  activeSeat,
  activeCourse,
  courseNames,
  draftLines = [],
  onSendCourse,
  onFireCourse,
  onLineTap,
  onMoveLineToCourse,
  kdsSendEnabled = true,
  disabled,
}: OrderTicketProps) {
  const [viewMode, setViewMode] = useState<'active' | 'all'>('all');
  const [coursePickerLineId, setCoursePickerLineId] = useState<string | null>(null);

  const courses = tab.courses ?? [];
  const serverLines = tab.lines ?? [];

  // Memoize line grouping — avoid re-building Maps on every render
  const { sortedCourses, draftsByCourse, courseStatusMap, hasAnyContent } = useMemo(() => {
    // Filter server lines by active seat
    const filteredServerLines = activeSeat === 0
      ? serverLines
      : serverLines.filter((l) => l.seatNumber === activeSeat);

    // Filter draft lines by active seat
    const filteredDrafts = activeSeat === 0
      ? draftLines
      : draftLines.filter((d) => d.seatNumber === activeSeat);

    // Group server lines by course
    const linesByCourse = new Map<number, typeof filteredServerLines>();
    for (const line of filteredServerLines) {
      const cn = line.courseNumber ?? 1;
      const existing = linesByCourse.get(cn) ?? [];
      existing.push(line);
      linesByCourse.set(cn, existing);
    }

    // Group draft lines by course
    const dbc = new Map<number, FnbDraftLine[]>();
    for (const draft of filteredDrafts) {
      const cn = draft.courseNumber ?? 1;
      const existing = dbc.get(cn) ?? [];
      existing.push(draft);
      dbc.set(cn, existing);
    }

    // Ensure all courses (server + draft) are represented
    for (const course of courses) {
      if (!linesByCourse.has(course.courseNumber)) {
        linesByCourse.set(course.courseNumber, []);
      }
    }
    for (const cn of dbc.keys()) {
      if (!linesByCourse.has(cn)) {
        linesByCourse.set(cn, []);
      }
    }

    const sorted = [...linesByCourse.entries()].sort(([a], [b]) => a - b);

    // Build a map of course statuses for "previous course served" detection
    const csm = new Map<number, string>();
    for (const c of courses) {
      csm.set(c.courseNumber, c.courseStatus);
    }

    return {
      sortedCourses: sorted,
      draftsByCourse: dbc,
      courseStatusMap: csm,
      hasAnyContent: sorted.length > 0 || filteredDrafts.length > 0,
    };
  }, [serverLines, draftLines, activeSeat, courses]);

  // In "active" mode, only show the active course
  const displayCourses = viewMode === 'active'
    ? sortedCourses.filter(([cn]) => cn === activeCourse)
    : sortedCourses;

  if (!hasAnyContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          No items yet — tap menu to add
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* View mode toggle — only show when multiple courses exist */}
      {sortedCourses.length > 1 && (
        <div
          className="flex items-center gap-1 px-2 py-1 shrink-0"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: viewMode === 'all' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: viewMode === 'all' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <Layers className="h-3 w-3" />
            All
          </button>
          <button
            type="button"
            onClick={() => setViewMode('active')}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: viewMode === 'active' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: viewMode === 'active' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <List className="h-3 w-3" />
            Course {activeCourse}
          </button>
        </div>
      )}

      {/* Course sections */}
      <div className="flex-1 overflow-y-auto p-2">
        {displayCourses.map(([courseNum, courseLines]) => {
          const courseInfo = courses.find((c) => c.courseNumber === courseNum);
          const courseName = courseInfo?.courseName ?? courseNames[courseNum - 1] ?? `Course ${courseNum}`;
          const courseStatus = (courseInfo?.courseStatus as 'unsent' | 'sent' | 'held' | 'fired' | 'cooking' | 'ready' | 'served') ?? 'unsent';
          const courseDrafts = draftsByCourse.get(courseNum) ?? [];
          const totalItems = courseLines.length + courseDrafts.length;

          // Check if previous course is served (for fire pulse)
          const prevCourseStatus = courseNum > 1 ? courseStatusMap.get(courseNum - 1) : undefined;
          const previousCourseServed = prevCourseStatus === 'served';

          return (
            <CourseSection
              key={courseNum}
              courseNumber={courseNum}
              courseName={courseName}
              courseStatus={courseStatus}
              sentAt={courseInfo?.sentAt}
              firedAt={courseInfo?.firedAt}
              servedAt={courseInfo?.servedAt}
              itemCount={totalItems}
              previousCourseServed={previousCourseServed}
              onSend={kdsSendEnabled ? () => onSendCourse(courseNum) : undefined}
              onFire={kdsSendEnabled ? () => onFireCourse(courseNum) : undefined}
              disabled={disabled}
            >
              {/* Server-committed lines */}
              {courseLines.map((line) => {
                const mods = (line.modifiers ?? []) as Array<Record<string, unknown>>;
                const modAdj = mods.reduce((sum, m) => sum + (Number(m?.priceAdjustment) || 0), 0);
                return (
                <div key={line.id} className="relative">
                  <FnbOrderLine
                    seatNumber={line.seatNumber ?? 1}
                    itemName={line.catalogItemName ?? 'Unknown'}
                    modifiers={mods.map((mod) => {
                      if (typeof mod === 'string') return mod as string;
                      const name = String(mod?.name ?? '');
                      const price = Number(mod?.priceAdjustment) || 0;
                      const suffix = price > 0 ? ` (+$${(price / 100).toFixed(2)})` : '';
                      if (mod?.instruction === 'none') return `NO ${name}`;
                      if (mod?.instruction === 'extra') return `EXTRA ${name}${suffix}`;
                      if (mod?.instruction === 'on_side') return `${name} ON SIDE${suffix}`;
                      return `${name}${suffix}`;
                    })}
                    specialInstructions={line.specialInstructions}
                    priceCents={(line.unitPriceCents ?? 0) + modAdj}
                    qty={line.qty ?? 1}
                    status={(line.status as 'draft' | 'sent' | 'fired' | 'served' | 'voided') ?? 'draft'}
                    isUnsent={line.status === 'draft' || line.status === 'unsent'}
                    onTap={() => {
                      if (coursePickerLineId === line.id) {
                        setCoursePickerLineId(null);
                      } else {
                        onLineTap?.(line.id);
                      }
                    }}
                    onLongPress={onMoveLineToCourse && (line.status === 'draft' || line.status === 'unsent')
                      ? () => setCoursePickerLineId(line.id)
                      : undefined
                    }
                  />
                  {/* Course reassignment dropdown */}
                  {coursePickerLineId === line.id && onMoveLineToCourse && (
                    <div
                      className="absolute right-2 top-full z-10 rounded-lg shadow-lg border p-1 min-w-30"
                      style={{
                        backgroundColor: 'var(--fnb-bg-surface)',
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <p className="px-2 py-1 text-[9px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
                        Move to course
                      </p>
                      {courseNames.map((name, i) => {
                        const targetCourse = i + 1;
                        if (targetCourse === courseNum) return null;
                        return (
                          <button
                            key={targetCourse}
                            type="button"
                            onClick={() => {
                              onMoveLineToCourse(line.id, targetCourse);
                              setCoursePickerLineId(null);
                            }}
                            className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs transition-opacity hover:opacity-80"
                            style={{ color: 'var(--fnb-text-primary)' }}
                          >
                            <span className="font-bold" style={{ color: 'var(--fnb-text-muted)' }}>C{targetCourse}</span>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )})}
              {/* Local draft lines (not yet persisted) */}
              {courseDrafts.map((draft) => {
                const draftModAdj = draft.modifiers.reduce((sum, m) => sum + (m.priceAdjustment || 0), 0);
                return (
                <div
                  key={`draft-${draft.localId}`}
                  style={{ opacity: 0.7, borderLeft: '2px dashed var(--fnb-text-muted)', paddingLeft: 4 }}
                >
                  <FnbOrderLine
                    seatNumber={draft.seatNumber}
                    itemName={draft.catalogItemName}
                    modifiers={draft.modifiers.map((m) => {
                      const price = m.priceAdjustment || 0;
                      const suffix = price > 0 ? ` (+$${(price / 100).toFixed(2)})` : '';
                      if (m.instruction === 'none') return `NO ${m.name}`;
                      if (m.instruction === 'extra') return `EXTRA ${m.name}${suffix}`;
                      if (m.instruction === 'on_side') return `${m.name} ON SIDE${suffix}`;
                      return `${m.name}${suffix}`;
                    })}
                    specialInstructions={draft.specialInstructions}
                    priceCents={draft.unitPriceCents + draftModAdj}
                    qty={draft.qty}
                    status="draft"
                    isUnsent
                  />
                </div>
              )})}
            </CourseSection>
          );
        })}
      </div>
    </div>
  );
});
